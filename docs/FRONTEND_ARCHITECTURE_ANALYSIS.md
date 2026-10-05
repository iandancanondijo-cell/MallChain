# MALLCHAIN PROJECT — FRONTEND ARCHITECTURE ANALYSIS

**Date**: 2026-09-17  
**Scope**: Two independent frontend applications, backend services, and blockchain integration

---

## EXECUTIVE SUMMARY

The Mallchain project contains **TWO distinct frontend applications** with fundamentally different architectures and purposes:

1. **Mallchain App** (Port 3000) — Direct blockchain wallet & explorer
2. **Mallchain Mission Control v14** (Port 5173) — Centralized backend-dependent dashboard

They do **NOT** share the same architecture, wallet system, or communication patterns.

---

## FRONTEND 1: MALLCHAIN APP

### Location
```
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-app
```

### Identification
- **Package Name**: `react-example` (legacy name)
- **Display Name**: Mallchain App
- **Purpose**: Direct blockchain wallet, transactions, block explorer, validator management, dApp portal
- **Type**: Standalone blockchain gateway

### Startup Command
```bash
cd mallchain-app
npm run dev
```

### Port & Access
- **Port**: 3000 (HTTP, all interfaces)
- **URL**: http://localhost:3000
- **Command**: `vite --port=3000 --host=0.0.0.0`

### Framework & Build
- **Framework**: React 19.0.1 + TypeScript
- **Build Tool**: Vite 6.2.3
- **Build Command**: `npm run build` → outputs to `dist/`
- **Preview Command**: `npm run preview`

### Key Dependencies
```json
{
  "react": "^19.0.1",
  "vite": "^6.2.3",
  "@noble/curves": "^2.4.0",
  "@scure/bip32": "^2.4.0",
  "@scure/bip39": "^2.4.0",
  "cosmjs-types": "^0.11.0",
  "qrcode": "^1.5.4",
  "express": "^4.21.2"
}
```

### Environment Configuration
**File**: `.env.local` (user-created) and `.env.example`

**Mallchain RPC/REST Endpoints**:
```bash
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_MAINNET_CHAIN_ID="mallchain-1"

VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"

VITE_MALLCHAIN_TESTNET_RPC_URL=""  # Placeholder, not set
VITE_MALLCHAIN_TESTNET_REST_URL=""
```

### Blockchain Connection Architecture
- **Type**: Direct to Mallchain node (RPC + REST)
- **No Backend**: Does NOT require a backend service
- **Network Modes**: 
  - Simulator (internal mock)
  - Local (127.0.0.1:26657)
  - Testnet (placeholder URL)
  - Mainnet (placeholder URL)

### Source Structure
```
mallchain-app/src/
├── blockchain/
│   ├── adapter.ts         # Network adapter for RPC/REST calls
│   ├── client.ts          # Main blockchain client
│   ├── proto.ts           # Protobuf transaction builders
│   └── simulator.ts       # Mock blockchain for testing
├── config/
│   └── networks.ts        # Network configurations (fallback URLs)
├── wallet/
│   ├── MallchainWallet.ts # Key management, encryption
│   └── MallchainSigner.ts # Transaction signing
├── components/            # UI components
├── pages/                 # Application pages
├── provider/              # Context providers
├── security/              # Crypto utilities
└── services/              # Wallet service, etc.
```

### Wallet System
- **Type**: Client-side, browser-based
- **Key Generation**: BIP-39 mnemonic
- **Storage**: Encrypted keystore (password-protected)
- **Signing**: secp256k1 (via @noble/curves)
- **Private Key Access**: Only when wallet is unlocked
- **Export**: Supports mnemonic and private key export

### Pages/Features
1. Dashboard — Balance & account info
2. Send — Transfer MLCNS
3. Receive — Address & QR code
4. Transactions — Transaction history
5. Explorer — Block explorer
6. Validators — Staking interface
7. Contracts — Smart contract interaction
8. dApp Portal — dApp connection
9. Settings — Network/configuration

---

## FRONTEND 2: MALLCHAIN MISSION CONTROL V14

### Location
```
/home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14
```

### Identification
- **Package Name**: `mallchain-os-v14`
- **Display Name**: Mallchain Mission Control v14
- **Purpose**: Production-grade centralized dashboard with backend API
- **Type**: Backend-dependent application

### Startup Command
```bash
cd mallchain-os-v14
npm run dev
```

### Port & Access
- **Port**: 5173 (HTTP)
- **URL**: http://localhost:5173
- **Default Configuration**:
  ```typescript
  server: {
    port: 5173,
    host: true,
  }
  ```

### Framework & Build
- **Framework**: React 18.3.1 + TypeScript
- **Build Tool**: Vite 7.3.6
- **Build Command**: `npm run build` → outputs to `dist/`
- **Build Validation**: Requires VITE_API_BASE_URL to be set
- **Type Checking**: `tsc --noEmit && vite build`

