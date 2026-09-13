output "endpoint_url" {
  value       = "http://${aws_instance.vault.private_ip}:8200"
  description = "Vault server internal endpoint URL"
}

output "security_group_id" {
  value       = aws_security_group.vault.id
  description = "Vault server security group ID"
}

output "connection_secret_arn" {
  value       = "arn:aws:ssm:${var.aws_region}::parameter/${var.cluster_name}-${var.environment}/vault/token"
  description = "Pattern for Vault connection/token secret in SSM Parameter Store"
}

output "instance_id" {
  value       = aws_instance.vault.id
  description = "Vault EC2 instance ID"
}

output "instance_private_ip" {
  value       = aws_instance.vault.private_ip
  description = "Vault EC2 private IP address"
}

output "iam_role_arn" {
  value       = aws_iam_role.vault_server.arn
  description = "Vault IAM role ARN"
}
