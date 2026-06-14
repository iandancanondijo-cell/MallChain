# Mallchain Production Blockchain Engineering Guide

## Objective

This guide documents the work required to move Mallchain from an advanced prototype into production-grade blockchain infrastructure.

It covers:
- governance completion
- production architecture
- validator infrastructure
- governance completion
- slashing system
- observability stack
- transaction pipeline
- CI/CD
- deployment instructions
- operational handling guides

---

## Section 1 — Governance Completion

### Goal

Implement a complete governance lifecycle for Mallchain with:
- proposal creation
- deposits
- voting
- quorum checks
- execution
- parameter changes
- treasury proposals
- software upgrades

### Recommended files and flows

#### Governance types
File: `x/governance/types/proposal.go`

```go
package types

type ProposalStatus string

const (
    StatusVoting   ProposalStatus = "voting"
    StatusPassed   ProposalStatus = "passed"
    StatusRejected ProposalStatus = "rejected"
    StatusExecuted ProposalStatus = "executed"
)

type Proposal struct {
    Id          uint64
    Title       string
    Description string
    Creator     string
    Status      ProposalStatus
    VotesYes    uint64
    VotesNo     uint64
    Deposit     uint64
    CreatedAt   int64
    ExpiresAt   int64
}
```

#### Proposal storage
File: `x/governance/keeper/proposal_store.go`

```go
package keeper

import (
    "encoding/json"
    "fmt"

    sdk "github.com/cosmos/cosmos-sdk/types"
    "marketplace/x/governance/types"
)

func (k Keeper) SaveProposal(ctx sdk.Context, proposal types.Proposal) {
    store := ctx.KVStore(k.storeKey)
    key := []byte(fmt.Sprintf("proposal:%d", proposal.Id))
    bz, _ := json.Marshal(proposal)
    store.Set(key, bz)
}
```

#### Voting logic
File: `x/governance/keeper/vote.go`

```go
package keeper

import sdk "github.com/cosmos/cosmos-sdk/types"

func (k Keeper) Vote(ctx sdk.Context, proposalId uint64, approve bool) error {
    proposal := k.GetProposal(ctx, proposalId)

    if approve {
        proposal.VotesYes++
    } else {
        proposal.VotesNo++
    }

    k.SaveProposal(ctx, proposal)
    return nil
}
```

#### Quorum check
File: `x/governance/keeper/quorum.go`

```go
package keeper

func HasQuorum(totalVotingPower uint64, participating uint64) bool {
    return participating*2 >= totalVotingPower
}
```

### Governance rules

Recommended production values:
- Voting period: 7 days
- Minimum deposit: 1,000 MLCN
- Quorum: 50%
- Pass threshold: 67%
- Veto threshold: 33%

### Best practices

Never allow:
- instant execution
- unrestricted treasury access
- unlimited parameter changes

Always use:
- timelocks
- quorum
- minimum deposits
- validator participation

---

## Section 2 — Slashing System

### Goal

Punish downtime, double signing, and malicious validators with a transparent slashing policy.

### Recommended files and flows

File: `x/slashing/types/validator_metrics.go`

```go
package types

type ValidatorMetrics struct {
    Address        string
    MissedBlocks   int64
    ProducedBlocks int64
    SlashCount     int64
    Jailed         bool
}
```

File: `x/slashing/keeper/missed_blocks.go`

```go
package keeper

import sdk "github.com/cosmos/cosmos-sdk/types"

func (k Keeper) RecordMissedBlock(ctx sdk.Context, validator string) {
    metrics := k.GetValidatorMetrics(ctx, validator)
    metrics.MissedBlocks++
    k.SetValidatorMetrics(ctx, metrics)
}
```

File: `x/slashing/keeper/slash.go`

```go
package keeper

import sdk "github.com/cosmos/cosmos-sdk/types"

func (k Keeper) SlashValidator(ctx sdk.Context, validator string, percent float64) error {
    stake := k.GetValidatorStake(ctx, validator)
    slashAmount := int64(float64(stake.Amount.Int64()) * percent)
    newStake := stake.Amount.Int64() - slashAmount
    k.SetValidatorStake(ctx, validator, newStake)
    return nil
}
```

