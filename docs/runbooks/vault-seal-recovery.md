# Vault Seal Recovery Runbook

## Document Metadata
- **Runbook ID**: RB-VAULT-001
- **Service**: HashiCorp Vault (vault-0, vault-1, vault-2)
- **Owner**: SRE Team — Platform Security
- **Last Updated**: 2026-09-10
- **Approved By**: Head of Security

---

## Prerequisites

Before attempting any recovery procedure, verify the following prerequisites are satisfied:

1. **Network Access**: Operator must have SSH access to Vault nodes via the bastion host. Confirm connectivity: `ssh vault-0.prod.internal` from the designated operator workstation.
2. **HSM Access Permissions**: Operator must hold an active role granting access to at least 3 of the 5 geographical HSM slots (AWS CloudHSM us-east-1, eu-west-2, ap-southeast-1, Azure Key Vault usgov-arizona, GCP KMS australia-southeast1).
3. **Air-Gapped Key Material**: In the event HSMs are unreachable, the operator must have physical presence authorization to retrieve key shards from the on-site air-gapped safe (dual-control, two-person rule enforced).
4. **Audit Logger Role**: The operator executing unseal commands must have the `audit-log-writer` role bound to their identity in the incident-management system. All commands must be transcribed within 60 seconds of execution.
5. **Incident Declared**: A Sev-1 incident must be open in the PagerDuty service `vault-prod` with the incident commander field populated. Do NOT proceed without an IC assignment.
6. **Quorum of Key Holders**: Minimum 3 key holders must be on the incident bridge simultaneously. Each holder must verbally confirm they are in a private location with no screen sharing or recording active before any key material is accessed.
7. **Read-Only Vault Status**: Confirm `vault status` returns `Sealed: true` on the affected node(s) before executing any write operations.

---

## Pre-declared Severity

| Scenario | Severity | PagerDuty Escalation | MTTR Target |
|---|---|---|---|
| Single Vault node sealed in 3-node cluster (raft quorum maintained) | SEV-3 | SRE On-Call only, page after 10 min | 45 minutes |
| Two Vault nodes sealed (quorum lost, reads degraded) | SEV-2 | SRE + Security IC, page after 5 min | 30 minutes |
| All 3 Vault nodes sealed (full outage, no secret reads/writes) | SEV-1 | Full SRE + Security + Engineering leadership, page immediately | 20 minutes |
| Seal detected within 24 hours of a detected auth anomaly | SEV-1 + Security Event | SOC + Forensics team engaged automatically | 15 minutes |

**Downtime Impact**: Vault seal blocks ALL secret material retrieval. Backend API pods will crash-loop on startup. Payment signing, database credential rotation, and TLS certificate issuance all stop. Estimated $24,000/minute revenue impact at peak.

---

## Triggers (Alert Rule Names from MO-3)

This runbook is activated when ANY of the following Prometheus alert rules from MO-3 fire:

| Alert Name | Severity | Expression Snippet |
|---|---|---|
| `VaultSealed` | CRIT | `vault_core_unsealed{env="prod"} == 0` for 2m |
| `VaultSealedMultipleNodes` | CRIT | `count by (cluster) (vault_core_unsealed{env="prod"} == 0) >= 2` for 1m |
| `VaultSealedFullQuorumLoss` | CRIT | `count by (cluster) (vault_core_unsealed{env="prod"} == 1) < 2` for 30s |
| `VaultSealedPostAuthAnomaly` | CRIT | `vault_core_unsealed{env="prod"} == 0` and `increase(vault_audit_auth_failure_total[1h]) > 50` |
| `VaultStandbySealed` | WARN | `vault_core_unsealed{env="prod",vault_mode="standby"} == 0` for 5m |

**Auto-Response**: The `VaultSealed` CRIT alert automatically:
1. Pages SRE on-call and Security on-call in parallel
2. Creates a Slack channel `#inc-vault-seal-${UNIX_TS}`
3. Locks the deploy pipeline for `vault-infra` via GitHub branch protection
4. Triggers a video bridge invite to all key holders listed in `vault-key-holders@mallchain.io` group

---

## Decision Tree

