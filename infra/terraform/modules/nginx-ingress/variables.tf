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
  description = "VPC ID"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for the internet-facing ALB (3 AZs)"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for internal target lookups"
}

variable "domain_name" {
  type        = string
  description = "Primary domain name for the ACM certificate (e.g. mallchain.example.com)"
}

variable "subject_alternative_names" {
  type        = list(string)
  description = "Additional SANs for the ACM certificate"
  default     = []
}

variable "route53_zone_id" {
  type        = string
  description = "Route53 hosted zone ID for DNS validation of the ACM certificate. Leave empty if zone not managed here."
  default     = ""
}

variable "backend_target_port" {
  type        = number
  description = "Backend service port on targets"
  default     = 8080
}

variable "frontend_target_port" {
  type        = number
  description = "Frontend service port on targets"
  default     = 3000
}

variable "sentry_target_port" {
  type        = number
  description = "Sentry service port on targets"
  default     = 9000
}

variable "health_check_path" {
  type        = string
  description = "Default health check path for target groups"
  default     = "/healthz"
}

variable "rate_limit_per_ip" {
  type        = number
  description = "WAF rate-based rule: requests per IP per evaluation window"
  default     = 2000
}

variable "rate_limit_window_minutes" {
  type        = number
  description = "WAF rate-based rule evaluation window in minutes"
  default     = 5
}

variable "http_5xx_alarm_threshold_pct" {
  type        = number
  description = "CloudWatch alarm threshold for 5xx rate percentage"
  default     = 5
}

variable "alarm_sns_topic_arn" {
  type        = string
  description = "Optional SNS topic ARN to notify on 5xx alarm. Leave empty for no action."
  default     = ""
}
