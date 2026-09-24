terraform {
  required_version = ">= 1.5"

  # Remote state with DynamoDB locking — a local terraform.tfstate holding
  # production RDS passwords, Vault unseal keys, and EKS cluster config is a
  # single-point-of-loss disaster waiting to happen. The bucket and table must
  # exist before `terraform init`; create them once out-of-band:
  #   aws s3api create-bucket --bucket mallchain-terraform-state \
  #     --region eu-west-1 --create-bucket-configuration LocationConstraint=eu-west-1
  #   aws s3api put-bucket-versioning --bucket mallchain-terraform-state \
  #     --versioning-configuration Status=Enabled
  #   aws s3api put-public-access-block --bucket mallchain-terraform-state \
  #     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  #   aws dynamodb create-table --table-name mallchain-terraform-locks \
  #     --attribute-definitions AttributeName=LockID,AttributeType=S \
  #     --key-schema AttributeName=LockID,KeyType=HASH \
  #     --billing-mode PAY_PER_REQUEST --region eu-west-1
  backend "s3" {
    bucket         = "mallchain-terraform-state"
    key            = "infra/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "mallchain-terraform-locks"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    template = {
      source  = "hashicorp/template"
      version = "~> 2.2"
    }
  }
}