```
[ALERT: VaultSealed CRIT fires]
        │
        ▼
  Open incident bridge,
  assign IC and Scribe
        │
        ├─► Is this a PLANNED seal (maintenance window)?
        │       │
        │       ├─ Yes → Confirm change ticket CHG-* exists,
        │       │         proceed to Step-by-step Recovery
        │       │
        │       └─ No  → Continue below
        │
        ▼
  Run `vault status` on EACH node
        │
        ├─► How many nodes show Sealed=true?
        │       │
        │       ├─ 1 node only, raft_index > 0 on others
        │       │       │
        │       │       └─► Sufficient quorum. Unseal single node.
        │       │           Do NOT touch remaining nodes.
        │       │
        │       ├─ 2 nodes sealed (1 active)
        │       │       │
        │       │       └─► SEV-2. Activate key holders.
        │       │           Unseal both sealed nodes sequentially.
        │       │
        │       └─ 3 nodes sealed (0 active)
        │               │
        │               └─► SEV-1. Activate ALL 5 key holders.
        │                   Escalate to CTO.
        │                   Consider DR failover to vault-dr.
        │
        ▼
  Are HSM slots reachable?
        │
        ├─► Yes → Retrieve 3 key shards via HSM API calls.
        │         Log each retrieval request ID.
        │
        └─► No  → Initiate air-gapped safe access protocol.
                  Two-person sign-off on safe access log.
```

---

## Step-by-step Recovery

**SAFETY NOTICE: NEVER paste unseal keys into Slack, Teams, Zoom chat, email, or any instant messaging system. Keys are read directly from HSM output or typed manually into the terminal. If a key is accidentally exposed, assume compromise and rotate ALL key shards within 24 hours.**

### Phase 1: Identify Affected Nodes

1. Log into the bastion host using your operator certificate:
   ```
   ssh -i ~/.ssh/operator-prod-cert.pem bastion.prod.internal
   ```

2. For each Vault node (0, 1, 2), run status and record output in the incident scribe doc:
   ```bash
   for node in vault-0 vault-1 vault-2; do
     echo "=== $node ==="
     ssh $node "VAULT_ADDR=https://127.0.0.1:8200 vault status"
   done
   ```

3. Record the `Sealed:` field and `HA Mode:` for each node in the incident tracking ticket.

### Phase 2: Retrieve Unseal Key Shards (3 of 5 Required)

4. Key Holder 1 (us-east-1 HSM slot) executes:
   ```bash
   aws cloudhsmv2 get-attributes \
     --cluster-id hsm-prod-clus-01 \
     --hsm-id hsm-prod-01 \
     --query "Attributes.VendorKeys[?KeyName=='vault-unseal-shard-1']" \
     --output text
   ```
   Decrypt output using your personal PGP key. DO NOT COPY TO CLIPBOARD.

5. Key Holder 2 (eu-west-2 HSM slot) executes equivalent for shard-2.
6. Key Holder 3 (ap-southeast-1 HSM slot) executes equivalent for shard-3.
7. If any HSM slot is unreachable, escalate to remaining HSM slots (slot 4 or 5) until 3 shards are available.

### Phase 3: Execute Unseal Operation

8. On the FIRST sealed node, Key Holder 1 enters their shard:
   ```bash
   ssh vault-X
   export VAULT_ADDR=https://127.0.0.1:8200
   vault operator unseal
   # Paste/type key shard 1 directly at the prompt, NOT inline
   ```
   Scribe records: `[TS] Node vault-X: Unseal key 1 provided by [INITIALS]. Progress: 1/3`

9. Key Holder 2 enters their shard on the same node. Scribe records.
10. Key Holder 3 enters their shard on the same node. Scribe records.
11. Confirm output shows: `Sealed          false` and `Unseal Progress 3/3`.
12. Repeat Phase 3 for each additional sealed node. Use the SAME 3 key shards — do NOT rotate which holders provide keys.

### Phase 4: Validate Cluster Health and Audit

13. Authenticate using the audited root token (stored in HSM slot root-vault-01):
    ```bash
    vault login -method=token
    # Paste token from HSM decrypted output
    ```