File: `x/slashing/keeper/jail.go`

```go
package keeper

import sdk "github.com/cosmos/cosmos-sdk/types"

func (k Keeper) JailValidator(ctx sdk.Context, validator string) {
    metrics := k.GetValidatorMetrics(ctx, validator)
    metrics.Jailed = true
    k.SetValidatorMetrics(ctx, metrics)
}
```

### Slashing rules

Recommended thresholds:
- 5% slash for downtime
- 10% slash for malicious behavior
- permanent jail for double signing

Always log slashes, downtime, and jail history.

---

## Section 3 — Validator Infrastructure

### Goal

Build a production validator architecture using sentries and a private validator node.

### Architecture

Internet
  ↓
Sentry nodes
  ↓
Private validator node

### Production config
File: `config/config.toml`

```toml
pex = true
addr_book_strict = true
max_num_inbound_peers = 40
max_num_outbound_peers = 10
persistent_peers = "peer1@ip:26656,peer2@ip:26656"

[mempool]
size = 5000
max_txs_bytes = 1073741824
cache_size = 100000

[consensus]
timeout_propose = "3s"
timeout_prevote = "1s"
timeout_precommit = "1s"
timeout_commit = "5s"
```

### Validator start script
File: `deployment/start-validator.sh`

```bash
#!/bin/bash

mallchaind start \
  --home ~/.mallchain \
  --rpc.laddr tcp://0.0.0.0:26657 \
  --p2p.laddr tcp://0.0.0.0:26656
```

### Validator rules

Never:
- expose the validator directly
- store validator keys on a public machine
- run without backups

Always:
- use sentries
- use firewall rules
- backup validator keys securely
- monitor uptime

---

## Section 4 — Transaction Pipeline

### Goal

Complete the sign → broadcast → inclusion → confirmation → indexing pipeline.

### Recommended files

File: `backend/services/simulateTx.js`

```js
async function simulateTx(tx) {
  return {
    gasEstimate: 200000,
    success: true
  }
}

module.exports = simulateTx
```

File: `backend/queue/transactionQueue.js`

```js
const { Queue } = require('bullmq')

const txQueue = new Queue('transactions')

module.exports = txQueue
```

File: `backend/workers/transactionWorker.js`

```js
const { Worker } = require('bullmq')

new Worker('transactions', async job => {
  console.log('Broadcasting tx', job.data)
})
```

File: `backend/socket/txSocket.js`

```js
module.exports = io => {
  function txConfirmed(hash) {
    io.emit('tx_confirmed', { hash })
  }

  return { txConfirmed }
}
```

### Transaction rules

Always:
- simulate before broadcast
- estimate gas
- retry failed broadcasts
- track confirmations
- index transactions

Never:
- broadcast directly from the frontend
- trust frontend transaction state

---

## Section 5 — Security Hardening

### Goal

Protect validators, RPC, APIs, wallets, and governance.

### Recommended files

File: `backend/middleware/rateLimiter.js`

```js
const rateLimit = require('express-rate-limit')

module.exports = rateLimit({
  windowMs: 60 * 1000,
  max: 100
})
```

File: `backend/security/verifySignature.js`

```js
const crypto = require('crypto')

function verifySignature(message, signature, publicKey) {
  const verify = crypto.createVerify('SHA256')
  verify.update(message)
  verify.end()
  return verify.verify(publicKey, signature, 'hex')
}

module.exports = verifySignature
```

Add to `.env`:

```text
JWT_SECRET=VERY_LONG_SECURE_SECRET
```

File: `app/ante.go`

```go
if tx.Sequence <= account.Sequence {
    return ctx, errors.New("replay attack detected")
}
```

### Security rules

Always:
- rotate secrets
- secure validator keys
- use env variables
- audit governance and treasury logic

Never:
- hardcode secrets
- expose private keys
- accept unsigned tx requests

---

## Section 6 — Observability Stack

### Goal

Monitor validator health, block times, chain status, tx throughput, and failures.

### Recommended files

File: `backend/monitoring/prometheus.js`

```js
const client = require('prom-client')
const register = new client.Registry()

client.collectDefaultMetrics({ register })

module.exports = register
```

