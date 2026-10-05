# Mallchain Production Terraform Variables
# Generated: 2026-09-25
# Redis AUTH token generated with: openssl rand -base64 48 | tr -d '/+=' | head -c 64

redis_auth_token = "ADy4dRLmVZ3EOVhOt4Whir64JUC3yZIBJarWkfw6C3Q3zEF6rSRKI3cGy5foClW"

aws_region   = "eu-west-1"
environment  = "production"
cluster_name = "mallchain"

eks_min_nodes           = 2
eks_max_nodes           = 6
eks_node_instance_types = ["t3.large"]

github_repo = "iandancanondijo-cell/MallChain"
