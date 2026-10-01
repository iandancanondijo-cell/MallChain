# EBS CSI driver support: the marketplaced StatefulSet (infra/k8s/11-marketplaced.yaml)
# has a 100Gi volumeClaimTemplate, and PVCs stay Pending forever without the
# driver. The addon uses IRSA (kube-system/ebs-csi-controller-sa) rather than
# the node role so the controller can only tag/create/delete EBS volumes.

data "aws_iam_policy_document" "ebs_csi_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name               = "${var.cluster_name}-${var.environment}-ebs-csi"
  description        = "IRSA role for the aws-ebs-csi-driver addon controller"
  assume_role_policy = data.aws_iam_policy_document.ebs_csi_assume.json

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ebs-csi"
  }
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}
