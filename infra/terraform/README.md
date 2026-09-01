# Terraform (AWS reference implementation)

Provisions the pieces a Kubernetes deploy of `infra/k8s/` actually needs on
AWS: a segmented VPC, an EKS cluster, ECR repositories for the three images
(backend, frontend, marketplaced), and a GitHub Actions OIDC deploy role
(CI7 — no long-lived AWS keys in repo secrets).

This is a **reference implementation for one cloud**, not a universal
skeleton — GCP/Azure would need their own provider blocks and equivalent
resources (GKE/AKS, Artifact Registry/ACR, Workload Identity Federation
instead of this OIDC setup). Picking a cloud is itself a decision only the
team can make.

## What's here (code-level)

- `versions.tf` / `provider.tf` — provider + version pins
- `vpc.tf` — segmented VPC (public subnets for the LB only; app/data in
  private subnets) — see `docs/deployment/network-segmentation.md`
- `eks.tf` — the Kubernetes cluster `infra/k8s/` deploys onto
- `ecr.tf` — container registries with vulnerability scan-on-push and an
  untagged-image expiry policy
- `github-oidc.tf` — lets `.github/workflows/*` assume a scoped AWS role via
  OIDC instead of stored access keys (thumbprint fetched live from GitHub's
  own OIDC endpoint rather than hardcoded — see the comment in that file for
  why a hardcoded one is a real, previously-seen failure mode)

## What still needs a human / an account (not implementable as code)

- **An actual AWS account and billing** — nothing here can create one.
- **Remote state backend** (S3 bucket + DynamoDB lock table, or Terraform
  Cloud) — left unconfigured in `versions.tf` rather than guessing a bucket
  name; provision this once, by hand, before the first real `terraform apply`.
- **A managed MongoDB** (Atlas or equivalent) and **managed Redis**
  (ElastiCache/Memorystore) for production — `infra/k8s/13-redis.yaml` is a
  dev/reference default only; this Terraform doesn't provision either,
  since which managed provider to use is a vendor decision, and Mongo Atlas
  in particular needs its own provider + org/project already set up.
- **DNS + the ACME account cert-manager uses** for `infra/k8s/20-ingress.yaml`'s
  TLS — needs a real domain you control.
- **`var.github_repo`** — set to the real `org/repo` before applying
  `github-oidc.tf`, or the trust policy authorizes the wrong repository.
