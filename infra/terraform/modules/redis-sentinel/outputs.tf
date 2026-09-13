output "endpoint_url" {
  value       = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  description = "Redis primary endpoint URL with rediss:// (TLS)"
}

output "primary_endpoint_address" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "Redis primary endpoint hostname"
}

output "reader_endpoint_address" {
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  description = "Redis reader (load-balanced read replicas) endpoint hostname"
}

output "endpoint_port" {
  value       = aws_elasticache_replication_group.redis.port
  description = "Redis endpoint port"
}

output "security_group_id" {
  value       = aws_security_group.redis.id
  description = "Redis security group ID"
}

output "connection_secret_arn" {
  value       = "arn:aws:secretsmanager:${var.aws_region}::secret:${var.cluster_name}-${var.environment}/redis/credentials"
  description = "Pattern for Redis auth token secret in Secrets Manager"
}

output "replication_group_id" {
  value       = aws_elasticache_replication_group.redis.id
  description = "ElastiCache replication group ID"
}

output "cluster_enabled" {
  value       = false
  description = "Cluster mode is disabled for this Sentinel-style setup"
}
