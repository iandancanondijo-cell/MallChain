/**
 * Public node-download routes — mounted at /downloads (NOT under /api), because
 * the landing page's node-download CTAs link exactly:
 *
 *   GET ${API_BASE}/downloads/node/amd64.zip
 *   GET ${API_BASE}/downloads/node/arm64.zip
 *   GET ${API_BASE}/downloads/node/            (JSON index: links + sha256 + sizes)
 *   GET ${API_BASE}/downloads/node/docs        (validator setup guide, text/markdown)
 *   GET ${API_BASE}/downloads/node/sha256sums.txt
 *
 * Artifacts are produced by scripts/build-validator-bundle.sh:
 *   - per-arch zips : build/validator-bundle/zips/mallchain-node-v<...>-linux-<arch>.zip
 *                     (each contains bin/marketplaced + bin/gen-node-home for that
 *                     arch, config/genesis.json, config examples, INSTALL.md,
 *                     PEERS.md, VERSION.txt, SHA256SUMS.txt)
 *   - full bundle   : <repo>/mallchain-node-v<...>.zip (all archs + top SHA256SUMS.txt)
 *
 * SECURITY: no user-supplied string ever becomes a filesystem path. The arch is
 * a fixed whitelist key with its own registered route ('amd64'/'arm64'); every
 * served file is discovered server-side via a pinned regex over a pinned
 * directory and resolved newest-mtime-first. Unknown paths fall through to a
 * JSON 404 that lists what IS available.
 *
 * Fallback: if a per-arch zip is missing but the full bundle exists, the arch
 * route serves the full bundle with an X-Download-Note header (per plan).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Fixed whitelist — the ONLY arch values that resolve to anything.
const ARCH_ZIP_ROUTES = {
  amd64: { url: '/node/amd64.zip', arch: 'amd64' },
  arm64: { url: '/node/arm64.zip', arch: 'arm64' },
};

const PERARCH_ZIP_BASE = '^mallchain-node-v[A-Za-z0-9._-]+-linux-';
const PERARCH_ZIP_RE = new RegExp(`${PERARCH_ZIP_BASE}(amd64|arm64)\\.zip$`);
// Full multi-arch bundle lives at repo root; per-arch zips are matched by
// '-linux-' and are excluded here.
const FULL_ZIP_RE = /^mallchain-node-v[A-Za-z0-9._-]+\.zip$/;

/** Newest regular file (or dir when dirsOnly) in `dir` matching `re`, else null. */
function findNewest(dir, re, { dirsOnly = false } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = entries
    .filter((e) => (dirsOnly ? e.isDirectory() : e.isFile()) && re.test(e.name))
    .map((e) => {
      const abs = path.join(dir, e.name);
      let stat;
      try { stat = fs.statSync(abs); } catch { return null; }
      return { abs, name: e.name, mtimeMs: stat.mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches.length ? matches[0] : null;
}

/** In-memory sha256 cache keyed by abs path, validated against size+mtime. */
const checksumCache = new Map();

function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch (err) {
      return reject(err);
    }
    const cached = checksumCache.get(absPath);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return resolve(cached.sha256);
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const sha256 = hash.digest('hex');
      checksumCache.set(absPath, { sha256, size: stat.size, mtimeMs: stat.mtimeMs });
      resolve(sha256);
    });
  });
}

async function fileEntry(absPath, urlPath, extra = {}) {
  const stat = fs.statSync(absPath);
  const sha256 = await sha256File(absPath);
  return {
    downloadUrl: urlPath,
    fileName: path.basename(absPath),
    bytes: stat.size,
    sha256,
    modified: new Date(stat.mtimeMs).toISOString(),
    ...extra,
  };
}

/**
 * @param {string} [repoRoot] override repo root (used by tests for negative cases)
 */
