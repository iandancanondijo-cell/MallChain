# Task 24: Service Audit & Real Data Integration Plan

**Date**: September 20, 2026  
**Status**: ✅ AUDIT COMPLETE  
**Purpose**: Locate and verify existing services before connecting real data

---

## Executive Summary

**Finding**: All required services and real data methods are **fully implemented** in the codebase. The infrastructure exists to connect real blockchain and wallet data.

**Status**:
- ✅ mallchainClient: Real methods for block height, TPS, validators, transactions
- ✅ walletService: Account management, balance queries, transaction history
- ✅ MallchainWallet: Signing, unlocking, address derivation
- ✅ MallchainNetworkAdapter: RPC/REST calls to real nodes
- ✅ localStorage: Wallet storage and persistence
- ⚠️ MallchainDashboard: Currently using simulated data, ready for connection

---

## Detailed Service Audit

### 1. MallchainClient (`src/blockchain/client.ts`)

**Status**: ✅ PRODUCTION-READY

**Available Methods**:
```typescript
// Network Status
getNetworkStatus(): Promise<MallchainNetworkStatus>
  → Returns: { status, connected, latestBlock, blockTimeMs, chainId, ... }
  → Implementation: Real RPC calls + simulator fallback

// Block Height (Primary source for dashboard)
getBlockHeight(): Promise<number>
  → Returns: Current block height from network status
  → Real: Queries CometBFT /status endpoint
  → Simulator: mallchainSimulator.getCurrentHeight()

// Validators
getValidators(): Promise<MallchainValidator[]>
  → Returns: Array of validator info
  → Real: REST API query
  → Simulator: mallchainSimulator.getValidators()

// Transactions
getTransactions(address?: string): Promise<MallchainTransaction[]>
  → Returns: Transaction history
  → Real: REST API with address filter
  → Simulator: mallchainSimulator.getTransactions(address)

getTransactionByHash(hash: string): Promise<MallchainTransaction | undefined>
  → Returns: Single transaction details

broadcastTx(signedTx): Promise<TxBroadcastResult>
  → Broadcasts signed transaction to network
  → Real: POST to RPC endpoint
  → Returns: { txHash, height, code, ... }

pollTxConfirmation(txHash, timeoutMs, pollIntervalMs)
  → Waits for transaction to be included in block
  → Real: Polls /tx_search endpoint

// Account Info
getAccount(address): Promise<MallchainAccountInfo>
  → Returns: { accountNumber, sequence, ... } for signing

getBalances(address): Promise<MallchainAssetBalance[]>
  → Returns: Array of token balances
  → Real: REST API /bank/balances
  → Format: [{ denom, amount }, ...]
```

**Network Configuration** (`src/config/networks.ts`):
- Default: `mallchain-mainnet` (RPC: configured in networks.ts)
- Fallback: `mallchain-simulator` (in-memory for development)
- Runtime check: `mallchainClient.isSimulatorActive()`

**Real Data Sources**:
- Block height: RPC `/status` endpoint
- Validators: REST `/cosmos/staking/v1beta1/validators`
- Account balances: REST `/cosmos/bank/v1beta1/balances/{address}`
- Transactions: REST `/cosmos/tx/v1beta1/txs?events=...`

---

### 2. WalletService (`src/services/walletService.ts`)

**Status**: ✅ PRODUCTION-READY

**Available Methods**:
```typescript
// Wallet Management
getActiveWallet(): MallchainWallet | null
  → Returns: Currently selected wallet or null

getAccounts(): WalletStorageRecord[]
  → Returns: All stored wallets [{ address, name, keystore, createdAt }, ...]
  → Source: localStorage via storage.ts

switchAccount(address: string): void
  → Changes active wallet
  → Updates: localStorage + notifies listeners

// Operations
createWallet(password, name?): Promise<{ wallet, mnemonic }>
  → Creates new 12-word BIP-39 wallet
  → Returns: Unlocked wallet + recovery phrase
  → Stored: Encrypted keystore to localStorage

importMnemonic(mnemonic, password, name?): Promise<MallchainWallet>
  → Imports from recovery phrase
  → Stored: Encrypted keystore to localStorage

importPrivateKey(privateKeyHex, password, name?): Promise<MallchainWallet>
  → Imports from raw hex key
  → Stored: Encrypted keystore to localStorage

unlockActive(password): Promise<boolean>
  → Unlocks wallet with password
  → Returns: true if success, false if password incorrect

lockActive(): void
  → Locks current wallet (clears decrypted secrets)

deleteAccount(address): void
  → Removes wallet from localStorage
```

