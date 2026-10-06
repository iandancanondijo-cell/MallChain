# Run a Blockchain Node

Operate a `marketplaced` full node on this machine or on a fresh PC: build
the binary, create a node home, join the live `mallchain-1` network (or spin
up a standalone chain), configure it, run it, and recover from the failure
modes we've actually hit. This is an operator-level task — nothing here
happens through the wallet app (compare `06-staking.md` for delegating, and
`09-become-a-validator.md` for the *next* step after running a node).

## The one thing to know before anything else

**`marketplaced` has no `init` command.** It is a node-runner only — its
command surface is `start`, `comet` (a.k.a. `tendermint`/`cometbft`),
`export`, `rollback`, `module-hash-by-height`, `version`, and `completion`.
There is also no key-generation subcommand. `cmd/marketplaced/main.go` wires
up server commands only, so a fresh node home cannot be produced by the
binary itself.

This guide uses `scripts/gen_node_home.go`, a small helper that generates
exactly what `cometbft init` would — node key, validator key, default
`config.toml` — using the same CometBFT library version as the binary (it is
a dependency in `go.mod`), so the generated files are version-compatible by
construction. `scripts/install-remote-node.sh` bundles the whole flow.

Two other binary quirks to know up front:

- `marketplaced comet show-validator` panics (missing client context in the
  binary). Read your consensus pubkey directly from
  `config/priv_validator_key.json`'s `pub_key.value` instead — that's what
  `backend/scripts/create-validator.js` does.
- `marketplaced comet show-node-id` prints its output to **stderr**, not
  stdout. `$(...)` captures nothing and `| grep` sees nothing — use
  `2>&1` when scripting around it.

## What's in a node home

A node home (e.g. `blockchain_working/`, `.marketplace_test/`, or
`~/.mallchain/`) is:

| Path | What it is | Committed to git? |
|---|---|---|
| `config/genesis.json` | The chain's birth certificate — defines `mallchain-1` | **Yes** (`blockchain_working/config/`) |
| `config/app.toml` | Cosmos SDK app config: API, gRPC, pruning, gas | **Yes** |
| `config/config.toml` | CometBFT config: moniker, P2P, RPC, timeouts | No (regenerated, then patched) |
| `config/node_key.json` | P2P identity keypair → your node ID | **No — secret** |
| `config/priv_validator_key.json` | Consensus keypair → your validator address | **No — secret** |
| `config/addrbook.json` | Known peers | No (self-populates) |
| `data/` | Blockstore, state, WAL, `priv_validator_state.json` | No |

The key rule: **genesis and app.toml are shared; keys are per-node and never
committed.** Every node that wants to join `mallchain-1` uses the committed
`blockchain_working/config/genesis.json` verbatim, plus its own fresh keys.

## Prerequisites

- Go 1.25.8+ (`go version`). On this machine Go lives at
  `/usr/local/go/bin/go`; the install script adds that to `PATH` if `go`
  isn't found.
- A clone of this repository (the committed genesis and app.toml come from
  it).
- For joining the live network: network reachability to an existing peer on
  port 26656.
- Ports used (make sure nothing else binds them):
  - **26657** — RPC (kept on `127.0.0.1` by default)
  - **26656** — P2P
  - **1317** — REST API (only if enabled; see the gRPC trap below)
  - **9099** — gRPC, if you enable it. **Never 9090/9091** on the dev
    machine — Prometheus owns 9090 there.

## Step 1 — Build the binary

From the repository root:

```bash
go build -o ./marketplaced \
  -ldflags="-X github.com/cosmos/cosmos-sdk/version.Name=marketplace" \
  ./cmd/marketplaced
```

Takes 3–10 minutes the first time (`go mod download` runs first). The
`install-remote-node.sh` script does this inline with a 30-minute timeout.

## Step 2 — Create the node home

```bash
go run scripts/gen_node_home.go ~/.mallchain
```

