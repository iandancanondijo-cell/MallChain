output "endpoint_url" {
  value       = "mongodb://${aws_docdb_cluster.mongo.endpoint}:${aws_docdb_cluster.mongo.port}/?tls=true&replicaSet=rs0&readPreference=primaryPreferred"
  description = "DocumentDB MongoDB connection string (writer endpoint with TLS)"
}

output "reader_endpoint_url" {
  value       = "mongodb://${aws_docdb_cluster.mongo.reader_endpoint}:${aws_docdb_cluster.mongo.port}/?tls=true&readPreference=secondaryPreferred"
  description = "DocumentDB MongoDB reader endpoint (load-balanced read replicas)"
}

output "endpoint_address" {
  value       = aws_docdb_cluster.mongo.endpoint
  description = "DocumentDB writer endpoint hostname"
}

output "reader_endpoint_address" {
  value       = aws_docdb_cluster.mongo.reader_endpoint
  description = "DocumentDB reader endpoint hostname"
}

output "endpoint_port" {
  value       = aws_docdb_cluster.mongo.port
  description = "DocumentDB endpoint port"
}

output "security_group_id" {
  value       = aws_security_group.mongo.id
  description = "DocumentDB security group ID"
}

output "connection_secret_arn" {
  value       = "arn:aws:secretsmanager:${var.aws_region}::secret:${var.cluster_name}-${var.environment}/docdb/credentials"
  description = "Pattern for DocumentDB credentials secret in Secrets Manager"
}

output "cluster_id" {
  value       = aws_docdb_cluster.mongo.id
  description = "DocumentDB cluster identifier"
}

output "cluster_arn" {
  value       = aws_docdb_cluster.mongo.arn
  description = "DocumentDB cluster ARN"
}

output "master_username" {
  value       = aws_docdb_cluster.mongo.master_username
  description = "DocumentDB master username"
  sensitive   = true
}

output "master_password" {
  value       = aws_docdb_cluster.mongo.master_password
  description = "DocumentDB master password"
  sensitive   = true
}

output "instance_ids" {
  value       = aws_docdb_cluster_instance.mongo[*].id
  description = "DocumentDB individual instance IDs"
}
