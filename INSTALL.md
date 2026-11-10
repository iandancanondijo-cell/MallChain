# Mallchain Marketplace - Installation Guide

## Prerequisites

- **Go 1.24+** (required by `go.mod`)
- **Node.js 20+**
- **npm 9+**
- **Docker & Docker Compose** (for MongoDB, Redis)
- **Rust + wasm-pack** (for WASM smart contracts, optional)

## Quick Start

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd MarketplaceBlockchain-Mallchain

# 2. Copy and configure environment
cp .env.example .env
# Edit .env and set real secrets:
#   openssl rand -hex 64  (for JWT_SECRET, SESSION_SECRET, ADMIN_API_KEY)
# NEVER commit real mnemonics or secrets to .env

# 3. Start infrastructure (MongoDB + Redis)
docker compose up -d mongo redis

# 4. Install Go dependencies
go mod download

# 5. Build the blockchain binary
make install

# 6. Start the full stack
./START_ALL.sh
```

## Building

```bash
# Build blockchain binary
make install

# Build frontend
cd frontend && npm ci && npm run build

# Build backend
cd backend && npm ci
```

## Testing

```bash
# Go unit tests
make test-unit

# Go tests with race detection
make test-race

# Go vet + vulnerability check
make govet
make govulncheck

# Linting
make lint
```

## Architecture

```
MarketplaceBlockchain-Mallchain/
  app/              # Cosmos SDK app wiring (Go)
  cmd/              # CLI entry points (marketplaced)
  x/                # Custom Cosmos SDK modules
  contracts/        # AssemblyScript WASM contracts
  wasm/             # CosmWasm smart contracts (Rust)
  backend/          # Node.js Express API server
  frontend/         # React + Vite frontend
  explorer/         # Blockchain explorer
  sdk/              # Client SDKs (Go, JS, Python)
  marketplace/      # Protobuf generated code
  proto/            # Protobuf definitions
  mallwallet/       # Wallet backend service
  operator/         # Operator server for fund distribution
  scripts/          # Utility scripts
  packages/         # Shared packages (config, UI)
```

## Environment Variables

See `.env.example` for all required variables. Key secrets to generate:

```bash
JWT_SECRET=$(openssl rand -hex 64)
SESSION_SECRET=$(openssl rand -hex 64)
ADMIN_API_KEY=$(openssl rand -hex 64)
PAYMENT_WEBHOOK_SECRET=$(openssl rand -hex 64)
MINES_BROADCAST_SECRET=$(openssl rand -hex 64)
```

## Docker Deployment

```bash
docker compose up -d
```

See `docker-compose.yml` for service definitions. Requires `.env` with all
secrets set (MongoDB, Redis, JWT, API keys).

## Security Notes

- **Never** commit mnemonics or private keys to version control
- Set all `.env` file permissions to `600`: `chmod 600 .env backend/.env`
- Use a secrets manager (HashiCorp Vault, AWS Secrets Manager) in production
- Rotate all keys if they have ever been committed to git history
