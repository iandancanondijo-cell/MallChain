# Marketplace Blockchain

This repository contains the Marketplace blockchain app, its Cosmos SDK chain, the Node/Express backend, and the Vite/React frontend.

## Current stack

- Blockchain node: `marketplaced`
- Backend API: `backend/`
- Frontend UI: `frontend/`
- Local startup helpers: `START_ALL.sh`, `STOP_ALL.sh`

## Quick start

From the repository root, you can start the full stack with:

```sh
./START_ALL.sh
```

To stop everything:

```sh
./STOP_ALL.sh
```

## Manual startup commands

### 1. Blockchain

```sh
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

### 2. Backend

```sh
cd backend && npm start
```

### 3. Frontend

```sh
cd frontend && npm run dev -- --host 127.0.0.1
```

## Manual stop commands

```sh
pkill -f "marketplaced start" || true
pkill -f "node src/index.js" || true
pkill -f "vite" || true
pkill -f "nodemon src/index.js" || true
```

If a port is still stuck, you can also force it free with:

```sh
fuser -k 4000/tcp 5173/tcp 5174/tcp 5175/tcp 5176/tcp 1317/tcp 26657/tcp 26656/tcp 9090/tcp 2>/dev/null || true
```

## Production

See [PRODUCTION.md](./PRODUCTION.md) for deployment, security checklist, and chain reset steps.

If you changed genesis or `chain_id`, reset local chain data:

```sh
./scripts/reset-local-chain.sh
```

## Development notes

- The backend expects the blockchain REST endpoint on `http://127.0.0.1:1317`.
- The frontend uses Vite and will start on the next available port if `5173` is already occupied.
- The startup helper in `START_ALL.sh` is the preferred way to bring up the full local stack.

## Release

To release a new version of your blockchain, create and push a new tag with `v` prefix. A new draft release with the configured targets will be created.

```sh
git tag v0.1
git push origin v0.1
```

After a draft release is created, make your final changes from the release page and publish it.

## Install

To install the latest version of your blockchain node's binary, execute the following command on your machine:

```sh
curl https://get.ignite.com/tmp/marketplace@latest! | sudo bash
```

`tmp/marketplace` should match the `username` and `repo_name` of the GitHub repository to which the source code was pushed. Learn more about the install process at the Ignite installer docs.

## 2026 Enhancement Roadmap

This project is evolving toward a modern blockchain architecture with the following priorities:

- **Invisible UX**: smart accounts, gasless transactions, and social recovery.
- **Agent-ready infrastructure**: support autonomous AI agents with scoped spending keys and verifiable decision logs.
- **Modular scalability**: separate execution, settlement, and data availability, with a focus on high throughput and composable modules.
- **Real-world asset tokenization**: support custody-grade fractional ownership, compliance-by-design, and stablecoin settlement.
- **Cross-chain and payment interoperability**: make assets move seamlessly across chains, with the backend abstracting network details.
- **Privacy + compliance**: add zero-knowledge proofs, selective disclosure, and on-chain audit trails.

See `docs/2026_blockchain_enhancements.md` for the full feature roadmap and implementation guidance.

## Learn more

- [Ignite CLI](https://ignite.com/cli)
- [Tutorials](https://docs.ignite.com/guide)
- [Ignite CLI docs](https://docs.ignite.com)
- [Cosmos SDK docs](https://docs.cosmos.network)
- [Developer Chat](https://discord.com/invite/ignitecli)

