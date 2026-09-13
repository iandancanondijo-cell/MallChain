variable "cluster_name" {
  type        = string
  description = "Cluster name prefix for resources"
}

variable "environment" {
  type        = string
  description = "Deployment environment (staging, production)"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the Vault EC2 instance"
}

variable "app_subnet_cidr" {
  type        = string
  description = "CIDR block of the app subnet allowed to access Vault port 8200"
  default     = "10.20.10.0/23"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for security group creation"
}

variable "ami_id" {
  type        = string
  description = "Amazon Linux 2023 Graviton AMI ID for the region"
  default     = ""
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type for Vault server"
  default     = "r6g.large"
}

variable "volume_size_gb" {
  type        = number
  description = "EBS gp3 volume size in GB"
  default     = 100
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for EBS volume encryption (vault-master-key)"
}
