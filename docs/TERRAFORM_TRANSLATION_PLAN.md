# MALLCHAIN — TERRAFORM TRANSLATION PLAN

**Objective**: Translate approved AWS architecture into Terraform (IaC)  
**Status**: Planning document (NO PROVISIONING, NO terraform apply)  
**Target**: Align existing `infra/terraform/` with approved production specification  
**Date**: September 19, 2026

---

## CURRENT STATE vs APPROVED ARCHITECTURE

### Current Terraform (`infra/terraform/`)

| Component | Current | Issue |
|-----------|---------|-------|
| **Compute** | EKS (Kubernetes) | Approved uses EC2 + docker-compose |
| **MongoDB** | AWS DocumentDB (managed) | Approved uses self-managed MongoDB (compatibility unproven) |
| **Redis** | ElastiCache (managed) | ✅ Compatible, keep |
| **PostgreSQL** | AWS RDS (managed) | ✅ Compatible, keep |
| **Validator** | Not in Terraform | Missing; needs dedicated EC2 + EBS |
| **Public RPC** | Not defined | Missing; needs NLB + RPC proxy |
| **Backend/Frontend** | K8s deployments | Needs to be docker-compose on EC2 |
| **Load Balancer** | ALB only | Needs NLB for RPC/REST |
| **VPC** | 10.20.0.0/16 | ✅ Reusable (adjust subnets) |
| **TLS** | ACM + ALB | ✅ Reusable, add NLB |
| **Secrets Manager** | Yes | ✅ Reusable |
| **KMS** | Yes | ✅ Reusable |

### Architectural Mismatch

```
CURRENT: EKS Kubernetes cluster
├── Deploy backend pod
├── Deploy frontend pod
├── Deploy chain-sentry pod (container in K8s)
├── Deploy MongoDB pod (DocumentDB managed service)
├── Deploy Redis cluster (ElastiCache managed)
└── No validator persistent storage strategy

APPROVED: EC2 instances + docker-compose
├── EC2 Instance 1: docker-compose (backend, frontend, nginx, vault, postgres)
├── EC2 Instance 2: docker-compose (validator blockchain node, persistent EBS)
├── ElastiCache Redis (keep, reuse)
├── Self-managed MongoDB 3-node replica set (EC2 instances + EBS or containers)
├── ALB for frontend + backend API
├── NLB for RPC/REST gateway
└── Public RPC as first-class service
```

---

## TERRAFORM TRANSLATION STRATEGY

### Phase 1: Assessment (No Changes)

**Status**: Existing Terraform is deployable but architecturally misaligned

**Decision points**:

1. **EKS vs EC2**: Approved architecture uses EC2 + docker-compose, not Kubernetes
   - Current EKS code can be preserved as-is (not deleted) for reference
   - Create new EC2 resources instead of deploying to EKS
   - Decision: Keep EKS module (commented out or in separate workspace) OR delete and rebuild

2. **DocumentDB vs MongoDB**: Current Terraform provisions DocumentDB
   - Approved requires self-managed MongoDB (compatibility audit needed for DocumentDB)
   - Decision: Remove DocumentDB module, add MongoDB EC2 instances or containers

3. **Validator**: Currently not in Terraform
   - Add new EC2 instance for validator
   - Add EBS volume for persistent blockchain state
   - Add security group restricting RPC to internal only

4. **Public RPC**: Not currently defined
   - Add NLB (separate from existing ALB)
   - Add RPC proxy (nginx container or separate EC2)
   - Add DNS records for rpc.mallchain.network, rest.mallchain.network

---

## TERRAFORM CHANGES REQUIRED

### Files to Modify

1. **versions.tf** ✅ No changes (terraform version, providers OK)

2. **backend.tf** ✅ No changes (S3 + DynamoDB state management OK)

3. **provider.tf** ✅ No changes (AWS provider OK)

4. **variables.tf** ⚠️ Needs review
   - Add variables for EC2 instance types
   - Add variables for validator configuration
   - Add variables for RPC/REST endpoints
   - Add variables for domain/subdomains

5. **vpc.tf** ⚠️ Reusable but review
   - Current: 10.20.0.0/16 with 3 AZs (good)
   - Approved: 10.0.0.0/16 with 3 AZs (different CIDR)
   - **Decision**: Use 10.0.0.0/16 (per approved spec) — requires subnet CIDR update
   - Subnets need renaming: public, app, data, validator (vs current structure)

