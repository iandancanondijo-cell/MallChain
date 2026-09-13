output "endpoint_url" {
  value       = "postgresql://${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}"
  description = "PostgreSQL connection endpoint URL with db name"
}

output "endpoint_address" {
  value       = aws_db_instance.postgres.address
  description = "PostgreSQL endpoint hostname"
}

output "endpoint_port" {
  value       = aws_db_instance.postgres.port
  description = "PostgreSQL endpoint port"
}

output "security_group_id" {
  value       = aws_security_group.postgres.id
  description = "PostgreSQL security group ID"
}

output "connection_secret_arn" {
  value       = "arn:aws:secretsmanager:${var.aws_region}::secret:${var.cluster_name}-${var.environment}/postgres/credentials"
  description = "Pattern for Postgres credentials secret in Secrets Manager"
}

output "db_instance_id" {
  value       = aws_db_instance.postgres.id
  description = "RDS DB instance identifier"
}

output "db_instance_arn" {
  value       = aws_db_instance.postgres.arn
  description = "RDS DB instance ARN"
}

output "master_username" {
  value       = aws_db_instance.postgres.username
  description = "PostgreSQL master username"
  sensitive   = true
}

output "master_password" {
  value       = aws_db_instance.postgres.password
  description = "PostgreSQL master password"
  sensitive   = true
}
