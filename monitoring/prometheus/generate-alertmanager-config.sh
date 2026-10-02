#!/usr/bin/env bash
# Generate Alertmanager configuration from secrets
# Usage: ./generate-alertmanager-config.sh [path-to-secrets-file]
#
# This script reads credentials from a .env.secrets file and generates
# a complete alertmanager.yml with real credentials injected.

set -euo pipefail

SECRETS_FILE="${1:-.env.secrets}"
TEMPLATE_FILE="alertmanager.yml.template"
OUTPUT_FILE="alertmanager.yml"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: Secrets file not found: $SECRETS_FILE"
  echo "Copy .env.secrets.example to .env.secrets and fill in real values:"
  echo "  cp .env.secrets.example .env.secrets"
  echo "  edit .env.secrets with your credentials"
  exit 1
fi

# Load secrets
set -a
source "$SECRETS_FILE"
set +a

# Validate required secrets
required_vars=(
  "SMTP_SMARTHOST"
  "SMTP_FROM"
  "SMTP_AUTH_USERNAME"
  "SMTP_AUTH_PASSWORD"
  "PAGERDUTY_SERVICE_KEY"
  "SLACK_CRITICAL_WEBHOOK"
  "SLACK_WARNINGS_WEBHOOK"
  "OPS_TEAM_EMAIL"
)

missing=()
for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    missing+=("$var")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Error: Missing required secrets:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

# Generate config
cat > "$OUTPUT_FILE" <<EOF
# Alertmanager configuration for Mallchain.
# Auto-generated from $SECRETS_FILE on $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# DO NOT EDIT DIRECTLY - regenerate from template instead.

global:
  resolve_timeout: 5m
  smtp_smarthost: '${SMTP_SMARTHOST}'
  smtp_from: '${SMTP_FROM}'
  smtp_auth_username: '${SMTP_AUTH_USERNAME}'
  smtp_auth_password: '${SMTP_AUTH_PASSWORD}'
  smtp_require_tls: true

templates:
  - '/etc/alertmanager/templates/*.tmpl'

route:
  receiver: 'default-email'
  group_by: ['alertname', 'namespace', 'job']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - match:
        severity: critical
      receiver: 'pager-duty'
      group_wait: 10s
      repeat_interval: 1h
      continue: true

    - match:
        severity: critical
      receiver: 'slack-critical'
      group_wait: 10s
      repeat_interval: 1h

    - match:
        severity: warning
      receiver: 'slack-warnings'
      group_wait: 30s
      repeat_interval: 4h

    - match:
        severity: info
      receiver: 'slack-warnings'
      group_wait: 1m
      repeat_interval: 12h

inhibit_rules:
  - source_match:
      severity: critical
    target_match:
      severity: warning
    equal: ['alertname', 'namespace']

  - source_match:
      alertname: MallchainBackendDown
    target_match_re:
      alertname: 'HighHttp5xxErrorRate|HighRequestLatencyP95|BackendErrorRateSpike|PaymentFailureSpike|TransactionQueueJobFailureRate|BullMQ.*'
    equal: ['job']

receivers:
  - name: 'default-email'
    email_configs:
      - to: '${OPS_TEAM_EMAIL}'
        send_resolved: true
        headers:
          Subject: '[Mallchain] {{ .GroupLabels.alertname }} ({{ .GroupLabels.job }})'

  - name: 'pager-duty'
    pagerduty_configs:
      - service_key: '${PAGERDUTY_SERVICE_KEY}'
        severity: '{{ .CommonLabels.severity }}'
        component: '{{ .CommonLabels.job }}'
        group: '{{ .CommonLabels.namespace }}'
        description: '{{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ .Alerts.Firing | len }}'
          description: '{{ .CommonAnnotations.description }}'
          runbook: '{{ .CommonAnnotations.runbook }}'

  - name: 'slack-critical'
    slack_configs:
      - api_url: '${SLACK_CRITICAL_WEBHOOK}'
        channel: '#mallchain-critical'
        send_resolved: true
        title: '[CRITICAL] {{ .GroupLabels.alertname }}'
        text: >-
          {{ range .Alerts }}
          *Summary:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Instance:* {{ .Labels.instance }}
          *Job:* {{ .Labels.job }}
          {{ if .Annotations.runbook }}*Runbook:* {{ .Annotations.runbook }}{{ end }}
          {{ end }}
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'

  - name: 'slack-warnings'
    slack_configs:
      - api_url: '${SLACK_WARNINGS_WEBHOOK}'
        channel: '#mallchain-alerts'
        send_resolved: true
        title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
        text: >-
          {{ range .Alerts }}
          *Severity:* {{ .Labels.severity }}
          *Summary:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Instance:* {{ .Labels.instance }}
          {{ if .Annotations.runbook }}*Runbook:* {{ .Annotations.runbook }}{{ end }}
          {{ end }}
        color: '{{ if eq .Status "firing" }}warning{{ else }}good{{ end }}'
EOF

echo "✓ Generated $OUTPUT_FILE from $SECRETS_FILE"
echo "  Deploy this file to /etc/alertmanager/alertmanager.yml"
