# Nginx TLS Certificate Renewal and ACME DNS-01 Runbook

## Document Metadata
- **Runbook ID**: RB-NGINX-004
- **Service**: Nginx Ingress Controller (ingress-nginx on k8s `prod-ingress` namespace) + edge Nginx proxies (edge-0/1/2, certbot classic)
- **Owner**: SRE Team — Edge and Networking
- **Last Updated**: 2026-09-10
- **Approved By**: Head of Security Engineering

---

## Prerequisites

1. **Certbot Version ≥ 2.7.0**: All edge Nginx hosts must have `certbot` 2.7.0 or later installed (required for ECDSA P-256 default and ACME CAA account binding). Confirm: `certbot --version` on each edge node returns `certbot 2.7.x` or newer.
2. **Cloudflare API Token Permissions**: The `CLOUDFLARE_API_TOKEN` stored in `prod-ingress/certbot-cloudflare-token` k8s secret AND on edge hosts in `/etc/letsencrypt/cloudflare.ini` must have these exact zone-level permissions: `Zone:Zone:Read`, `Zone:DNS:Edit` scoped to the `mallchain.io` zone and all secondary zones (`mallchain.co.ke`, `mallchain.africa`). Do NOT use the Global API Key.
3. **Let's Encrypt Account Registered**: Each edge host and the cert-manager k8s issuer must have a valid, registered ACME account with an operational contact email (ops-tls@mallchain.io). Confirm: `certbot show_account` on each edge.
4. **Nginx Include Snippets Available**: Ensure `/etc/nginx/snippets/ssl-params.conf` exists on all edge hosts and contains: TLS 1.3 only, ECDHE-ECDSA-AES256-GCM-SHA384 cipher list, HSTS preload, OCSP stapling.
5. **Reload Script Executable**: Verify the reloader script exists and is executable: `test -x /home/ops/scripts/nginx-reload-tls.sh && echo OK`. This script handles graceful reload with `nginx -t` preflight, worker warmup, and health-check wait before draining old workers.
6. **Kubernetes cert-manager CRDs Present**: For the k8s ingress path, confirm: `kubectl get crd certificates.cert-manager.io clusterissuers.cert-manager.io challenges.acme.cert-manager.io` all show `ESTABLISHED` CRDs with version `cert-manager.io/v1`.
7. **Monitoring Panels Open**: Operator MUST have these panels open before starting:
   - `Edge-TLS`: cert expiry days per hostname, handshake failure rate
   - `Nginx-Upstream`: 5xx rate per upstream cluster, upstream connect time
   - `Synthetic-Probe`: global uptime result from 20 regions (Checkly)

---

## Pre-declared Severity

| Scenario | Severity | Escalation | MTTR Target |
|---|---|---|---|
| `NginxSSLCertExpiryDays WARN` — 14-30 days remaining on 1+ non-critical hostnames | SEV-4 | Email to ops-tls list, work within business day | 1 business day |
| `NginxSSLCertExpiryDays WARN` — 7-14 days or critical hostname (api, checkout, payment-callback) at 30 days | SEV-3 | Page SRE Networking on-call, work within shift | 8 hours |
| `NginxSSLCertExpiryDays CRIT` — <7 days remaining OR auto-renewal cert-manager Certificate CR in READY=False state | SEV-2 | Page SRE Networking + SecEng IC | 4 hours |
| `NginxSSLCertExpiryDays CRIT` — <48 hours AND certbot renew fails (rate-limit, DNS, or account issue) | SEV-1 | Page everyone in Networking + Security oncall + CISO | 1 hour to BEGIN manual issuance |
| `Upstream5xxRate CRIT` coinciding with cert reload (handshake failures, cipher mismatch, HSTS anomaly) | SEV-1 | Immediate rollback of cert, activate pre-signed backup cert | 30 minutes to rollback |

