# Phase 2: Live Testnet Connectivity - Readiness Assessment

**Date**: September 20, 2026  
**Phase**: Pre-testnet inspection (before attempting live network connection)  
**Purpose**: Identify what testnet infrastructure exists and what must be done first

---

## Current Network Configuration State

### Available Networks (Hardcoded in networks.ts)

#### 1. mallchain-simulator (DEFAULT) ✅
```
Status: ACTIVE and working
Network: internal://simulator-rpc (no external connectivity)
Used by: Current verified 12 tests
Mode: Development sandbox only
```

#### 2. mallchain-testnet (PLACEHOLDER)
```
Status: NOT CONFIGURED / NOT VERIFIED
RPC: https://testnet-rpc.mallchain.network (hardcoded placeholder)
REST: https://testnet-api.mallchain.network (hardcoded placeholder)
Chain ID: mallchain-testnet-1
Status: Can be overridden via VITE_MALLCHAIN_TESTNET_RPC_URL env var
Current Value: Not set in .env.local (using hardcoded placeholder)
Reachable: ❌ UNKNOWN - endpoint may not exist
```

#### 3. mallchain-mainnet (PLACEHOLDER)
```
Status: NOT CONFIGURED / NOT VERIFIED
RPC: https://rpc.mallchain.network (hardcoded placeholder)
REST: https://api.mallchain.network (hardcoded placeholder)
Chain ID: mallchain-1
Status: Can be overridden via VITE_MALLCHAIN_MAINNET_RPC_URL env var
Current Value: Not set in .env.local (using hardcoded placeholder)
Reachable: ❌ UNKNOWN - endpoint may not exist
```

#### 4. mallchain-local (FALLBACK)
```
Status: CONFIGURED but not verified running
RPC: http://127.0.0.1:26657
REST: http://127.0.0.1:1317
Chain ID: mallchain-1 or mallchain-local-1
Requires: Local Mallchain node running on localhost
Current Status: ❌ NOT RUNNING on this machine
```

---

## Frontend Environment Configuration

### Current .env.local (mallchain-app/)
```
# Points to LOCAL node only
VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_LOCAL_CHAIN_ID="mallchain-1"

# Testnet not configured (using placeholder URLs)
# VITE_MALLCHAIN_TESTNET_RPC_URL="https://testnet-rpc.mallchain.network"
# (commented out, not in use)
```

### Configuration Status
- ✅ Local node endpoints defined (but node not running)
- ❌ Testnet endpoints not configured
- ❌ Mainnet endpoints not configured
- ⚠️ Active network: Defaults to simulator (hardcoded in networks.ts)

---

## Infrastructure Readiness Assessment

### Testnet Validator Infrastructure

| Item | Status | Evidence | Next Action |
|------|--------|----------|------------|
| **Testnet exists** | ❌ UNKNOWN | Placeholder URLs not verified | Verify testnet is running |
| **RPC endpoint** | ❌ UNKNOWN | https://testnet-rpc.mallchain.network untested | Curl endpoint to test |
| **REST endpoint** | ❌ UNKNOWN | https://testnet-api.mallchain.network untested | Curl endpoint to test |
| **Validators running** | ❌ UNKNOWN | Not queried yet | Query validator set |
| **Blocks being produced** | ❌ UNKNOWN | Not queried yet | Check block height |
| **Network sync** | ❌ UNKNOWN | Not verified | Check sync status |

### Local Node Infrastructure

| Item | Status | Evidence | Next Action |
|------|--------|----------|------------|
| **Local node** | ❌ NOT RUNNING | No process on 127.0.0.1:26657 | Deploy local node or use testnet |
| **RPC port** | ❌ NOT LISTENING | Port 26657 not in use | Start node if using local |
| **REST port** | ❌ NOT LISTENING | Port 1317 not in use | Start node if using local |

---

## Required Pre-Testing Steps

### Step 1: Determine Testnet Availability

**Action**: Verify if `testnet-rpc.mallchain.network` actually exists and is reachable

```bash
# Test 1: Can we resolve the domain?
nslookup testnet-rpc.mallchain.network

# Test 2: Can we reach the RPC endpoint?
curl -s -w "\nHTTP %{http_code}" https://testnet-rpc.mallchain.network/status | head -20

# Test 3: Can we reach the REST endpoint?
curl -s -w "\nHTTP %{http_code}" https://testnet-api.mallchain.network/ | head -20
```

**Possible Outcomes**:
- ✅ Endpoints reachable → Proceed to Step 2
- ❌ Endpoints unreachable → Either (a) testnet doesn't exist, (b) domain placeholder is wrong, or (c) network is down
- ⚠️ Partially reachable → Some infrastructure exists, investigate

### Step 2: Verify Testnet Status (If Reachable)

**Action**: Query testnet node for basic blockchain data

```bash
# Get network status
curl -s https://testnet-rpc.mallchain.network/status | jq '.result.sync_info'
# Should show: latest_block_height, catching_up, latest_block_time

# Get validator set
curl -s https://testnet-api.mallchain.network/cosmos/staking/v1beta1/validators | jq '.validators | length'
# Should return: number of active validators

# Check latest block
curl -s https://testnet-rpc.mallchain.network/block | jq '.result.block.header.height'
# Should return: current block height (number)
```

**Possible Outcomes**:
- ✅ All queries respond with blockchain data → Testnet is live and synced
- ❌ Queries fail/timeout → Testnet down, endpoints wrong, or network issue
- ⚠️ Queries respond but data is stale → Testnet may not be synced

