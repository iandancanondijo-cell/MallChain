#!/usr/bin/env bash
# build-validator-bundle.sh — Build distributable Mallchain node bundles so
# anyone in the world can run a validator/full node on their own PC.
#
# A node needs ONLY: the marketplaced binary + genesis.json + a peer address.
# It does NOT need the Express backend or MongoDB — those are the web-app's
# off-chain API layer, not consensus. The bundle ships no backend/Mongo
# reference at all, and the docs in the bundle say so explicitly.
#
# Outputs (idempotent — safe to re-run; staging dirs are rebuilt each time):
#   build/validator-bundle/mallchain-node-<version>-linux-<arch>/
#     ├── bin/marketplaced              node binary (CGO off => pure-Go,
#     │                                 cross-compiled amd64 + arm64)
#     ├── bin/gen-node-home             the missing `init` (binary has NO
#     │                                 init command — docs/user-guides/10)
#     ├── config/genesis.json           LIVE from <rpc>/genesis when the
#     │                                 reference node is up (chain_id
#     │                                 verified), else the committed
#     │                                 blockchain_working/config copy
#     ├── config/config.toml.example    correct ports, real persistent_peers
#     │                                 (or REPLACE marker behind NAT)
#     ├── config/app.toml.example       gRPC DISABLED (enabling 9090 silently
#     │                                 kills the REST API on 1317)
#     ├── config/client.toml.example
#     ├── INSTALL.md                    download → verify → init (no-init
#     │                                 flow) → peers → start → sync → validate
#     ├── PEERS.md                      this node's real peer string + NAT how-to
#     ├── VERSION.txt                   git commit + version + block height at
#     │                                 export time
#     └── SHA256SUMS.txt                checksums of every file in the bundle
#   <repo>/mallchain-node-<version>.zip   all arch bundles + top-level
#                                         SHA256SUMS.txt, at repo root
#
# Traps respected (see project memory / docs/user-guides/10):
#   - Go is NOT on PATH here → use /usr/local/go/bin/go.
#   - No `marketplaced init` → gen-node-home helper (scripts/gen_node_home.go).
#   - `comet show-node-id` prints to STDERR → node ID computed from
#     config/node_key.json instead (identical result, deterministic).
#   - gRPC on 9090 kills API on 1317 → templates keep [grpc] enable = false.
#
# Usage:
#   scripts/build-validator-bundle.sh [--version=vX.Y.Z] [--archs=amd64,arm64]
#                                     [--rpc=http://127.0.0.1:26657]
#                                     [--home=blockchain_working]
#                                     [--peer=<nodeid@host:26656>]  force peer
#                                     [--no-peer-check]             skip TCP probe
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

APP_NAME="marketplaced"
CHAIN_ID="mallchain-1"
BOND_DENOM="stake"
VERSION=""
ARCHS="amd64,arm64"
RPC="${RPC:-http://127.0.0.1:26657}"
NODE_HOME="${REPO_DIR}/blockchain_working"
OUT_DIR="${REPO_DIR}/build/validator-bundle"
PEER_OVERRIDE=""
PEER_CHECK=true

