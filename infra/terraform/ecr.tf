resource "aws_ecr_repository" "backend" {
  name                 = "mallchain-backend"
  image_tag_mutability = "IMMUTABLE" # a tag must never silently point at different image content once pushed

  image_scanning_configuration {
    scan_on_push = true # complements the CI-time Trivy scan (.github/workflows/ci.yml) with a registry-side one
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "mallchain-frontend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "marketplaced" {
  name                 = "mallchain-marketplaced"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "expire_untagged" {
  for_each = {
    backend      = aws_ecr_repository.backend.name
    frontend     = aws_ecr_repository.frontend.name
    marketplaced = aws_ecr_repository.marketplaced.name
  }
  repository = each.value

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}
