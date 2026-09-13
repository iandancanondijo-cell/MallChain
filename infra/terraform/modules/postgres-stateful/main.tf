resource "aws_db_subnet_group" "postgres" {
  name       = "${var.cluster_name}-${var.environment}-postgres"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.cluster_name}-${var.environment}-postgres"
  }
}

resource "aws_security_group" "postgres" {
  name        = "${var.cluster_name}-${var.environment}-postgres"
  description = "PostgreSQL security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "PostgreSQL from app subnet"
    from_port   = 5432
    to_port     = 5432
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
    Name = "${var.cluster_name}-${var.environment}-postgres"
  }
}

resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${var.cluster_name}-${var.environment}-postgres-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole",
  ]
}

resource "random_password" "postgres_master" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  number  = true

  keepers = {
    cluster_name = var.cluster_name
    environment  = var.environment
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${var.cluster_name}-${var.environment}-postgres"
  engine                 = "postgres"
  engine_version         = var.engine_version
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage_gb
  max_allocated_storage  = var.max_allocated_storage_gb
  storage_type           = "gp3"
  storage_encrypted      = true
  kms_key_id             = var.kms_key_arn
  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  multi_az               = var.multi_az

  db_name  = var.snapshot_identifier == "" ? var.db_name : null
  username = var.snapshot_identifier == "" ? var.db_username : null
  password = var.snapshot_identifier == "" ? random_password.postgres_master.result : null

  snapshot_identifier = var.snapshot_identifier != "" ? var.snapshot_identifier : null

  backup_retention_period = var.backup_retention_period_days
  preferred_backup_window = var.preferred_backup_window
  preferred_maintenance_window = var.preferred_maintenance_window
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier_prefix = var.environment == "production" ? "${var.cluster_name}-${var.environment}-postgres-final" : null

  performance_insights_enabled    = var.performance_insights_enabled
  performance_insights_retention_period = 93
  performance_insights_kms_key_id = var.kms_key_arn

  monitoring_interval           = var.monitoring_interval_seconds
  monitoring_role_arn           = aws_iam_role.rds_enhanced_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  auto_minor_version_upgrade = true
  allow_major_version_upgrade = false
  deletion_protection        = var.environment == "production"

  tags = {
    Name = "${var.cluster_name}-${var.environment}-postgres"
  }
}
