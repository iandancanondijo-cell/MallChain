#!/usr/bin/env bash
# make-validator-bundle.sh — Assemble a complete, joinable validator/full-node
# bundle for the mallchain-1 network:
#
#   mallchain-node-<version>-<os>-<arch>.tar.gz containing
#     bin/marketplaced            node binary (+ bin/gen-node-home helper —
#                                 the binary has NO `init` command)
#     config/genesis.json         pulled LIVE from the running chain's RPC
#                                 (/genesis on 127.0.0.1:26657; falls back to
#                                 the committed blockchain_working/config/
#                                 genesis.json; chain_id is verified either way)
#     config/config.toml.example  P2P/RPC config with persistent_peers/seeds
#                                 placeholders + our node's public address
#                                 guidance (see the NAT note in INSTALL.md)
#     config/app.toml.example     gRPC OFF (enabling it on 9090 kills API 1317)
#     config/client.toml.example  client config (chain-id, keyring defaults)
#     INSTALL.md                  download → verify → install → init (no-init
#                                 trap) → join → start → sync → create validator
#     CREATE_VALIDATOR.sh         register a validator once synced (safe +
#                                 idempotent wrapper; needs a repo clone or
#                                 cosmjs — see its header)
#     sha256sums.txt              checksums of everything inside
#
# Usage:
#   scripts/make-validator-bundle.sh [--os=linux] [--arch=amd64]
#                                    [--rpc=http://127.0.0.1:26657]
#                                    [--out=build/bundles]
#
# Runs build-node-release.sh for the requested target first (Go at
# /usr/local/go/bin/go if not on PATH).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="marketplaced"
CHAIN_ID="mallchain-1"
BOND_DENOM="stake"                       # verified: x/staking params bond_denom
OS="linux"
ARCH="amd64"
RPC="${RPC:-http://127.0.0.1:26657}"
OUT_DIR="${REPO_DIR}/build/bundles"
NODE_ID="57c770cb4072eaf15bf1314a35c43acb827c09a2"   # this PC's node (moniker AvastaIan)

for arg in "$@"; do
  case "$arg" in
    --os=*)    OS="${arg#*=}" ;;
    --arch=*)  ARCH="${arg#*=}" ;;
    --rpc=*)   RPC="${arg#*=}" ;;
    --out=*)   OUT_DIR="${arg#*=}" ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# --- build the binary for the requested target (no Go on PATH here) --------
if ! command -v go >/dev/null 2>&1 && [[ -x /usr/local/go/bin/go ]]; then
  export PATH="/usr/local/go/bin:$PATH"
fi
bash "${REPO_DIR}/scripts/build-node-release.sh" --targets="${OS}/${ARCH}" --out="${REPO_DIR}/build/releases"

VERSION="$(cat "${REPO_DIR}/build/releases/.lastversion" 2>/dev/null || true)"
if [[ -z "$VERSION" ]]; then
  VERSION="$(git -C "$REPO_DIR" describe --tags 2>/dev/null || echo "$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)-$(git -C "$REPO_DIR" log -1 --format='%h')")"
fi
VERSION="${VERSION//\//-}"
NAME="mallchain-node-${VERSION}-${OS}-${ARCH}"
STAGE="${OUT_DIR}/${NAME}"
TAR="${OUT_DIR}/${NAME}.tar.gz"

rm -rf "$STAGE"; mkdir -p "$STAGE/bin" "$STAGE/config"
cp -a "${REPO_DIR}/build/releases/${APP_NAME}-${VERSION}-${OS}-${ARCH}/bin/." "$STAGE/bin/"
chmod +x "$STAGE/bin/"*

# --- genesis: prefer the LIVE chain, verify chain-id, fall back to committed
echo "--- genesis ---"
GEN_OK=false
if curl -s --max-time 10 "${RPC}/genesis" -o /tmp/genv.json 2>/dev/null \
   && python3 - "$CHAIN_ID" <<'PY' 2>/dev/null
import json,sys
g=json.load(open('/tmp/genv.json'))['result']['genesis']
sys.exit(0 if g['chain_id']==sys.argv[1] else 1)
PY
then
  python3 -c "import json;json.dump(json.load(open('/tmp/genv.json'))['result']['genesis'],open('$STAGE/config/genesis.json','w'),indent=2,sort_keys=False)"
  echo "    source: LIVE RPC ${RPC}/genesis (chain_id verified = ${CHAIN_ID})"
  GEN_OK=true
else
  echo "    RPC ${RPC} unavailable/mismatched — using committed genesis" >&2
  cp "${REPO_DIR}/blockchain_working/config/genesis.json" "$STAGE/config/genesis.json"
  python3 - "$STAGE/config/genesis.json" "$CHAIN_ID" <<'PY'
