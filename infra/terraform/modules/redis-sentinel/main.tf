resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.cluster_name}-${var.environment}-redis"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.cluster_name}-${var.environment}-redis"
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.cluster_name}-${var.environment}-redis"
  description = "ElastiCache Redis security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Redis from app subnet"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.app_subnet_cidr]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-redis"
  }
}

resource "aws_elasticache_parameter_group" "redis" {
  count = var.parameter_group_name == "" ? 1 : 0

  name   = "${var.cluster_name}-${var.environment}-redis"
  family = "redis${var.engine_version}.x"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Kx"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${var.cluster_name}-${var.environment}-redis"
  replication_group_description = "${var.cluster_name} ${var.environment} Redis replication group"

  engine                       = "redis"
  engine_version               = var.engine_version
  node_type                    = var.node_type
  num_cache_clusters           = var.num_cache_clusters
  automatic_failover_enabled   = var.automatic_failover_enabled
  multi_az_enabled             = var.automatic_failover_enabled

  port                         = 6379
  parameter_group_name         = var.parameter_group_name != "" ? var.parameter_group_name : aws_elasticache_parameter_group.redis[0].name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]

  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  kms_key_id                   = var.kms_key_arn

  snapshot_retention_limit     = var.snapshot_retention_limit_days
  snapshot_window              = var.snapshot_window
  maintenance_window           = var.maintenance_window

  auto_minor_version_upgrade   = true
  apply_immediately            = false

  tags = {
    Name = "${var.cluster_name}-${var.environment}-redis"
  }
}