**Downtime Impact**: An expired cert on `api.mallchain.io` or `checkout.mallchain.io` causes 100% browser/client handshake failure. Revenue impact: all payments blocked, estimated $42,000/minute at peak hours.

---

## Triggers (Alert Rule Names from MO-3)

Activate this runbook on any of the following MO-3 alerts:

| Alert Name | Severity | Expression |
|---|---|---|
| `NginxSSLCertExpiryDays` | WARN | `probe_ssl_earliest_cert_expiry{env="prod"} - time() < 30*24*3600 and probe_ssl_earliest_cert_expiry - time() > 7*24*3600 for 10m` |
| `NginxSSLCertExpiryDays` | CRIT | `probe_ssl_earliest_cert_expiry{env="prod"} - time() < 7*24*3600 for 5m` |
| `NginxSSLCertExpiringImminent` | CRIT | `probe_ssl_earliest_cert_expiry{env="prod"} - time() < 48*3600 for 2m` |
| `Upstream5xxRate` | CRIT | `sum(rate(nginx_ingress_controller_requests{status=~"5..",env="prod"}[2m])) by (host) / sum(rate(nginx_ingress_controller_requests{env="prod"}[2m])) by (host) > 0.05 for 3m` |
| `TLSHandshakeFailureRate` | CRIT | `rate(nginx_ingress_controller_ssl_errors_total{env="prod"}[5m]) / rate(nginx_ingress_controller_ssl_handshakes_total[5m]) > 0.02 for 3m` |
| `CertManagerCertificateNotReady` | WARN | `certmanager_certificate_ready_status{env="prod",condition="False"} == 1 for 30m` |
| `CertManagerCertificateNotReady` | CRIT | `certmanager_certificate_ready_status{env="prod",condition="False"} == 1 and (time() - certmanager_certificate_expiration_timestamp_seconds{env="prod"}) > -2*24*3600 for 10m` |

**Alert Correlation**: If both `Upstream5xxRate CRIT` AND `CertManagerCertificateNotReady CRIT` fire together, jump immediately to Step-by-step Phase 5 (Troubleshooting + Rollback).

---

## Decision Tree

```
[ALERT: NginxSSLCertExpiryDays OR Upstream5xxRate]
        │
        ▼
  Open #inc-tls-${TS} channel
  @-mention networking + seceng
  Post affected hostnames list from alert labels
        │
        ├─► Is Upstream5xxRate CRIT FIRING RIGHT NOW?
        │       │
        │       ├─► Yes AND TLS handshake errors present
        │       │     └─► JUMP TO PHASE 5: ROLLBACK + BACKUP CERT
        │       │
        │       └─► No → Continue normal renewal flow
        │
        ▼
  Classify deployment target:
        │
        ├─► Edge Nginx hosts (classic certbot /etc/letsencrypt)
        │     └─► Phase 1: certbot list → renew → reload-tls.sh
        │
        ├─► K8s Ingress Nginx + cert-manager Certificate CR
        │     └─► Phase 3: kubectl inspect Certificate CR
        │               If stuck, trigger manual cert issuance
        │
        └─► Wildcard or apex cert requiring DNS-01 challenge
              └─► Phase 2: Cloudflare DNS-01 auth flow
        │
        ▼
  After renewal + reload: Verify with curl + openssl
        │
        ├─► Verify PASSES on all probes
        │     └─► Monitor 10 min → Clear alerts → Close incident
        │
        └─► Verify FAILS
              └─► Phase 5: Rollback, activate pre-signed backup
                  Escalate to SEV-1
```

---

## Step-by-step Recovery

### Phase 1: Standard Certbot Renewal (Edge Nginx hosts)

1. Open a parallel tmux session for each of the 3 edge hosts. On each host, list certificates and identify the one(s) with low days remaining:
   ```bash
   # Execute on edge-0.prod, edge-1.prod, edge-2.prod via tmux sync-pane
   sudo certbot certificates
   ```
   Scribe records: note `Certificate Name`, `Domains`, `Expiry Date`, `Days`, and `Certificate Path` for each cert with <30 days remaining.