function createDownloadsRouter(repoRoot) {
  const ROOT = repoRoot || path.resolve(__dirname, '..', '..', '..');
  const BUNDLE_DIR = path.join(ROOT, 'build', 'validator-bundle');
  const ZIPS_DIR = path.join(BUNDLE_DIR, 'zips');
  const DOCS_README = path.join(ROOT, 'docs', 'validator-setup', 'README.md');
  const SUMS_TOP = path.join(BUNDLE_DIR, 'SHA256SUMS.txt');

  // ---- server-side file discovery (never from user input) ----
  // `arch` is ONLY ever one of the hardcoded whitelist keys below, so building
  // the regex from it is safe; no user string reaches path/fs operations.
  function resolveArchZip(arch) {
    if (!Object.prototype.hasOwnProperty.call(ARCH_ZIP_ROUTES, arch)) return null;
    const re = new RegExp(`${PERARCH_ZIP_BASE}${arch}\\.zip$`);
    const perArch = findNewest(ZIPS_DIR, re);
    if (perArch) return { abs: perArch.abs, source: 'per-arch-bundle' };
    const full = resolveFullZip();
    if (full) return { abs: full.abs, source: 'full-bundle-fallback' };
    return null;
  }

  function resolveFullZip() {
    // Repo root, name like mallchain-node-vXXXX.zip (NOT a -linux-<arch>.zip).
    let entries;
    try {
      entries = fs.readdirSync(ROOT, { withFileTypes: true });
    } catch {
      return null;
    }
    const matches = entries
      .filter((e) => e.isFile() && FULL_ZIP_RE.test(e.name) && !e.name.includes('-linux-'))
      .map((e) => {
        const abs = path.join(ROOT, e.name);
        try { return { abs, name: e.name, mtimeMs: fs.statSync(abs).mtimeMs }; } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return matches.length ? matches[0] : null;
  }

  function resolveSumsFile() {
    // Preferred: the bundle-wide per-file checksums. Fallback: the full zip's
    // own .sha256 sidecar.
    if (fs.existsSync(SUMS_TOP)) return SUMS_TOP;
    const full = resolveFullZip();
    if (full && fs.existsSync(`${full.abs}.sha256`)) return `${full.abs}.sha256`;
    return null;
  }

  // ---- helpful 404 payload: lists what IS actually available ----
  function availableSnapshot() {
    const available = [];
    for (const [key, def] of Object.entries(ARCH_ZIP_ROUTES)) {
      if (resolveArchZip(def.arch)) available.push(def.url);
    }
    if (resolveFullZip()) available.push('/node/full.zip');
    if (fs.existsSync(DOCS_README)) available.push('/node/docs');
    if (resolveSumsFile()) available.push('/node/sha256sums.txt');
    available.unshift('/node/', '/node/index.html');
    return available;
  }

  function notFound(req, res) {
    return res.status(404).json({
      error: 'file_not_available',
      message:
        'That download is not present on this server. Node bundles are produced by ' +
        'scripts/build-validator-bundle.sh; run it on the backend host to populate them.',
      requested: req.originalUrl,
      available: availableSnapshot(),
    });
  }

  const router = express.Router();

  // GET /downloads — pointer to the node listing.
  router.get('/', (req, res) => {
    res.json({
      service: 'mallchain-node-downloads',
      listings: ['/downloads/node/'],
      docs: '/downloads/node/docs',
    });
  });

  // GET /downloads/node/ (and /node/index.html) — human-readable JSON index.
  const indexHandler = async (req, res) => {
    const bundles = {};
    for (const [key, def] of Object.entries(ARCH_ZIP_ROUTES)) {
      const resolved = resolveArchZip(def.arch);
      if (resolved) {
        bundles[key] = await fileEntry(resolved.abs, `/downloads/node/${key}.zip`, {
          servedFrom: resolved.source,
          bundleContents: [
            'bin/marketplaced (node binary)',
            'bin/gen-node-home (init helper)',
            'config/genesis.json',
            'config/*.toml.example',
            'INSTALL.md',
            'PEERS.md',
            'VERSION.txt',
            'SHA256SUMS.txt',
          ],
        });
      } else {
        bundles[key] = { downloadUrl: `/downloads/node/${key}.zip`, exists: false };
      }
    }
    const full = resolveFullZip();
    const payload = {
      title: 'Mallchain node bundles (chain mallchain-1)',
      description:
        'Run a validator/full node: download a bundle, verify SHA256, follow INSTALL.md inside. ' +
        'No backend/Mongo needed — the binary + genesis.json + a peer address are all consensus requires.',
      bundles,
      fullBundle: full
        ? await fileEntry(full.abs, '/downloads/node/full.zip')
        : { downloadUrl: '/downloads/node/full.zip', exists: false },
      setupGuide: {
        url: '/downloads/node/docs',
        repoPath: 'docs/validator-setup/README.md',
        exists: fs.existsSync(DOCS_README),
      },
      checksums: resolveSumsFile()
        ? { url: '/downloads/node/sha256sums.txt' }
        : { url: null, exists: false },
      verifyHint: 'sha256sum -c SHA256SUMS.txt  (inside the unpacked bundle)',
    };
    res.json(payload);
  };
  router.get('/node/', indexHandler);
  router.get('/node', indexHandler);
  router.get('/node/index.html', indexHandler);

  // GET /downloads/node/amd64.zip | arm64.zip — per-arch bundles (whitelisted routes).
  const makeArchZipHandler = (arch) => (req, res, next) => {
    const resolved = resolveArchZip(arch);
    if (!resolved) return notFound(req, res);
    if (resolved.source === 'full-bundle-fallback') {
      // Clear marker + pointer to README: per-arch zip unavailable, full bundle served.
      res.setHeader('X-Download-Note', 'per-arch bundle unavailable - serving full multi-arch bundle; see /downloads/node/docs');
    }
    return res.download(resolved.abs, path.basename(resolved.abs), (err) => {
      // Success: sendFile already finished the response — do NOT call next().
      // Failure before headers: replace the error with our helpful JSON 404.
      if (err && !res.headersSent) {
        return res.status(404).json({
          error: 'file_unreadable',
          message: 'The bundle file was discovered but could not be read.',
          available: availableSnapshot(),
        });
      }
    });
  };
  router.get('/node/amd64.zip', makeArchZipHandler('amd64'));
  router.get('/node/arm64.zip', makeArchZipHandler('arm64'));

  // GET /downloads/node/full.zip — the all-arch bundle (bonus, same whitelist style).
  router.get('/node/full.zip', (req, res, next) => {
    const full = resolveFullZip();
    if (!full) return notFound(req, res);
    return res.download(full.abs, full.name, (err) => (err && !res.headersSent ? next(err) : undefined));
  });

  // GET /downloads/node/docs — validator setup guide as text/markdown.
  router.get('/node/docs', (req, res) => {
    if (!fs.existsSync(DOCS_README)) return notFound(req, res);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="validator-setup-README.md"');
    return res.sendFile(DOCS_README);
  });

  // GET /downloads/node/sha256sums.txt — bundle-wide checksum file.
  router.get('/node/sha256sums.txt', (req, res) => {
    const sums = resolveSumsFile();
    if (!sums) return notFound(req, res);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="SHA256SUMS.txt"');
    return res.sendFile(sums);
  });

  // Anything else under /downloads → helpful JSON 404 (also the only landing for
  // traversal attempts like /node/..%2F..%2Fetc%2Fpasswd — no route matches,
  // and nothing here ever builds a path from the URL).
  router.use((req, res) => notFound(req, res));

  return router;
}

module.exports = createDownloadsRouter();
module.exports.createDownloadsRouter = createDownloadsRouter;
module.exports.PERARCH_ZIP_RE = PERARCH_ZIP_RE;
module.exports.FULL_ZIP_RE = FULL_ZIP_RE;
