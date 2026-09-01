terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # State should live in a real remote backend (S3 + DynamoDB lock table, or
  # Terraform Cloud) before this is ever applied for real — local state for
  # infrastructure holding production secrets/DB credentials is not safe to
  # leave as the default. Left unconfigured here deliberately rather than
  # pointing `backend "s3"` at a bucket name I'd have to invent.
}