import json,sys
g=json.load(open(sys.argv[1]))
assert g['chain_id']==sys.argv[2], "committed genesis chain_id mismatch!"
PY
  echo "    source: blockchain_working/config/genesis.json (chain_id verified)"
  GEN_OK=true
fi
$GEN_OK || { echo "ERROR: could not obtain a verified ${CHAIN_ID} genesis" >&2; exit 1; }

# --- example configs --------------------------------------------------------
# config.toml: generated from the running node's config with identity-,
# network-, and peer-specific values replaced by documented placeholders.
cp "${REPO_DIR}/blockchain_working/config/config.toml" "$STAGE/config/config.toml.example"
python3 - "$STAGE/config/config.toml.example" <<'PY'
import re,sys
p=sys.argv[1]; s=open(p).read()
s=s.replace('moniker = "AvastaIan"', 'moniker = "CHANGE_ME-my-node"')
s=s.replace('seeds = ""', 'seeds = ""  # optional seed nodes: comma-separated node_id@host:26656 (ask in #validators or see docs/VALIDATOR_TRUST_MODEL.md)')
s=s.replace('persistent_peers = ""',
            'persistent_peers = "CHANGE_ME_nodeid@CHANGE_ME_host:26656"  # REQUIRED to sync fast; see INSTALL.md step 4')
s=s.replace('external_address = ""',
            'external_address = ""  # set to <PUBLIC_IP>:26656 if your machine has a public IP (advertises you to others)')
open(p,'w').write(s)
PY
cp "${REPO_DIR}/blockchain_working/config/app.toml" "$STAGE/config/app.toml.example"
# gRPC trap: force [grpc] enable = false — enabling gRPC on 9090 kills API 1317.
python3 - "$STAGE/config/app.toml.example" <<'PY'
import sys
p=sys.argv[1]; lines=open(p).read().splitlines(True)
ingrpc=False
for i,l in enumerate(lines):
    s=l.strip()
    if s=='[grpc]': ingrpc=True; continue
    if s.startswith('[') and ingrpc: ingrpc=False
    if ingrpc and s.startswith('enable =') and 'false' not in s:
        lines[i]='enable = false  # KEEP FALSE on 9090: enabling gRPC here kills the REST API on 1317\n'
lines.insert(next(i for i,l in enumerate(lines) if l.strip()=='[grpc]')+1,
             '# TRAP: do not set this to true while it addresses localhost:9090 —\n'
             '# on this stack that silently kills the API server on 1317.\n')
open(p,'w').write(''.join(lines))
PY
cat > "$STAGE/config/client.toml.example" <<EOF
# Example client config (for cosmos-sdk clients / cosmjs tooling).
# NOTE: this marketplaced binary is node-runner-only — it has no tx/query CLI,
# so this file is here for companion tooling, not for the node itself.
broadcast-mode = "sync"
chain-id = "${CHAIN_ID}"
keyring-backend = "test"
output = "json"
node = "tcp://127.0.0.1:26657"
EOF

# --- docs & scripts inside the bundle --------------------------------------
cp "${REPO_DIR}/CREATE_VALIDATOR.sh" "$STAGE/CREATE_VALIDATOR.sh"
chmod +x "$STAGE/CREATE_VALIDATOR.sh"

cat > "$STAGE/INSTALL.md" <<EOF
# Running a Mallchain Node (${NAME})