Output:

```
node id:  c7a0fe538cbb8f51bc7c2618a7817e864a2d1a6d
config:   /home/you/.mallchain/config/config.toml
privval:  /home/you/.mallchain/config/priv_validator_key.json
nodekey:  /home/you/.mallchain/config/node_key.json
```

This creates `config/` and `data/` with fresh keys and a default
`config.toml`. **It is idempotent** — re-running keeps existing keys
(LoadOrGen semantics), so it's safe to run again after a partial setup.

Get your node ID any time with:

```bash
./marketplaced comet show-node-id --home ~/.mallchain
# (remember: prints to stderr — add 2>&1 inside scripts)
```

## Step 3 — Install the network genesis and app.toml

The helper does *not* write genesis or app.toml — those must come from the
repository so your node speaks the same chain:

```bash
cp blockchain_working/config/genesis.json ~/.mallchain/config/
cp blockchain_working/config/app.toml  ~/.mallchain/config/
```

The committed `app.toml` deliberately ships with:

- `[api] enable = true`, `address = "tcp://localhost:1317"`
- `[grpc] enable = false` — see the gRPC trap below for why

## Step 4 — Configure

Patch `~/.mallchain/config/config.toml`:

```bash
# Human-readable node name (shows up in peers' logs and explorer)
sed -i "s|^moniker = .*|moniker = \"my-node\"|" ~/.mallchain/config/config.toml

# Dial an existing node at startup (join the network)
sed -i "s|^persistent_peers = .*|persistent_peers = \"<40-hex-node-id>@<host>:26656\"|" \
  ~/.mallchain/config/config.toml
```

The peer's 40-hex node ID comes from the peer machine:

```bash
./marketplaced comet show-node-id --home <peer home> 2>&1
```

Other `config.toml` values worth knowing:

| Key | Default here | Notes |
|---|---|---|
| `p2p.laddr` | `tcp://0.0.0.0:26656` | P2P listener |
| `rpc.laddr` | `tcp://127.0.0.1:26657` | Keep loopback unless you mean to expose it |
| `seeds` | `""` | Seed nodes; we run without any |
| `external_address` | `""` | Set to a routable `host:26656` if others should dial *you* |
| `pex` | `true` | Peer exchange; leave on unless isolating |

## Step 5 — Run and verify

```bash
./marketplaced start --home ~/.mallchain --minimum-gas-prices="0.01umal"
```

`--minimum-gas-prices` is the fee denom the chain transacts in (`0.01umal`).
Verify it's producing/following blocks:

```bash
curl -s http://127.0.0.1:26657/status | \
  jq '.result.sync_info.latest_block_height'
```

On `mallchain-1` a new block lands every ~5–6 seconds, so this number should
climb. On first start a joining node will sync the whole chain history —
watch `sync_info.latest_block_height` approach the peer's height and
`sync_info.catching_up` flip to `false`.

One command that does the whole setup (build + home + genesis + peer + run):

```bash
scripts/install-remote-node.sh \
  --peer=<node-id>@<host>:26656 \
  --moniker=my-node \
  --home=~/.mallchain \
  --start
```

Options: `--api` (enable REST on 127.0.0.1:1317), `--grpc-address=localhost:9099`,
`--chain-id` (default `mallchain-1`).

## Running a standalone chain instead (Scenario B)

If you're not joining `mallchain-1`, you need a genesis of your own — but
there's a trap: the genesis `app_state.slashing.signing_infos` must contain
an entry for **your** validator address, and each `mallvalcons1...` address
must decode to exactly the 20 bytes CometBFT derives from your consensus
pubkey. If they don't match, the node panics on block 2 with
`no validator signing info found`.

The safe path is to generate the genesis *from your key material* rather
than hand-editing:

1. `go run scripts/gen_node_home.go <fresh-home>`
2. Build a genesis from that validator key —
   `scripts/generate_validator_genesis.js <priv_validator_key.json> <output.json>`
   produces a minimal `mallchain-1` genesis with matching signing infos.