14. Audit log the 3 key holders with timestamps:
    ```bash
    vault audit write \
      name=unseal-recovery \
      format=json \
      data="$(jq -n \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg ic "$INCIDENT_COMMANDER" \
        --arg k1 "$KEYHOLDER1_INITIALS" \
        --arg k2 "$KEYHOLDER2_INITIALS" \
        --arg k3 "$KEYHOLDER3_INITIALS" \
        --arg nodes "$SEALED_NODES" \
        '{timestamp:$ts,action:"unseal",incident_ic:$ic,key_holders:[$k1,$k2,$k3],nodes_sealed:$nodes}')"
    ```

---

## Verification

Execute ALL verification checks before marking the incident resolved:

1. **Per-Node Seal Status**:
   ```bash
   for node in vault-0 vault-1 vault-2; do
     result=$(ssh $node "VAULT_ADDR=https://127.0.0.1:8200 vault status -format=json" | jq -r '.sealed')
     echo "$node sealed=$result"
     if [ "$result" != "false" ]; then
       echo "FAIL: $node still sealed. Return to Phase 3."
       exit 1
     fi
   done
   ```
   Expected: All nodes report `sealed=false`.

2. **Raft Quorum**:
   ```bash
   vault operator raft list-peers
   ```
   Expected: 3 voters listed, all with `state: voter`. Leader node shows `leader=true`.

3. **Secret Read/Write Smoke Test**:
   ```bash
   vault kv put secret/incident-smoke-test value="vault-recovery-$(date +%s)"
   vault kv get secret/incident-smoke-test
   vault kv metadata delete secret/incident-smoke-test
   ```
   Expected: PUT succeeds, GET returns matching value, DELETE succeeds.

4. **Backend API Pod Health**:
   ```bash
   kubectl get pods -n backend -l app=mallchain-api -o wide | grep -v Running
   ```
   Expected: No output (all pods Running and Ready).

5. **Prometheus Alert Clearance**:
   Navigate to `https://prometheus.prod.internal/alerts`. Confirm `VaultSealed`, `VaultSealedMultipleNodes`, and `VaultSealedFullQuorumLoss` alerts are in state `resolved` for 5+ minutes.

6. **Audit Log Entry Presence**:
   ```bash
   grep "unseal-recovery" /var/log/vault/vault_audit.log | tail -5
   ```
   Expected: JSON entry present with all 3 key holder initials and timestamp matching recovery window.

---

## Postmortem Prompts

Within 24 hours of incident resolution, the Incident Commander must circulate a postmortem document answering:

1. **Timeline Reconstruction**: What was the exact wall-clock time each node sealed? What was the preceding event (power cycle, OOM, operator error)? List the second-by-second timeline from first alert to last unseal.
2. **Root Cause Analysis**: Use the 5-Whys method. Why did the seal occur? Why did HA/raft not prevent quorum loss? Why were the standard auto-unseal mechanisms (if configured) not engaged?
3. **SOP Adherence Audit**: Did all 3 key holders follow the protocol of NOT pasting keys into chat? Obtain Zoom chat logs if recorded. Were HSM retrieval request IDs all logged? Count deviations from this runbook.
4. **Geographic Distribution Efficacy**: Were the 3 required HSM slots all reachable? If failover to slot 4/5 was required, document the failover delay. Should the geographic distribution policy (2 in NA, 1 in EU, 1 in APAC, 1 in AU) be adjusted?
5. **MTTR Breakdown**: Measure time spent in Phase 1 (identification), Phase 2 (key retrieval), Phase 3 (unsealing), and Phase 4 (verification). Where was the greatest delay? What tooling could reduce it?
6. **Impact Assessment**: Count the number of backend pod restarts, payment failures, and database credential rotation failures during the seal window. Calculate actual revenue impact using the payments DB outage join query.
7. **Action Items (SMART)**: Produce 3-5 specific, measurable action items with owners and deadlines. Example: "Add auto-unseal transit seal via Vault HSM integration — Owner: SecEng, Due: 2026-10-15, Priority: P0"
8. **Key Rotation Decision**: Was any key material potentially exposed? If yes, schedule a full unseal key rotation (5 new shards, new HSM slot IDs, new air-gapped printouts) within 72 hours.
9. **SLO Impact**: Compute the 30-day rolling availability of Vault after this incident. Are we still above SLO (99.95%)? If not, trigger the error budget depletion protocol.
10. **Runbook Feedback**: What sections of this runbook were unclear or missing commands? Submit a PR to update this runbook with lessons learned before the postmortem meeting.