**Storage Location**: `localStorage`
- Key format: `mallchain-keystore-{address}`
- Contains: Encrypted keystore (PBKDF2 + AES-256-GCM)
- Accessible via: `src/wallet/storage.ts`

---

### 3. MallchainWallet Class (`src/wallet/MallchainWallet.ts`)

**Status**: ✅ PRODUCTION-READY

**Available Methods**:
```typescript
// Signing
getSigner(): MallchainSigner
  → Returns: Signer object for transaction signing
  → Requires: Wallet unlocked
  → Provides: sign(message: Uint8Array): Promise<Uint8Array>

// Locking/Unlocking
unlock(password): Promise<boolean>
  → Decrypts keystore with password
  → Loads private key into memory
  → Starts auto-lock timer (15 min)

lock(): void
  → Clears private key from memory
  → Stops auto-lock timer

exportMnemonic(password): Promise<string>
  → Returns: Recovery phrase (if wallet created with one)

exportPrivateKey(password): Promise<string>
  → Returns: Raw hex private key

// Properties
address: string
  → Wallet address (e.g., "mall1x7fk29zq0e4d2nvhslx9c6m")

name: string
  → User-friendly name

locked: boolean
  → Current lock state

keystore: EncryptedKeystore
  → Encrypted credentials object
```

**Transaction Signing Flow**:
```
1. MallchainWallet.getSigner() → MallchainSigner
2. MallchainSigner.sign(txBytes) → Signature
3. Attach signature to transaction
4. mallchainClient.broadcastTx(signedTx) → TxHash
5. mallchainClient.pollTxConfirmation(txHash) → Confirmed
```

---

### 4. MallchainNetworkAdapter (`src/blockchain/adapter.ts`)

**Status**: ✅ PRODUCTION-READY

**Real Network Probe**:
```typescript
getNetworkStatus(): Promise<MallchainNetworkStatus> {
  // Check if simulator is active
  if (isSimulator) {
    return simulated_status;
  }

  // Real: Probe RPC endpoint
  try {
    fetch(${this.network.rpcUrl}/status)
    // Parse CometBFT response
    // Return: { status: 'CONNECTED', latestBlock, chainId, ... }
  } catch (err) {
    return { status: 'OFFLINE', connected: false, ... };
  }
}
```

**Simulator Mode**:
- Automatically used if `network.isSimulator === true`
- Currently active in development
- Provides simulated block height, validators, transactions
- Allows testing without real network

**Real Network Endpoints**:
- RPC: `{rpcUrl}/status`, `/tx_search`, `/broadcast_tx_commit`
- REST: `{restUrl}/cosmos/bank/v1beta1/balances/{address}`
- Configured in: `src/config/networks.ts`

---

### 5. localStorage Access (`src/wallet/storage.ts`)

**Status**: ✅ PRODUCTION-READY

**Available Functions**:
```typescript
loadStoredKeystores(): WalletStorageRecord[]
  → Returns: All wallets from localStorage

saveStoredKeystore(record: WalletStorageRecord): void
  → Saves wallet to localStorage
  → Format: { address, name, keystore, createdAt }

removeStoredKeystore(address: string): void
  → Deletes wallet from localStorage

getActiveStoredAddress(): string | null
  → Returns: Currently selected wallet address

setActiveStoredAddress(address: string): void
  → Sets active wallet address
```

**Storage Keys**:
- Keystores: `mallchain-keystore-{address}`
- Active address: `mallchain-active-address`
- All data encrypted in transit/at rest

---

## Current Implementation Status

### ✅ Real Data Available But NOT Connected:

| Feature | Data Source | Current Dashboard | Status |
|---------|-------------|-------------------|--------|
| **Block Height** | `mallchainClient.getBlockHeight()` | Simulated (1,523,457 → +1/4s) | Ready to connect |
| **TPS** | Not directly available, would need tx rate calc | Simulated (1150-1400 random) | Ready to connect |
| **Validators** | `mallchainClient.getValidators()` | Mock data (3 validators) | Ready to connect |
| **Block Time** | `networkStatus.blockTimeMs` | Not used | Ready to connect |
| **Network Status** | `mallchainClient.getNetworkStatus()` | Not used | Ready to connect |
| **Send Transactions** | `mallchainClient.broadcastTx()` | Form UI only, not wired | Ready to connect |
| **Receive Address** | `wallet.address` (already available) | Placeholder QR | Ready to connect |
| **Balances** | `mallchainClient.getBalances()` | Mock "1,250.50 MALL" | Ready to connect |
| **Transaction History** | `mallchainClient.getTransactions()` | Mock 5 slips | Ready to connect |
| **Wallet Unlock** | `walletService.unlockActive()` | Not in dashboard | Ready to connect |
| **Account Switch** | `walletService.switchAccount()` | Not in dashboard | Ready to connect |