6. **eks.tf** ❌ Conflicts with approved architecture
   - Current: Provisions EKS cluster (Kubernetes)
   - Approved: Uses EC2 + docker-compose (no Kubernetes)
   - **Decision**: Remove or isolate EKS code (can comment out, keep for reference)

7. **ecr.tf** ✅ Keep (container registries are still needed)
   - Backend image → AWS ECR
   - Frontend image → AWS ECR  
   - Validator image → AWS ECR
   - No changes needed

8. **github-oidc.tf** ✅ Keep (CI/CD still uses GitHub Actions)
   - No changes needed (works with EC2-based deployments too)

9. **data-services.tf** ⚠️ Significant changes needed
   - **Keep**: ElastiCache Redis module ✅
   - **Keep**: RDS PostgreSQL module ✅
   - **Keep**: Vault EC2 module ✅
   - **Remove**: DocumentDB module (mongo-replica) ❌
   - **Add**: MongoDB EC2 instances or docker-compose containers
   - **Add**: Backend EC2 instance (docker-compose)
   - **Add**: Validator EC2 instance (dedicated, persistent EBS)
   - **Add**: NLB for RPC/REST

10. **outputs.tf** ⚠️ Needs update
    - Remove DocumentDB outputs
    - Add Backend EC2 outputs (IP, security group, etc.)
    - Add Validator EC2 outputs (IP, EBS volume ID, etc.)
    - Add NLB outputs (DNS name, target group ARNs, etc.)
    - Add RPC gateway outputs

11. **terraform.tfvars** ⚠️ Needs update
    - Change environment (staging → production or keep staging)
    - Add EC2 instance sizes
    - Add domain names (app.*, api.*, rpc.*, rest.*)
    - Add validator configuration
    - Keep github_repo

### Modules to Modify or Create

1. **modules/vpc** (or keep terraform vpc module)
   - Update CIDR: 10.20.0.0/16 → 10.0.0.0/16
   - Update subnet structure (public, app, data, validator)
   - Keep multi-AZ design (3 AZs)

2. **modules/nginx-ingress** ✅ Keep ALB, but add NLB
   - Existing: ALB for frontend + backend API
   - **Add**: NLB for RPC/REST (separate from ALB)

3. **modules/mongo-replica** ❌ Remove/Replace
   - Current: AWS DocumentDB (managed)
   - Replace with: EC2-based MongoDB or docker-compose containers

4. **modules/redis-sentinel** ✅ Keep
   - Existing: ElastiCache Redis (managed, compatible)
   - No changes

5. **modules/postgres-stateful** ✅ Keep
   - Existing: RDS PostgreSQL (managed)
   - No changes

6. **modules/vault-server** ✅ Keep
   - Existing: EC2 Vault instance (self-managed)
   - No changes

7. **[NEW] modules/backend-ec2**
   - Purpose: Backend/Frontend EC2 instance with docker-compose
   - Resources: EC2 instance, security group, EBS volume, IAM role
   - Configuration: docker-compose for backend, frontend, nginx, vault, postgres

8. **[NEW] modules/validator-ec2**
   - Purpose: Validator node EC2 instance
   - Resources: EC2 instance, security group, EBS volume (500GB), IAM role
   - Configuration: Single blockchain container, systemd service
   - Networking: No public IP, private subnet, restricted RPC

9. **[NEW] modules/rpc-gateway**
   - Purpose: NLB + RPC proxy for public RPC/REST endpoints
   - Resources: NLB, target groups, listener rules, security group
   - Configuration: nginx proxy (rate limiting, connection pooling)

10. **[NEW] modules/network-load-balancer**
    - Purpose: Separate NLB for high-throughput RPC/REST
    - Resources: NLB, target groups, health checks
    - Configuration: TCP routing, TLS termination

---

## REQUIRED NEW TERRAFORM RESOURCES

### 1. Backend EC2 Instance

```hcl
resource "aws_instance" "backend" {
  ami           = data.aws_ami.ubuntu_22_04_lts.id
  instance_type = var.backend_instance_type  # default: t3.xlarge
  
  subnet_id                   = aws_subnet.app_primary.id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.backend.id]
  iam_instance_profile        = aws_iam_instance_profile.backend.name
  
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 100
    delete_on_termination = true
    encrypted             = true
    kms_key_id            = aws_kms_key.data_services.arn
  }
  
  user_data = base64encode(templatefile("${path.module}/userdata/backend-startup.sh", {
    docker_compose_repo = var.github_repo
    environment         = var.environment
    chain_rpc           = "http://${aws_instance.validator.private_ip}:26657"
    chain_rest          = "http://${aws_instance.validator.private_ip}:1317"
    mongo_uri           = aws_docdb_cluster.mongo.endpoint  # or self-managed
    redis_host          = aws_elasticache_cluster.redis.primary_endpoint_address
  }))
  
  tags = {
    Name = "mallchain-backend-${var.environment}"
  }
}
```

