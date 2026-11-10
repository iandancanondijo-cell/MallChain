module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  cluster_name    = "${var.cluster_name}-${var.environment}"
  cluster_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Node traffic stays in the private subnets. Public reachability of the API
  # server is now constrained to admin_cidr_blocks, which deliberately has no
  # default — an unlisted operator network fails at plan instead of silently
  # accepting the module's 0.0.0.0/0.
  #
  # If this cluster does not need interactive kubectl from outside the VPC, set
  # cluster_endpoint_public_access = false and admin_cidr_blocks = [] in
  # your terraform.tfvars; the endpoint then exists only on the private
  # interface.
  cluster_endpoint_public_access       = true
  cluster_endpoint_private_access      = true
  cluster_endpoint_public_access_cidrs = var.admin_cidr_blocks

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_min_nodes
      max_size       = var.eks_max_nodes
      desired_size   = var.eks_min_nodes
    }
  }
}
