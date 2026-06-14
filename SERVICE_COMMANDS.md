# Service Start and Stop Commands

Run these from the repository root.

## Start services

### 1) Blockchain
```sh
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

### 2) Backend API
```sh
cd backend && npm start
```

### 3) Frontend UI
```sh
cd frontend && npm run dev -- --host 127.0.0.1
```

## Stop services

### Kill all local app processes
```sh
pkill -f "marketplaced start" || true
pkill -f "node src/index.js" || true
pkill -f "vite" || true
```

### Optional: force-free ports if a process is still hanging
```sh
fuser -k 4000/tcp 5173/tcp 5174/tcp 5175/tcp 5176/tcp 1317/tcp 26657/tcp 26656/tcp 9090/tcp 2>/dev/null || true
```

## One-command startup helper
```sh
./START_ALL.sh
```
