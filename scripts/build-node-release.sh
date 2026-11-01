#!/usr/bin/env bash
# build-node-release.sh — Build + checksum distributable `marketplaced` node
# binaries for the mallchain-1 network.
#
# Outputs (under build/releases/ by default):
#   <APP>-<VERSION>-<os>-<arch>/            staging dir per target
#     ├── bin/marketplaced                  the node binary
#     ├── bin/gen-node-home                 helper: the binary has NO `init`
#     │                                     command, so this standalone helper
#     │                                     generates node_key.json /
#     │                                     priv_validator_key.json / config.toml
#     │                                     (compiled from scripts/gen_node_home.go)
#     └── README.txt                        one-line pointer to INSTALL.md
#   <APP>-<VERSION>-<os>-<arch>.tar.gz      tarball per target
#   sha256sums.txt                          sha256 of every tarball
#
# Usage:
#   scripts/build-node-release.sh [--targets=linux/amd64,linux/arm64,darwin/arm64]
#                                 [--out=build/releases] [--version=vX.Y.Z]
#
# Notes / traps respected here:
#   - Go may not be on PATH on this machine (lives at /usr/local/go/bin/go).
#   - CGO_ENABLED=0 everywhere: the default DB backends are pure Go; rocksdb
#     (grocksdb) is only behind a build tag we do not use. This is what makes
#     cross-compilation work from a single host.
#   - Version is stamped via the same cosmos-sdk ldflags the Makefile uses.
#   - `marketplaced tendermint show-node-id` writes to STDERR (see --version
#     smoke test: 2>&1).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="marketplaced"
TARGETS="linux/amd64,linux/arm64,darwin/arm64"
OUT_DIR="${REPO_DIR}/build/releases"
VERSION=""

for arg in "$@"; do
  case "$arg" in
    --targets=*) TARGETS="${arg#*=}" ;;
    --out=*)     OUT_DIR="${arg#*=}" ;;
    --version=*) VERSION="${arg#*=}" ;;
    -h|--help)   sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# --- locate Go (not on PATH on this machine) --------------------------------
if ! command -v go >/dev/null 2>&1; then
  if [[ -x /usr/local/go/bin/go ]]; then
    export PATH="/usr/local/go/bin:$PATH"
  else
    echo "ERROR: Go toolchain not found (need >= go.mod's version)." >&2
    exit 1
  fi
fi

# --- version ----------------------------------------------------------------
cd "$REPO_DIR"
COMMIT="$(git log -1 --format='%H' 2>/dev/null || echo unknown)"
if [[ -z "$VERSION" ]]; then
  VERSION="$(git describe --tags --exact-match 2>/dev/null \
    || git describe --tags 2>/dev/null \
    || true)"
  if [[ -z "$VERSION" ]]; then
    BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)"
    VERSION="${BRANCH}-$(git log -1 --format='%h' 2>/dev/null || echo 0000000)"
  fi
fi
# branch names contain '/' (e.g. feature/x) — sanitize so it is safe in
# file/dir/tarball names.
VERSION="${VERSION//\//-}"

LDFLAGS="-s -w -X github.com/cosmos/cosmos-sdk/version.Name=marketplace \
-X github.com/cosmos/cosmos-sdk/version.AppName=${APP_NAME} \
-X github.com/cosmos/cosmos-sdk/version.Version=${VERSION} \
-X github.com/cosmos/cosmos-sdk/version.Commit=${COMMIT}"

echo "=== Building ${APP_NAME} release set ==="
echo "version : ${VERSION}"
echo "commit  : ${COMMIT:0:12}"
echo "targets : ${TARGETS}"
echo "out     : ${OUT_DIR}"
echo ""

mkdir -p "$OUT_DIR"
echo "$VERSION" > "$OUT_DIR/.lastversion"
BUILT=()
FAILED=()

IFS=',' read -ra TARGET_LIST <<< "$TARGETS"
for t in "${TARGET_LIST[@]}"; do
  GOOS="${t%%/*}"; GOARCH="${t##*/}"
  NAME="${APP_NAME}-${VERSION}-${GOOS}-${GOARCH}"
  STAGE="${OUT_DIR}/${NAME}"
  TAR="${OUT_DIR}/${NAME}.tar.gz"

  echo "--- ${NAME} ---"
  rm -rf "$STAGE"; mkdir -p "$STAGE/bin"

  # node binary
  if ! CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
       go build -trimpath -ldflags "$LDFLAGS" -o "$STAGE/bin/$APP_NAME" ./cmd/marketplaced; then
    echo "    BUILD FAILED for $t (node binary) — skipping target" >&2
    FAILED+=("$NAME"); continue
  fi

  # gen-node-home helper: the binary has NO init command, so remote operators
  # need this standalone key/config generator (source: scripts/gen_node_home.go).
  if ! CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
       go build -trimpath -o "$STAGE/bin/gen-node-home" ./scripts/gen_node_home.go; then
    echo "    WARNING: gen-node-home failed for $t — bundle still ships without it" >&2
  fi

  cat > "$STAGE/README.txt" <<EOF
${APP_NAME} ${VERSION} (${GOOS}/${GOARCH}) for network mallchain-1.

This archive contains ONLY binaries. For a complete joinable node bundle
(genesis.json, example configs, INSTALL.md, CREATE_VALIDATOR.sh) use:
    scripts/make-validator-bundle.sh --os=${GOOS} --arch=${GOARCH}

Quirks you must know (also in INSTALL.md):
  * There is NO \`marketplaced init\` command. Use ./bin/gen-node-home <home-dir>.
  * \`marketplaced tendermint show-node-id\` prints to STDERR (2>&1).
  * NEVER enable gRPC on 9090 on the reference setup — it kills the REST API
    on 1317. Keep [grpc] enable = false (or move it off 9090).
EOF

  tar -czf "$TAR" -C "$OUT_DIR" "$NAME"
  ( cd "$OUT_DIR" && sha256sum "$NAME.tar.gz" >> sha256sums.txt.tmp && \
    mv -f sha256sums.txt.tmp sha256sums.txt )
  BUILT+=("$NAME")
  SIZE="$(du -h "$TAR" | cut -f1)"
  echo "    OK  $TAR  ($SIZE)"
done

# host-arch smoke test: prove the freshly built main binary runs here.
HOST_NAME="${APP_NAME}-${VERSION}-$(uname -s | tr 'A-Z' 'a-z')-$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
if [[ -x "${OUT_DIR}/${HOST_NAME}/bin/${APP_NAME}" ]]; then
  echo "--- smoke test (${HOST_NAME}) ---"
  "${OUT_DIR}/${HOST_NAME}/bin/${APP_NAME}" version 2>&1 | head -2 || true
  "${OUT_DIR}/${HOST_NAME}/bin/${APP_NAME}" start --help 2>&1 | head -5 || true
fi

echo ""
echo "=== Done ==="
echo "built   : ${#BUILT[@]} target(s)"
echo "failed  : ${#FAILED[@]} ${FAILED[*]:-}"
echo "checksums: ${OUT_DIR}/sha256sums.txt"
cat "$OUT_DIR/sha256sums.txt" 2>/dev/null | sed 's/^/  /'
[[ ${#BUILT[@]} -gt 0 ]] || exit 1
