# Validator / Node Trust Model — What Travels, What Doesn't

Audience: anyone who wants to run a Mallchain node (full, RPC, or validator)
on their own hardware, anywhere in the world. Also the internal answer to
"can the backend and Mongo 'go with the node' so other PCs don't depend on
this one?" — read section "Why the backend/Mongo do NOT ship".

## The short version

| Component | Ships to the world? | Why |
|---|---|---|
| Chain node (`marketplaced` binary + genesis + configs) | **Yes** — tarball bundles, see `scripts/make-validator-bundle.sh` | A node re-executes and verifies every block itself. It trusts no one's database. |
| REST/explorer read APIs (port 1317 on your own node) | **Yes** — you run your own | Part of the node. |
| Mallchain Explorer UI + indexer (`explorer/`) | **Yes, self-hostable** — it is an independent Node service (indexer + API on 5000 + frontend), pointed at *your* node's RPC, not ours | Open surface; see `explorer/QUICKSTART.md` / `DEPLOYMENT.md`. |
| Marketplace backend (`backend/`) | **No** | Off-chain application server: KYC documents, user accounts, credentials, the Mongo off-chain ledger. It is *our* service, not consensus infrastructure. |
| MongoDB | **No** | Contains PII and the off-chain double-entry ledger. A validator must never receive it, and we must never trust *anyone else's* copy of it either. |

## Why running your own node means not trusting this PC

Chain state is the only source of truth that validators are paid to protect.
Your node downloads blocks from peers, **re-executes every transaction against
its own copy of state**, and compares app hashes. If our reference node (or
our website, or our API) ever reported a different balance, height, or tx
than your own node's `/status` and `/abci_query` say, your node simply
disagrees — consensus follows the honest majority of voting power, not a
REST endpoint. Concretely:

* Compare `latest_app_hash` at the same height across nodes — equal hashes =
  identical state. No trust needed.
* The chain's staking params (verified live): `bond_denom=stake`,
  `max_validators=100`, `min_commission_rate=0`, unbonding 21 days.

## Why the backend/Mongo do NOT ship

1. **PII and credentials.** Mongo holds user profiles, KYC scans, session
   data, and API keys. Shipping it to strangers would be a GDPR disaster;
   shipping a *blank* one accomplishes nothing for consensus.
2. **It is not consensus input.** Validators reach agreement on on-chain
   state (x/mallcoin balances, staking, governance…). The Mongo ledger never
   enters a block. It is our internal accounting mirror.
3. **And we don't trust it either — that's the reconciliation point.** The
   off-chain Mongo ledger is continuously reconciled against the chain by the
   scheduled hourly reconciliation job: it walks on-chain history and corrects
   or flags divergences in our books. The direction of truth is
   **chain → Mongo**, never Mongo → chain. (Tamper-protection work in this
   iteration adds a **hash-chained audit trail** anchoring ledger state
   on-chain, so any silent divergence becomes externally provable — see the
   audit-trail deliverable by the backend agent; referenced here, implemented
   there.)

So: what a remote operator *must* be able to verify is on-chain. Anything our
backend says is a convenience view that they can (and, if they run a node,
should) verify against their own chain state via `/rest/…` on their node.

## What a public validator depends on from us

* **Genesis + peer discovery** (bootstrap only). Bundle: `config/genesis.json`
  pulled from the live `mallchain-1` chain, exported via RPC `/genesis`.
* Nothing else, once synced. Your node keeps its own keys
  (`node_key.json`, `priv_validator_key.json`) — secrets that stay on your
  machine and are *never* part of any download.

## Honest current-state limitations (as of 2026-10-31)

* **This PC is behind NAT.** The reference node (moniker `AvastaIan`) binds
  P2P on 0.0.0.0:26656 but the router does not forward 26656/26657 from the
  public internet, and RPC is bound to 127.0.0.1 only. There is **no public
  peer address yet** — `persistent_peers` in the live config is empty and
  `external_address` is unset. A new node joining today must obtain peers out
  of band (community channel, `/net_info` on any reachable node). This is the
  single biggest blocker for "nodes across the world" and it is a *network
  plumbing* problem (port-forward 26656 or put a node on a VPS), not a code
  one.
* Single validator is bonded and producing blocks on this chain today;
  permissionless bootstrapping of the second+ validators is exactly what the
  bundle + `CREATE_VALIDATOR.sh` enable once a public peer exists.
* gRPC trap: bundled configs keep `[grpc] enable = false`; enabling it on
  9090 kills the REST API on 1317 in this stack.

## Self-hosting checklist (short form)

1. Download `mallchain-node-<version>-<os>-<arch>.tar.gz` + `sha256sums.txt`.
2. Verify checksum → extract → `INSTALL.md` (note: **no `init` command** —
   use `bin/gen-node-home`; `show-node-id` prints to **stderr**).
3. Set `moniker` + `persistent_peers`, start, wait for `catching_up:false`.
4. Optional: run your own explorer (`explorer/`) against your node's RPC.
5. Optional: `./CREATE_VALIDATOR.sh` with a funded account to validate.