### Step 3: Test Read-Only RPC Calls

**Action**: Verify we can query network data without sending transactions

```bash
# Query network status
curl -s https://testnet-rpc.mallchain.network/status

# Query account info (replace with valid testnet address)
curl -s "https://testnet-api.mallchain.network/cosmos/auth/v1beta1/accounts/mall1..."

# Query balances
curl -s "https://testnet-api.mallchain.network/cosmos/bank/v1beta1/balances/mall1..."
```

**Success Criteria**:
- ✅ Responses are valid JSON
- ✅ No authentication required
- ✅ Response times < 5 seconds
- ✅ Data is current (not stale)

### Step 4: Only Then - Test Transaction Flow

**Action**: Attempt a test transaction (only if read-only calls work)

```bash
# This is AFTER steps 1-3 pass
# Uses faucet to fund account
# Broadcasts simple test transaction
# Confirms it's in the chain
```

**Only proceed if**:
- Testnet verified running
- Read-only queries working
- Block height advancing
- Time synchronized between client and network

---

## Decision Tree: Which Path to Take?

```
START: Need to test live network
│
├─ Option A: Mallchain Testnet
│  ├─ Pros: Shared testnet, no setup required
│  ├─ Cons: Depends on external infrastructure
│  └─ Prerequisites:
│      ├─ testnet-rpc.mallchain.network must exist & be running
│      ├─ testnet-api.mallchain.network must exist & be running
│      └─ Must be at least synced to current block
│
├─ Option B: Local Mallchain Node
│  ├─ Pros: Complete control, no dependencies
│  ├─ Cons: Must build and run validator locally
│  └─ Prerequisites:
│      ├─ Mallchain source code or binary
│      ├─ ~10 GB disk space
│      └─ ~30 minutes setup time
│
└─ Option C: Other Community Testnet
   ├─ Pros: May have existing validators
   ├─ Cons: May have different configuration
   └─ Prerequisites:
       ├─ Testnet RPC endpoint URL
       ├─ Testnet REST endpoint URL
       └─ Testnet Chain ID
```

---

## Current Situation Analysis

### What We Know ✅
- Code is ready (simulator works, security fix applied)
- Frontend can accept network configuration via environment variables
- Network adapter supports switching between networks
- Demo labels are locked in place

### What We Don't Know ❌
- **Does Mallchain Testnet exist?** → Must verify
- **Is testnet infrastructure deployed?** → Must verify
- **What are the actual testnet endpoints?** → Must discover
- **Is the testnet currently synced?** → Must check
- **What is the testnet chain ID?** → Must determine
- **Are testnet faucets functional?** → Must test
- **Can we broadcast transactions?** → Must test after read-only works

---

## Information Needed (In Order)

### Priority 1 (BLOCKING)
1. Is there a Mallchain Testnet currently running?
   - Who deployed it?
   - Where are the RPC/REST endpoints?
   - What is the chain ID?

2. If no public testnet:
   - Should we deploy a local validator?
   - How much time/resources required?
   - Or use different test strategy?

### Priority 2 (HIGH)
3. If testnet exists:
   - What is current block height?
   - Is it synced and actively producing blocks?
   - What is typical block time?

4. Are testnet faucets available?
   - Can we fund test accounts?
   - What's the faucet rate limit?
   - How much MALL can we get per request?

### Priority 3 (MEDIUM)
5. What tokens/denoms are on testnet?
   - Native coin name and denom
   - Are test tokens easily accessible?
   - Testnet staking rules

---

## Recommended Next Action

**DO NOT** attempt to test against testnet yet.

**DO** first verify:

1. **Testnet Infrastructure Check** (5 minutes)
   ```bash
   curl -v https://testnet-rpc.mallchain.network/status
   curl -v https://testnet-api.mallchain.network/
   ```
   
2. **Document Findings** (5 minutes)
   - Does testnet exist?
   - What endpoints are reachable?
   - What responses did we get?
   - What's the current block height?

3. **Update Configuration** (5 minutes)
   - Add actual testnet endpoints to .env.local
   - Set network defaults appropriately
   - Document the testnet details

4. **Then Plan Phase 2** (10 minutes)
   - After infrastructure confirmed
   - Plan read-only test sequence
   - Define success criteria
   - Document expected vs. actual results

---

## Expected Timeline

| Step | Time | Blocking? |
|------|------|-----------|
| Verify testnet exists | 5 min | ✅ CRITICAL |
| Test read-only queries | 10 min | ✅ CRITICAL |
| Configure environment | 5 min | ✅ REQUIRED |
| Test transaction flow | 15 min | ⏳ After above |
| Document results | 10 min | ⏳ Final |
| **Total** | **~45 minutes** | - |

---

## Status Before Phase 2

```
Simulator Testing:      ✅ COMPLETE (12/12 tests pass)
Security Fix:           ✅ COMPLETE (window exposure fixed)
Frontend Ready:         ✅ YES (supports network switching)
Testnet Infrastructure: ❌ UNKNOWN (not verified)
Live Network Testing:   ❌ NOT STARTED (blocked on testnet verification)
```

**Recommendation**: 
Before writing any Phase 2 test code, answer: **"Does Mallchain Testnet exist and is it reachable?"**

---

*Phase 2 readiness assessment complete*  
*Status: Ready to investigate testnet infrastructure*  
*Next: Verify testnet availability before proceeding*

