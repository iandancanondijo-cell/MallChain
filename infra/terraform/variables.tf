# Terraform Variables

variable "environment" {
  type        = string
  default     = "production"
  description = "Environment name"
}

variable "namespace" {
  type        = string
  default     = "mallchain"
  description = "Kubernetes namespace"
}

variable "app_version" {
  type        = string
  description = "Application version/tag to deploy"
}

variable "image_registry" {
  type        = string
  description = "Docker image registry URL"
}

variable "k8s_cluster_endpoint" {
  type        = string
  description = "Kubernetes API endpoint"
  sensitive   = true
}

variable "k8s_cluster_ca" {
  type        = string
  description = "Kubernetes cluster CA certificate (base64)"
  sensitive   = true
}

variable "k8s_auth_token" {
  type        = string
  description = "Kubernetes authentication token"
  sensitive   = true
}

variable "jwt_secret" {
  type        = string
  description = "JWT signing secret"
  sensitive   = true
}

variable "session_secret" {
  type        = string
  description = "Session cookie secret"
  sensitive   = true
}

variable "admin_api_key" {
  type        = string
  description = "Admin API key"
  sensitive   = true
}

variable "mongodb_url" {
  type        = string
  description = "MongoDB connection URL"
  sensitive   = true
}

variable "redis_url" {
  type        = string
  description = "Redis connection URL"
  sensitive   = true
}

variable "request_signing_key" {
  type        = string
  description = "Request signing key for HMAC"
  sensitive   = true
}

variable "backend_replicas" {
  type        = number
  default     = 2
  description = "Number of backend replicas"
}

variable "backend_max_replicas" {
  type        = number
  default     = 10
  description = "Maximum backend replicas for HPA"
}

variable "log_level" {
  type        = string
  default     = "info"
  description = "Application log level (debug, info, warn, error)"
}

variable "enable_monitoring" {
  type        = bool
  default     = true
  description = "Enable Prometheus monitoring"
}

variable "enable_tracing" {
  type        = bool
  default     = true
  description = "Enable Jaeger tracing"
}

variable "enable_logging" {
  type        = bool
  default     = true
  description = "Enable ELK stack logging"
}