### Key Dependencies
```json
{
  "react": "^18.3.1",
  "vite": "^7.3.6",
  "@cosmjs/amino": "^0.39.0",
  "@cosmjs/proto-signing": "^0.39.0",
  "@cosmjs/stargate": "^0.39.0",
  "socket.io-client": "^4.6.0",
  "hash-wasm": "^4.12.0",
  "bcryptjs": "^3.0.3",
  "ed25519-hd-key": "^2.0.0"
}
```

### Environment Configuration
**File**: `.env` and `.env.example` in root

**Required Variables**:
```bash
# Backend API URL (REQUIRED for production builds)
VITE_API_BASE_URL=http://localhost:4000
# OR: https://api.mallchain.com (production)

# Network identification
VITE_NETWORK=testnet  # or mainnet

# Chain parameters for signing
VITE_CHAIN_ID=mallchain-1
VITE_CHAIN_PREFIX=mall
VITE_GAS_PRICE=0.01stake

# Session management
VITE_SESSION_TTL=120  # minutes
```

### Backend Connection Architecture
- **Type**: HTTP REST API + WebSocket (Socket.IO)
- **Backend Required**: YES — mandatory for all operations
- **API Base URL**: `VITE_API_BASE_URL` (must be set before build)
- **Real-Time Updates**: Socket.IO for live data
- **Authentication**: Session-based (cookies, Google OAuth)
- **No Direct Blockchain Access**: All blockchain operations go through backend

### Source Structure
```
mallchain-os-v14/src/
├── services/
│   ├── api.ts              # HTTP client for backend
│   ├── socket.ts           # WebSocket connection manager
│   ├── config.ts           # Configuration & validation
│   ├── auth.ts             # Authentication & session
│   └── storeSync.ts        # State synchronization
├── features/               # Feature modules (22 directories)
├── components/             # UI components
├── store/                  # Global state (Zustand?)
├── pages/                  # Application pages
├── router.tsx              # Hash-based routing
├── hooks/                  # React hooks
└── styles/                 # CSS stylesheets
```

### API Architecture
- **Validation**: Config validation at module load time (fail-fast)
- **Error**: Throws error immediately if VITE_API_BASE_URL invalid in production
- **URL Format**: Must be `http://` or `https://` without trailing slash
- **Example Valid URLs**:
  - `http://localhost:4000`
  - `http://localhost:3000`
  - `https://api.example.com`
  - `https://api.example.com:8080`

### Routing
- **Type**: Hash-based (e.g., `#/dashboard`, `#/explorer`)
- **Reason**: Works from any static host without server rewrites
- **Router**: Custom `router.tsx` with lazy loading

### Features
- Dashboard with real-time updates
- Explorer with chain data
- Wallet integration via backend
- Transaction signing (client-side)
- Admin panel (conditional UI)
- Maintenance mode handling
- Google OAuth integration
- Multi-tab store synchronization
- Error boundary with fallbacks

---

## COMPARISON TABLE

| Aspect | Mallchain App (3000) | Mission Control v14 (5173) |
|--------|----------------------|----------------------------|
| **Purpose** | Direct blockchain wallet | Centralized dashboard |
| **Backend Required** | NO | YES (mandatory) |
| **Blockchain Access** | Direct to RPC/REST | Through backend API |
| **Wallet** | Client-side, browser-based | Backend-managed sessions |
| **Authentication** | None (local wallet) | Session + Google OAuth |
| **Real-Time Updates** | Polling queries | Socket.IO WebSocket |
| **Port** | 3000 | 5173 |
| **React Version** | 19.0.1 | 18.3.1 |
| **Vite Version** | 6.2.3 | 7.3.6 |
| **Build Validation** | None (optional env vars) | Requires VITE_API_BASE_URL |
| **Network Config** | Environment variables | Environment variables + validation |
| **Routing** | Custom pages/state | Hash-based with lazy loading |
| **Target Users** | Power users, devs | General users via centralized API |

---

## SHARED vs INDEPENDENT COMPONENTS

### What They DO NOT Share
1. **Backend Service** — Mallchain App has no backend; Mission Control requires backend
2. **Wallet System** — Mallchain App uses browser crypto; Mission Control uses backend sessions
3. **Data Flow** — Mallchain App queries Mallchain directly; Mission Control queries backend
4. **Authentication** — Mallchain App has none; Mission Control has OAuth + sessions
5. **Routing** — Mallchain App has custom page routing; Mission Control uses hash-based router
6. **Node Dependencies** — Different React versions, different Vite versions
7. **Build Requirements** — Mission Control build fails without API URL; Mallchain App doesn't

### What They MIGHT Share
1. **Shared UI Components** — Both might use `/packages/shared-ui` (but unverified)
2. **Mallchain Chain** — Both can connect to the same Mallchain RPC (but not required)
3. **Blockchain Parameters** — Both understand BIP-39, secp256k1, Cosmos SDK

### How They Communicate
- **They DON'T communicate with each other**
- Both are independent applications
- If running simultaneously, they run on different ports (3000 vs 5173)
- No inter-application messaging or API calls between them

---

