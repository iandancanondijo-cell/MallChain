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
  description = "VPC ID for security group and DB subnet group"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the DB subnet group (3 AZs)"
}

variable "app_subnet_cidr" {
  type        = string
  description = "CIDR block of the app subnet allowed to access Postgres port 5432"
  default     = "10.20.10.0/23"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.r6g.large"
}

variable "engine_version" {
  type        = string
  description = "PostgreSQL engine version"
  default     = "16"
}

variable "allocated_storage_gb" {
  type        = number
  description = "Initial allocated storage in GB"
  default     = 100
}

variable "max_allocated_storage_gb" {
  type        = number
  description = "Maximum storage autoscaling limit in GB"
  default     = 500
}

variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment for high availability"
  default     = true
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for storage encryption"
}

variable "db_name" {
  type        = string
  description = "Initial database name to create"
  default     = "mallchain"
}

variable "db_username" {
  type        = string
  description = "Master database username"
  default     = "mallchain_admin"
}

variable "backup_retention_period_days" {
  type        = number
  description = "Backup retention period in days"
  default     = 35
}

variable "snapshot_identifier" {
  type        = string
  description = "Optional DB snapshot ARN to restore from. Leave empty for new DB."
  default     = ""
}

variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights"
  default     = true
}

variable "monitoring_interval_seconds" {
  type        = number
  description = "Enhanced monitoring interval in seconds"
  default     = 60
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
