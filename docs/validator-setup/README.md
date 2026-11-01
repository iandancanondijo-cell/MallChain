# Run a Mallchain Node — Validator Setup Guide (for the rest of the world)

You have `mallchain-node-<version>.zip` (or the per-arch folder
`mallchain-node-<version>-linux-<arch>/`). This guide takes you from download
to a synced full node — and, if you want, a validator — on your own PC,
anywhere in the world.

**First, the fear-killer:** running a Mallchain node does **not** depend on
our website, our Express backend, or our MongoDB. A validator/full node needs
exactly three things, all of which are in your bundle:

1. the `marketplaced` binary,
2. `genesis.json` (the chain's birth certificate),
3. a peer address to dial (`persistent_peers`).

The backend + Mongo are the web app's *off-chain* API layer (user accounts,
KYC docs, the double-entry mirror). Consensus never reads them. Your node
downloads blocks from peers over P2P and **re-executes every transaction
against its own state** — if our API ever lied about a balance or height,
your node simply disagrees, and the chain follows the honest majority of
voting power, not a REST endpoint. Full reasoning:
[`docs/VALIDATOR_TRUST_MODEL.md`](../VALIDATOR_TRUST_MODEL.md).

Companion in-repo docs: [user guide 10 — Run a blockchain node](../user-guides/10-run-a-blockchain-node.md)
(the operator reference this guide mirrors) and
[user guide 09 — Become a validator](../user-guides/09-become-a-validator.md).

## 0. Verify what you downloaded

```bash
unzip mallchain-node-<version>.zip && cd mallchain-node-<version>-linux-<arch>
sha256sum -c SHA256SUMS.txt          # every file must say OK
```

Cross-check the top-level line in the release notes / download page:

```bash
sha256sum mallchain-node-<version>.zip   # compare to the published digest
```

Requirements: Linux x86-64 (`amd64`) or ARM64 (`arm64` — Raspberry Pi 4/5,
AWS Graviton, most SBCs and ARM cloud instances). The binaries are
statically linked (`CGO_ENABLED=0`) — no glibc version games. Check
`VERSION.txt` inside the bundle for the git commit and chain version.

## 1. Install the binaries

```bash
sudo install -m 0755 bin/marketplaced bin/gen-node-home /usr/local/bin/
marketplaced version        # → e.g. v48052ec8
```

## 2. Create your node home — the `init` trap

**`marketplaced` has NO `init` command.** It is a node-runner only
(`start`, `export`, `rollback`, `version`, `comet`, …). The bundle ships
`gen-node-home`, a standalone helper compiled from
`scripts/gen_node_home.go` against the same CometBFT version as the binary —
it generates exactly what `cometbft init` would (P2P node key, validator
key, default `config.toml`) and is idempotent (keeps existing keys on
re-run).

```bash
export MALLCHAIN_HOME=$HOME/.mallchain
gen-node-home "$MALLCHAIN_HOME"
```

It prints your **node ID** (the same value as
`marketplaced comet show-node-id --home "$MALLCHAIN_HOME" 2>&1` — note that
command prints to **stderr**; the `2>&1` is not optional).

## 3. Install genesis + configs from the bundle

```bash
cp config/genesis.json       "$MALLCHAIN_HOME/config/genesis.json"
cp config/app.toml.example   "$MALLCHAIN_HOME/config/app.toml"
cp config/config.toml.example "$MALLCHAIN_HOME/config/config.toml"
```

Then edit `$MALLCHAIN_HOME/config/config.toml`:

