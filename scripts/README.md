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