Add to `backend/index.js`:

```js
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

### Dashboard metrics

Track:
- block height
- tx count
- peer count
- validator uptime
- memory usage
- CPU usage
- mempool pressure
- tx failure rate

### Alerts

Watch for:
- validator offline
- no new blocks
- high tx failure rate
- peer drops
- RPC downtime

---

## Section 7 — Cross-chain / IBC

### Goal

Enable interoperability while enforcing packet validation and timeouts.

### Recommended actions

- Ensure IBC module registration in `app/app.go`.
- Add a transfer route and packet validation logic in `x/ibc/transfer.go`.
- Use standard relayer tooling.
- Audit all bridge packet and acknowledgement handling.

---

## Section 8 — CI/CD Pipeline

### Goal

Automate tests, linting, builds, and security scans.

File: `.github/workflows/go.yml`

```yaml
name: Go
on:
  push:
    branches:
      - main
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: 1.22
      - name: Run Tests
        run: go test ./...
      - name: Run Vet
        run: go vet ./...
      - name: Run Gosec
        run: gosec ./...
```

### Security scans

Include:
- `gosec ./...`
- JS dependency vulnerability checks like `npm audit`

### CI/CD rules

Always:
- run tests before deployment
- block failing builds
- enforce release gating

---

## Section 9 — Deployment & Operational Runbooks

### Goal

Provide operator guides for validator start, backup, restore, and upgrade.

Recommended files:
- `deployment/start-validator.sh`
- `deployment/start-sentry.sh`
- `deployment/backup.sh`
- `deployment/restore.sh`
- `deployment/upgrade.sh`

Backup example:

```bash
#!/bin/bash

tar -czf validator-backup.tar.gz \
  ~/.mallchain/config \
  ~/.mallchain/config/priv_validator_key.json \
  ~/.mallchain/config/node_key.json \
  ~/.mallchain/config/genesis.json
```

Restore example:

```bash
#!/bin/bash

tar -xzf validator-backup.tar.gz -C ~/.mallchain/
```

### Operational rules

Always:
- backup keys and config before upgrades
- keep backups offline and encrypted
- use maintenance windows
- monitor chain health
- document approvals

---

## Section 10 — Production Readiness Checklist

### Governance
- [ ] proposal lifecycle complete
- [ ] deposit/voting/quorum logic validated
- [ ] treasury execution audited
- [ ] software upgrade proposals enabled
- [ ] governance events queryable

### Slashing
- [ ] slashing configured
- [ ] downtime and double-sign rules defined
- [ ] jailed validators tracked
- [ ] explorer APIs expose slash history

### Validator infrastructure
- [ ] sentry/validator architecture defined
- [ ] production config tuned
- [ ] private keys secured
- [ ] backup process documented

### Transaction pipeline
- [ ] simulation implemented
- [ ] queue and worker built
- [ ] broadcast/retry/confirm pipeline complete
- [ ] transaction indexing enabled

### Security
- [ ] rate limiting enabled
- [ ] signature verification enforced
- [ ] secrets stored securely
- [ ] replay protection enabled
- [ ] treasury/governance audited

### Observability
- [ ] Prometheus metrics exported
- [ ] Grafana dashboards created
- [ ] alerts configured

### IBC / cross-chain
- [ ] IBC modules registered
- [ ] transfer validation added
- [ ] relayer architecture planned

### CI/CD
- [ ] Github Actions active
- [ ] tests run
- [ ] security scans enabled
- [ ] release gating established

### Operations
- [ ] start/backup/restore scripts available
- [ ] key management documented
- [ ] upgrade runbook documented

---

## Notes for Mallchain engineers

- The repo has a strong Cosmos SDK foundation, but the current implementation remains prototype-grade.
- Prioritize governance and slashing hardening.
- Use SDK modules like `x/slashing` and `x/upgrade` when possible.
- Deploy validators behind sentries and protect private keys.
- Add audit events, replay protection, and secure secret handling for all critical flows.

---

## Recommended next step

1. Harden governance and fix quorum/execution flows.
2. Configure slashing and validator protections.
3. Complete backend transaction lifecycle and indexing.
4. Harden security and secrets management.
5. Add observability and CI/CD.