| Key | Set it to |
|---|---|
| `moniker` | your node's name, shown to peers |
| `persistent_peers` | a real peer — see step 4 (the example ships our node's ID) |
| `external_address` | `<your-public-ip-or-domain>:26656` if you are routable |
| `p2p.laddr` | leave `tcp://0.0.0.0:26656` so peers can dial you |
| `rpc.laddr` | leave `tcp://127.0.0.1:26657` unless you mean to expose RPC |

`app.toml` ships with `[grpc] enable = false` on purpose: on this stack
enabling gRPC on :9090 **silently kills the REST API on :1317** (API + gRPC
share one errgroup and gRPC binds before any logging). If you truly need
gRPC, move it to :9099 — never leave it on 9090 enabled.

## 4. Set `persistent_peers` (you need at least one live peer)

Our reference node's peer string is in the bundle's `PEERS.md`. It may read:

```
57c770cb4072eaf15bf1314a35c43acb827c09a2@REPLACE_WITH_PUBLIC_IP_OR_PORT_FORWARD:26656
```

That marker means our reference node is not dialable from the public
internet: it runs on a Starlink residential connection, which is CGNAT —
verified, there is no router we can configure, no static IP, and inbound
dials fail (an HTTP-only Cloudflare tunnel carries the site API but cannot
forward raw TCP). Outbound dials from the reference node still work, so the
fast path today is:

* open TCP 26656 on **your** node (public IP or router port-forward), set
  `external_address = "<your-ip>:26656"`, and share your
  `node_id@<your-ip>:26656` with the operators (community validators
  channel, link on the site) — they add it to the reference node's
  `persistent_peers`; the connection is bidirectional and you sync normally,
* or ask any node you already trust for `curl -s <their-rpc>:26657/net_info`
  if a routable seed has since been published,
* once you have **one** peer, `pex = true` discovers the rest by itself.

The **bundle is still fully functional with the marker** — nothing about
your node depends on our PC; you only need *some* honest peer to bootstrap
from, and once synced your app-hashes prove you're on the right chain.

## 5. Start and sync

```bash
marketplaced start --home "$MALLCHAIN_HOME" --minimum-gas-prices="0.01umal" &
curl -s http://127.0.0.1:26657/status | python3 -m json.tool | grep -E 'latest_block_height|catching_up'
```

Blocks finalize every ~5–6 s. A fresh node syncs the full history — watch
`latest_block_height` climb until `catching_up` flips to `false`.

## 6. Verify the chain yourself (don't trust, verify)

Your node is its own verification appliance:

```bash
# height + app hash (compare with any other node — equal hash = identical state)
curl -s http://127.0.0.1:26657/status | jq '.result.sync_info'

# your own REST API — no mallchain.com involved
curl -s http://127.0.0.1:1317/cosmos/staking/v1beta1/validators | jq '.validators|length'
curl -s "http://127.0.0.1:1317/cosmos/bank/v1beta1/supply" | jq
```

If the numbers from your node ever disagree with our website/API, your node
is right and ours is wrong — that asymmetry is the entire security property.

## 7. Become a validator (optional)

Two sides, one flow:

1. **On-chain side** — with your synced node and a funded account, run the
   bundled `CREATE_VALIDATOR.sh` (it wraps
   `backend/scripts/create-validator.js` with cosmjs; clone the repo and
   `npm ci` in `backend/` first, since the binary has no tx CLI):

   ```bash
   ./CREATE_VALIDATOR.sh \
     --priv-validator-key-file="$MALLCHAIN_HOME/config/priv_validator_key.json" \
     --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
     --moniker="My Node" --amount=1000000
   ```

   The mnemonic is passed **by env-var name only** (never on the command
   line). Chain params (verified): `bond_denom=stake`, `min_commission_rate=0`,
   `max_validators=100`, `unbonding_time=21 days`. The script refuses to run
   against a catching-up node and detects an already-registered consensus key.

2. **Application side** — submit the validator application in the Mallchain
   app (Admin area → Validators panel). It is reviewed via the backend API
   `/api/admin/validators/applications` and appears in the in-app "Validators"
   admin panel. This is an *operational* listing step (contact info,
   onboarding, rack-awareness): approval gates inclusion in our recommended
   operator set, **not** the chain itself — the on-chain `MsgCreateValidator`
   from step 1 is what makes you a validator.

Never edit the live genesis to add a validator, and **never run two nodes
with the same `priv_validator_key.json`** (double-signing gets you jailed).

## 8. Troubleshooting

Symptoms and fixes (stuck at height 0, `no validator signing info found`,
dead 1317 API, height regressions) are catalogued in
[user guide 10 § Recovery cheatsheet](../user-guides/10-run-a-blockchain-node.md).
Golden rule: never delete `data/` — move it aside
(`mv data data.broken-$(date +%s)`).

## Security & trust note (the "owner lockout" question, answered from the node side)

Today the network runs with a small validator set, so the current operator
*phold operational halt power*: if our validators go down, blocks stop.
That is real, and it is the honest short-term trade-off of an early-stage
chain. What it does **not** give anyone is forgery power:

* No one — including the operator — can mint, rewrite balances, or alter
  history without >2/3 of voting power signing conflicting blocks, and
  misbehaviour is jailable evidence on-chain.
* Every node re-executes all state transitions and checks app hashes, so a
  falsified block would be rejected by your client, not just "noticed" —
  you never have to believe our API.
* The lockout is *liveness*, not *integrity*, and it decays as you and other
  independent operators join: each validator added is voting power that is
  not ours. Running your node is the mechanism by which "trust us" becomes
  "trust math".

(Chain-level tamper-evidence — state-root anchoring and independent audit
trails — is a separate workstream; this document intentionally does not
depend on it.)

## Rebuilding a bundle yourself / for other archs

```bash
scripts/build-validator-bundle.sh                 # linux/amd64 + linux/arm64, zip at repo root
scripts/build-validator-bundle.sh --archs=arm64   # single arch
```

`CGO_ENABLED=0` works for both archs (pure-Go DB backends), so one build box
produces everything. If a future dependency ever makes CGO mandatory, the
script fails the cross-target with a message and ships amd64-only; build the
missing arch natively on that platform. Related tooling:
`scripts/build-node-release.sh` (per-target tarballs),
`scripts/make-validator-bundle.sh` (tar.gz variant), and
`scripts/install-remote-node.sh` (one-shot build+join on the target machine).
