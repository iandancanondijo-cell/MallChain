module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = "${var.cluster_name}-${var.environment}"
  kubernetes_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # API server left reachable publicly for kubectl access, but node traffic
  # stays in private subnets. Default allows all (0.0.0.0/0) for initial
  # setup; override eks_endpoint_allowed_cidrs in terraform.tfvars to lock
  # down to office/VPN ranges before production use.
  endpoint_public_access       = true
  endpoint_public_access_cidrs = var.eks_endpoint_allowed_cidrs

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_min_nodes
      max_size       = var.eks_max_nodes
      desired_size   = var.eks_min_nodes
    }
  }
}
