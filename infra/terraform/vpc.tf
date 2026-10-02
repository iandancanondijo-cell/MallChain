# Network segmentation at the cloud layer (see
# docs/deployment/network-segmentation.md): app/data tiers in private
# subnets with no direct public IP; only the load balancer sits in the
# public subnets. This is the layer the in-cluster NetworkPolicies
# (infra/k8s/30-network-policies.yaml) build on top of, not a replacement
# for them.
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "${var.cluster_name}-${var.environment}"
  cidr = var.vpc_cidr

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i)]
  public_subnets  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, i + 100)]

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production" # one shared NAT for staging cost, one-per-AZ in prod for HA
  enable_dns_hostnames = true

  # VPC Flow Logs → CloudWatch for network-level visibility (I2).
  # Destination and IAM role are defined in audit-s3.tf.
  enable_flow_log                   = true
  flow_log_destination_type         = "cloud-watch-logs"
  flow_log_destination_arn          = aws_cloudwatch_log_group.vpc_flow_logs.arn
  flow_log_iam_role_arn             = aws_iam_role.vpc_flow_logs.arn
  flow_log_max_aggregation_interval = 60

  # Required tags for the AWS Load Balancer Controller / EKS to auto-discover
  # subnets for public vs. internal load balancers.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
