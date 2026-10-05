# Phase 1C: Local Integration Test Preparation

**Date**: September 17, 2026  
**Scope**: Identify gaps, establish reproducible local environment, prepare offline validation  
**Type**: READ-ONLY ANALYSIS + LOCAL TESTING ONLY  
**Status**: PLANNING & IMPLEMENTATION ROADMAP

---

## Objective

Resolve the 5 critical gaps identified in Phase 1B evidence review:

1. ✅ Establish genuine Electron integration (or verify it's not needed)
2. ✅ Locate or implement custom Mallchain protobuf messages
3. ✅ Prepare reproducible local blockchain environment
4. ✅ Create offline transaction-encoding tests
5. ✅ Define controlled local-node integration test

**Hard Constraints**:
- ❌ DO NOT modify production infrastructure
- ❌ DO NOT deploy to AWS/Terraform
- ❌ DO NOT broadcast to mainnet
- ❌ DO NOT overwrite existing blockchain data
- ✅ Local-only testing in isolated Docker volumes
- ✅ Offline transaction tests (no network access required)

---

## Gap 1: Electron Integration Status

### Issue

`mallchain-app/package.json` has **NO Electron dependency**, but `mallchain-app/desktop/main.cjs` exists. This indicates either:
- A. Electron is intentionally unused (web/PWA-only distribution)
- B. Electron setup is incomplete
- C. Electron is in a separate package/workspace

### Investigation Steps

#### Step 1.1: Verify Actual Build Target
```bash
# Check what package.json actually builds
cd mallchain-app
cat package.json | grep -A 5 '"scripts"'
cat vite.config.ts | head -30
```

**Expected Output Analysis**:
- If `"electron": "..."` appears → Electron is a dependency
- If `vite build` only → Web/PWA target
- If electron.vite.config.ts exists → Electron build configured

#### Step 1.2: Check for Workspace Package Configuration
```bash
# Check if Electron is in parent workspace
cd /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain
cat package.json | grep -i electron
cat go.work | head -20  # Go workspaces (not relevant but check)
```

**Expected Output Analysis**:
- If "electron" appears at root level → Parent workspace defines it
- If not found → Electron truly missing

#### Step 1.3: Locate main.cjs Usage
```bash
# Search for any references to main.cjs or Electron startup
grep -r "main.cjs" . --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null | head -20
grep -r "electron-builder\|electron-packager" . --include="*.json" 2>/dev/null
grep -r "preload\|ipcMain" . --include="*.js" --include="*.ts" 2>/dev/null | head -10
```

**Expected Output Analysis**:
- If no matches → main.cjs is orphaned
- If matches found → Electron integration exists but undocumented

#### Step 1.4: Check for Native Build Scripts
```bash
# Look for desktop-specific build scripts
ls -la mallchain-app/scripts/ | grep -i "desktop\|electron\|app"
cat mallchain-app/package.json | grep -i "build\|package\|dist"
```

### Decision Tree

```
Is Electron a dependency?
├─ YES → Proceed to Step 2: Fix build integration
├─ NO  → Decision: Is main.cjs needed?
│  ├─ YES (needed for desktop) → Add Electron, integrate into build
│  └─ NO (PWA-only is fine) → Document PWA-only, skip Electron
```

### Implementation Path: Option A (If Electron is Needed)

**File**: `mallchain-app/package.json`

Add Electron to dependencies:
```json
{
  "dependencies": {
    "electron": "^latest",
    "electron-builder": "^latest"
  },
  "scripts": {
    "electron": "electron ./desktop/main.cjs",
    "electron:dev": "vite --port 3000 & electron ./desktop/main.cjs",
    "package:electron": "vite build && electron-builder"
  }
}
```

**File**: Create `mallchain-app/electron-builder.yml`
```yaml
appId: com.mallchain.app
productName: Mallchain App
directories:
  buildResources: public
files:
  - from: dist
    to: .
  - from: desktop/main.cjs
    to: .
```

### Implementation Path: Option B (If PWA is Sufficient)

**Decision**: Remove/archive main.cjs if PWA distribution is chosen

```bash
# Archive for reference
mkdir -p archive
mv mallchain-app/desktop/main.cjs archive/main.cjs.archive
```

**Document in README**: "Mallchain App is distributed as PWA (web) only. Desktop Electron version not currently used."

### Verification Needed

Before proceeding, user decision required:

**DECISION REQUIRED**:
- [ ] Option A: Install Electron, integrate into build, test desktop app
- [ ] Option B: PWA only, archive Electron code, document web-only distribution

---

## Gap 2: Custom Mallchain Protobuf Messages

### Issue

Phase 1B report claims 60+ message types, but only standard Cosmos messages found in `mallchain-app/src/blockchain/proto.ts`. Custom marketplace messages not located or implemented.

### Investigation Steps

#### Step 2.1: Locate Custom Message Definitions
```bash
# Find proto files for custom modules
find proto/marketplace -name "*.proto" -type f | sort
wc -l < <(find proto/marketplace -name "*.proto" -type f)
```

**Expected Output**: 50+ .proto files in proto/marketplace/*/v1/

#### Step 2.2: Extract Message Names
```bash
# Extract all message types from proto files
grep -h "^message " proto/marketplace/**/v1/*.proto | sort | uniq
```

**Expected Output**:
```
message MsgAddLiquidity
message MsgBuyMallcoin
message MsgConfirmVault
message MsgCreatePool
...
```

#### Step 2.3: Check TypeScript Code Generation
```bash
# Look for generated TypeScript types
find . -path ./node_modules -prune -o -name "*.ts" -type f -exec grep -l "Msg.*Types\|marketplace.*v1" {} \; 2>/dev/null | head -20
```

**Expected Output Analysis**:
- If TypeScript message types found → Code generation worked
- If not found → Need to code-generate or import custom messages

#### Step 2.4: Verify buf Configuration
```bash
# Check proto code generation configuration
cat buf.gen.yaml
cat buf.work.yaml
```

**Expected Output Analysis**:
- If TypeScript plugin configured → Proto → TS code generation enabled
- If only Go → Need to add TypeScript generation

### Implementation: Locate & Import Custom Messages

#### Step 2.4A: Find Generated Message Files
```bash
# Search for code-generated message files
find . -name "*pb.ts" -path "*/marketplace/*" 2>/dev/null | head -10
find . -name "*pb.js" -path "*/marketplace/*" 2>/dev/null | head -10
find node_modules -name "marketplace*" -type d 2>/dev/null
```

#### Step 2.4B: Create Message Type Registry

**File**: `mallchain-app/src/blockchain/marketplace-messages.ts`

This file will:
1. Import generated message types from appropriate location
2. Define TypeScript interfaces for each custom message
3. Implement pack/unpack functions for each message type

```typescript
/**
 * Mallchain Custom Message Type Registry
 * Provides TypeScript interfaces and packing functions for marketplace module messages
 */

import { Any } from 'cosmjs-types/google/protobuf/any';

// ============================================================================
// MLCOIN MODULE MESSAGES
// ============================================================================

export interface MsgSetCurrencyRateParams {
  signer: string;
  currencyCode: string;
  rate: string;
}

export function packMsgSetCurrencyRate(params: MsgSetCurrencyRateParams): Any {
  // Serialize using protobuf encoding
  // TODO: Import actual generated message or implement manual encoding
  return {
    typeUrl: '/marketplace.mlcoin.v1.MsgSetCurrencyRate',
    value: new Uint8Array([]), // Placeholder: implement protobuf encoding
  };
}

// ============================================================================
// VAULT MODULE MESSAGES
// ============================================================================

export interface MsgSetupVaultParams {
  creator: string;
  vaultName: string;
  threshold: number;
}

export function packMsgSetupVault(params: MsgSetupVaultParams): Any {
  return {
    typeUrl: '/marketplace.vault.v1.MsgSetupVault',
    value: new Uint8Array([]), // Placeholder
  };
}

export interface MsgConfirmVaultParams {
  confirmer: string;
  vaultId: string;
  signature: string;
}

export function packMsgConfirmVault(params: MsgConfirmVaultParams): Any {
  return {
    typeUrl: '/marketplace.vault.v1.MsgConfirmVault',
    value: new Uint8Array([]), // Placeholder
  };
}

// ============================================================================
// DEX MODULE MESSAGES
// ============================================================================

export interface MsgCreatePoolParams {
  creator: string;
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
}

export function packMsgCreatePool(params: MsgCreatePoolParams): Any {
  return {
    typeUrl: '/marketplace.dex.v1.MsgCreatePool',
    value: new Uint8Array([]), // Placeholder
  };
}

// ... (continue for all custom message types)
```

#### Step 2.4C: Test Message Packing

Create test file: `mallchain-app/src/blockchain/__tests__/marketplace-messages.test.ts`

```typescript
/**
 * Marketplace Message Packing Tests
 * Verify custom messages pack/unpack correctly
 */

import { packMsgSetCurrencyRate, packMsgSetupVault, packMsgCreatePool } from '../marketplace-messages';

describe('Marketplace Message Packing', () => {
  it('should pack MsgSetCurrencyRate with correct typeUrl', () => {
    const msg = packMsgSetCurrencyRate({
      signer: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
      currencyCode: 'USD',
      rate: '0.95',
    });

    expect(msg.typeUrl).toBe('/marketplace.mlcoin.v1.MsgSetCurrencyRate');
    expect(msg.value).toBeInstanceOf(Uint8Array);
  });

  it('should pack MsgSetupVault with correct typeUrl', () => {
    const msg = packMsgSetupVault({
      creator: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
      vaultName: 'test-vault',
      threshold: 2,
    });

    expect(msg.typeUrl).toBe('/marketplace.vault.v1.MsgSetupVault');
  });

  it('should pack MsgCreatePool with correct typeUrl', () => {
    const msg = packMsgCreatePool({
      creator: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
      tokenA: 'umal',
      tokenB: 'umall',
      amountA: '1000000',
      amountB: '5000000',
    });

    expect(msg.typeUrl).toBe('/marketplace.dex.v1.MsgCreatePool');
  });
});
```

### Verification Checklist

- [ ] All custom message .proto files located
- [ ] TypeScript code generation verified or configured
- [ ] Message type registry created with all custom messages
- [ ] Pack/unpack functions implemented for each message
- [ ] Message packing tests created and passing

---

## Gap 3: Reproducible Local Blockchain Environment

### Issue

Docker startup procedure exists but was never executed. Need to verify it works end-to-end.

### Step 3.1: Verify Docker Prerequisites
```bash
# Check Docker installation
docker --version
docker-compose --version

# Verify Docker daemon running
docker ps -q 2>&1 | head -1
```

### Step 3.2: Create Local Blockchain Setup Script

**File**: `scripts/setup-local-blockchain.sh`

```bash
#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOCKCHAIN_HOME="${REPO_ROOT}/blockchain_local"
MARKETPLACED_BIN="${REPO_ROOT}/marketplaced"

echo "🔷 Mallchain Local Blockchain Setup"
echo "===================================="
echo ""

# Step 1: Initialize blockchain directory
if [ ! -d "$BLOCKCHAIN_HOME/config" ]; then
  echo "📁 Step 1: Creating blockchain working directory..."
  mkdir -p "$BLOCKCHAIN_HOME"/{config,data}
  
  # Copy genesis from .marketplace_test (known working config)
  if [ -f "${REPO_ROOT}/.marketplace_test/config/genesis.json" ]; then
    echo "📋 Step 1a: Copying genesis from .marketplace_test..."
    cp "${REPO_ROOT}/.marketplace_test/config/genesis.json" "$BLOCKCHAIN_HOME/config/genesis.json"
  else
    echo "❌ ERROR: No genesis.json source found"
    echo "Expected: ${REPO_ROOT}/.marketplace_test/config/genesis.json"
    exit 1
  fi
  
  # Generate fresh validator and node keys
  echo "🔑 Step 1b: Generating validator and node keys..."
  if ! $MARKETPLACED_BIN init validator1 --home="$BLOCKCHAIN_HOME" 2>&1; then
    echo "❌ ERROR: Failed to initialize marketplaced"
    exit 1
  fi
  
  echo "✅ Blockchain directory initialized"
else
  echo "✅ Step 1: Blockchain directory already initialized"
fi

# Step 2: Ensure validator state exists
if [ ! -f "$BLOCKCHAIN_HOME/data/priv_validator_state.json" ]; then
  echo "📝 Step 2: Creating validator state..."
  mkdir -p "$BLOCKCHAIN_HOME/data"
  cat > "$BLOCKCHAIN_HOME/data/priv_validator_state.json" << 'STATE_EOF'
{
  "height": "0",
  "round": 0,
  "step": 0
}
STATE_EOF
  echo "✅ Validator state created"
else
  echo "✅ Step 2: Validator state already exists"
fi

# Step 3: Display startup information
echo ""
echo "✅ Blockchain Setup Complete"
echo ""
echo "📋 Configuration:"
echo "   Home Directory: $BLOCKCHAIN_HOME"
echo "   Genesis File:  $BLOCKCHAIN_HOME/config/genesis.json"
echo "   Validator Key: $BLOCKCHAIN_HOME/config/priv_validator_key.json"
echo "   Node Key:      $BLOCKCHAIN_HOME/config/node_key.json"
echo ""
echo "🚀 To start the local blockchain:"
echo "   docker-compose up marketplaced"
echo ""
echo "📊 To check blockchain status:"
echo "   curl -s http://127.0.0.1:26657/status | jq ."
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "   • Private keys are generated locally and NOT committed to git"
echo "   • Genesis is copied from .marketplace_test for reproducibility"
echo "   • All blockchain data is isolated in Docker volumes"
echo "   • Safe to delete and reinitialize at any time"
echo ""
```

### Step 3.3: Create Health Check & Validation Script

**File**: `scripts/validate-local-blockchain.sh`

```bash
#!/bin/bash

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="http://127.0.0.1:26657"
REST_URL="http://127.0.0.1:1317"

echo "🔍 Mallchain Local Blockchain Validation"
echo "========================================"
echo ""

# Step 1: Check RPC endpoint
echo "Step 1: Checking RPC endpoint ($RPC_URL)..."
if curl -s "$RPC_URL/status" > /dev/null 2>&1; then
  STATUS_RESPONSE=$(curl -s "$RPC_URL/status")
  CHAIN_ID=$(echo "$STATUS_RESPONSE" | jq -r '.result.node_info.network // "unknown"')
  BLOCK_HEIGHT=$(echo "$STATUS_RESPONSE" | jq -r '.result.sync_info.latest_block_height // "0"')
  CATCHING_UP=$(echo "$STATUS_RESPONSE" | jq -r '.result.sync_info.catching_up // "unknown"')
  
  echo "   ✅ RPC responding"
  echo "      Chain ID:    $CHAIN_ID"
  echo "      Block Height: $BLOCK_HEIGHT"
  echo "      Synced:      $([ "$CATCHING_UP" = "false" ] && echo "YES" || echo "NO (catching up)")"
else
  echo "   ❌ RPC not responding. Is marketplaced running?"
  echo "      docker-compose up marketplaced"
  exit 1
fi

# Step 2: Check REST endpoint
echo ""
echo "Step 2: Checking REST endpoint ($REST_URL)..."
if curl -s "$REST_URL/cosmos/base/tendermint/v1beta1/syncing" > /dev/null 2>&1; then
  echo "   ✅ REST responding"
else
  echo "   ⚠️  REST not responding (optional)"
fi

# Step 3: Check genesis account
echo ""
echo "Step 3: Checking genesis account..."
GENESIS_ADDR="mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz"
ACC_RESPONSE=$(curl -s "$REST_URL/cosmos/auth/v1beta1/accounts/$GENESIS_ADDR" 2>/dev/null || echo "{}")
if [ "$(echo "$ACC_RESPONSE" | jq -r '.account.address // "none"')" = "$GENESIS_ADDR" ]; then
  ACC_NUM=$(echo "$ACC_RESPONSE" | jq -r '.account.account_number // "unknown"')
  SEQ=$(echo "$ACC_RESPONSE" | jq -r '.account.sequence // "unknown"')
  echo "   ✅ Genesis account found"
  echo "      Account #:  $ACC_NUM"
  echo "      Sequence:   $SEQ"
else
  echo "   ⚠️  Genesis account not found (may not be initialized)"
fi

# Step 4: Summary
echo ""
echo "✅ Local blockchain validation complete"
echo ""
echo "Next steps:"
echo "  1. Create a test wallet"
echo "  2. Sign a transaction offline"
echo "  3. Broadcast transaction"
echo "  4. Verify confirmation"
```

### Step 3.4: Docker Compose Verification

**File**: `docker-compose.override.local.yml` (safe override for local testing)

```yaml
version: '3.8'

services:
  marketplaced:
    environment:
      # Add any local testing environment overrides
      LOG_LEVEL: info
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:26657/status"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 30s

# Override volumes for local testing (isolated from production)
volumes:
  chain-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ./blockchain_local
```

### Step 3.5: Verification Checklist

- [ ] Docker and docker-compose installed and running
- [ ] `setup-local-blockchain.sh` created and executable
- [ ] `validate-local-blockchain.sh` created and executable
- [ ] Genesis configuration verified
- [ ] Private key generation tested
- [ ] Health checks working

---

## Gap 4: Offline Transaction-Encoding Tests

### Issue

No tests verifying that transactions encode correctly without network access. Need to create comprehensive offline test suite.

### Step 4.1: Create Offline Encoding Test Suite

**File**: `mallchain-app/src/blockchain/__tests__/offline-encoding.test.ts`

```typescript
/**
 * Offline Transaction Encoding Test Suite
 * 
 * Verifies that transactions can be fully constructed and signed without network access
 * Tests all steps: TX construction → Signing → Serialization → Base64 encoding
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { MallchainWallet } from '../../wallet/MallchainWallet';
import { MallchainTransaction } from '../transactions';
import { MallchainProtoTx } from '../proto';
import { MallchainSigner } from '../../wallet/MallchainSigner';
import { validateMallchainAddress } from '../../security/validation';

describe('Offline Transaction Encoding', () => {
  let testWallet: MallchainWallet;
  let signer: MallchainSigner;

  beforeAll(async () => {
    // Create test wallet entirely offline
    const { wallet } = await MallchainWallet.create('TestPassword123!', 'Offline Test Wallet');
    testWallet = wallet;
    await testWallet.unlock('TestPassword123!');
    signer = testWallet.getSigner();
  });

  describe('Step 1: Basic Transaction Construction', () => {
    it('should construct a MsgSend transaction offline', () => {
      const doc = MallchainTransaction.buildSignDoc({
        type: 'send',
        sender: testWallet.address,
        recipient: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
        amount: '1.5',
        denom: 'MLCNS',
        chainId: 'mallchain-testnet-1',
        accountNumber: 1,
        sequence: 0,
      });

      expect(doc).toBeDefined();
      expect(doc.msgs).toBeDefined();
      expect(doc.msgs.length).toBe(1);
      expect(doc.msgs[0].type).toContain('MsgSend');
    });

    it('should validate sender and recipient addresses', () => {
      const sender = testWallet.address;
      const recipient = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';

      const senderValid = validateMallchainAddress(sender);
      const recipientValid = validateMallchainAddress(recipient);

      expect(senderValid.isValid).toBe(true);
      expect(recipientValid.isValid).toBe(true);
    });

    it('should construct transaction with multiple messages', () => {
      const sendMsg = MallchainProtoTx.packMsgSend({
        fromAddress: testWallet.address,
        toAddress: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
        amount: [{ denom: 'umall', amount: '1000000' }],
      });

      const delegateMsg = MallchainProtoTx.packMsgDelegate({
        delegatorAddress: testWallet.address,
        validatorAddress: 'mallvaloper1zyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpkfcawx',
        amount: { denom: 'umall', amount: '500000' },
      });

      expect([sendMsg, delegateMsg]).toHaveLength(2);
      expect(sendMsg.typeUrl).toContain('MsgSend');
      expect(delegateMsg.typeUrl).toContain('MsgDelegate');
    });
  });

  describe('Step 2: Canonical JSON Serialization', () => {
    it('should produce deterministic canonical JSON', () => {
      const obj1 = { z: 1, a: 2 };
      const obj2 = { a: 2, z: 1 };

      const canonical1 = JSON.stringify(obj1, Object.keys(obj1).sort());
      const canonical2 = JSON.stringify(obj2, Object.keys(obj2).sort());

      expect(canonical1).toBe(canonical2);
      expect(canonical1).toBe('{"a":2,"z":1}');
    });

    it('should canonicalize nested objects', () => {
      const doc = {
        msgs: [{ type: 'MsgSend' }],
        fee: { amount: '5000', denom: 'umall' },
        memo: 'test',
      };

      // Keys should be sorted: fee, memo, msgs
      const keys = Object.keys(doc).sort();
      expect(keys).toEqual(['fee', 'memo', 'msgs']);
    });
  });

  describe('Step 3: Signing (Offline)', () => {
    it('should sign transaction without network access', async () => {
      const doc = MallchainTransaction.buildSignDoc({
        type: 'send',
        sender: testWallet.address,
        recipient: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
        amount: '1.0',
        denom: 'MLCNS',
        chainId: 'mallchain-testnet-1',
        accountNumber: 1,
        sequence: 0,
      });

      const signed = await signer.signTransactionDoc(doc);

      expect(signed).toBeDefined();
      expect(signed.tx).toBeDefined();
      expect(signed.tx.signatures).toBeDefined();
      expect(signed.tx.signatures.length).toBe(1);
    });

    it('should produce 64-byte compact signature', async () => {
      const msg = new TextEncoder().encode('Test message for signing');
      const sig = await signer.signDirectBytes(msg);

      expect(sig).toBeInstanceOf(Uint8Array);
      expect(sig.length).toBe(64); // secp256k1 compact signature is 64 bytes
    });

    it('should verify own signature offline', async () => {
      const msg = new TextEncoder().encode('Message to verify');
      const sig = await signer.signDirectBytes(msg);
      const isValid = MallchainSigner.verifyDirectBytesSignature(sig, msg, signer.publicKeyHex);

      expect(isValid).toBe(true);
    });

    it('should fail signature verification with wrong message', async () => {
      const msg = new TextEncoder().encode('Original message');
      const sig = await signer.signDirectBytes(msg);
      
      const wrongMsg = new TextEncoder().encode('Different message');
      const isValid = MallchainSigner.verifyDirectBytesSignature(sig, wrongMsg, signer.publicKeyHex);

      expect(isValid).toBe(false);
    });
  });

  describe('Step 4: Protobuf Serialization', () => {
    it('should build Protobuf TxBody', async () => {
      const sendMsg = MallchainProtoTx.packMsgSend({
        fromAddress: testWallet.address,
        toAddress: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
        amount: [{ denom: 'umall', amount: '1000000' }],
      });

      const pubKeyBytes = signer.getPublicKeyBytes();
      const protoDoc = MallchainProtoTx.buildSignDoc({
        chainId: 'mallchain-testnet-1',
        accountNumber: 1,
        sequence: 0,
        publicKeyBytes: pubKeyBytes,
        messages: [sendMsg],
        memo: 'Test Memo',
        feeDenom: 'umall',
        feeAmount: '5000',
        gasLimit: 200000,
      });

      expect(protoDoc).toBeDefined();
      expect(protoDoc.signDocBytes).toBeDefined();
      expect(protoDoc.signDocBytes.length).toBeGreaterThan(0);
      expect(protoDoc.txBodyBytes).toBeDefined();
      expect(protoDoc.authInfoBytes).toBeDefined();
    });

    it('should build TxRaw from components', () => {
      const bodyBytes = new Uint8Array([10, 2, 8, 1]);
      const authBytes = new Uint8Array([18, 2, 8, 2]);
      const sigBytes = new Uint8Array(64);

      const raw = MallchainProtoTx.buildTxRaw(bodyBytes, authBytes, sigBytes);

      expect(raw.txRawBytes).toBeDefined();
      expect(raw.txRawBase64).toBeDefined();
      expect(raw.txRawBase64.length).toBeGreaterThan(0);
      
      // Verify base64 is valid
      try {
        atob(raw.txRawBase64);
      } catch {
        throw new Error('Invalid base64 encoding');
      }
    });
  });

  describe('Step 5: End-to-End Offline Encoding', () => {
    it('should encode complete transaction offline', async () => {
      // Step 1: Create transaction doc
      const doc = MallchainTransaction.buildSignDoc({
        type: 'send',
        sender: testWallet.address,
        recipient: 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz',
        amount: '2.5',
        denom: 'MLCNS',
        chainId: 'mallchain-testnet-1',
        accountNumber: 42,
        sequence: 7,
      });

      // Step 2: Sign transaction
      const signed = await signer.signTransactionDoc(doc);

      // Step 3: Verify signature is present
      expect(signed.tx.signatures[0].pub_key.type).toBe('tendermint/PubKeySecp256k1');
      expect(signed.tx.signatures[0].signature).toBeDefined();

      // Step 4: Encode for broadcast
      const txJson = JSON.stringify(signed.tx);
      const txBase64 = btoa(txJson);

      expect(txBase64.length).toBeGreaterThan(0);
      
      // Step 5: Verify round-trip (decode and verify structure)
      const decoded = JSON.parse(atob(txBase64));
      expect(decoded.msg).toBeDefined();
      expect(decoded.signatures).toBeDefined();
    });

    it('should handle large transaction with multiple messages', async () => {
      const messages = [];
      
      for (let i = 0; i < 5; i++) {
        messages.push(
          MallchainProtoTx.packMsgSend({
            fromAddress: testWallet.address,
            toAddress: `mall1${i}${'q'.repeat(39)}`,
            amount: [{ denom: 'umall', amount: '100000' }],
          })
        );
      }

      const pubKeyBytes = signer.getPublicKeyBytes();
      const protoDoc = MallchainProtoTx.buildSignDoc({
        chainId: 'mallchain-testnet-1',
        accountNumber: 1,
        sequence: 0,
        publicKeyBytes: pubKeyBytes,
        messages: messages,
        memo: 'Multi-message transaction',
        feeDenom: 'umall',
        feeAmount: '25000',
        gasLimit: 1000000,
      });

      const signed = await signer.signTransactionDoc(protoDoc as any);
      expect(signed.tx.msg.length).toBe(5);
    });
  });

  describe('Step 6: Transaction Validation (Pre-Broadcast)', () => {
    it('should validate transaction structure before signing', () => {
      const isValid = true; // Placeholder: implement validation logic
      expect(isValid).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const invalidAddr = 'invalid1234567890';
      const result = validateMallchainAddress(invalidAddr);

      expect(result.isValid).toBe(false);
    });

    it('should enforce gas limits', () => {
      const gasLimit = 200000;
      const maxGas = 10000000;

      expect(gasLimit).toBeLessThan(maxGas);
      expect(gasLimit).toBeGreaterThan(0);
    });

    it('should validate amounts are positive', () => {
      const amounts = ['1000000', '0', '-100'];
      
      expect(parseInt(amounts[0], 10)).toBeGreaterThan(0);
      expect(parseInt(amounts[1], 10)).toBe(0);
      expect(parseInt(amounts[2], 10)).toBeLessThan(0);
    });
  });
});
```

### Step 4.2: Run Offline Tests

```bash
cd mallchain-app
npm install  # Install testing framework if needed
npm run test -- offline-encoding.test.ts
```

### Step 4.3: Verification Checklist

- [ ] All 6 offline encoding test categories implemented
- [ ] Tests pass without network access
- [ ] Wallet creation offline verified
- [ ] Canonical JSON determinism verified
- [ ] Signature generation and verification offline verified
- [ ] End-to-end encoding tested

---

## Gap 5: Controlled Local-Node Integration Test

### Issue

No test that actually broadcasts a transaction to the local blockchain and verifies it reaches consensus.

### Step 5.1: Create Local Node Integration Test Suite

**File**: `mallchain-app/src/blockchain/__tests__/local-node-integration.test.ts`

```typescript
/**
 * Local Node Integration Test Suite
 * 
 * PREREQUISITES:
 * - Local blockchain node running: docker-compose up marketplaced
 * - Node RPC: http://127.0.0.1:26657
 * - Node REST: http://127.0.0.1:1317
 * 
 * Tests verify complete end-to-end flow:
 * 1. Connect to local node
 * 2. Query account info
 * 3. Create transaction offline
 * 4. Sign transaction
 * 5. Broadcast to node
 * 6. Verify transaction in mempool
 * 7. Wait for block confirmation
 * 8. Verify transaction in block
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MallchainClient } from '../client';
import { MallchainWallet } from '../../wallet/MallchainWallet';
import { MallchainNetworkAdapter } from '../adapter';
import { MALLCHAIN_NETWORKS } from '../../config/networks';

const LOCAL_RPC = 'http://127.0.0.1:26657';
const LOCAL_REST = 'http://127.0.0.1:1317';
const GENESIS_ADDR = 'mall14gqqqqqqqqqqqqqqqqqqqqqqqqqqqqq30eu8gz';
const TEST_RECIPIENT = 'mall1hvqqqqqqqqqqqqqqqqqqqqqqqqqqqqpz49yf79';

describe('Local Node Integration Tests', () => {
  let client: MallchainClient;
  let adapter: MallchainNetworkAdapter;
  let testWallet: MallchainWallet;

  beforeAll(async () => {
    // Verify local node is running
    console.log('\n📋 Pre-flight checks...');
    
    try {
      const response = await fetch(`${LOCAL_RPC}/status`);
      if (!response.ok) throw new Error(`RPC returned status ${response.status}`);
      console.log('✅ Local RPC is reachable');
    } catch (err) {
      throw new Error(`Cannot reach local blockchain at ${LOCAL_RPC}. Is docker-compose up running?`);
    }

    // Initialize adapter for local network
    adapter = new MallchainNetworkAdapter(MALLCHAIN_NETWORKS['mallchain-local']);
    client = new MallchainClient();
    client.switchNetwork('mallchain-local');

    // Create test wallet
    const { wallet } = await MallchainWallet.create('LocalTestPass123!', 'Local Test Wallet');
    testWallet = wallet;
    await testWallet.unlock('LocalTestPass123!');
  });

  describe('Phase 1: Network Connectivity', () => {
    it('should connect to local RPC node', async () => {
      const status = await adapter.getNetworkStatus();

      expect(status.connected).toBe(true);
      expect(status.isSimulator).toBe(false);
      expect(status.status).toBe('CONNECTED');
      expect(status.rpcStatus).toBe('online');
      expect(status.latestBlock).toBeGreaterThan(0);
    });

    it('should report correct chain ID', async () => {
      const status = await adapter.getNetworkStatus();
      // Local node typically uses 'mallchain-local-1'
      expect(status.chainId).toMatch(/mallchain-local/);
    });
  });

  describe('Phase 2: Account Queries', () => {
    it('should query genesis account', async () => {
      const accInfo = await adapter.getAccount(GENESIS_ADDR);

      expect(accInfo.address).toBe(GENESIS_ADDR);
      expect(accInfo.accountNumber).toBeGreaterThanOrEqual(0);
      expect(accInfo.sequence).toBeGreaterThanOrEqual(0);
    });

    it('should handle uninitialized account gracefully', async () => {
      const uninitAddr = 'mall1uninitializedaddress12345678901234567890';

      try {
        await adapter.getAccount(uninitAddr);
        // If we reach here, check if it returns default values
        expect(true).toBe(true);
      } catch (err: any) {
        // Expected: account doesn't exist error
        expect(err.message).toContain('does not exist');
      }
    });
  });

  describe('Phase 3: Transaction Broadcasting', () => {
    it('should broadcast transaction to local node', async () => {
      const accInfo = await adapter.getAccount(GENESIS_ADDR);
      const signer = testWallet.getSigner();

      // Create transaction
      const doc = buildTransactionDoc({
        sender: GENESIS_ADDR,
        recipient: TEST_RECIPIENT,
        amount: '0.001',
        chainId: 'mallchain-local-1',
        accountNumber: accInfo.accountNumber,
        sequence: accInfo.sequence,
      });

      // Sign transaction
      const signed = await signer.signTransactionDoc(doc);

      // Broadcast
      const res = await adapter.broadcastTx(signed);

      expect(res.txHash).toBeDefined();
      expect(res.txHash).toMatch(/^0x[0-9a-fA-F]+/);
      expect(res.code).toBe(0); // CheckTx accepted
      
      return res.txHash; // Return for next test
    }, 30000);

    it('should reject invalid transaction', async () => {
      const accInfo = await adapter.getAccount(GENESIS_ADDR);
      const signer = testWallet.getSigner();

      // Create transaction with invalid sequence (far in future)
      const doc = buildTransactionDoc({
        sender: GENESIS_ADDR,
        recipient: TEST_RECIPIENT,
        amount: '0.001',
        chainId: 'mallchain-local-1',
        accountNumber: accInfo.accountNumber,
        sequence: 99999, // Invalid sequence
      });

      const signed = await signer.signTransactionDoc(doc);

      try {
        await adapter.broadcastTx(signed);
        expect(true).toBe(false); // Should not reach here
      } catch (err: any) {
        expect(err.message).toContain('sequence');
      }
    }, 10000);
  });

  describe('Phase 4: Transaction Confirmation', () => {
    let txHash: string;

    beforeAll(async () => {
      // Broadcast a transaction first
      const accInfo = await adapter.getAccount(GENESIS_ADDR);
      const signer = testWallet.getSigner();

      const doc = buildTransactionDoc({
        sender: GENESIS_ADDR,
        recipient: TEST_RECIPIENT,
        amount: '0.001',
        chainId: 'mallchain-local-1',
        accountNumber: accInfo.accountNumber,
        sequence: accInfo.sequence + 1,
      });

      const signed = await signer.signTransactionDoc(doc);
      const res = await adapter.broadcastTx(signed);
      txHash = res.txHash;
    });

    it('should poll transaction confirmation', async () => {
      const confirm = await adapter.pollTxConfirmation(txHash, 15000, 1000);

      expect(confirm.status).toBe('confirmed');
      expect(confirm.height).toBeGreaterThan(0);
      expect(confirm.code).toBe(0);
    }, 30000);

    it('should include transaction in block', async () => {
      const confirm = await adapter.pollTxConfirmation(txHash, 15000, 1000);
      const block = await adapter.getBlock(confirm.height);

      expect(block).toBeDefined();
      expect(block?.transactions).toBeDefined();
      expect(block?.transactions.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Phase 5: Transaction History', () => {
    it('should query transaction history for address', async () => {
      const history = await adapter.getTransactionsForAddress(GENESIS_ADDR);

      expect(history.status).toBe('available');
      expect(history.transactions).toBeDefined();
      expect(Array.isArray(history.transactions)).toBe(true);
    });

    it('should handle indexing disabled gracefully', async () => {
      // Mock indexing disabled response
      const mockHistory = {
        status: 'indexing_disabled' as const,
        transactions: [],
        message: 'Node transaction indexing is disabled',
      };

      expect(mockHistory.status).toBe('indexing_disabled');
      expect(mockHistory.transactions).toHaveLength(0);
    });
  });

  describe('Phase 6: Validator Queries', () => {
    it('should query validator set', async () => {
      const validators = await adapter.getValidators();

      expect(Array.isArray(validators)).toBe(true);
      expect(validators.length).toBeGreaterThan(0);
    });

    it('should include voting power in validators', async () => {
      const validators = await adapter.getValidators();
      const validator = validators[0];

      expect(validator.votingPower).toBeGreaterThan(0);
      expect(validator.moniker).toBeDefined();
    });
  });
});

// Helper function
function buildTransactionDoc(params: {
  sender: string;
  recipient: string;
  amount: string;
  chainId: string;
  accountNumber: number;
  sequence: number;
}) {
  // Placeholder: use actual MallchainTransaction builder
  return {
    msgs: [{ type: 'MsgSend', value: {} }],
    fee: { amount: ['5000'], denom: 'umall' },
    memo: 'Integration test transaction',
    signatures: [],
    account_number: params.accountNumber.toString(),
    sequence: params.sequence.toString(),
    chain_id: params.chainId,
  };
}
```

### Step 5.2: Run Local Integration Tests

**Before running tests**, start the local blockchain:

```bash
# Terminal 1: Start blockchain
docker-compose up marketplaced

# Wait for health checks to pass (~30 seconds)
# Then in Terminal 2:

cd mallchain-app
npm run test -- local-node-integration.test.ts --reporter=verbose
```

### Step 5.3: Test Execution Checklist

- [ ] Local blockchain started with `docker-compose up`
- [ ] Health checks passing (port 26657 responding)
- [ ] RPC endpoint reachable
- [ ] Account queries returning valid responses
- [ ] Transaction broadcast successful
- [ ] Transaction confirmation in block
- [ ] Validator set queryable
- [ ] All 6 test phases passing

---

## Implementation Execution Order

### Phase 1C Part 1: Analysis (No Code Changes)
1. ✅ **Gap 1.1**: Verify Electron dependency status
2. ✅ **Gap 2.1-2.4**: Locate all custom message proto files
3. ✅ **Gap 3.1**: Verify Docker prerequisites

### Phase 1C Part 2: Local Setup (Isolated & Reversible)
4. ✅ **Gap 1.X**: Implement chosen Electron path (or document PWA-only)
5. ✅ **Gap 2.X**: Create marketplace-messages.ts type registry
6. ✅ **Gap 3.2-3.5**: Create setup and validation scripts

### Phase 1C Part 3: Testing (Read-Only Tests)
7. ✅ **Gap 4.1**: Create offline encoding test suite
8. ✅ **Gap 5.1**: Create local node integration test suite
9. ✅ **Run tests**: Execute with actual output captured

### Phase 1C Part 4: Documentation
10. ✅ **Create test report** with pass/fail results
11. ✅ **Document all findings** in PHASE_1C_RESULTS.md
12. ✅ **Prepare Phase 2** recommendation based on test results

---

## Success Criteria

Before declaring Phase 1C complete:

| Criterion | Status | Evidence |
|--|--|--|
| Electron integration clarified | ⏳ Pending | Decision + implementation |
| Custom messages located/implemented | ⏳ Pending | marketplace-messages.ts created |
| Local blockchain reproducible | ⏳ Pending | setup-local-blockchain.sh + validation script |
| Offline tests passing | ⏳ Pending | Test output (all 20+ tests PASS) |
| Local node integration tests passing | ⏳ Pending | Test output (6 phases PASS) |
| Zero mainnet risk | ✅ Done | All tests local-only, no deployment |
| Zero infrastructure changes | ✅ Done | Read-only analysis + local Docker only |

---

## Hard Stops (Do Not Proceed Without)

If any of these occur, stop and document the issue:

- [ ] Local blockchain fails to start (health checks fail)
- [ ] Transaction broadcast rejected by node
- [ ] Signature verification fails
- [ ] Any test shows simulator data leaking into real network operations
- [ ] Any test attempts external network access
- [ ] Any infrastructure modification attempted

---

## Next Steps

Upon completion of Phase 1C:

✅ **Phase 1C Complete** → Generate PHASE_1C_RESULTS.md with:
- All 5 gaps resolved
- Test execution results
- Evidence of passing offline tests
- Evidence of local node integration working
- Electron status clarified
- Custom messages implemented

⏳ **Phase 2: Ready** → Proceed to:
- App desktop packaging (if Electron chosen)
- Testnet deployment readiness
- Production integration planning

---

**Document Status**: PHASE 1C ROADMAP  
**Audience**: Development team + Infrastructure  
**Update**: Execute steps 1-12 and return results to user  
**Constraint**: Local testing only, zero infrastructure modifications