### 2. Validator EC2 Instance

```hcl
resource "aws_instance" "validator" {
  ami           = data.aws_ami.ubuntu_22_04_lts.id
  instance_type = var.validator_instance_type  # default: t3.2xlarge
  
  subnet_id                   = aws_subnet.validator_primary.id
  associate_public_ip_address = false
  vpc_security_group_ids      = [aws_security_group.validator.id]
  iam_instance_profile        = aws_iam_instance_profile.validator.name
  
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 500
    delete_on_termination = false  # IMPORTANT: Persist blockchain data
    encrypted             = true
    kms_key_id            = aws_kms_key.data_services.arn
    iops                  = 3000
    throughput            = 125
  }
  
  user_data = base64encode(templatefile("${path.module}/userdata/validator-startup.sh", {
    blockchain_home = "/home/marketplaced/.marketplaced"
    chain_id        = "mallchain-1"
  }))
  
  tags = {
    Name = "mallchain-validator-${var.environment}"
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ebs_snapshot_schedule" "validator" {
  description        = "Daily snapshots of validator blockchain state"
  schedule_interval  = 24  # hours
  schedule_time      = "02:00"  # 2 AM UTC
  retention          = 7  # days
  
  tags = {
    Name = "mallchain-validator-snapshots-${var.environment}"
  }
}
```

### 3. Network Load Balancer for RPC/REST

```hcl
resource "aws_lb" "rpc" {
  name               = "mallchain-nlb-rpc-${var.environment}"
  internal           = false
  load_balancer_type = "network"
  subnets            = aws_subnet.public[*].id
  
  enable_deletion_protection = var.environment == "production"
  enable_cross_zone_load_balancing = true
  
  tags = {
    Name = "mallchain-rpc-nlb-${var.environment}"
  }
}

resource "aws_lb_target_group" "rpc" {
  name        = "mallchain-rpc-targets-${var.environment}"
  port        = 26657
  protocol    = "TCP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"
  
  health_check {
    enabled           = true
    healthy_threshold = 2
    unhealthy_threshold = 3
    interval          = 30
    timeout           = 10
    port              = "26657"
    protocol          = "TCP"
  }
}

resource "aws_lb_listener" "rpc_tls" {
  load_balancer_arn = aws_lb.rpc.arn
  port              = 26657
  protocol          = "TLS"
  certificate_arn   = aws_acm_certificate.main.arn
  
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.rpc.arn
  }
}

resource "aws_lb_target_group_attachment" "rpc_backend" {
  target_group_arn = aws_lb_target_group.rpc.arn
  target_id        = aws_instance.backend.id
  port             = 26657  # nginx RPC proxy port
}
```

### 4. Security Groups

```hcl
# Backend security group (allows ALB → backend, internal RPC/REST)
resource "aws_security_group" "backend" {
  name   = "mallchain-backend-${var.environment}"
  vpc_id = aws_vpc.main.id
  
  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  
  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  
  ingress {
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  
  ingress {
    from_port       = 26657
    to_port         = 26657
    protocol        = "tcp"
    cidr_blocks     = [aws_vpc.main.cidr_block]  # Internal RPC
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Validator security group (NO direct RPC exposure)
resource "aws_security_group" "validator" {
  name   = "mallchain-validator-${var.environment}"
  vpc_id = aws_vpc.main.id
  
  ingress {
    from_port       = 26657
    to_port         = 26657
    protocol        = "tcp"
    cidr_blocks     = ["127.0.0.1/32"]  # localhost only (NOT 0.0.0.0)
  }
  
  ingress {
    from_port       = 26656
    to_port         = 26656
    protocol        = "tcp"
    security_groups = [aws_security_group.validator.id]  # Peer-to-peer
  }
  
  ingress {
    from_port       = 26660
    to_port         = 26660
    protocol        = "tcp"
    cidr_blocks     = [aws_vpc.main.cidr_block]  # Prometheus metrics
  }
  
  egress {
    from_port   = 26656
    to_port     = 26656
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # To validator peers
  }
  
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # CloudWatch, Secrets Manager
  }
}
```