2. Attempt standard auto-renewal first (this is the scheduled job that failed):
   ```bash
   sudo certbot renew --non-interactive --agree-tos --email ops-tls@mallchain.io \
     --deploy-hook "/home/ops/scripts/nginx-reload-tls.sh"
   ```
   Capture output to `/tmp/certbot-renew-$(date +%s).log` on each host.

3. If auto-renewal succeeded, skip to Phase 4 (Verification).

4. If auto-renewal FAILED with errors containing `Failed to obtain HTTP-01 challenge token` or `connection refused on port 80`, attempt with force-renewal flag after confirming port 80 listener:
   ```bash
   sudo nginx -t 2>&1 | grep -q "test is successful" \
     && sudo ss -tlnp | grep -q ":80 " \
     && echo "Port 80 OK, attempting force renewal..." \
     && sudo certbot renew --force-renewal \
        --deploy-hook "/home/ops/scripts/nginx-reload-tls.sh" \
        2>&1 | tee /tmp/certbot-force-renew.log
   ```

5. If HTTP-01 STILL fails, proceed to Phase 2 (DNS-01 via Cloudflare).

### Phase 2: ACME DNS-01 Challenge with Cloudflare API_TOKEN Auth

Use DNS-01 for wildcard certs (`*.mallchain.io`), when HTTP-01 port 80 is blocked, or for apex zone `CAA` constraints.

6. Confirm Cloudflare credential file is present and well-formed (on each edge):
   ```bash
   sudo ls -la /etc/letsencrypt/cloudflare.ini
   # Contents MUST be (exactly):
   # dns_cloudflare_api_token = Xxxxxxxxxxxxxxxxxxxx-yyyyyyyyyyyyyyyyyy
   sudo chmod 600 /etc/letsencrypt/cloudflare.ini
   sudo grep -c 'dns_cloudflare_api_token = ' /etc/letsencrypt/cloudflare.ini
   # Expected: 1
   ```

7. Validate token permissions first (non-destructive):
   ```bash
   TOKEN=$(sudo awk -F' = ' '/dns_cloudflare_api_token/{print $2}' /etc/letsencrypt/cloudflare.ini)
   curl -s -H "Authorization: Bearer $TOKEN" \
     https://api.cloudflare.com/client/v4/user/tokens/verify | jq '.success, .result.status'
   # Expected: true, "active"
   ```

8. Trigger manual issuance using Cloudflare DNS-01 authenticator plugin:
   ```bash
   CERT_NAME="wildcard-mallchain-io"    # Use the cert name from Phase 1
   DOMAINS="-d mallchain.io -d *.mallchain.io -d mallchain.co.ke -d *.mallchain.co.ke"

   sudo certbot certonly \
     --cert-name $CERT_NAME \
     --dns-cloudflare \
     --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
     --dns-cloudflare-propagation-seconds 60 \
     --key-type ecdsa \
     --elliptic-curve secp256r1 \
     --email ops-tls@mallchain.io \
     --agree-tos \
     --non-interactive \
     --deploy-hook "/home/ops/scripts/nginx-reload-tls.sh" \
     $DOMAINS \
     2>&1 | tee /tmp/certbot-dns01-${CERT_NAME}.log
   ```
   Note: `--dns-cloudflare-propagation-seconds 60` waits 1 full minute after writing the `_acme-challenge` TXT record before Let's Encrypt validates. Increase to 120 if you see intermittent `NXDOMAIN` on validation.

9. On success, certbot auto-triggers the deploy-hook which runs `nginx-reload-tls.sh`. Verify log tail: `tail -30 /home/ops/logs/nginx-reload-tls-*.log`.

### Phase 3: Kubernetes Ingress Nginx + cert-manager Recovery

If the failing cert is managed via cert-manager (check: `kubectl get certs -n prod-ingress` shows the hostname):

