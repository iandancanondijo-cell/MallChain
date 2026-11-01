Node bundle downloads are served by the BACKEND, not from this static folder.

Canonical live endpoints (relative to the API origin, e.g. https://api.mallchain.network):

  GET /downloads/node/            JSON index: per-arch links, sizes, SHA256, docs pointer
  GET /downloads/node/amd64.zip   linux/amd64 bundle (binary + genesis + INSTALL.md + SHA256SUMS)
  GET /downloads/node/arm64.zip   linux/arm64 bundle
  GET /downloads/node/full.zip    combined bundle (amd64 + arm64)
  GET /downloads/node/docs        validator setup guide (markdown)
  GET /downloads/node/sha256sums.txt

The in-app pages (Landing "Run a Node", /#/run-node, Developer Hub) and the
landing page CTAs all link ${VITE_API_BASE_URL}/downloads/node/... so dev and
production resolve to the same published bundles.

Source of truth on the server:
  build/validator-bundle/zips/            per-arch zips (built by scripts/build-validator-bundle.sh, section 6b)
  build/validator-bundle/mallchain-node-*-linux-<arch>/   staged bundle contents
  backend/src/routes/downloads.js         serving router (whitelist, checksums, no path traversal)

To publish a new release: run scripts/build-validator-bundle.sh, then the route
auto-discovers the newest matching files — no static uploads needed here.
