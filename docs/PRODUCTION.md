# Production deployment guide

This document describes how to run Marketplace / Mallchain in a production-ready configuration.

## Architecture

| Component | Port (default) | Role |
|-----------|----------------|------|
| `marketplaced` | 26657 RPC, 1317 REST | Cosmos SDK node |
| Backend API | 4000 | REST + WebSocket for the app |
| Frontend (static) | 443 / CDN | Built with `npm run build` |
| MongoDB | 27017 | Users, payments, tx history |
| Redis | 6379 | Background workers, auth cache, rate limits (**required** in production) |

Do **not** expose the wallet service (`wallet-service.js`) on the public internet. Wallets should sign in the browser (`frontend/src/core/wallet/walletUtils.js`).

## 1. Chain configuration

### Align chain ID and denoms

All layers must agree:

| Variable | Example |
|----------|---------|
| `chain_id` in genesis | `mallchain-1` |
| `CHAIN_ID` (backend) | `mallchain-1` |
| `VITE_CHAIN_ID` (frontend) | `mallchain-1` |
| Base denom | `stake` (bank module) |
| `minimum-gas-prices` | `0.01stake` |
| `GAS_PRICE` (backend) | `0.01stake` |

After changing genesis or chain ID, reset local data:

```bash
chmod +x scripts/reset-local-chain.sh
./scripts/reset-local-chain.sh
```

Then start the node again.

### Node flags (production)

```bash
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://0.0.0.0:26657 \
  --api.enable \
  --api.address=tcp://0.0.0.0:1317
```

Put REST/RPC behind a reverse proxy with TLS. Restrict RPC `0.0.0.0` binding to internal networks only.

## 2. Backend

Copy `backend/.env.example` to `backend/.env` and set:

- `NODE_ENV=production`
- Strong `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_API_KEY`
- `FRONTEND_URL` and `CORS_ORIGINS` (comma-separated production URLs)
- `CHAIN_RPC`, `CHAIN_REST`, `CHAIN_ID`, `CHAIN_PREFIX`, `CHAIN_BASE_DENOM`, `GAS_PRICE`
- `OPERATOR_MNEMONIC` only if the server must sign txs (use a dedicated hot wallet with minimal funds)
- `PAYMENT_WEBHOOK_SECRET` for M-Pesa / payment provider callbacks
- `MONGO_URI` pointing to a managed MongoDB instance

Start:

```bash
cd backend && npm ci && npm start
```

Health: `GET /api/health` (chain + backend).

Metrics: `GET /metrics` with header `x-api-key: <ADMIN_API_KEY>`.

## 3. Frontend

Copy `frontend/.env.example` to `frontend/.env.production` (or set CI variables):

```bash
cd frontend && npm ci && npm run build
```

Serve `frontend/dist` with nginx, Caddy, or a static host. Point `VITE_API_URL` at your public API.

## 4. Security checklist

- [ ] Rotate all dev secrets from `.env`
- [ ] `NODE_ENV=production` on the API — enforced at startup: the API refuses to
      boot in production without `JWT_SECRET`, `SESSION_SECRET`, `ADMIN_API_KEY`,
      `OPERATOR_MNEMONIC`, `FAUCET_MNEMONIC`, `PAYMENT_WEBHOOK_SECRET`, and
      `VAULT_ADDR`/`VAULT_TOKEN` (see `config/index.js`'s `validateRuntimeSecrets`)
- [ ] CORS limited to your frontend origin(s) — enforced in code via `CORS_ORIGINS`;
      the `localhost`/`127.0.0.1` dev fallback is automatically disabled when
      `NODE_ENV=production`
- [ ] Wallet service disabled or bound to `127.0.0.1` only — this is already the
      default (`WALLET_SERVICE_HOST`); only override it if you understand the risk
- [ ] TLS on API and static site
- [ ] MongoDB auth + network isolation
- [ ] Rate limits reviewed (`RATE_LIMIT_*` in backend config)
- [ ] Payment webhooks use `PAYMENT_WEBHOOK_SECRET` + verification — enforced:
      production startup fails without `PAYMENT_WEBHOOK_SECRET` set, and
      `/api/buy/mpesa/callback` / `/api/buy/payout/callback` reject any request
      whose `?token=` query param doesn't match it (Safaricom doesn't support
      signing webhook payloads, so the secret is embedded in the callback URL
      registered with them instead of an HMAC header)

## 5. Optional services

- **Redis**: required for BullMQ workers (`transactionWorker`). API runs without it in degraded mode.
- **Explorer indexer**: `npm run explorer:all` in `backend/` for a dedicated explorer stack.

## 6. Monitoring

- Backend logs: structured via Morgan `combined` in production
- Prometheus: `/metrics` when `prom-client` registry is loaded
- Chain: CometBFT metrics on node; enable `[telemetry] enabled = true` in `app.toml` if needed

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Wrong chain ID on broadcast | Match `CHAIN_ID` / `VITE_CHAIN_ID` to node; reset chain if genesis changed |
| Insufficient fees | Align `GAS_PRICE` and `minimum-gas-prices` denom |
| CORS errors | Set `FRONTEND_URL` and `CORS_ORIGINS` |
| Staking shows mock validators | Ensure chain REST is up; `GET /api/validators/list` |
| Health shows chain down | Start `marketplaced` with `--api.enable` |