10. Inspect Certificate CR status and identify failure reason:
    ```bash
    NAMESPACE="prod-ingress"
    CERT_NAME=$(kubectl get certs -n $NAMESPACE -o json | jq -r '.items[] | select(.status.conditions[]?.type=="Ready" and .status.conditions[]?.status=="False") | .metadata.name')
    echo "Failing certificates: $CERT_NAME"
    kubectl describe cert $CERT_NAME -n $NAMESPACE
    ```
    Look in `Status.Conditions.Message` for strings like: `429 urn:ietf:params:acme:error:rateLimited` or `DNS record for _acme-challenge not yet propagated` or `Account on hold for suspicious activity`.

11. If stuck in rate-limit: switch to Let's Encrypt STAGING first to validate, or switch ClusterIssuer:
    ```bash
    kubectl patch cert $CERT_NAME -n $NAMESPACE \
      --type=merge \
      -p '{"spec":{"issuerRef":{"name":"letsencrypt-prod-backup-account","kind":"ClusterIssuer"}}}'
    ```

12. If stuck on DNS-01 propagation for Cloudflare: verify the Secret backing the Issuer:
    ```bash
    ISSUER_NAME=$(kubectl get cert $CERT_NAME -n $NAMESPACE -o jsonpath='{.spec.issuerRef.name}')
    SECRET_NAME=$(kubectl get clusterissuer $ISSUER_NAME -o jsonpath='{.spec.acme.solvers[0].dns01.cloudflare.apiTokenSecretRef.name}')
    echo "Issuer=$ISSUER_NAME, Cloudflare token secret=$SECRET_NAME"
    # Verify secret exists and token valid:
    TOKEN=$(kubectl get secret $SECRET_NAME -n cert-manager -o jsonpath='{.data.api-token}' | base64 -d)
    curl -s -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | jq '.success'
    ```

13. Force cert-manager to re-attempt issuance by triggering a CertificateRequest manually:
    ```bash
    kubectl cert-manager renew $CERT_NAME -n $NAMESPACE
    # Watch progress:
    kubectl get challenges -n $NAMESPACE -w
    # Wait until Certificate READY=True:
    kubectl wait --for=condition=ready cert/$CERT_NAME -n $NAMESPACE --timeout=10m
    ```

14. Force-reload the Nginx ingress controller pods to pick up newly-minted cert (in case the secret watcher missed it):
    ```bash
    kubectl rollout restart deployment/ingress-nginx-controller -n prod-ingress
    kubectl rollout status deployment/ingress-nginx-controller -n prod-ingress --timeout=3m
    ```

### Phase 4: Verification (curl + openssl)

Execute verification from MULTIPLE vantage points (local operator machine + one CI runner + one synthetic probe API).

15. **Curl HSTS and header check** (repeat for every affected hostname):
    ```bash
    HOST="api.mallchain.io"
    echo "=== Checking $HOST ==="
    curl -I --resolve "$HOST:443:$(dig +short $HOST | head -1)" \
      https://$HOST/healthz \
      --max-time 10 \
      2>&1 | grep -Ei "HTTP/|strict-transport-security|server:|x-content-type-options"
    ```
    Expected: `HTTP/2 200`, Strict-Transport-Security contains `max-age=63072000; includeSubDomains; preload`.

16. **OpenSSL chain and expiry verification**:
    ```bash
    HOST="api.mallchain.io"
    PORT="443"
    echo | openssl s_client -connect "${HOST}:${PORT}" \
      -servername $HOST \
      -showcerts \
      -verify_return_error \
      2>&1 | tee /tmp/openssl-${HOST}.log | grep -E "Verify return code|subject=|issuer=|notBefore=|notAfter="

    EXPIRE_EPOCH=$(date -d "$(echo | openssl s_client -connect ${HOST}:${PORT} -servername $HOST 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)" +%s)
    DAYS_LEFT=$(( (EXPIRE_EPOCH - $(date +%s)) / 86400 ))
    echo "Days until expiry: $DAYS_LEFT"
    test $DAYS_LEFT -gt 60 && echo "PASS" || echo "FAIL: Renewal appears ineffective"
    ```
    Expected: `Verify return code: 0 (ok)`, issuer chain leads to `ISRG Root X1` or `ISRG Root X2` (ECDSA chain), days_left > 60.

