output "vault_endpoint_url" {
  value       = module.vault_server.endpoint_url
  description = "Vault server internal endpoint URL"
}

output "vault_security_group_id" {
  value       = module.vault_server.security_group_id
  description = "Vault security group ID"
}

output "vault_connection_secret_arn_pattern" {
  value       = module.vault_server.connection_secret_arn
  description = "Vault credentials secret ARN pattern (SSM Parameter Store)"
}

output "vault_instance_private_ip" {
  value       = module.vault_server.instance_private_ip
  description = "Vault EC2 private IP address"
}

output "postgres_endpoint_url" {
  value       = module.postgres_stateful.endpoint_url
  description = "PostgreSQL connection endpoint URL with db name"
}

output "postgres_endpoint_address" {
  value       = module.postgres_stateful.endpoint_address
  description = "PostgreSQL endpoint hostname"
}

output "postgres_security_group_id" {
  value       = module.postgres_stateful.security_group_id
  description = "PostgreSQL security group ID"
}

output "postgres_connection_secret_arn_pattern" {
  value       = module.postgres_stateful.connection_secret_arn
  description = "PostgreSQL credentials secret ARN pattern (Secrets Manager)"
}

output "postgres_master_username" {
  value       = module.postgres_stateful.master_username
  description = "PostgreSQL master username"
  sensitive   = true
}

output "postgres_master_password" {
  value       = module.postgres_stateful.master_password
  description = "PostgreSQL master password"
  sensitive   = true
}

output "redis_endpoint_url" {
  value       = module.redis_sentinel.endpoint_url
  description = "Redis primary endpoint URL with TLS (rediss://)"
}

output "redis_primary_endpoint_address" {
  value       = module.redis_sentinel.primary_endpoint_address
  description = "Redis primary (writer) endpoint hostname"
}

output "redis_reader_endpoint_address" {
  value       = module.redis_sentinel.reader_endpoint_address
  description = "Redis reader (read replicas LB) endpoint hostname"
}

output "redis_security_group_id" {
  value       = module.redis_sentinel.security_group_id
  description = "Redis security group ID"
}

output "redis_connection_secret_arn_pattern" {
  value       = module.redis_sentinel.connection_secret_arn
  description = "Redis auth token secret ARN pattern (Secrets Manager)"
}

output "mongo_endpoint_url" {
  value       = module.mongo_replica.endpoint_url
  description = "DocumentDB MongoDB writer connection string with TLS + replica set"
}

output "mongo_reader_endpoint_url" {
  value       = module.mongo_replica.reader_endpoint_url
  description = "DocumentDB MongoDB reader endpoint URL (secondary preferred)"
}

output "mongo_endpoint_address" {
  value       = module.mongo_replica.endpoint_address
  description = "DocumentDB writer endpoint hostname"
}

output "mongo_reader_endpoint_address" {
  value       = module.mongo_replica.reader_endpoint_address
  description = "DocumentDB reader endpoint hostname"
}

output "mongo_security_group_id" {
  value       = module.mongo_replica.security_group_id
  description = "DocumentDB security group ID"
}

output "mongo_connection_secret_arn_pattern" {
  value       = module.mongo_replica.connection_secret_arn
  description = "DocumentDB credentials secret ARN pattern (Secrets Manager)"
}

output "mongo_master_username" {
  value       = module.mongo_replica.master_username
  description = "DocumentDB master username"
  sensitive   = true
}

output "mongo_master_password" {
  value       = module.mongo_replica.master_password
  description = "DocumentDB master password"
  sensitive   = true
}

output "ingress_endpoint_url" {
  value       = module.nginx_ingress.endpoint_url
  description = "Ingress ALB HTTPS endpoint URL"
}

output "ingress_alb_dns_name" {
  value       = module.nginx_ingress.alb_dns_name
  description = "Ingress ALB DNS name (for Route53 alias record target)"
}

output "ingress_alb_zone_id" {
  value       = module.nginx_ingress.alb_zone_id
  description = "Ingress ALB canonical hosted zone ID (for Route53 alias)"
}

output "ingress_security_group_id" {
  value       = module.nginx_ingress.security_group_id
  description = "Ingress ALB security group ID"
}

output "ingress_connection_secret_arn_pattern" {
  value       = module.nginx_ingress.connection_secret_arn
  description = "Ingress TLS cert reference ARN pattern (SSM Parameter Store)"
}

output "ingress_acm_certificate_arn" {
  value       = module.nginx_ingress.acm_certificate_arn
  description = "ACM certificate ARN"
}

output "ingress_waf_web_acl_arn" {
  value       = module.nginx_ingress.waf_web_acl_arn
  description = "WAFv2 Web ACL attached to ingress ALB"
}

output "ingress_target_group_backend_arn" {
  value       = module.nginx_ingress.target_group_backend_arn
  description = "Backend target group ARN"
}

output "ingress_target_group_frontend_arn" {
  value       = module.nginx_ingress.target_group_frontend_arn
  description = "Frontend target group ARN"
}

output "ingress_target_group_sentry_arn" {
  value       = module.nginx_ingress.target_group_sentry_arn
  description = "Sentry target group ARN"
}

output "ingress_domain_validation_options" {
  value       = module.nginx_ingress.domain_validation_options
  description = "ACM certificate domain validation options (for manual DNS validation)"
}

output "kms_vault_master_key_arn" {
  value       = aws_kms_key.vault_master.arn
  description = "Vault master KMS key ARN"
}

output "kms_data_services_key_arn" {
  value       = aws_kms_key.data_services.arn
  description = "Data services KMS key ARN (Postgres/Redis/DocDB)"
}