for arg in "$@"; do
  case "$arg" in
    --version=*)      VERSION="${arg#*=}" ;;
    --archs=*)        ARCHS="${arg#*=}" ;;
    --rpc=*)          RPC="${arg#*=}" ;;
    --home=*)         NODE_HOME="${arg#*=}"; [[ "$NODE_HOME" = /* ]] || NODE_HOME="$REPO_DIR/$NODE_HOME" ;;
    --peer=*)         PEER_OVERRIDE="${arg#*=}" ;;
    --no-peer-check)  PEER_CHECK=false ;;
    -h|--help)        sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n=== %s ===\n' "$*"; }

# --- 1. Go toolchain (not on PATH on this machine) ---------------------------
if ! command -v go >/dev/null 2>&1; then
  if [[ -x /usr/local/go/bin/go ]]; then
    export PATH="/usr/local/go/bin:$PATH"
  else
    echo "ERROR: Go toolchain not found (expected /usr/local/go/bin/go)." >&2
    exit 1
  fi
fi

# --- 2. Version + commit ------------------------------------------------------
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
if [[ -z "$VERSION" ]]; then
  VERSION="$(git describe --tags --exact-match 2>/dev/null || true)"
  [[ -n "$VERSION" ]] || VERSION="v$(git log -1 --format='%h' 2>/dev/null || echo 0000000)"
fi
VERSION="${VERSION//\//-}"

LDFLAGS="-s -w -X github.com/cosmos/cosmos-sdk/version.Name=marketplace \
-X github.com/cosmos/cosmos-sdk/version.AppName=${APP_NAME} \
-X github.com/cosmos/cosmos-sdk/version.Version=${VERSION} \
-X github.com/cosmos/cosmos-sdk/version.Commit=${COMMIT}"

# --- 3. This node's identity: node ID + peer address --------------------------
# Node ID = first 20 bytes of SHA256 over the ed25519 pub key embedded in
# config/node_key.json (priv value = 32B priv ++ 32B pub). Same result as
# `marketplaced comet show-node-id` — which is unusable in scripts anyway
# because it prints to STDERR and the node is not running during builds.
NODE_ID=""
if [[ -f "$NODE_HOME/config/node_key.json" ]]; then
  NODE_ID="$(python3 - "$NODE_HOME/config/node_key.json" <<'PY'
import json,hashlib,base64,sys
k=json.load(open(sys.argv[1]))
raw=base64.b64decode(k['priv_key']['value'])
print(hashlib.sha256(raw[32:64]).hexdigest()[:40])
PY
)"
fi

LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '')"
PUBLIC_IP=""
for ep in ifconfig.me icanhazip.com api.ipify.org; do
  PUBLIC_IP="$(curl -s --max-time 6 "$ep" 2>/dev/null | tr -d '[:space:]')" || PUBLIC_IP=""
  [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && break || PUBLIC_IP=""
done
[[ -n "$PUBLIC_IP" ]] || { echo "WARNING: could not resolve any public IP — peer address will be a REPLACE marker." >&2; PUBLIC_IP=""; }

# Can we actually be dialled from outside on 26656? Probe our own public IP.
# A residential LAN behind NAT usually fails this (no port forward, and even
# with one hairpin NAT may fail) — in that case the bundle marks the peer
# address as a REPLACE marker with a how-to instead of publishing a dead
# address that would strand joiners.
PEER=""
PEER_STATUS=""
if [[ -n "$PEER_OVERRIDE" ]]; then
  PEER="$PEER_OVERRIDE"; PEER_STATUS="operator override"
elif [[ -z "$NODE_ID" ]]; then
  PEER="${NODE_ID}" # keep empty; docs fall back to addrbook/net_info instructions
  PEER_STATUS="node_key.json not found under $NODE_HOME/config — no peer published"
elif [[ "$PEER_CHECK" == false ]]; then
  PEER="${NODE_ID}@${PUBLIC_IP:-REPLACE_WITH_YOUR_PUBLIC_IP}:26656"
  PEER_STATUS="peer check skipped"
elif [[ -n "$PUBLIC_IP" ]] && timeout 6 bash -c "echo > /dev/tcp/$PUBLIC_IP/26656" 2>/dev/null; then
  PEER="${NODE_ID}@${PUBLIC_IP}:26656"; PEER_STATUS="VERIFIED reachable from this host on port 26656"
else
  PEER="${NODE_ID}@REPLACE_WITH_PUBLIC_IP_OR_PORT_FORWARD:26656"
  if [[ -n "$PUBLIC_IP" ]]; then
    PEER_STATUS="public egress IP $PUBLIC_IP found but port 26656 not dialled from here (NAT/no port-forward or hairpin-blocked). Candidate real address: ${NODE_ID}@${PUBLIC_IP}:26656 — publish it only after port-forwarding."
  else
    PEER_STATUS="no public IP (behind NAT) — bundle ships a REPLACE marker"
  fi
fi
[[ -n "$NODE_ID" ]] || NODE_ID="unknown"

log "Mallchain validator bundle"
echo "version   : $VERSION"
echo "commit    : $COMMIT"
echo "chain id  : $CHAIN_ID (bond denom: $BOND_DENOM)"
echo "node id   : $NODE_ID"
echo "local ip  : ${LOCAL_IP:-n/a}   public ip: ${PUBLIC_IP:-none (NAT)}"
echo "peer      : ${PEER:-<none>}   [$PEER_STATUS]"
echo "targets   : ${ARCHS//,/, linux/} (CGO_ENABLED=0)"
echo "out       : $OUT_DIR"

# --- 4. Genesis: live RPC first, fall back to committed -----------------------
GEN_SRC=""
GEN_TMP="$(mktemp)"
trap 'rm -f "$GEN_TMP"' EXIT
if curl -s --max-time 10 "${RPC}/genesis" -o "$GEN_TMP" 2>/dev/null \
   && python3 - "$GEN_TMP" "$CHAIN_ID" <<'PY'
import json,sys
try: g=json.load(open(sys.argv[1]))['result']['genesis']
except Exception: sys.exit(1)
sys.exit(0 if g.get('chain_id')==sys.argv[2] else 1)
PY
then
  GEN_SRC="live ${RPC}/genesis"
else
  cp "$NODE_HOME/config/genesis.json" "$GEN_TMP"
  GEN_SRC="committed $NODE_HOME/config/genesis.json (RPC offline/mismatched)"
fi
# live-RPC path stores the full {"result":{"genesis":{...}}} envelope;
# committed fallback is a bare GenesisDoc. Unwrap before asserting — and
# write the bare GenesisDoc back, since $GEN_TMP ships as genesis.json.
python3 - "$GEN_TMP" "$CHAIN_ID" <<'PY'
import json,sys
g=json.load(open(sys.argv[1]))
if 'result' in g and 'genesis' in (g.get('result') or {}):
    g = g['result']['genesis']
assert g['chain_id']==sys.argv[2], 'genesis chain_id mismatch!'
json.dump(g, open(sys.argv[1], 'w'), indent=2, sort_keys=False)
PY

# Block height at export time (empty string if the node is offline).
HEIGHT="$(curl -s --max-time 5 "${RPC}/status" 2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["result"]["sync_info"]["latest_block_height"])
except Exception: print("")' || true)"
[[ -n "$HEIGHT" ]] || HEIGHT="unknown (reference node offline at bundle build time — height = whatever your peer reports when you sync)"

# --- 5. Build binaries per arch -----------------------------------------------
mkdir -p "$OUT_DIR"
BUILT=(); FAILED=()
IFS=',' read -ra ARCH_LIST <<< "$ARCHS"
for ARCH in "${ARCH_LIST[@]}"; do
  NAME="mallchain-node-${VERSION}-linux-${ARCH}"
  STAGE="${OUT_DIR}/${NAME}"
  echo ""
  echo "--- build linux/${ARCH} ---"
  rm -rf "$STAGE"; mkdir -p "$STAGE/bin" "$STAGE/config"

  if ! CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" \
       go build -trimpath -ldflags "$LDFLAGS" -o "$STAGE/bin/$APP_NAME" ./cmd/marketplaced; then
    echo "    BUILD FAILED linux/$ARCH — target skipped (document in release notes)" >&2
    FAILED+=("linux/$ARCH"); rm -rf "$STAGE"; continue
  fi
  # gen-node-home: the binary has NO `init` command (docs/user-guides/10 §1).
  if ! CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" \
       go build -trimpath -o "$STAGE/bin/gen-node-home" ./scripts/gen_node_home.go; then
    echo "    WARNING: gen-node-home failed for linux/$ARCH" >&2
  fi
  chmod +x "$STAGE/bin/"* 2>/dev/null || true
  BUILT+=("$NAME")
done
[[ ${#BUILT[@]} -gt 0 ]] || { echo "ERROR: no target built." >&2; exit 1; }
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "NOTE: cross-build with CGO_ENABLED=0 failed for: ${FAILED[*]}" >&2
  echo "      → those archs need a native builder (see docs/validator-setup/README.md §Build failures)." >&2
fi

# --- 6. Assemble per-arch bundle content --------------------------------------
for NAME in "${BUILT[@]}"; do
  STAGE="${OUT_DIR}/${NAME}"
  ARCH="${NAME##*-}"

  cp "$GEN_TMP" "$STAGE/config/genesis.json"

  # config.toml.example — from the running node's real config with identity/
  # peer values replaced by documented placeholders + this node's peer string.
  cp "$NODE_HOME/config/config.toml" "$STAGE/config/config.toml.example"
  PEER="$PEER" NODE_ID="$NODE_ID" python3 - "$STAGE/config/config.toml.example" "$PEER_STATUS" <<'PY'
import os,sys,re
p=sys.argv[1]; peer=os.environ['PEER']; nid=os.environ['NODE_ID']
s=open(p).read()
s=re.sub(r'^moniker = .*', 'moniker = "CHANGE_ME-your-node-name"', s, count=1, flags=re.M)
s=re.sub(r'^seeds = .*',
  'seeds = ""  # optional: comma-separated node_id@host:26656 (see PEERS.md)', s, count=1, flags=re.M)
s=re.sub(r'^persistent_peers = .*',
  f'persistent_peers = "{peer}"  # see PEERS.md — REQUIRED to join the network fast', s, count=1, flags=re.M)
s=re.sub(r'^external_address = .*',
  'external_address = ""  # set to <your-public-ip-or-domain>:26656 once routable', s, count=1, flags=re.M)
# rpc.laddr stays loopback by default; make that explicit.
s=re.sub(r'^laddr = "tcp://(0\.0\.0\.0|127\.0\.0\.1):26657"',
  'laddr = "tcp://127.0.0.1:26657"  # keep loopback unless you front it with a proxy+auth', s, count=1, flags=re.M)
open(p,'w').write(s)
PY

  # app.toml.example — API on 1317, gRPC FORCE-disabled (trap: gRPC on 9090
  # binds first and kills the shared errgroup => REST API dies silently).
  cp "$NODE_HOME/config/app.toml" "$STAGE/config/app.toml.example"
  python3 - "$STAGE/config/app.toml.example" <<'PY'
import sys
p=sys.argv[1]; lines=open(p).read().splitlines(True)
ingrpc=False
for i,l in enumerate(lines):
    s=l.strip()
    if s=='[grpc]': ingrpc=True; continue
    if s.startswith('[') and ingrpc: ingrpc=False
    if ingrpc and s.startswith('enable') and 'false' not in s:
        lines[i]='enable = false  # KEEP FALSE: gRPC on :9090 silently kills the REST API on :1317\n'
try:
    idx=next(i for i,l in enumerate(lines) if l.strip()=='[grpc]')+1
    lines.insert(idx, '# TRAP: do not enable gRPC while it addresses :9090 — the API+gRPC\n'
                      '# servers share one errgroup; a failed gRPC bind kills API :1317 silently.\n')
except StopIteration: pass
open(p,'w').write(''.join(lines))
PY

  cat > "$STAGE/config/client.toml.example" <<EOF
# Client config for companion tooling (cosmjs etc.). The marketplaced binary
# itself is node-runner-only — it has no tx/query CLI.
broadcast-mode = "sync"
chain-id = "${CHAIN_ID}"
keyring-backend = "test"
output = "json"
node = "tcp://127.0.0.1:26657"
EOF

  cat > "$STAGE/VERSION.txt" <<EOF
chain        : ${CHAIN_ID}
binary       : ${APP_NAME}
version      : ${VERSION}
git commit   : ${COMMIT}
genesis src  : ${GEN_SRC}
block height : ${HEIGHT}
built at     : $(date -u +%Y-%m-%dT%H:%M:%SZ)
peer status  : ${PEER_STATUS}
EOF

  cat > "$STAGE/PEERS.md" <<EOF
# Peer / Node-ID reference (builder: this machine)

**Our reference node's peer string:**

\`\`\`
${PEER}
\`\`\`

Status: ${PEER_STATUS}

## What a peer string is
\`<40-hex node-id>@<host>:26656\`. The node ID is derived from the P2P identity
key in \`config/node_key.json\` (per-node secret — never ship yours, never
reuse someone else's).

## How we computed our node ID (without \`show-node-id\`)
\`marketplaced comet show-node-id\` prints to **STDERR**, which breaks most
scripting. Equivalent, deterministic, scriptable: SHA256 over the ed25519
public key packed in \`node_key.json\` (bytes 32..64 of the decoded priv value),
first 20 bytes hex:

\`\`\`bash
python3 - ~/.mallchain/config/node_key.json <<'PY'
import json,hashlib,base64,sys
raw=base64.b64decode(json.load(open(sys.argv[1]))['priv_key']['value'])
print(hashlib.sha256(raw[32:64]).hexdigest()[:40])
PY
# or, with a running node:
./${APP_NAME} comet show-node-id --home ~/.mallchain 2>&1   # 2>&1 is NOT optional
\`\`\`

## If the peer address says REPLACE_…
Our reference node runs on a Starlink residential connection, which is
CGNAT: there is no router we can configure, no static IP, and inbound ports
cannot be forwarded from the machine — this was verified (node listens on
\`0.0.0.0:26656\`, egress IP is a Starlink CGNAT address, external dial
fails). Our HTTP API works from anywhere only because it goes through an
outbound Cloudflare tunnel; that tunnel does not carry raw TCP, so it cannot
expose 26656 either.

If YOUR node sits behind a router you control, make it dialable:
1. On the node machine keep \`p2p.laddr = "tcp://0.0.0.0:26656"\`.
2. On the router/firewall, forward TCP 26656 to that machine's LAN IP, or run
   a tunnel that carries raw TCP (e.g. \`tailscaled\`, an SSH \`-R\` relay to a
   VPS). Note: free \`cloudflared\` HTTP tunnels do NOT work for P2P.
3. Set \`external_address = "<public-addr>:26656"\` in config.toml so peers
   advertise you correctly.
4. Verify from another network: \`nc -zv <public-addr> 26656\`.

## Joining today, while the reference node is CGNAT-bound
Outbound connections from the reference node DO work through CGNAT, so a new
peer with 26656 open can still join: publish your own peer string
(\`node_id@<your-public-ip>:26656\`) to the Mallchain operators (DevHub
contact / Discord) and they will add it to the reference node's
\`persistent_peers\` and restart. The node then dials OUT to you, the
connection is bidirectional, and you sync like any other peer.
Long term the fix is a seed/validator on a VPS with a static IP — then the
bundle ships a real peer string and anyone can join self-service.

## No published peer? You can still join
Ask any synced node operator for \`curl -s <their-rpc>:26657/net_info |
grep -o '"id":"[0-9a-f]\\{40\\}","listen_addr[^,]*'\`, or start from one known
peer — PEX (\`pex = true\`) discovers the rest within minutes. Until a
routable seed exists the reference node is the only holder of the ledger, so
your node must be dialled by us (see above) — genesis.json in this bundle is
still complete and verifiable on its own.
EOF

  cp "$REPO_DIR/CREATE_VALIDATOR.sh" "$STAGE/CREATE_VALIDATOR.sh"
  chmod +x "$STAGE/CREATE_VALIDATOR.sh"

  cat > "$STAGE/INSTALL.md" <<EOF
# Mallchain node — ${NAME}

Network **${CHAIN_ID}** · binary \`${APP_NAME}\` · bond denom **${BOND_DENOM}** ·
denom \`umal\` (MLCN, 6dp).

> **You do NOT need our backend or MongoDB.** A validator/full node is just
> the binary + genesis.json + a peer address in this folder. Your node
> downloads blocks from peers and **re-executes every transaction itself** —
> it trusts math, not our database. The Express backend/Mongo are the web
> app's off-chain API layer; consensus never reads them.

## Traps (read once, saves hours)
1. **No \`init\` command.** \`${APP_NAME}\` is node-runner only (start/export/
   rollback/version/comet). Use the included \`bin/gen-node-home\` — it makes
   exactly what cometbft init would (node key, validator key, config.toml)
   and is idempotent (keeps existing keys on re-run).
2. **Never enable gRPC on :9090.** It binds before logging and silently
   kills the REST API on :1317 (shared errgroup). Shipped app.toml keeps
   \`[grpc] enable = false\`. If you need gRPC, use :9099.
3. **\`comet show-node-id\` prints to STDERR** — script with \`2>&1\`.

## 1 · Verify the download
\`\`\`bash
sha256sum -c SHA256SUMS.txt        # run inside the unpacked folder
\`\`\`

## 2 · Install binaries
\`\`\`bash
sudo install -m 0755 bin/${APP_NAME} bin/gen-node-home /usr/local/bin/
${APP_NAME} version                # → ${VERSION}
\`\`\`

## 3 · Create the node home (the no-init flow, docs/user-guides/10)
\`\`\`bash
export MALLCHAIN_HOME=\$HOME/.mallchain
gen-node-home "\$MALLCHAIN_HOME"
cp config/genesis.json  "\$MALLCHAIN_HOME/config/genesis.json"
cp config/app.toml.example "\$MALLCHAIN_HOME/config/app.toml"
cp config/config.toml.example "\$MALLCHAIN_HOME/config/config.toml"   # then edit:
#   moniker           = "your-node-name"
#   persistent_peers  = see PEERS.md  (replace the REPLACE_… marker if present)
\`\`\`

## 4 · Start & sync
\`\`\`bash
${APP_NAME} start --home "\$MALLCHAIN_HOME" --minimum-gas-prices="0.01umal" &
curl -s http://127.0.0.1:26657/status | python3 -m json.tool | grep -E 'latest_block_height|catching_up'
\`\`\`
Blocks land every ~5-6s. \`catching_up: false\` = synced. Verify independently:
compare your \`latest_app_hash\` at a given height against any other node —
equal hashes means you agree on the entire state.

## 5 · Become a validator (optional)
Once synced with a funded account:
\`\`\`bash
git clone <this repo> && cd <repo> && (cd backend && npm ci)   # cosmjs lives there
./CREATE_VALIDATOR.sh --priv-validator-key-file=\$MALLCHAIN_HOME/config/priv_validator_key.json \\
  --from-mnemonic-env=MY_VALIDATOR_MNEMONIC --moniker="My Node" --amount=1000000
\`\`\`
Then file the operator-side application in the Mallchain app: Admin →
Validators panel (backend API \`/api/admin/validators/applications\`). Full
walkthrough: docs/validator-setup/README.md and docs/user-guides/09 in the repo.

## 6 · Never do these
- Run two nodes with the same \`priv_validator_key.json\` (double-sign → jailed).
- Ship your \`node_key.json\`/\`priv_validator_key.json\` anywhere.
- Delete a bad \`data/\` dir — move it aside (\`mv data data.broken-\\\$(date +%s)\`).
EOF

  # SHA256SUMS for every file in the bundle (excluding the sums file itself)
  ( cd "$STAGE" && find . -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS.txt )
  echo "--- assembled ${NAME} ($(du -sh "$STAGE" | cut -f1)) ---"
done

# --- 6b. Per-arch zips ---------------------------------------------------------
# The landing page links ${API_BASE}/downloads/node/<arch>.zip directly (served
# by backend/src/routes/downloads.js, which resolves the newest matching zip in
# build/validator-bundle/zips/). Each zip is one complete arch bundle:
# bin/marketplaced + bin/gen-node-home, config/genesis.json, config examples,
# INSTALL.md / PEERS.md, VERSION.txt and the bundle's own SHA256SUMS.txt.
mkdir -p "$OUT_DIR/zips"
PERARCH_ZIPS=()
for NAME in "${BUILT[@]}"; do
  ARCH="${NAME##*-}"
  PERARCH_ZIP="${OUT_DIR}/zips/mallchain-node-${VERSION}-linux-${ARCH}.zip"
  rm -f "$PERARCH_ZIP"
  ( cd "$OUT_DIR" && zip -q -r "$PERARCH_ZIP" "$NAME" )
  ( cd "$OUT_DIR/zips" && sha256sum "$(basename "$PERARCH_ZIP")" > "$(basename "$PERARCH_ZIP").sha256" )
  PERARCH_ZIPS+=("$PERARCH_ZIP")
  echo "--- per-arch zip ${PERARCH_ZIP} ($(du -h "$PERARCH_ZIP" | cut -f1)) ---"
done

# --- 7. Zip at repo root (idempotent: rebuilt every run) ----------------------
ZIP="${REPO_DIR}/mallchain-node-${VERSION}.zip"
rm -f "$ZIP"
TOP_SUMS="$OUT_DIR/SHA256SUMS-top.txt"
( cd "$OUT_DIR" && find "${BUILT[@]}" -type f -print0 | sort -z | xargs -0 sha256sum > "$TOP_SUMS" )
cp "$TOP_SUMS" "$OUT_DIR/SHA256SUMS.txt"
( cd "$OUT_DIR" && zip -q -r "$ZIP" "${BUILT[@]}" SHA256SUMS.txt )
ZIP_SHA="$(sha256sum "$ZIP" | awk '{print $1}')"
echo "$ZIP_SHA  $(basename "$ZIP")" > "${ZIP}.sha256"

log "Done"
echo "zip      : $ZIP"
echo "size     : $(du -h "$ZIP" | cut -f1)"
echo "sha256   : $ZIP_SHA"
echo "bundles  :"
for NAME in "${BUILT[@]}"; do echo "  $OUT_DIR/$NAME"; done
echo "per-arch zips (served at /downloads/node/<arch>.zip):"
for Z in "${PERARCH_ZIPS[@]}"; do echo "  $Z"; done
echo "peer     : ${PEER}  [$PEER_STATUS]"
[[ ${#FAILED[@]} -eq 0 ]] || echo "skipped archs: ${FAILED[*]}"