### 5. Self-Managed MongoDB (if not using containers)

```hcl
# Option A: EC2 instances for MongoDB nodes
resource "aws_instance" "mongodb" {
  count             = 3
  ami               = data.aws_ami.ubuntu_22_04_lts.id
  instance_type     = var.mongodb_instance_type  # default: t3.medium
  subnet_id         = aws_subnet.data[count.index % 3].id
  security_groups   = [aws_security_group.data.id]
  
  root_block_device {
    volume_type = "gp3"
    volume_size = 100
    encrypted   = true
    kms_key_id  = aws_kms_key.data_services.arn
  }
  
  user_data = base64encode(templatefile("${path.module}/userdata/mongodb-startup.sh", {
    replica_set_name = "mallchain-rs"
    node_number      = count.index + 1
  }))
  
  tags = {
    Name = "mallchain-mongodb-${count.index + 1}-${var.environment}"
  }
}

# Option B: Docker containers on backend EC2 (via docker-compose)
# (Simpler for initial launch; MongoDB runs as containers alongside backend)
```

### 6. DNS Records (Route 53)

```hcl
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain}"
  type    = "A"
  alias {
    name                   = aws_lb.alb.dns_name
    zone_id                = aws_lb.alb.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  alias {
    name                   = aws_lb.alb.dns_name
    zone_id                = aws_lb.alb.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "rpc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "rpc.${var.domain}"
  type    = "A"
  alias {
    name                   = aws_lb.rpc.dns_name
    zone_id                = aws_lb.rpc.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "rest" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "rest.${var.domain}"
  type    = "A"
  alias {
    name                   = aws_lb.rpc.dns_name
    zone_id                = aws_lb.rpc.zone_id
    evaluate_target_health = true
  }
}
```

---

## TERRAFORM FILE STRUCTURE (Proposed)

```
infra/terraform/
├── versions.tf              ✅ Keep
├── provider.tf              ✅ Keep
├── backend.tf               ✅ Keep
├── variables.tf             ⚠️ Modify (add EC2 variables)
├── terraform.tfvars         ⚠️ Modify (update values)
│
├── vpc.tf                   ⚠️ Modify (update CIDR, subnets)
├── kms.tf                   ✅ Keep
├── iam.tf                   ⚠️ Modify (add backend/validator roles)
│
├── ecr.tf                   ✅ Keep
├── github-oidc.tf           ✅ Keep
│
├── data-services.tf         ⚠️ Rewrite
│   ├── Remove: mongodb (DocumentDB)
│   ├── Keep: postgres (RDS)
│   ├── Keep: redis (ElastiCache)
│   ├── Keep: vault (EC2)
│   ├── Add: backend EC2
│   ├── Add: validator EC2
│   ├── Add: NLB for RPC/REST
│
├── alb.tf                   ✅ Keep (but rename to app-load-balancer.tf for clarity)
├── nlb.tf                   ✨ New (Network Load Balancer for RPC/REST)
│
├── security-groups.tf       ✨ New (all security groups)
├── dns.tf                   ✨ New (Route 53 records)
│
├── outputs.tf               ⚠️ Modify (update outputs)
│
├── eks.tf                   ❌ Remove or comment out
├── eks-*.tf                 ❌ Remove (if other EKS files exist)
│
├── userdata/                ✨ New directory
│   ├── backend-startup.sh   ✨ New (docker-compose startup)
│   ├── validator-startup.sh ✨ New (blockchain node startup)
│   └── mongodb-startup.sh   ✨ New (MongoDB EC2 startup, if not containerized)
│
└── modules/                 ⚠️ Update
    ├── vpc/                 ✅ Keep (update CIDR ranges)
    ├── nginx-ingress/       ✅ Keep ALB, but refactor for clarity
    ├── redis-sentinel/      ✅ Keep
    ├── postgres-stateful/   ✅ Keep
    ├── vault-server/        ✅ Keep
    ├── mongo-replica/       ❌ Remove (DocumentDB)
    ├── backend-ec2/         ✨ New
    ├── validator-ec2/       ✨ New
    ├── nlb-rpc/             ✨ New
    └── rpc-gateway/         ✨ New
```

---

## CONFLICTS & RESOLUTIONS

### Conflict 1: EKS vs EC2

**Current**: `eks.tf` provisions Kubernetes cluster  
**Approved**: Uses EC2 + docker-compose (no Kubernetes)

