provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "mallchain"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
