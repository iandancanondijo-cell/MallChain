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

variable "vpc_id" {
  type        = string
  description = "VPC ID for security group and subnet group"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the ElastiCache subnet group (3 AZs)"
}

variable "app_subnet_cidr" {
  type        = string
  description = "CIDR block of the app subnet allowed to access Redis"
  default     = "10.20.10.0/23"
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type"
  default     = "cache.r6g.large"
}

variable "engine_version" {
  type        = string
  description = "Redis engine version"
  default     = "7"
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters in the replication group (1 primary + read replicas)"
  default     = 3
}

variable "automatic_failover_enabled" {
  type        = bool
  description = "Enable automatic failover (multi-AZ)"
  default     = true
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for at-rest encryption"
}

variable "parameter_group_name" {
  type        = string
  description = "Optional custom parameter group name. Leave empty to create default."
  default     = ""
}

variable "snapshot_retention_limit_days" {
  type        = number
  description = "Snapshot retention limit in days"
  default     = 35
}

variable "snapshot_window" {
  type        = string
  description = "Daily snapshot window in UTC"
  default     = "02:00-03:00"
}

variable "maintenance_window" {
  type        = string
  description = "Weekly maintenance window in UTC"
  default     = "sun:04:00-sun:05:00"
}
