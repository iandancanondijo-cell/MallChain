This folder contains small scripts to interact with the local marketplace chain using CosmJS.

Steps:

1. Install dependencies

```bash
cd marketplace/scripts
npm ci
```

2. Print an address derived from a mnemonic (default test mnemonic used if `MNEMONIC` not set):

```bash
MNEMONIC="your mnemonic here" npm run gen-address
```

3. Send a short `mlc` `MsgSend` from the mnemonic to a target address (requires the sending account to be funded in genesis):

```bash
# Example using default mnemonic and RPC
MNEMONIC="..." npm run send
```

Notes:
- The local node must be running and reachable on the RPC address in `RPC` env var (default `http://localhost:26657`).
- Ensure the sending account is funded in genesis before starting the node, or restart node after adding funds to genesis.

## Backup / restore

`backup.sh` and `restore.sh` back up and restore both stores of state:
MongoDB (users, KYC, escrow records, audit logs, withdrawal requests, etc.)
and the chain data directory (`blockchain_working/`), which covers every
module's on-chain state including x/vault's KV store — there is no separate
vault backup step, since vault state lives in the same multistore as every
other module.

```bash
# Stop marketplaced first for a consistent chain-data snapshot.
./scripts/backup.sh my-backup-name

# Lists available backups if you omit the name.
./scripts/restore.sh my-backup-name
```

Both default to `MONGO_URI=mongodb://localhost:27017/marketplace` and write/read
backups under `./backups/<name>/`. Requires `mongodump`/`mongorestore` (MongoDB
Database Tools) on PATH. `restore.sh` moves any existing chain data aside
(timestamped, not deleted) before restoring, and refuses to run against a live
`marketplaced` process.
