data "aws_ami" "amazon_linux_graviton" {
  count = var.ami_id == "" ? 1 : 0

  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-minimal-*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_iam_policy_document" "vault_kms" {
  statement {
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
    ]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_policy" "vault_kms" {
  name        = "${var.cluster_name}-${var.environment}-vault-kms"
  description = "Allow Vault EC2 to encrypt/decrypt with vault-master-key"
  policy      = data.aws_iam_policy_document.vault_kms.json
}

resource "aws_iam_role" "vault_server" {
  name = "${var.cluster_name}-${var.environment}-vault-server"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
    aws_iam_policy.vault_kms.arn,
  ]
}

resource "aws_iam_instance_profile" "vault_server" {
  name = "${var.cluster_name}-${var.environment}-vault-server"
  role = aws_iam_role.vault_server.name
}

resource "aws_security_group" "vault" {
  name        = "${var.cluster_name}-${var.environment}-vault"
  description = "Vault server security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Vault API from app subnet"
    from_port   = 8200
    to_port     = 8200
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
    Name = "${var.cluster_name}-${var.environment}-vault"
  }
}

resource "aws_ebs_volume" "vault_data" {
  availability_zone = element(data.aws_availability_zones.available.names, 0)
  size              = var.volume_size_gb
  type              = "gp3"
  encrypted         = true
  kms_key_id        = var.kms_key_arn

  tags = {
    Name = "${var.cluster_name}-${var.environment}-vault-data"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "template_cloudinit_config" "vault_userdata" {
  gzip          = true
  base64_encode = true

  part {
    content_type = "text/cloud-config"
    content = <<-EOT
      #cloud-config
      package_update: true
      package_upgrade: true
      packages:
        - amazon-cloudwatch-agent
        - unzip
      runcmd:
        - |
          set -euo pipefail
          swapoff -a
          sed -i '/ swap / s/^\\(.*\\)$/#\\1/g' /etc/fstab
          echo 'net.ipv4.tcp_numa_balancing=0' >> /etc/sysctl.conf
          echo 'kernel.numa_balancing=0' >> /etc/sysctl.conf
          sysctl -p
          curl -fsSL https://releases.hashicorp.com/vault/1.16.2/vault_1.16.2_linux_arm64.zip -o /tmp/vault.zip
          unzip /tmp/vault.zip -d /usr/local/bin/
          chmod +x /usr/local/bin/vault
          setcap cap_ipc_lock=+ep /usr/local/bin/vault
          useradd --system --home /etc/vault.d --shell /bin/false vault
          mkdir -p /etc/vault.d /var/lib/vault /opt/vault/data
          chown -R vault:vault /etc/vault.d /var/lib/vault /opt/vault/data
          cat > /etc/vault.d/vault.hcl <<'VAULT'
      ui = true
      listener "tcp" {
        address     = "127.0.0.1:8200"
        tls_disable = true
      }
      storage "raft" {
        path    = "/opt/vault/data"
        node_id = "vault-0"
      }
      api_addr = "http://127.0.0.1:8200"
      cluster_addr = "http://127.0.0.1:8201"
      VAULT
          cat > /etc/systemd/system/vault.service <<'SVC'
      [Unit]
      Description="HashiCorp Vault"
      Documentation=https://www.vaultproject.io/docs/
      Requires=network-online.target
      After=network-online.target
      ConditionFileNotEmpty=/etc/vault.d/vault.hcl
      StartLimitIntervalSec=60
      StartLimitBurst=3

      [Service]
      User=vault
      Group=vault
      ProtectSystem=strict
      ProtectHome=read-only
      PrivateTmp=yes
      PrivateDevices=yes
      SecureBits=keep-caps
      AmbientCapabilities=CAP_IPC_LOCK
      CapabilityBoundingSet=CAP_SYSLOG CAP_IPC_LOCK
      NoNewPrivileges=yes
      ExecStart=/usr/local/bin/vault server -config=/etc/vault.d/vault.hcl
      ExecReload=/bin/kill --signal HUP $MAINPID
      KillMode=process
      KillSignal=SIGINT
      Restart=on-failure
      RestartSec=5
      TimeoutStopSec=30
      StartLimitInterval=60
      StartLimitIntervalSec=60
      StartLimitBurst=3
      LimitNOFILE=65536
      LimitMEMLOCK=infinity
      Environment=VAULT_ADDR=http://127.0.0.1:8200

      [Install]
      WantedBy=multi-user.target
      SVC
          chown vault:vault /etc/vault.d/vault.hcl
          chmod 640 /etc/vault.d/vault.hcl
          systemctl daemon-reload
          systemctl enable vault
          systemctl start vault
    EOT
  }
}

resource "aws_instance" "vault" {
  ami                         = var.ami_id != "" ? var.ami_id : data.aws_ami.amazon_linux_graviton[0].id
  instance_type               = var.instance_type
  iam_instance_profile        = aws_iam_instance_profile.vault_server.name
  subnet_id                   = element(var.subnet_ids, 0)
  vpc_security_group_ids      = [aws_security_group.vault.id]
  user_data_base64            = data.template_cloudinit_config.vault_userdata.rendered
  associate_public_ip_address = false

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 30
    encrypted             = true
    kms_key_id            = var.kms_key_arn
    delete_on_termination = true
  }

  tags = {
    Name = "${var.cluster_name}-${var.environment}-vault-server"
  }
}

resource "aws_volume_attachment" "vault_data" {
  device_name = "/dev/sdh"
  volume_id   = aws_ebs_volume.vault_data.id
  instance_id = aws_instance.vault.id
}
