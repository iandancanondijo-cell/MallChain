module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  cluster_name    = "${var.cluster_name}-${var.environment}"
  cluster_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # API server left reachable publicly for kubectl access, but node traffic
  # stays in private subnets — tighten `cluster_endpoint_public_access_cidrs`
  # to your office/VPN range for a real production cluster rather than
  # leaving it open to 0.0.0.0/0.
  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    default = {
      instance_types = var.eks_node_instance_types
      min_size       = var.eks_min_nodes
      max_size       = var.eks_max_nodes
      desired_size   = var.eks_min_nodes
    }
  }
}
