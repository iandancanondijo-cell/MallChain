# 🚀 MALLCHAIN DEPLOYMENT SETUP GUIDE

**Status**: Fixing deployment infrastructure  
**Blocker**: Missing ECR_REGISTRY and EKS_CLUSTER_NAME GitHub variables  
**Approach**: Infrastructure-first (Terraform) → GitHub variables → Deployment retry

---

## 📋 PROBLEM ANALYSIS

Your GitHub Actions deployment has been failing 13 consecutive times (Sept 13-14, 2026) because:

**Root Cause**: The deployment workflow requires two GitHub repository variables that are not set:

```
❌ ECR_REGISTRY = not set
❌ EKS_CLUSTER_NAME = not set
```

**Workflow Location**: `.github/workflows/deploy.yml`

**Error Log**: 
```
::error::repository variable ECR_REGISTRY is not set. 
Apply terraform and populate vars.ECR_REGISTRY with the `ecr_registry` output.
```

**Why**: Your Terraform creates ECR repositories and an EKS cluster, but the outputs weren't configured to be used by GitHub Actions.

---

## ✅ WHAT I'VE FIXED

### 1. Added Terraform Outputs (infra/terraform/outputs.tf)

Added two new outputs that GitHub Actions expects:

```hcl
output "ecr_registry" {
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  description = "AWS ECR registry URL for Docker image push/pull"
}

output "eks_cluster_name" {
  value       = module.eks.cluster_name
  description = "EKS cluster name (for kubectl configuration)"
}
```

### 2. Added AWS Account ID Data Source (infra/terraform/provider.tf)

Added the data source needed to get your AWS account ID:

```hcl
data "aws_caller_identity" "current" {}
```

---

## 📊 YOUR TERRAFORM CONFIGURATION

Based on your variables:

| Setting | Value | Purpose |
|---------|-------|---------|
| `aws_region` | `eu-west-1` | AWS region where ECR/EKS is deployed |
| `cluster_name` | `mallchain` | Cluster name prefix |
| `environment` | `staging` or `production` | Environment suffix |
| **ECR Repositories** | `mallchain-backend`, `mallchain-frontend`, `mallchain-marketplaced` | Docker image registries |
| **EKS Cluster Name** | `mallchain-{environment}-eu-west-1` | Kubernetes cluster |

**Example values for staging**:
- ECR Registry: `123456789012.dkr.ecr.eu-west-1.amazonaws.com`
- EKS Cluster: `mallchain-staging-eu-west-1`

(Your actual AWS account ID will replace `123456789012`)

---

## 🔧 NEXT STEPS TO COMPLETE

### STEP 1: Verify You Have Terraform Installed

**Check if Terraform is available**:
```bash
terraform version
```

**If you get "terraform: command not found"**:
```bash
# Install Terraform (choose your method)
# Option A: Homebrew (Mac)
brew install terraform

# Option B: Direct download
https://www.terraform.io/downloads

# Option C: Using tfenv (if available)
tfenv install
```

Once installed, verify:
```bash
terraform version
```

---

### STEP 2: Initialize Terraform

**Navigate to terraform directory**:
```bash
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/infra/terraform
```

**Initialize Terraform** (this sets up the backend and downloads modules):
```bash
terraform init
```

**Expected output**: Should say "Terraform has been successfully initialized"

**If it says "Error: no state file found"**: 
- Your project uses remote Terraform state (in S3)
- You may need AWS credentials configured
- See infra/terraform/README.md for backend setup

---

### STEP 3: Check What Infrastructure Exists

**View Terraform state** (what resources already exist in AWS):
```bash
terraform state list
```

**Possible outcomes**:

**Outcome A** - You see resources:
```
aws_ecr_repository.backend
aws_ecr_repository.frontend
aws_ecr_repository.marketplaced
module.eks.aws_eks_cluster.this[0]
...
```
✅ Good! Your AWS infrastructure was already created.

**Outcome B** - Empty state or error:
```
No state file was found.
```
❌ Resources haven't been deployed yet (see Step 4)

---

### STEP 4: Deploy Infrastructure (If Needed)

**If Outcome B**: You need to apply Terraform to create AWS infrastructure:

```bash
terraform apply -var="environment=staging"
```

**What it does**:
- Creates 3 ECR repositories (backend, frontend, marketplaced)
- Creates 1 EKS Kubernetes cluster
- Creates data services (Postgres, MongoDB, Redis, Vault)
- Sets up networking, security groups, IAM roles
- Takes 15-25 minutes

**When prompted "Do you want to perform these actions?"**:
- Review the plan
- Type: `yes`
- Wait for completion

---

### STEP 5: Extract Terraform Outputs

**View all outputs** (including the two new ones):
```bash
terraform output
```

**Extract specific values**:
```bash
# Get ECR registry URL
terraform output ecr_registry

# Get EKS cluster name
terraform output eks_cluster_name
```

