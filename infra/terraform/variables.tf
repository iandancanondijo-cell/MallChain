variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type        = string
  description = "e.g. staging, production"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "cluster_name" {
  type    = string
  default = "mallchain"
}

variable "eks_node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

variable "eks_min_nodes" {
  type    = number
  default = 2
}

variable "eks_max_nodes" {
  type    = number
  default = 6
}

# No default on purpose. The EKS API endpoint used to be created with
# public access and the module's own 0.0.0.0/0 default, which meant the
# Kubernetes control plane of every environment was reachable — and, paired
# with the aws-auth ConfigMap, attackable — from anywhere on the internet.
# Supplying this is now part of `terraform plan`, so a cluster cannot be
# stood up wide open by omission. Use your VPN or office range, e.g.
# ["203.0.113.10/32"]; for a cluster nobody applies to interactively, use
# private access only (see eks.tf) and set this to [].
variable "admin_cidr_blocks" {
  type        = list(string)
  description = "CIDR ranges allowed to reach the EKS public API endpoint. Set to [] with cluster_endpoint_public_access = false for private-only clusters."
}