**Resolution**:
- **Option A** (Minimal disruption): Keep EKS code but don't deploy to it
  - Isolate EKS to separate workspace or comment out
  - Create new EC2-based resources in main configuration
- **Option B** (Cleaner): Remove EKS code entirely
  - Delete `eks.tf`
  - Create new `ec2-backend.tf`, `ec2-validator.tf`
  - Pro: Cleaner code; Con: Loses reference implementation

**Recommendation**: **Option B** (remove EKS code, start fresh with EC2)
- EKS can be re-added as separate workspace later
- Keeps approved architecture clean
- No legacy code confusion

### Conflict 2: DocumentDB vs Self-Managed MongoDB

**Current**: `data-services.tf` `mongo_replica` module provisions DocumentDB  
**Approved**: Self-managed MongoDB (compatibility audit required)

**Resolution**:
- **Option A**: Remove DocumentDB module entirely
  - Add self-managed MongoDB (EC2 instances or docker-compose containers)
  - Clean break from DocumentDB
- **Option B**: Keep DocumentDB for future migration
  - Add self-managed MongoDB alongside
  - Plan migration path
  - Adds complexity

**Recommendation**: **Option A** (remove DocumentDB)
- Align with approved architecture
- Can add DocumentDB migration workflow later after audit
- Simpler initial deployment

### Conflict 3: No Validator Definition

**Current**: Validator not in Terraform (runs as docker container in EKS)  
**Approved**: Dedicated EC2 instance with persistent EBS

**Resolution**:
- Add new `ec2-validator.tf` file
- Define EC2 instance with 500GB encrypted EBS
- Ensure `delete_on_termination = false` on root volume
- Configure security group to restrict RPC to localhost

### Conflict 4: Missing Public RPC Service

**Current**: ALB only (frontend + backend API)  
**Approved**: NLB (for RPC/REST) + RPC proxy

**Resolution**:
- Add new `nlb.tf` file
- Create Network Load Balancer
- Define target group for RPC proxy
- Add TLS listener (port 26657, 1317)
- Create nginx RPC proxy container configuration

### Conflict 5: VPC CIDR Mismatch

**Current**: 10.20.0.0/16  
**Approved**: 10.0.0.0/16

**Resolution**:
- Update `vpc.tf` to use 10.0.0.0/16
- Update subnet CIDRs:
  - Public: 10.0.1.0/24 (was 10.20.100.0/24)
  - App: 10.0.2.0/24 (was 10.20.0.0/24)
  - Data: 10.0.3.0/24 (was 10.20.1.0/24)
  - Validator: 10.0.4.0/24 (new)

---

## TERRAFORM VALIDATION & SAFETY CHECKS

### Before Making Changes

```bash
# Current state
cd infra/terraform/
terraform fmt -recursive
terraform validate
terraform plan -out=tfplan.current
```

### After Translation

```bash
# Format new code
terraform fmt -recursive

# Validate syntax
terraform validate

# Generate plan (NO APPLY)
terraform plan -out=tfplan.approved
terraform show tfplan.approved > tfplan-readable.txt

# Review critical resources
grep "aws_instance" tfplan-readable.txt | head -20
grep "destroy" tfplan-readable.txt  # Check for deletions
grep "create" tfplan-readable.txt   # Check for new resources
```

### Safety Constraints

1. **NO resources should be destroyed** (except DocumentDB module removal, which is intentional)
2. **Validator EBS: delete_on_termination = false** (blockchain data persistence)
3. **Validator: associate_public_ip_address = false** (no direct internet)
4. **Validator RPC: restricted to localhost only** (127.0.0.1)
5. **Public ports: 80, 443 only** (no 26657 or other ports directly public)

---

## IMPLEMENTATION ORDER

### Step 1: Assessment (This Document)
- ✅ Identify conflicts
- ✅ Document strategy
- ✅ Plan changes

### Step 2: Preparation (Next Steps)
- [ ] Create git branch (feature/approved-architecture)
- [ ] Backup current `infra/terraform/` state
- [ ] Document current configuration

### Step 3: Remove Conflicting Resources
- [ ] Delete or isolate `eks.tf`
- [ ] Remove `modules/mongo-replica/` (DocumentDB)
- [ ] Update `data-services.tf` (remove mongo module call)

### Step 4: Add New Resources
- [ ] Create `modules/backend-ec2/`
- [ ] Create `modules/validator-ec2/`
- [ ] Create `modules/nlb-rpc/`
- [ ] Create `userdata/` scripts

