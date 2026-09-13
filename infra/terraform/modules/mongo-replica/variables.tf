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
  description = "Private subnet IDs for the DocumentDB subnet group (3 AZs)"
}

variable "app_subnet_cidr" {
  type        = string
  description = "CIDR block of the app subnet allowed to access MongoDB port 27017"
  default     = "10.20.10.0/23"
}

variable "instance_class" {
  type        = string
  description = "DocumentDB instance class"
  default     = "db.r6g.large"
}

variable "engine_version" {
  type        = string
  description = "DocumentDB engine version"
  default     = "5.0.0"
}

variable "num_instances" {
  type        = number
  description = "Number of DB instances in the cluster (1 writer + readers)"
  default     = 3
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for storage encryption"
}

variable "master_username" {
  type        = string
  description = "DocumentDB master username"
  default     = "mallchain_admin"
}

variable "backup_retention_period_days" {
  type        = number
  description = "Backup retention period in days"
  default     = 35
}

variable "preferred_backup_window" {
  type        = string
  description = "Preferred daily backup window in UTC"
  default     = "02:00-03:00"
}

variable "preferred_maintenance_window" {
  type        = string
  description = "Preferred weekly maintenance window in UTC"
  default     = "sun:04:00-sun:05:00"
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection"
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip final snapshot on deletion"
  default     = false
}