Network: **${CHAIN_ID}** — binary \`${APP_NAME}\` — bond denom: **${BOND_DENOM}**.
Read the whole thing before typing anything. Two traps cost people hours:

> ⚠️ **TRAP 1: there is NO \`${APP_NAME} init\` command.** The binary is a
> node-runner only (commands: start, export, rollback, version, comet,
> module-hash-by-height). Use the included \`bin/gen-node-home\` helper — it
> generates exactly what \`cometbft init\` would (node key, validator key,
> default config.toml) using the same CometBFT version as the binary.
>
> ⚠️ **TRAP 2: never enable gRPC on port 9090.** On this stack enabling
> [grpc] on 9090 silently kills the REST API on 1317. The shipped
> app.toml.example keeps it off. Also, \`${APP_NAME} tendermint show-node-id\`
> prints to **STDERR**, not stdout — pipe with \`2>&1\` if you script it.

## 1. Download + verify
Download the tarball and its checksum (published alongside the release at
\`https://mallchain.network/downloads/\` — see README of the release page):
\`\`\`bash
sha256sum -c <(echo "<from sha256sums.txt>  ${NAME}.tar.gz")
tar -xzf ${NAME}.tar.gz && cd ${NAME}
\`\`\`

## 2. Install the binary
\`\`\`bash
sudo install -m 0755 bin/${APP_NAME} /usr/local/bin/${APP_NAME}
sudo install -m 0755 bin/gen-node-home /usr/local/bin/gen-node-home
${APP_NAME} version 2>&1     # expect: ${VERSION}
\`\`\`

## 3. Create the node home (the no-init trap)
\`\`\`bash
export MALLCHAIN_HOME=\$HOME/.mallchain
gen-node-home "\$MALLCHAIN_HOME"          # keys + default config.toml
cp config/genesis.json "\$MALLCHAIN_HOME/config/genesis.json"
cp config/app.toml.example "\$MALLCHAIN_HOME/config/app.toml"
# merge the example config.toml settings you care about (peers, moniker) into
# \$MALLCHAIN_HOME/config/config.toml, or copy it over and re-run gen-node-home.
\`\`\`
Set \`moniker\` in config.toml to something identifying your node.

## 4. Find peers (REQUIRED to sync)
Set in config.toml:
\`\`\`toml
persistent_peers = "<node_id>@<host>:26656"
\`\`\`
Get live peer addresses:
* From any node you already trust: \`curl -s <their-rpc>:26657/net_info | grep -o '"remote_ip":"[^"]*"\|"id":"[0-9a-f]\\{40\\}"'\`
* Compute a node's own id: \`${APP_NAME} tendermint show-node-id --home=<home> 2>&1\`
  (the \`2>&1\` is not optional — output goes to STDERR).
* Reference network status / peers: https://mallchain.network/#/run-node
  and #validators in our community channel.

**Honesty note about our reference node (moniker \`AvastaIan\`, node id
\`${NODE_ID}\`):** it currently runs behind NAT on a private LAN address; its P2P port 26656 is bound to
0.0.0.0 but is NOT port-forwarded to the public internet, and its RPC binds
127.0.0.1 only. Until we publish a stable public peer address, use peers
discovered via \`/net_info\` on any reachable node you know of, and expect
bootstrapping to be slow (state-sync from scratch works but takes time).
Once you have ≥1 peer, your addrbook will discover the rest.
Set \`external_address = "<your-public-ip>:26656"\` on YOUR node if you have a
public IP so others can find you — the network needs you as much as you need it.

## 5. Start + sync
\`\`\`bash
${APP_NAME} start --home "\$MALLCHAIN_HOME" >> \$MALLCHAIN_HOME/node.log 2>&1 &
tail -f \$MALLCHAIN_HOME/node.log
# watch height until catching_up=false:
curl -s http://127.0.0.1:26657/status | python3 -m json.tool | grep -E "latest_block_height|catching_up"
\`\`\`
RPC stays on 127.0.0.1 by default — keep it there unless you front it with a
reverse proxy + auth. The REST API (1317) is off unless you set
\[api\] enable = true in app.toml.

## 6. Become a validator (optional)
1. Let the node fully sync.
2. Get a funded account (mint denom \`${BOND_DENOM}\`) — see
   docs/user-guides/09-become-a-validator.md in the repo for where stake comes
   from on this chain.
3. Run \`./CREATE_VALIDATOR.sh --help\` (bundled). It submits
   MsgCreateValidator via cosmjs against your own node's RPC — no trusted
   third party needed. Staking params (from the live chain): bond_denom=${BOND_DENOM},
   min_commission_rate=0, max_validators=100, unbonding_time=21 days.

## 7. Verify the chain independently
Don't trust our backend: your node re-executes every block. Compare your
app-hash at height H with any other node's \`/status\` (latest_app_hash). If
they match, you agree on the entire state — that's the whole point of running
your own node. See docs/VALIDATOR_TRUST_MODEL.md.
EOF

# --- checksums: every file in the bundle, then the tarball itself ----------
( cd "$STAGE" && find . -type f ! -name sha256sums.txt -print0 | sort -z | xargs -0 sha256sum > sha256sums.txt )
tar -czf "$TAR" -C "$OUT_DIR" "$NAME"
( cd "$OUT_DIR" && sha256sum "$(basename "$TAR")" > "$(basename "$TAR").sha256" && cat "$(basename "$TAR").sha256" )

echo ""
echo "=== Bundle ready ==="
echo "path : $TAR"
echo "size : $(du -h "$TAR" | cut -f1)"
echo "sha25: $(awk '{print $1}' "$OUT_DIR/$(basename "$TAR").sha256")"
echo "contents:"
tar -tzf "$TAR" | sed 's/^/  /'
