# Marketplace Blockchain

This repository contains the Marketplace blockchain app, its Cosmos SDK chain, the Node/Express backend, and the Vite/React frontend.

## Current stack

- Blockchain node: `marketplaced`
- Backend API: `backend/`
- Frontend UI: `mallchain-os-v14/` (Mallchain OS — see `mallchain-os-v14/README.md`)
- Local startup helpers: `START_ALL.sh`, `STOP_ALL.sh`

## Quick start

From the repository root, you can start the full stack with:

```sh
./START_ALL.sh
```

To stop everything:

```sh
./STOP_ALL.sh
```

## Manual startup commands

### 1. Blockchain

```sh
./marketplaced start \
  --home=./blockchain_working \
  --minimum-gas-prices=0.01stake \
  --rpc.laddr=tcp://127.0.0.1:26657 \
  --api.enable \
  --api.address=tcp://localhost:1317
```

### 2. Backend

```sh
cd backend && npm start
```

### 3. Frontend

```sh
cd mallchain-os-v14 && npm run dev -- --host 127.0.0.1
```

## Manual stop commands

```sh
pkill -f "marketplaced start" || true
pkill -f "node src/index.js" || true
pkill -f "vite" || true
pkill -f "nodemon src/index.js" || true
```

If a port is still stuck, you can also force it free with:

```sh
fuser -k 4000/tcp 5173/tcp 5174/tcp 5175/tcp 5176/tcp 1317/tcp 26657/tcp 26656/tcp 9090/tcp 2>/dev/null || true
```

## Production

See [PRODUCTION.md](./PRODUCTION.md) for deployment, security checklist, and chain reset steps.

If you changed genesis or `chain_id`, reset local chain data:

```sh
./scripts/reset-local-chain.sh
```

## Development notes

- The backend expects the blockchain REST endpoint on `http://127.0.0.1:1317`.
- The frontend (`mallchain-os-v14/`) uses Vite and will start on the next available port if `5173` is already occupied.
- The startup helper in `START_ALL.sh` is the preferred way to bring up the full local stack.

## Release

To release a new version of your blockchain, create and push a new tag with `v` prefix. A new draft release with the configured targets will be created.

```sh
git tag v0.1
git push origin v0.1
```

After a draft release is created, make your final changes from the release page and publish it.

The release job signs every artifact it builds (`checksums.txt` plus a cosign
keyless signature and Fulcio certificate per file) before publishing, and the
job fails rather than publishing if it cannot. The signing identity is
`https://github.com/<org>/<repo>/.github/workflows/release.yml@refs/tags/<tag>`.

## Install

Do not pipe a remote installer into a root shell. `curl … | sudo bash` runs
whatever the server returns that second, with no version pinned, no artifact to
inspect afterwards and no signature checked — it hands any network path or
account compromise a one-line remote-code-execution channel into every node
operator who follows the instruction.

Install a pinned, verified release instead:

```sh
VERSION=v0.1.0                       # the tag you are installing — never "latest"
REPO=iandancanondijo-cell/MallChain  # your GitHub org/repo
BASE="https://github.com/${REPO}/releases/download/${VERSION}"
mkdir -p /tmp/marketplace-install && cd /tmp/marketplace-install

# The node binary for your platform (adjust the arch if you are on arm64 Linux
# or a Mac: darwin_arm64 / darwin_amd64 / linux_amd64).
curl -fLO "${BASE}/marketplace_${VERSION#v}_linux_amd64.tar.gz"
curl -fLO "${BASE}/checksums.txt"
curl -fLO "${BASE}/checksums.txt.sig"
curl -fLO "${BASE}/checksums.txt.crt"

# 1. Authenticate checksums.txt itself against the release's signer identity.
cosign verify-blob checksums.txt \
  --signature checksums.txt.sig \
  --certificate checksums.txt.crt \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity "https://github.com/${REPO}/.github/workflows/release.yml@refs/tags/${VERSION}"

# 2. Then authenticate the tarball against that signed manifest.
sha256sum --ignore-missing --check checksums.txt

# 3. Install for the current user — no root, no sudo. The tarball carries the
#    `marketplaced` binary (see Makefile's `go install ./cmd/marketplaced`).
mkdir -p "$HOME/.local/bin"
tar -xzf "marketplace_${VERSION#v}_linux_amd64.tar.gz"
install -m 0755 ./marketplaced "$HOME/.local/bin/"
"$HOME/.local/bin/marketplaced" version
```

If `cosign verify-blob` fails, or you cannot install a cosign binary you trust,
stop: a matching SHA256 against a digest fetched from the same host as the
artifact proves nothing.

Prefer the Ignite installer? Pin the version, download the script so there is
something to read and re-run, and keep it out of root:

```sh
curl -fLO "https://get.ignite.com/${REPO}@${VERSION}!"
less get.ignite.com*      # read it
bash ./get.ignite.com*    # as your own user, into $HOME/.local/bin
```

`tmp/marketplace` in the original installer URL was a scaffold placeholder that
matches no repository — the first person to run that line was installing
somebody else's build script.

## 2026 Enhancement Roadmap

This project is evolving toward a modern blockchain architecture with the following priorities:

- **Invisible UX**: smart accounts, gasless transactions, and social recovery.
- **Agent-ready infrastructure**: support autonomous AI agents with scoped spending keys and verifiable decision logs.
- **Modular scalability**: separate execution, settlement, and data availability, with a focus on high throughput and composable modules.
- **Real-world asset tokenization**: support custody-grade fractional ownership, compliance-by-design, and stablecoin settlement.
- **Cross-chain and payment interoperability**: make assets move seamlessly across chains, with the backend abstracting network details.
- **Privacy + compliance**: add zero-knowledge proofs, selective disclosure, and on-chain audit trails.

See `docs/2026_blockchain_enhancements.md` for the full feature roadmap and implementation guidance.

## Learn more

- [Ignite CLI](https://ignite.com/cli)
- [Tutorials](https://docs.ignite.com/guide)
- [Ignite CLI docs](https://docs.ignite.com)
- [Cosmos SDK docs](https://docs.cosmos.network)
- [Developer Chat](https://discord.com/invite/ignitecli)

