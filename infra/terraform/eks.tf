module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = "${var.cluster_name}-${var.environment}"
  kubernetes_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Node traffic stays in the private subnets. Public reachability of the API
  # server is now constrained to admin_cidr_blocks, which deliberately has no
  # default — an unlisted operator network fails at plan instead of silently
  # accepting the module's 0.0.0.0/0.
  #
  # If this cluster does not need interactive kubectl from outside the VPC, set
  # endpoint_public_access = false and admin_cidr_blocks = [] in
  # your terraform.tfvars; the endpoint then exists only on the private
  # interface.
  #
  # Argument names verified against the pinned module (terraform-aws-modules/eks
  # v21.26.0, the newest release satisfying ~> 21.0): its own
  # docs/UPGRADE-21.0.md lists the v21 rename as
  # `cluster_endpoint_public_access` -> `endpoint_public_access`, and
  # variables.tf declares endpoint_public_access, endpoint_private_access and
  # endpoint_public_access_cidrs — no cluster_* form. The cluster_* names this
  # block used before are v20 and earlier and fail with "Unsupported argument".
  #
  # `terraform validate` could not be run to demonstrate this (the module
  # registry is unreachable from this network, so the modules cannot be
  # installed here); the check was made against the module source cached at
  # infra/terraform/.terraform/modules/eks.
  endpoint_public_access       = true
  endpoint_private_access      = true
  endpoint_public_access_cidrs = var.admin_cidr_blocks

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_min_nodes
      max_size       = var.eks_max_nodes
      desired_size   = var.eks_min_nodes
    }
  }
}