### ⚠️ Needs Validation:

1. **Buy MALL Formula**: USD ÷ 1.019
   - Needs: Review actual Mallchain pricing model
   - Location: TASK_24_PRICING_VALIDATION.md (to be created)

2. **QR Code Generation**: Current placeholder
   - Needs: Implement QR code generation
   - Could use: `qrcode.react` npm package
   - Data: wallet address

3. **TPS Calculation**:
   - No direct "TPS" metric from blockchain
   - Options:
     a) Query recent transactions and calculate rate
     b) Use block time + avg tx/block
     c) Get from chain telemetry endpoint

4. **Responsive Images/Icons**:
   - Current: Inline SVG emojis
   - Works but can be improved

---

## Integration Checkpoints

### Checkpoint 1: Real Block Height
```typescript
// Current (MallchainDashboard.tsx line ~90)
setInterval(() => {
  setState(prev => ({
    ...prev,
    blockHeight: prev.blockHeight + 1  // ❌ Simulated
  }))
}, 4000)

// To Change To:
useEffect(() => {
  const poll = setInterval(async () => {
    const height = await mallchainClient.getBlockHeight();
    setState(prev => ({
      ...prev,
      blockHeight: height,
      networkReady: true  // Mark as real data
    }))
  }, 4000)
  return () => clearInterval(poll)
}, [])
```

### Checkpoint 2: Real Balances
```typescript
// Current: Mock "1,250.50 MALL"

// To Change To:
useEffect(() => {
  if (!wallet?.address) return;
  (async () => {
    const balances = await mallchainClient.getBalances(wallet.address);
    const mallBalance = balances.find(b => b.denom === 'umall');
    setState(prev => ({
      ...prev,
      walletBalance: (parseFloat(mallBalance?.amount || 0) / 1_000_000).toFixed(2)
    }))
  })()
}, [wallet?.address])
```

### Checkpoint 3: Real Transaction History
```typescript
// Current: Mock 5 slips

// To Change To:
useEffect(() => {
  if (!wallet?.address) return;
  (async () => {
    const txs = await mallchainClient.getTransactions(wallet.address);
    const slips = txs.map(tx => ({
      id: tx.hash,
      type: determineType(tx),
      detail: tx.memo || formatAddress(tx.toAddress),
      when: formatTime(tx.timestamp),
      amount: calculateAmount(tx),
      amountClass: getClass(calculateAmount(tx))
    }))
    setState(prev => ({
      ...prev,
      slips: slips.slice(0, 5)  // Last 5
    }))
  })()
}, [wallet?.address])
```

---

## Next Steps (Implementation Order)

### Priority 1: Data Visibility (Critical)
1. [ ] Add "Demo Mode" / "Simulated" label to block height
2. [ ] Add network status indicator (CONNECTED/OFFLINE/SIMULATOR)
3. [ ] Distinguish real vs simulated data visually

### Priority 2: Real Data (High)
1. [ ] Connect real block height from `mallchainClient.getBlockHeight()`
2. [ ] Connect real wallet balances from `mallchainClient.getBalances()`
3. [ ] Connect real transaction history from `mallchainClient.getTransactions()`
4. [ ] Show real network status (connected, chain ID, validators)

### Priority 3: Wallet Operations (Medium)
1. [ ] Connect send form to `mallchainClient.broadcastTx()`
2. [ ] Generate real QR code for receive address
3. [ ] Connect account balances display

### Priority 4: Pricing & Advanced (Lower Priority)
1. [ ] Validate Buy MALL formula (USD ÷ 1.019)
2. [ ] Calculate real TPS from transaction data
3. [ ] Add mining/staking rewards calculation

---

## Implementation Notes

- **No changes to blockchain infrastructure**
- **No deployment required for audit/testing**
- **All methods are async** - require proper await/loading states
- **Error handling needed** for network timeouts/failures
- **Distinguish real vs simulated** with clear labels
- **Keep feature flag approach** for easy rollback
- **Test with both simulator and real network** before merging

---

## Files to Modify (Next Steps)

1. **MallchainDashboard.tsx** - Connect real data sources
2. **Add labels** - "Demo/Simulated" tags for mock data
3. **Add error states** - Handle network failures
4. **Add loading states** - Show spinners while fetching
5. **Create utility functions** - Format blockchain data for UI

---

**Audit Completed**: All required services are available and ready to integrate.