3. Copy that genesis (and an `app.toml`) into the fresh home and start the
   node as in Step 5.

Only hand-craft genesis entries if you can recompute the
`mallvalcons` address from `pub_key.value` (that's exactly what
`backend/scripts/create-validator.js` does — reuse its encoding logic).

**Never** install a fresh standalone genesis over a home that's been
joining the live network without a full `data/` reset — foreign
signing-info state is how the stuck-at-height-0 bug below happens.

## Enabling the REST API (and the gRPC port trap)

The API server and gRPC server start in a **shared errgroup**
(`server/start.go`): if either listener fails to bind, the whole group is
cancelled — but the gRPC listener binds *before any logging*, so a busy gRPC
port kills the REST API **silently**. On the dev machine Prometheus occupies
9090, so a "my API on 1317 isn't responding" symptom with a healthy node log
was traced to exactly this.

Rules:

- Keep `[grpc] enable = false` unless you actually need gRPC.
- If you need gRPC: `address = "localhost:9099"`. Never 9090/9091 here.
- API: `[api] enable = true`, `address = "tcp://localhost:1317"`.

```toml
# app.toml
[api]
enable = true
address = "tcp://localhost:1317"

[grpc]
enable = false
address = "localhost:9099"
```

## Becoming a validator

Running a node makes you a *full node*; participating in consensus is a
separate transaction (`MsgCreateValidator`). Once your node is synced and
you have a funded account:

```bash
./CREATE_VALIDATOR.sh \
  --priv-validator-key-file=~/.mallchain/config/priv_validator_key.json \
  --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
  --moniker="my-node" \
  --amount=1000000
```

Full walkthrough: `09-become-a-validator.md`. Never edit the live genesis to
add a validator — and never run two nodes with the same
`priv_validator_key.json` (double-signing gets you jailed).

## Recovery cheatsheet

| Symptom | Cause | Fix |
|---|---|---|
| Node stuck at height 0, logs mention foreign validator | `data/` carries state.db from a different validator/genesis | Stop node, **move** `data/` aside (don't delete), copy `data/priv_validator_state.json` into the new empty data dir, restart |
| Height regression / "already signed at height N" | `priv_validator_state.json` ahead of chain state | Stop node, reset `data/priv_validator_state.json` to `{"height":"0","round":0,"step":0}`, restart |
| Panics on block 2: `no validator signing info found` | Genesis `signing_infos` don't match the validator pubkey | Regenerate genesis from your key material (Scenario B above) |
| API on 1317 dead, node looks healthy | gRPC bound a busy port (9090) and killed the shared errgroup silently | Disable gRPC or move it to 9099, restart |
| Reset data but keep genesis/keys | — | `./scripts/reset-local-chain.sh` (runs `tendermint unsafe-reset-all`, preserves config) |

Golden rule for all of these: **never delete a data dir outright** — move it
aside (`mv data data.broken-$(date +%s)`) so the signing state and any
evidence survive.

## Script reference

| Script | Purpose |
|---|---|
| `scripts/install-remote-node.sh` | One-shot: build + node home + genesis/app.toml + peer + optional start |
| `scripts/gen_node_home.go` | Idempotent key/config generation (the missing `init`) |
| `scripts/start_blockchain.sh` | Legacy dev starter for `blockchain_working/` |
| `scripts/reset-local-chain.sh` | Wipe `data/` of a home, keep genesis and keys |
| `CREATE_VALIDATOR.sh` | Register a validator (after the node is synced) |

## Related docs

- `09-become-a-validator.md` — turning a node into a validator
- `06-staking.md` — delegating stake as a wallet user
- `docs/BLOCKCHAIN_REBUILD_GUIDE.md` — the September 2026 chain rebuild,
  which produced the canonical `blockchain_working/` config