**Note the values** - you'll need them in the next step.

---

### STEP 6: Set GitHub Repository Variables

**Go to GitHub**:
1. Open your MallChain repository: https://github.com/your-org/MarketplaceBlockchain-Mallchain
2. Click **Settings** (top right)
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **Variables** tab

**Create Variable 1: ECR_REGISTRY**
- Name: `ECR_REGISTRY`
- Value: (paste the output from `terraform output ecr_registry`)
- Example: `123456789012.dkr.ecr.eu-west-1.amazonaws.com`
- Click **Add variable**

**Create Variable 2: EKS_CLUSTER_NAME**
- Name: `EKS_CLUSTER_NAME`
- Value: (paste the output from `terraform output eks_cluster_name`)
- Example: `mallchain-staging-eu-west-1`
- Click **Add variable**

**Verify both variables are now visible** in the Variables tab.

---

### STEP 7: Verify AWS OIDC Role

The deployment workflow uses OIDC (no AWS keys stored in GitHub).

**Verify the role exists**:
```bash
terraform output github_actions_deploy_role_arn
```

**You should get something like**:
```
arn:aws:iam::123456789012:role/mallchain-github-deploy-role
```

**Go to GitHub Settings**:
1. **Settings** → **Secrets and variables** → **Actions** → **Secrets** tab
2. Look for secret: `AWS_DEPLOY_ROLE_ARN`

**If missing, create it**:
- Name: `AWS_DEPLOY_ROLE_ARN`
- Value: (paste the role ARN from terraform output above)
- Click **Add secret**

---

### STEP 8: Retry Failed Deployment

**Go to GitHub Actions**:
1. Repository → **Actions** tab
2. Select **Deploy** workflow (on left)
3. Click **Deployment #13** (the latest failed one)
4. Click **Re-run all jobs** (top right)

**Watch the deployment**:
- The workflow should now get past the variable check
- If it passes the "Derive target env" step, the next error tells us what to fix next
- If it's still failing at variable check, GitHub variables didn't sync (wait 30 seconds and retry)

---

## 📍 WHERE YOU ARE IN THE PROCESS

```
1. Terraform infrastructure exists (needs verification)     ← YOU ARE HERE
   ↓
2. Terraform outputs configured ✅                          ← FIXED
   ↓
3. AWS infrastructure deployed                              ← MIGHT NEED TO DO
   ↓
4. Terraform outputs extracted                              ← NEXT
   ↓
5. GitHub variables set (ECR_REGISTRY, EKS_CLUSTER_NAME)   ← NEXT
   ↓
6. AWS OIDC role verified                                   ← NEXT
   ↓
7. Deployment #13 retried                                   ← NEXT
   ↓
8. If passes: fix next error
   If fails: diagnose new error
```

---

## ⚠️ IMPORTANT REMINDERS

### DO NOT:
- ❌ Manually invent AWS account IDs or region names
- ❌ Change deployment workflow yet
- ❌ Run `terraform destroy`
- ❌ Skip the Terraform initialization step

### DO:
- ✅ Extract values from `terraform output` (don't guess)
- ✅ Set GitHub variables exactly as output shows them
- ✅ Wait for variables to sync (30-60 seconds after creating)
- ✅ Retry Deployment #13 after setting variables

---

## 🔄 THE DEPLOYMENT CYCLE

```
Code commit → GitHub Actions triggered
   ↓
Workflow checks variables
   ↓
If missing: ERROR (this is where 13 failed)
   ↓
If present: Build Docker images
   ↓
Push to ECR
   ↓
Update EKS deployment
   ↓
Wait for rollout
   ↓
Deployment complete ✓
```

The first 13 failed at step "Workflow checks variables". Once we set them, we can see if the next step works.

---

## 📞 WHAT TO DO WHEN YOU'RE READY

1. **Confirm you have Terraform installed** (`terraform version`)
2. **Run Steps 2-3** above
3. **Tell me the output of**:
   ```bash
   terraform state list | head -20
   ```
4. **If infrastructure exists**, proceed to Step 5
5. **If infrastructure needs deployment**, run Step 4 first
6. **Then complete Steps 5-8**

After that, we watch Deployment #13 retry. If it passes the variable check but fails elsewhere, that next error becomes our new target.

---

## 📖 REFERENCE

- **Deployment Workflow**: `.github/workflows/deploy.yml`
- **Terraform Config**: `infra/terraform/`
- **Terraform Docs**: https://www.terraform.io/docs
- **AWS ECR Docs**: https://docs.aws.amazon.com/ecr/
- **EKS Docs**: https://docs.aws.amazon.com/eks/

---

**Status**: Ready for Step 1 (Terraform verification)  
**Next**: Confirm Terraform is installed, then run Steps 2-3

