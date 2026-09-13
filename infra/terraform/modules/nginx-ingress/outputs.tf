output "endpoint_url" {
  value       = "https://${aws_lb.ingress.dns_name}"
  description = "Ingress ALB HTTPS endpoint URL"
}

output "alb_dns_name" {
  value       = aws_lb.ingress.dns_name
  description = "ALB DNS name"
}

output "alb_arn" {
  value       = aws_lb.ingress.arn
  description = "ALB ARN"
}

output "alb_zone_id" {
  value       = aws_lb.ingress.zone_id
  description = "ALB canonical hosted zone ID (for Route53 alias records)"
}

output "security_group_id" {
  value       = aws_security_group.alb.id
  description = "Ingress ALB security group ID"
}

output "connection_secret_arn" {
  value       = "arn:aws:ssm:${var.aws_region}::parameter/${var.cluster_name}-${var.environment}/ingress/tls-cert"
  description = "Pattern for Ingress TLS cert reference in SSM Parameter Store"
}

output "acm_certificate_arn" {
  value       = aws_acm_certificate.ingress.arn
  description = "ACM certificate ARN attached to the HTTPS listener"
}

output "waf_web_acl_arn" {
  value       = aws_wafv2_web_acl.ingress.arn
  description = "WAFv2 Web ACL ARN attached to the ALB"
}

output "listener_https_arn" {
  value       = aws_lb_listener.https.arn
  description = "HTTPS listener ARN (for attaching additional rules)"
}

output "listener_http_arn" {
  value       = aws_lb_listener.http.arn
  description = "HTTP listener ARN"
}

output "target_group_backend_arn" {
  value       = aws_lb_target_group.backend.arn
  description = "Backend target group ARN"
}

output "target_group_frontend_arn" {
  value       = aws_lb_target_group.frontend.arn
  description = "Frontend target group ARN"
}

output "target_group_sentry_arn" {
  value       = aws_lb_target_group.sentry.arn
  description = "Sentry target group ARN"
}

output "logs_bucket_name" {
  value       = aws_s3_bucket.lb_logs.bucket
  description = "S3 bucket where ALB access logs are stored"
}

output "domain_validation_options" {
  value       = aws_acm_certificate.ingress.domain_validation_options
  description = "ACM certificate domain validation options (for manual DNS validation)"
}
