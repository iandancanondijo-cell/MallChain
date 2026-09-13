resource "aws_docdb_subnet_group" "mongo" {
  name       = "${var.cluster_name}-${var.environment}-docdb"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.cluster_name}-${var.environment}-docdb"
  }
}

resource "aws_security_group" "mongo" {
  name        = "${var.cluster_name}-${var.environment}-docdb"
  description = "DocumentDB security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "MongoDB from app subnet"
    from_port   = 27017
    to_port     = 27017
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
    Name = "${var.cluster_name}-${var.environment}-docdb"
  }
}

resource "aws_docdb_cluster_parameter_group" "mongo" {
  name   = "${var.cluster_name}-${var.environment}-docdb"
  family = "docdb${split(".", var.engine_version)[0]}.0"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "audit_logs"
    value = "disabled"
  }
}

resource "random_password" "docdb_master" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  number  = true

  override_special = "_-@%+^#~"

  keepers = {
    cluster_name = var.cluster_name
    environment  = var.environment
  }
}

resource "aws_docdb_cluster" "mongo" {
  cluster_identifier                   = "${var.cluster_name}-${var.environment}-docdb"
  engine                               = "docdb"
  engine_version                       = var.engine_version
  master_username                      = var.master_username
  master_password                      = random_password.docdb_master.result
  backup_retention_period              = var.backup_retention_period_days
  preferred_backup_window              = var.preferred_backup_window
  preferred_maintenance_window         = var.preferred_maintenance_window
  db_subnet_group_name                 = aws_docdb_subnet_group.mongo.name
  vpc_security_group_ids               = [aws_security_group.mongo.id]
  db_cluster_parameter_group_name      = aws_docdb_cluster_parameter_group.mongo.name
  storage_encrypted                    = true
  kms_key_id                           = var.kms_key_arn
  deletion_protection                  = var.deletion_protection
  skip_final_snapshot                  = var.skip_final_snapshot
  final_snapshot_identifier_prefix     = var.environment == "production" ? "${var.cluster_name}-${var.environment}-docdb-final" : null
  apply_immediately                    = false

  tags = {
    Name = "${var.cluster_name}-${var.environment}-docdb"
  }
}

resource "aws_docdb_cluster_instance" "mongo" {
  count                       = var.num_instances
  identifier                  = "${var.cluster_name}-${var.environment}-docdb-${count.index}"
  cluster_identifier          = aws_docdb_cluster.mongo.id
  instance_class              = var.instance_class
  engine                      = "docdb"
  db_parameter_group_name     = aws_docdb_cluster_parameter_group.mongo.name
  apply_immediately           = false
  auto_minor_version_upgrade  = true

  tags = {
    Name = "${var.cluster_name}-${var.environment}-docdb-${count.index}"
  }
}