17. **Cert chain depth and SCT check** (for CT log compliance):
    ```bash
    echo | openssl s_client -connect api.mallchain.io:443 -servername api.mallchain.io -brief 2>&1
    # Manually confirm:
    # - Protocol version: TLSv1.3
    # - Cipher: TLS_AES_256_GCM_SHA384 or TLS_CHACHA20_POLY1305_SHA256
    # - ECDSA curve: X25519 or P-256
    # - Certificate Transparency SCTs present in extension
    ```

18. **Synthetic probe green across 20 regions**: Open Checkly dashboard `https://app.checklyhq.com/dashboards/mallchain-edge` and confirm all 20 public regions show 200 OK with `sslValid: true` for the affected hostnames.

### Phase 5: Emergency Rollback and Backup Cert Activation

TRIGGER: If after renewal and reload, `Upstream5xxRate CRIT` persists, OR `TLSHandshakeFailureRate > 5%`, OR openssl verification returns a non-zero verify code:

19. **Immediate rollback of symlink** (edge hosts):
    ```bash
    # List backup symlinks:
    sudo ls -la /etc/letsencrypt/live/${CERT_NAME}-backup*/
    # Restore pre-renewal symlink (certbot creates backups automatically):
    sudo certbot certificates --cert-name $CERT_NAME
    sudo ln -sfn /etc/letsencrypt/archive/${CERT_NAME}-backup-YYYYMMDDHHMMSS/cert1.pem /etc/letsencrypt/live/${CERT_NAME}/cert.pem
    sudo ln -sfn /etc/letsencrypt/archive/${CERT_NAME}-backup-YYYYMMDDHHMMSS/privkey1.pem /etc/letsencrypt/live/${CERT_NAME}/privkey.pem
    sudo ln -sfn /etc/letsencrypt/archive/${CERT_NAME}-backup-YYYYMMDDHHMMSS/chain1.pem /etc/letsencrypt/live/${CERT_NAME}/chain.pem
    sudo ln -sfn /etc/letsencrypt/archive/${CERT_NAME}-backup-YYYYMMDDHHMMSS/fullchain1.pem /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem
    sudo /home/ops/scripts/nginx-reload-tls.sh
    ```

20. **For Kubernetes, revert the k8s TLS Secret to pre-renewal backed-up value**:
    ```bash
    SECRET_NAME=$(kubectl get cert $CERT_NAME -n prod-ingress -o jsonpath='{.spec.secretName}')
    # Use last known good secret from Velero backup:
    kubectl get secret $SECRET_NAME -n prod-ingress -o yaml > /tmp/current-secret.yaml
    velero restore create --from-backup prod-ingress-secrets-hourly-$(date -d -1hour +%Y%m%d%H%M) --include-resources secrets --selector cert-manager.io/certificate-name=$CERT_NAME
    kubectl rollout restart deployment/ingress-nginx-controller -n prod-ingress
    ```

21. **Last resort: Pre-signed DigiCert EV backup cert**:
    If all else fails, activate the DigiCert multi-year EV cert stored in HSM slot `edge-tls-backup-ev-01`. This is good for 397 days. Decrypt and install:
    ```bash
    aws cloudhsmv2 sign --cluster-id ... --hsm-id ... --key-id edge-tls-backup-ev-01 ...
    # Install:
    sudo cp /tmp/backup-ev.crt /etc/nginx/ssl/backup-ev-cert.pem
    sudo cp /tmp/backup-ev.key /etc/nginx/ssl/backup-ev-key.pem
    sudo sed -i 's|ssl_certificate /etc/letsencrypt|ssl_certificate /etc/nginx/ssl/backup-ev|g' /etc/nginx/sites-enabled/*.conf
    sudo /home/ops/scripts/nginx-reload-tls.sh
    ```