### Step 5: Update VPC & Networking
- [ ] Update `vpc.tf` (CIDR ranges, subnets)
- [ ] Create `security-groups.tf`
- [ ] Create `dns.tf`

### Step 6: Update IAM & Secrets
- [ ] Create `iam.tf` (backend, validator instance profiles)
- [ ] Update Secrets Manager references

### Step 7: Validation
- [ ] terraform fmt -recursive
- [ ] terraform validate
- [ ] terraform plan (save output)
- [ ] Review plan for conflicts

### Step 8: Documentation
- [ ] Update README
- [ ] Document new variables
- [ ] Document deployment order
- [ ] Create runbooks

### Step 9: Ready for Review
- [ ] Commit to branch
- [ ] Create pull request
- [ ] Team review
- [ ] Approval before `terraform apply`

---

## RESOURCES THAT WILL BE CREATED

### Total Resource Count (Estimate)

| Category | Count | Details |
|----------|-------|---------|
| EC2 instances | 2-3 | Backend (1-2), Validator (1) |
| EBS volumes | 2-3 | Backend (100GB), Validator (500GB) |
| Security groups | 6 | ALB, Backend, Validator, Data, NLB, Internal |
| Load balancers | 2 | ALB (keep), NLB (new) |
| Target groups | 5 | Frontend (ALB), Backend (ALB), RPC (NLB), REST (NLB), Sentry (ALB optional) |
| Listeners | 4 | HTTP→HTTPS (ALB), HTTPS (ALB), RPC TLS (NLB), REST TLS (NLB) |
| DNS records | 4-5 | app.*, api.*, rpc.*, rest.*, www.* |
| IAM roles | 2 | Backend instance profile, Validator instance profile |
| KMS keys | 2 | Vault master, Data services (existing) |
| RDS | 1 | PostgreSQL (keep) |
| ElastiCache | 1 | Redis (keep) |
| ACM certificates | 1 | Wildcard (existing) |
| **Total** | **~31** | Conservative estimate |

---

## TERRAFORM PLAN EXAMPLE OUTPUT

When ready to generate the plan, it should show:

```
Plan: X to add, Y to change, Z to destroy

Add (new resources for approved architecture):
  + aws_instance.backend[0]
  + aws_instance.validator[0]
  + aws_ebs_volume.validator_data
  + aws_lb.rpc_gateway
  + aws_lb_target_group.rpc
  + aws_security_group.backend
  + aws_security_group.validator
  + aws_security_group.data
  + ... (other resources)

Change (modified configurations):
  ~ aws_subnet.private (CIDR update)
  ~ aws_route_table.private (routes)
  ~ aws_security_group.existing (additional rules)
  ~ aws_security_group.alb (additional rules)
  ... (other changes)

Destroy (removal of conflicting resources):
  - aws_eks_cluster.main (if removing EKS)
  - aws_eks_node_group.main (if removing EKS)
  - aws_docdb_cluster.mongo (DocumentDB)
  ... (EKS-related resources if removing)
```

**CRITICAL**: If anything shows destroying blockchain-related data (EBS volumes, databases), **STOP and investigate** before proceeding.

---

## UNRESOLVED QUESTIONS

1. **MongoDB EC2 vs Containers**: Should MongoDB run on:
   - Separate EC2 instances (3 nodes, dedicated)
   - Docker containers on backend EC2 (via docker-compose)
   - Current answer: Docker containers (simpler for initial launch)

2. **RPC Proxy Container**: Should RPC proxy run on:
   - Separate container (on backend EC2, expose via NLB)
   - Nginx module within backend container
   - Current answer: Separate nginx RPC proxy container (cleaner separation)

3. **Validator Init**: Should blockchain initialization be:
   - User data script on EC2 startup
   - Manual post-deployment setup
   - Current answer: User data script (automated)

4. **Failover Backend**: Should we provision:
   - Single backend EC2 (simplest)
   - Multiple backend EC2 + ALB failover
   - Current answer: Start with single, add failover later

---

## NEXT PHASE

This translation plan is ready for:

1. ✅ Review by DevOps/infrastructure team
2. ✅ Approval to proceed with implementation
3. ✅ Creation of git branch for changes
4. ✅ Execution of implementation steps

**Once approved and implemented**:
- Generate terraform plan
- Review for conflicts
- Validate all safety constraints
- Prepare for terraform apply (when team decides to provision)

---

**Status**: READY FOR APPROVAL AND IMPLEMENTATION

**No terraform apply until this plan is reviewed and approved.**