## BLOCKCHAIN CONNECTIVITY

### Mallchain App
```
Browser App (Port 3000)
    ↓
    ├→ Network Selector (Simulator / Local / Testnet / Mainnet)
    ├→ Direct RPC/REST Queries
    ├→ Mallchain Node (127.0.0.1:26657)
    └→ Transaction Signing (Browser secp256k1)
```

**Current .env.local**:
- Mainnet RPC: `http://127.0.0.1:26657`
- Mainnet REST: `http://127.0.0.1:1317`
- Local RPC: `http://127.0.0.1:26657` (same as mainnet)
- Local REST: `http://127.0.0.1:1317` (same as mainnet)

### Mission Control v14
```
Browser App (Port 5173)
    ↓
Backend API (Port 4000)
    ├→ Blockchain Queries
    ├→ Transaction Signing
    ├→ Session Management
    ├→ Wallet Management
    └→ Mallchain Node (via backend)
```

**Configuration**:
- Backend API URL: `VITE_API_BASE_URL` (e.g., http://localhost:4000)
- Chain ID: `VITE_CHAIN_ID=mallchain-1`
- All blockchain access flows through backend

---

## INDEPENDENT DIRECTORIES & PACKAGES

### Component Library (Shared)
```
/packages/shared-ui/
├── package.json
├── vite.config.ts
└── src/  (Component library, not runnable)
```
- **Type**: NPM package (not standalone app)
- **Port**: None (library only)
- **Purpose**: Shared React components

### Other Backend Services
```
/backend/              # Main backend API (Node.js)
/explorer/            # Block explorer (separate service)
/mallwallet/          # Wallet backend services
  ├── backend/
  └── frontend/components/  (Only components, not standalone)
```

---

## NETWORK DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mallchain Project Architecture               │
└─────────────────────────────────────────────────────────────────┘

                                    ┌──────────────────────┐
                                    │  Mallchain Blockchain│
                                    │  (Chain: mallchain-1)│
                                    │  RPC: 127.0.0.1:26657
                                    │  REST: 127.0.0.1:1317
                                    └──────────────────────┘
                                            ↑
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ↓                       ↓                       ↓
            ┌──────────────┐        ┌──────────────┐        ┌────────────────┐
            │ Mallchain App│        │   Backend    │        │ Mission Control│
            │  Port 3000   │        │ Port 4000(??)│        │    Port 5173   │
            │              │        │              │        │                │
            │ Direct       │        │ REST API +   │        │ Backend-driven │
            │ Blockchain   │        │ Socket.IO    │        │ Dashboard      │
            │ Wallet       │        │ Session Mgmt │        │ Session+OAuth  │
            │ Explorer     │        │ Tx Signing   │        │ Real-time UI   │
            └──────────────┘        └──────────────┘        └────────────────┘
                ↑                       ↑
                └───────────────────────┘
           (Independent, don't communicate with each other)

├─ Both can query the same Mallchain RPC
├─ But they do it independently
├─ No shared wallet system
├─ No shared backend storage
└─ No inter-app messaging
```

---

## ENVIRONMENT VARIABLES SUMMARY

### Mallchain App (.env.local)
```bash
# Mainnet endpoints
VITE_MALLCHAIN_MAINNET_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_MAINNET_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_MAINNET_CHAIN_ID="mallchain-1"

# Local endpoints (currently same as mainnet for local testing)
VITE_MALLCHAIN_LOCAL_RPC_URL="http://127.0.0.1:26657"
VITE_MALLCHAIN_LOCAL_REST_URL="http://127.0.0.1:1317"
VITE_MALLCHAIN_LOCAL_CHAIN_ID="mallchain-1"
```

### Mission Control v14 (.env)
```bash
# Backend API (REQUIRED)
VITE_API_BASE_URL=http://localhost:4000

# Network
VITE_NETWORK=testnet

# Chain params
VITE_CHAIN_ID=mallchain-1
VITE_CHAIN_PREFIX=mall
VITE_GAS_PRICE=0.01stake

# Session
VITE_SESSION_TTL=120
```

---

## CURRENT STATUS

### Mallchain App
- ✅ Dev server running on port 3000
- ✅ `.env.local` configured with local node endpoints
- ✅ Ready for Mainnet connection testing
- ⏳ Awaiting browser verification of endpoint usage

### Mission Control v14
- ❓ Backend API status unknown (not running?)
- ❓ VITE_API_BASE_URL not verified
- ❓ Would require backend service to be running
- ⏳ Not currently the focus of testing

---

## CONCLUSION

**Two Completely Independent Frontends**:
1. **Mallchain App (Port 3000)**: Direct blockchain wallet, no backend needed
2. **Mission Control v14 (Port 5173)**: Centralized dashboard, requires backend API

**They share**:
- Same Mallchain blockchain (can connect to)
- Same directory structure (React + TypeScript + Vite)
- Some cryptographic dependencies

**They DON'T share**:
- Backend service
- Wallet system
- Data storage
- Authentication system
- Communication channels

**They are designed to work independently**.