---

## Verification (Formal Signoff Checklist)

Before closing the incident, ALL items in this checklist must be recorded:

1. [ ] `certbot certificates` shows renewed cert with `Days > 60` on ALL 3 edge hosts
2. [ ] `kubectl get certs -n prod-ingress -o wide` shows READY=True and RENEWAL_TIME > +60d for all cert-manager certs
3. [ ] `curl -I https://<host>` returns HSTS header with `max-age=63072000; includeSubDomains; preload` (confirm no `max-age=0`)
4. [ ] `openssl s_client -verify_return_error` returns code 0 (ok) on all affected hosts
5. [ ] openssl shows `notAfter` date matches expectations for 90-day LE cert (85-89 days away)
6. [ ] Chain verification against Mozilla CCADB: `certigo dump -v https://<host> 2>&1 | grep "Chain validation passed"` = true
7. [ ] Chrome CT compliance: `certspotter` shows CT log entries for all newly-issued certs within 5 minutes
8. [ ] `TLSHandshakeFailureRate` < 0.001 (0.1%) for 5+ minutes
9. [ ] `Upstream5xxRate` < 0.005 (0.5%) for 5+ minutes
10. [ ] All 20 Checkly synthetic regions green on TLS for all hostnames

---

## Postmortem Prompts

1. **Root Cause of Non-Renewal**: Why did the scheduled `certbot renew` cron (or cert-manager Issuer) fail? Was it Cloudflare token expiry, HTTP-01 ACME port 80 blocked by firewall change, rate limit hit due to test/staging churn, or account suspension? Include EXACT error message from logs.
2. **Rate Limit Analysis**: If Let's Encrypt returned `429 rateLimited`, use `https://crt.sh/` and `certbot certificates -v` to count duplicate certs issued. What fraction of our weekly 50-cert / 5-duplicate limit was consumed? Propose mitigation: staging environment, rate-limit monitoring alert.
3. **Token Rotation Review**: When was the Cloudflare API token last rotated? Is the token tied to a service account (recommended) or personal account (prohibited)? Rotate the token now and update the k8s secret and edge ini file.
4. **Time-to-Detect vs Time-to-Mitigate**: Compare the alert fire time (days remaining) vs actual start of fix vs completion. If we only caught it at 7 days (CRIT) instead of 30 days (WARN), why did the WARN page routing fail?
5. **Backup Cert Efficacy**: Did we need Phase 5? If yes, how quickly was the DigiCert backup installed? Is the 397-day multi-year cert still within its validity window? Schedule a 6-month reminder to rotate the backup.
6. **DNS-01 Delay Impact**: When Cloudflare DNS-01 was used, did 60 seconds propagation suffice, or was 120 required? Should we raise the default `--dns-cloudflare-propagation-seconds` globally?
7. **SLO Impact**: Calculate actual edge TLS availability during the incident. Was `edge-TLS-handshake-availability` (SLO target 99.995%) maintained for the 30-day rolling window? If not, how much error budget burned?
8. **Observability Gaps**: What new metric or alert would have caught this 24-48 hours earlier? Example: alert on `cert-manager CertificateRequest Age > 30m`, not just Ready=False.
9. **Certificate Inventory**: Audit all certs across edge + k8s now. How many are <45 days to expiry? How many are not covered by certbot/cert-manager automation? List and schedule.
10. **Automation Improvement**: Create a GitHub Action to run weekly on Monday that: (a) runs `certbot renew --dry-run` on all edges, (b) runs `kubectl cert-manager renew --dry-run` on all certs, (c) posts to `#ops-tls-health` slack channel if ANY dry-run fails. Owner: Networking, due in 14 days.
