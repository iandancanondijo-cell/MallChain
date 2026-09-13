resource "aws_kms_key" "vault_master" {
  description         = "${var.cluster_name}-${var.environment} Vault master key (seals + EBS)"
  deletion_window_in_days = 30
  enable_key_rotation = true
  is_enabled          = true
  multi_region        = false

  tags = {
    Name        = "${var.cluster_name}-${var.environment}-vault-master-key"
    Service     = "vault"
    Rotation    = "auto"
  }
}

resource "aws_kms_alias" "vault_master" {
  name          = "alias/${var.cluster_name}-${var.environment}-vault-master-key"
  target_key_id = aws_kms_key.vault_master.key_id
}

resource "aws_kms_key" "data_services" {
  description             = "${var.cluster_name}-${var.environment} data services encryption key (Postgres/Redis/DocDB)"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  is_enabled              = true
  multi_region            = false

  tags = {
    Name     = "${var.cluster_name}-${var.environment}-data-services-key"
    Services = "postgres,redis,docdb,alb-logs"
    Rotation = "auto"
  }
}

resource "aws_kms_alias" "data_services" {
  name          = "alias/${var.cluster_name}-${var.environment}-data-services-key"
  target_key_id = aws_kms_key.data_services.key_id
}

locals {
  app_subnet_cidr = "10.20.10.0/23"
}

module "vault_server" {
  source = "./modules/vault-server"

  cluster_name   = var.cluster_name
  environment    = var.environment
  aws_region     = var.aws_region
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnets
  app_subnet_cidr = local.app_subnet_cidr
  kms_key_arn    = aws_kms_key.vault_master.arn
}

module "postgres_stateful" {
  source = "./modules/postgres-stateful"

  cluster_name            = var.cluster_name
  environment             = var.environment
  aws_region              = var.aws_region
  vpc_id                  = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnets
  app_subnet_cidr         = local.app_subnet_cidr
  instance_class          = "db.r6g.large"
  engine_version          = "16"
  allocated_storage_gb    = 100
  max_allocated_storage_gb = 500
  multi_az                = true
  kms_key_arn             = aws_kms_key.data_services.arn
  db_name                 = "mallchain"
  db_username             = "mallchain_admin"
  backup_retention_period_days = 35
  performance_insights_enabled = true
  monitoring_interval_seconds  = 60
}

module "redis_sentinel" {
  source = "./modules/redis-sentinel"

  cluster_name           = var.cluster_name
  environment            = var.environment
  aws_region             = var.aws_region
  vpc_id                 = module.vpc.vpc_id
  subnet_ids             = module.vpc.private_subnets
  app_subnet_cidr        = local.app_subnet_cidr
  node_type              = "cache.r6g.large"
  engine_version         = "7"
  num_cache_clusters     = 3
  automatic_failover_enabled = true
  kms_key_arn            = aws_kms_key.data_services.arn
}

module "mongo_replica" {
  source = "./modules/mongo-replica"

  cluster_name            = var.cluster_name
  environment             = var.environment
  aws_region              = var.aws_region
  vpc_id                  = module.vpc.vpc_id
  subnet_ids              = module.vpc.private_subnets
  app_subnet_cidr         = local.app_subnet_cidr
  instance_class          = "db.r6g.large"
  engine_version          = "5.0.0"
  num_instances           = 3
  kms_key_arn             = aws_kms_key.data_services.arn
  master_username         = "mallchain_admin"
  backup_retention_period_days = 35
  preferred_backup_window = "02:00-03:00"
  deletion_protection     = var.environment == "production"
}

module "nginx_ingress" {
  source = "./modules/nginx-ingress"

  cluster_name        = var.cluster_name
  environment         = var.environment
  aws_region          = var.aws_region
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnets
  private_subnet_ids  = module.vpc.private_subnets
  domain_name         = "${var.environment == "production" ? "" : "${var.environment}."}mallchain.io"
  subject_alternative_names = [
    "${var.environment == "production" ? "www" : "www.${var.environment}"}.mallchain.io",
    "${var.environment == "production" ? "api" : "api.${var.environment}"}.mallchain.io",
    "${var.environment == "production" ? "sentry" : "sentry.${var.environment}"}.mallchain.io",
  ]
  backend_target_port  = 8080
  frontend_target_port = 3000
  sentry_target_port   = 9000
  rate_limit_per_ip    = 2000
  rate_limit_window_minutes = 5
  http_5xx_alarm_threshold_pct = 5
}
