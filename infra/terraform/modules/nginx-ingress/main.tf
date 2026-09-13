resource "aws_security_group" "alb" {
  name        = "${var.cluster_name}-${var.environment}-ingress-alb"
  description = "Ingress ALB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP redirect from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound to VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress-alb"
  }
}

resource "aws_lb_target_group" "backend" {
  name     = "${var.cluster_name}-${var.environment}-backend"
  port     = var.backend_target_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = var.health_check_path
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  stickiness {
    enabled = false
    type    = "lb_cookie"
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-backend"
  }
}

resource "aws_lb_target_group" "frontend" {
  name     = "${var.cluster_name}-${var.environment}-frontend"
  port     = var.frontend_target_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-frontend"
  }
}

resource "aws_lb_target_group" "sentry" {
  name     = "${var.cluster_name}-${var.environment}-sentry"
  port     = var.sentry_target_port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    path                = "/_health/"
    protocol            = "HTTP"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 2
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-sentry"
  }
}

resource "aws_acm_certificate" "ingress" {
  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "ingress" {
  count = var.route53_zone_id != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.ingress.arn
  validation_record_fqdns = [for record in aws_acm_certificate.ingress.domain_validation_options : record.resource_record_name]
}

resource "aws_lb" "ingress" {
  name                       = "${var.cluster_name}-${var.environment}-ingress"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  enable_deletion_protection = var.environment == "production"
  drop_invalid_header_fields = true

  access_logs {
    bucket  = aws_s3_bucket.lb_logs.bucket
    prefix  = "alb-logs"
    enabled = true
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress"
  }
}

resource "aws_s3_bucket" "lb_logs" {
  bucket        = "${var.cluster_name}-${var.environment}-ingress-logs"
  force_destroy = var.environment != "production"

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress-logs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lb_logs" {
  bucket = aws_s3_bucket.lb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "lb_logs" {
  bucket = aws_s3_bucket.lb_logs.id
  policy = data.aws_iam_policy_document.lb_logs.json
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "lb_logs" {
  statement {
    effect  = "Allow"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.lb_logs.arn}/alb-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*",
    ]

    principals {
      type        = "Service"
      identifiers = ["logdelivery.elasticloadbalancing.amazonaws.com"]
    }
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.lb_logs.arn}/alb-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::054676820928:root"]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [aws_lb.ingress.arn]
    }
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.ingress.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.ingress.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.ingress.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_wafv2_web_acl" "ingress" {
  name        = "${var.cluster_name}-${var.environment}-ingress"
  description = "WAF for ingress ALB: common rules + rate limit"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 0

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "WAFCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateBased2000Per5Min"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_ip
        aggregate_key_type = "IP"
        evaluation_window_sec = var.rate_limit_window_minutes * 60
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "WAFRateBased"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "WAFIngressALB"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress-waf"
  }
}

resource "aws_wafv2_web_acl_association" "ingress" {
  resource_arn = aws_lb.ingress.arn
  web_acl_arn  = aws_wafv2_web_acl.ingress.arn
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_rate" {
  alarm_name          = "${var.cluster_name}-${var.environment}-ingress-5xx-rate-high"
  alarm_description   = "ALB 5xx error rate exceeds ${var.http_5xx_alarm_threshold_pct}% of total requests"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.ingress.arn_suffix
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  ok_actions    = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress-5xx-rate"
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_ratio" {
  alarm_name          = "${var.cluster_name}-${var.environment}-ingress-5xx-ratio"
  alarm_description   = "ALB 5xx ratio exceeds ${var.http_5xx_alarm_threshold_pct}% over 5 min window"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = var.http_5xx_alarm_threshold_pct
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "m1"
    expression  = "IF(m3 > 0, (m2/m3)*100, 0)"
    label       = "5XXRatePct"
    return_data = true
  }

  metric_query {
    id = "m2"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      period      = 300
      stat        = "Sum"
      dimensions = {
        LoadBalancer = aws_lb.ingress.arn_suffix
      }
    }
  }

  metric_query {
    id = "m3"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 300
      stat        = "Sum"
      dimensions = {
        LoadBalancer = aws_lb.ingress.arn_suffix
      }
    }
  }

  alarm_actions = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
  ok_actions    = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []

  tags = {
    Name = "${var.cluster_name}-${var.environment}-ingress-5xx-ratio"
  }
}
