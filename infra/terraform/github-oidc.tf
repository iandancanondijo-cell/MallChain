# CI7: lets GitHub Actions assume an AWS role via OIDC federation instead of
# storing long-lived AWS access keys as a repo secret — a leaked long-lived
# key is valid until manually rotated; an OIDC-issued credential is scoped to
# a single workflow run and expires with it.
#
# The thumbprint is fetched live from GitHub's own OIDC endpoint (via
# data.tls_certificate) rather than hardcoded: GitHub has rotated the TLS
# certificate backing this endpoint before, and a stale hardcoded thumbprint
# silently breaks every deploy the next time that happens.
data "tls_certificate" "github_actions" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github_actions.certificates[0].sha1_fingerprint]
}

variable "github_repo" {
  type        = string
  description = "GitHub org/repo allowed to assume the deploy role, e.g. \"my-org/MarketplaceBlockchain-Mallchain\""
}

data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Restricts to the main branch and version tags — exactly the two
    # triggers deploy.yml actually deploys from (push-to-main -> staging,
    # push-tag-v*.*.* -> production). A tag-triggered run's OIDC token has
    # sub=...:ref:refs/tags/vX.Y.Z, not refs/heads/main, so both values are
    # required or every production (tag) deploy gets AccessDenied here.
    # Widen further (e.g. "repo:${var.github_repo}:pull_request") only if a
    # deploy workflow genuinely needs to run from PRs, which most shouldn't.
    #
    # The tag pattern mirrors deploy.yml's `v[0-9]+.[0-9]+.[0-9]+*`. IAM
    # StringLike globs have no character classes, so this is the closest
    # expression of it. It used to be `refs/tags/*`, which is broader than any
    # deploy trigger: release.yml runs on `on: push` — i.e. on every tag, and
    # every branch push — so `refs/tags/anything` already produced an OIDC
    # token that satisfied the old condition. Today release.yml asks for no AWS
    # credentials, so nothing was exploitable; but the day any workflow other
    # than deploy.yml is given this role ARN, the trust policy would hand it
    # production image-push rights on a tag that was never meant to deploy.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:ref:refs/tags/v*.*.*",
      ]
    }
  }
}

resource "aws_iam_role" "github_actions_deploy" {
  name               = "${var.cluster_name}-${var.environment}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_actions_trust.json
}

# Scoped to exactly what a deploy workflow needs (push images, update the
# EKS deployment) — deliberately NOT AdministratorAccess. Extend this policy
# only as specific, named actions turn out to be needed.
data "aws_iam_policy_document" "github_actions_deploy_permissions" {
  # GetAuthorizationToken is the one ECR call that cannot be scoped to a
  # repository ARN, so it keeps `*` on its own. Everything that can write to a
  # registry is limited to the three repositories this stack creates — with the
  # actions listed here, `resources = ["*"]` meant any repository in the
  # account, including ones holding images this pipeline must not touch (and,
  # because these actions accept `ecr:PutImage` on a repo the deploy role can
  # now overwrite, the blast radius was the whole registry).
  statement {
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken",
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [
      aws_ecr_repository.backend.arn,
      aws_ecr_repository.frontend.arn,
      aws_ecr_repository.marketplaced.arn,
    ]
  }

  statement {
    effect    = "Allow"
    actions   = ["eks:DescribeCluster"]
    resources = [module.eks.cluster_arn]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name   = "deploy-permissions"
  role   = aws_iam_role.github_actions_deploy.id
  policy = data.aws_iam_policy_document.github_actions_deploy_permissions.json
}

output "github_actions_deploy_role_arn" {
  value       = aws_iam_role.github_actions_deploy.arn
  description = "Put this in the deploy workflow's aws-actions/configure-aws-credentials role-to-assume input."
}
