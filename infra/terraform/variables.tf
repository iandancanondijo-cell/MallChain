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
