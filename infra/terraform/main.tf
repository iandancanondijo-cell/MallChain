# Mallchain Infrastructure as Code
# Terraform configuration for production deployment
#
# Deployment model: Blue-Green with GitOps (ArgoCD)
# HA architecture with auto-scaling

terraform {
  required_version = ">= 1.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "s3" {
    bucket         = "mallchain-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "kubernetes" {
  host                   = var.k8s_cluster_endpoint
  cluster_ca_certificate = base64decode(var.k8s_cluster_ca)
  token                  = var.k8s_auth_token
}

provider "helm" {
  kubernetes {
    host                   = var.k8s_cluster_endpoint
    cluster_ca_certificate = base64decode(var.k8s_cluster_ca)
    token                  = var.k8s_auth_token
  }
}

# Namespace for Mallchain
resource "kubernetes_namespace" "mallchain" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/name"       = "mallchain"
      "app.kubernetes.io/instance"   = "prod"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# ConfigMap for application configuration
resource "kubernetes_config_map" "app_config" {
  metadata {
    name      = "mallchain-config"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
  }

  data = {
    NODE_ENV              = var.environment
    LOG_LEVEL             = var.log_level
    JAEGER_ENABLED        = "true"
    JAEGER_HOST           = "jaeger.monitoring"
    JAEGER_PORT           = "4318"
    REDIS_CLUSTER_ENABLED = "true"
    MONGODB_REPLSET       = "rs0"
  }
}

# Secret for sensitive configuration
resource "kubernetes_secret" "app_secrets" {
  metadata {
    name      = "mallchain-secrets"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
  }

  data = {
    JWT_SECRET      = var.jwt_secret
    SESSION_SECRET  = var.session_secret
    ADMIN_API_KEY   = var.admin_api_key
    MONGODB_URL     = var.mongodb_url
    REDIS_URL       = var.redis_url
    REQUEST_SIGNING_KEY_1 = var.request_signing_key
  }

  type = "Opaque"
}

# Deployment: Backend API
resource "kubernetes_deployment" "backend_api" {
  metadata {
    name      = "mallchain-backend"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
    labels = {
      "app" = "mallchain-backend"
    }
  }

  spec {
    replicas = var.backend_replicas

    selector {
      match_labels = {
        "app" = "mallchain-backend"
      }
    }

    template {
      metadata {
        labels = {
          "app" = "mallchain-backend"
          "version" = var.app_version
        }
        annotations = {
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "9090"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        # Pod disruption budget for safe rollouts
        disruption_budget {
          min_available = 1
        }

        containers {
          name  = "backend"
          image = "${var.image_registry}/mallchain-backend:${var.app_version}"
          image_pull_policy = "IfNotPresent"

          ports {
            name           = "http"
            container_port = 3000
          }

          ports {
            name           = "metrics"
            container_port = 9090
          }

          # Environment variables from ConfigMap and Secrets
          env_from {
            config_map_ref {
              name = kubernetes_config_map.app_config.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.app_secrets.metadata[0].name
            }
          }

          # Health checks
          liveness_probe {
            http_get {
              path   = "/api/live"
              port   = 3000
              scheme = "HTTP"
            }
            initial_delay_seconds = 30
            period_seconds        = 10
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path   = "/api/ready"
              port   = 3000
              scheme = "HTTP"
            }
            initial_delay_seconds = 10
            period_seconds        = 5
            failure_threshold     = 2
          }

          # Resource limits
          resources {
            requests = {
              cpu    = "500m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "2000m"
              memory = "2Gi"
            }
          }

          # Volume mount for logs
          volume_mount {
            name       = "logs"
            mount_path = "/app/logs"
          }

          # Security context
          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = true
            run_as_non_root            = true
            run_as_user                = 1000
          }
        }

        # Volumes
        volume {
          name = "logs"
          empty_dir {
            medium = "Memory"
          }
        }

        # Pod security context
        security_context {
          fs_group = 1000
        }

        # Node affinity for performance
        affinity {
          pod_anti_affinity {
            preferred_during_scheduling_ignored_during_execution {
              weight = 100
              pod_affinity_term {
                label_selector {
                  match_expressions {
                    key      = "app"
                    operator = "In"
                    values   = ["mallchain-backend"]
                  }
                }
                topology_key = "kubernetes.io/hostname"
              }
            }
          }
        }
      }
    }

    # Blue-Green strategy
    strategy {
      type = "RollingUpdate"

      rolling_update {
        max_surge       = "1"
        max_unavailable = "0"
      }
    }
  }
}

# Service for Backend
resource "kubernetes_service" "backend_api" {
  metadata {
    name      = "mallchain-backend"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
  }

  spec {
    selector = {
      "app" = "mallchain-backend"
    }

    ports {
      name       = "http"
      port       = 80
      target_port = 3000
      protocol   = "TCP"
    }

    type = "ClusterIP"
  }
}

# HorizontalPodAutoscaler for auto-scaling
resource "kubernetes_horizontal_pod_autoscaler_v2" "backend_hpa" {
  metadata {
    name      = "mallchain-backend-hpa"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
  }

  spec {
    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.backend_api.metadata[0].name
    }

    min_replicas = var.backend_replicas
    max_replicas = var.backend_max_replicas

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    metric {
      type = "Resource"
      resource {
        name = "memory"
        target {
          type                = "Utilization"
          average_utilization = 80
        }
      }
    }

    behavior {
      scale_down {
        stabilization_window_seconds = 300
        policies {
          type          = "Percent"
          value         = 50
          period_seconds = 60
        }
      }
      scale_up {
        stabilization_window_seconds = 0
        policies {
          type          = "Percent"
          value         = 100
          period_seconds = 15
        }
        policies {
          type          = "Pods"
          value         = 1
          period_seconds = 15
        }
      }
    }
  }
}

# PodDisruptionBudget for safe rollouts
resource "kubernetes_pod_disruption_budget_v1" "backend_pdb" {
  metadata {
    name      = "mallchain-backend-pdb"
    namespace = kubernetes_namespace.mallchain.metadata[0].name
  }

  spec {
    min_available = 1

    selector {
      match_labels = {
        "app" = "mallchain-backend"
      }
    }
  }
}

# Outputs
output "backend_service_endpoint" {
  value = kubernetes_service.backend_api.spec[0].cluster_ip
  description = "Internal Kubernetes service endpoint for backend"
}

output "namespace" {
  value = kubernetes_namespace.mallchain.metadata[0].name
  description = "Kubernetes namespace for Mallchain"
}
