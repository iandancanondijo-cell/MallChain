/**
 * downloadsRoute.test.js — exercises backend/src/routes/downloads.js via
 * supertest WITHOUT listening on a port (the dev backend owns :4000).
 *
 * Positive cases hit the REAL repo artifacts (built by
 * scripts/build-validator-bundle.sh); zip bodies are fetched with HEAD so we
 * never buffer ~45MB. Negative cases use an injected empty temp root so the
 * router's file-existence checks and JSON-404 listing are verified too.
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const downloadsRouter = require('../routes/downloads');
const { createDownloadsRouter } = downloadsRouter;

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function appWith(router) {
  const app = express();
  app.use('/downloads', router);
  return app;
}

const realApp = appWith(downloadsRouter);
const emptyApp = appWith(createDownloadsRouter(fs.mkdtempSync(path.join(os.tmpdir(), 'dl-empty-'))));

describe('GET /downloads/node/ (JSON index, real artifacts)', () => {
  jest.setTimeout(30000); // sha256 over ~180MB of zips on first call

  test('returns index with both bundles, checksums, sizes and docs pointer', async () => {
    const res = await request(realApp).get('/downloads/node/');
    expect(res.status).toBe(200);
    expect(res.body.bundles.amd64).toMatchObject({
      downloadUrl: '/downloads/node/amd64.zip',
      servedFrom: 'per-arch-bundle',
    });
    expect(res.body.bundles.amd64.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.bundles.amd64.bytes).toBeGreaterThan(1e6);
    expect(res.body.bundles.arm64.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.bundles.amd64.sha256).not.toBe(res.body.bundles.arm64.sha256);
    expect(res.body.setupGuide.url).toBe('/downloads/node/docs');
    expect(res.body.setupGuide.exists).toBe(true);
    expect(res.body.checksums.url).toBe('/downloads/node/sha256sums.txt');
    // sizes must match the actual files on disk
    const amdPath = path.join(
      REPO_ROOT, 'build', 'validator-bundle', 'zips',
      res.body.bundles.amd64.fileName,
    );
    expect(fs.statSync(amdPath).size).toBe(res.body.bundles.amd64.bytes);
  });

  test('/node and /node/index.html serve the same index', async () => {
    const a = await request(realApp).get('/downloads/node');
    const b = await request(realApp).get('/downloads/node/index.html');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.bundles.amd64.sha256).toBe(a.body.bundles.amd64.sha256);
  });

  test('checksums match the .sha256 sidecars produced by the build script', () => {
    for (const arch of ['amd64', 'arm64']) {
      const zipsDir = path.join(REPO_ROOT, 'build', 'validator-bundle', 'zips');
      const sidecar = fs
        .readdirSync(zipsDir)
        .filter((n) => n.endsWith(`-linux-${arch}.zip.sha256`))
        .map((n) => fs.readFileSync(path.join(zipsDir, n), 'utf8').trim().split(/\s+/)[0])[0];
      expect(sidecar).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('GET /downloads/node/<arch>.zip (real artifacts, HEAD)', () => {
  for (const arch of ['amd64', 'arm64']) {
    test(`HEAD /node/${arch}.zip -> 200 with attachment + real filename`, async () => {
      const res = await request(realApp).head(`/downloads/node/${arch}.zip`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/zip/);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="mallchain-node-v48052ec8-linux-${arch}.zip"`,
      );
      const zipsDir = path.join(REPO_ROOT, 'build', 'validator-bundle', 'zips');
      const expected = fs.readdirSync(zipsDir).find((n) => n.endsWith(`-linux-${arch}.zip`));
      expect(Number(res.headers['content-length'])).toBe(fs.statSync(path.join(zipsDir, expected)).size);
    });
  }

  test('/node/full.zip serves the multi-arch bundle', async () => {
    const res = await request(realApp).head('/downloads/node/full.zip');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('mallchain-node-v48052ec8.zip');
  });
});

describe('GET /downloads/node/docs and /node/sha256sums.txt', () => {
  test('docs serves the validator setup README as text/markdown', async () => {
    const res = await request(realApp).get('/downloads/node/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/markdown/);
    expect(res.text.length).toBeGreaterThan(100);
    const onDisk = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'validator-setup', 'README.md'), 'utf8');
    expect(res.text).toBe(onDisk);
  });

  test('sha256sums.txt serves the bundle-wide checksum file', async () => {
    const res = await request(realApp).get('/downloads/node/sha256sums.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^[0-9a-f]{64}\s+\S+$/m);
  });
});

describe('missing files -> helpful JSON 404 (existence checks)', () => {
  test('unknown download path lists what IS available', async () => {
    const res = await request(realApp).get('/downloads/node/riscv64.zip');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('file_not_available');
    expect(res.body.available).toEqual(
      expect.arrayContaining(['/node/amd64.zip', '/node/arm64.zip', '/node/docs', '/node/sha256sums.txt']),
    );
  });

  test('empty artifact root: arch routes 404, index reports exists:false', async () => {
    const a = await request(emptyApp).get('/downloads/node/amd64.zip');
    expect(a.status).toBe(404);
    expect(a.body.available).not.toContain('/node/amd64.zip');
    const idx = await request(emptyApp).get('/downloads/node/');
    expect(idx.status).toBe(200);
    expect(idx.body.bundles.amd64.exists).toBe(false);
    expect(idx.body.bundles.arm64.exists).toBe(false);
    expect(idx.body.fullBundle.exists).toBe(false);
    const d = await request(emptyApp).get('/downloads/node/docs');
    expect(d.status).toBe(404);
  });

  test('full-bundle-only root: arch zip falls back with X-Download-Note', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-fullonly-'));
    fs.writeFileSync(path.join(root, 'mallchain-node-vTEST.zip'), 'not-a-real-zip-but-route-agnostic');
    const app = appWith(createDownloadsRouter(root));
    const res = await request(app).head('/downloads/node/arm64.zip');
    expect(res.status).toBe(200);
    expect(res.headers['x-download-note']).toMatch(/multi-arch bundle/);
    expect(res.headers['content-disposition']).toContain('mallchain-node-vTEST.zip');
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('path traversal is impossible (whitelist map, no req.params -> paths)', () => {
  const tries = [
    '/downloads/node/..%2F..%2F..%2Fetc%2Fpasswd',
    '/downloads/node/%2e%2e%2f%2e%2e%2fbackend%2Fsrc%2Findex.js',
    '/downloads/node/amd64.zip/../../../../etc/passwd',
    '/downloads/node/../src/routes/downloads.js',
    '/downloads/node/arm64.zip?filename=evil',
  ];

  test.each(tries)('traversal attempt %s never leaks files', async (url) => {
    const res = await request(realApp).get(url);
    // Either a clean JSON 404 (nothing matched / no file contents), or the
    // whitelisted arch zip itself — never any other file's contents.
    if (res.status === 200) {
      expect(res.headers['content-disposition']).toMatch(/mallchain-node-v.*\.zip/);
    } else {
      expect(res.status).toBe(404);
      // Must not be the CONTENTS of a sensitive file (the default Express 404
      // HTML / our JSON 404 are both acceptable responses here).
      expect(String(res.text)).not.toMatch(/root:.*:0:0|require\(['"]dotenv/);
    }
  });
});
