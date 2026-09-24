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

variable "eks_endpoint_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed to reach the EKS API server endpoint. Lock to office/VPN ranges in production."
  default     = ["0.0.0.0/0"]
}
