/**
 * GET /api/blockchain/overview — one aggregated, public network-status feed.
 *
 * Why this exists: the landing page's status table used to fire three
 * anonymous requests per poll (/blockchain/health, /blockchain/stats,
 * /explorer/blocks?limit=5) while /health and /stats both hit node_info and
 * the latest block anyway. Two tabs left in a shared CGNAT address burned a
 * large slice of the 300-requests-per-15-minutes per-IP budget, and when the
 * budget ran out every one of those requests answered 429 — which the page
 * rendered as "UNREACHABLE", a false outage report about a healthy network.
 *
 * This endpoint makes the poll one request, and caches it process-wide for
 * `NETWORK_OVERVIEW_TTL_MS` (default 10s) with in-flight deduplication, so the
 * number of chain queries per interval is set by the TTL rather than by how
 * many browsers are watching.
 *
 * Honesty contract (the reason each source carries its own status):
 *   - `sources.<x>.ok` reflects whether that feed *actually answered*;
 *   - `price.ok` is false when mallcoinService had to fall back to its
 *     configured default price, so a fallback never reads as a live rate;
 *   - an unavailable value stays `null` and the client says so. Nothing in
 *     this response is a placeholder.
 */
const { config } = require('../config')
const logger = require('../utils/logger')
const { computeBlockStaleness } = require('../utils/chainHealth')
const { chainStatusSnapshot } = require('./blockchainController')
const { getMarketPrice } = require('../services/mallcoinService')
const { getMallpointPriceKes } = require('../services/economyConstants')
const explorer = require('../services/explorerService')

const DEFAULT_TTL_MS = 10000
const DEFAULT_STALE_BLOCK_MS = 60000
const DEFAULT_EXPLORER_PROBE = 3

// Read at call time, not require time, so the cache window can be tuned in a
// running process (and in tests) without a restart.
function ttlMs() {
  const raw = Number(process.env.NETWORK_OVERVIEW_TTL_MS)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_MS
}

function staleBlockMs() {
  const raw = Number(process.env.CHAIN_STALE_BLOCK_MS)
  return Number.isFinite(raw) && raw >= 1000 ? raw : DEFAULT_STALE_BLOCK_MS
}

function explorerProbe() {
  const raw = Number(process.env.NETWORK_OVERVIEW_EXPLORER_PROBE)
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_EXPLORER_PROBE
  return Math.min(10, Math.floor(raw))
}

let cached = null // { at: number, payload: object }
let inflight = null // Promise<payload> — collapses concurrent polls into one build

// Exported for tests: the cache is deliberately module-level, so a suite that
// asserts on two successive builds needs a way to clear it between cases.
function resetOverviewCache() {
  cached = null
  inflight = null
}

async function buildExplorerStatus() {
  const out = { ok: false, recentBlockCount: 0, error: null }
  try {
    const blocks = await explorer.getRecentBlocks(explorerProbe())
    out.recentBlockCount = Array.isArray(blocks) ? blocks.length : 0
    out.ok = out.recentBlockCount > 0
    if (!out.ok) out.error = 'no_blocks_returned'
  } catch (err) {
    out.error = err?.message ? String(err.message).slice(0, 200) : 'explorer_unavailable'
  }
  return out
}

async function buildPriceStatus() {
  const out = { ok: false, midKes: null, buyKes: null, sellKes: null, pointPriceKes: null, source: 'unavailable', error: null }
  try {
    const price = await getMarketPrice()
    // getMarketPrice() answers with the configured defaults and flags the
    // substitution rather than throwing. Respect that flag: a fallback price
    // is reported as not-live, and the numbers are withheld so no client can
    // display an unverified rate as "read from the on-chain market".
    if (!price || price.fallback) {
      out.error = 'market_price_fallback'
      out.source = 'fallback'
      out.pointPriceKes = getMallpointPriceKes()
      return out
    }
    out.ok = true
    out.midKes = price.midPriceKes ?? null
    out.buyKes = price.buyPriceKes ?? null
    out.sellKes = price.sellPriceKes ?? null
    out.pointPriceKes = getMallpointPriceKes()
    out.source = 'onchain'
    return out
  } catch (err) {
    out.error = err?.message ? String(err.message).slice(0, 200) : 'price_unavailable'
    return out
  }
}

async function buildOverview() {
  const [chain, explorerStatus, price] = await Promise.all([
    chainStatusSnapshot(),
    buildExplorerStatus(),
    buildPriceStatus(),
  ])

  const { blockAgeMs, isStale } = computeBlockStaleness(chain.latestBlockTime, staleBlockMs())

  return {
    generatedAt: new Date().toISOString(),
    cachedForMs: ttlMs(),
    sources: {
      chain: { ok: chain.reachable, error: chain.error },
      explorer: { ok: explorerStatus.ok, error: explorerStatus.error },
      price: { ok: price.ok, error: price.error },
    },
    chain: {
      ...chain,
      // `reachable` means the REST endpoint answered; `producing` means the
      // last block is recent enough that consensus is advancing. A node can
      // be reachable and stalled, and those are different incidents.
      blockAgeMs,
      producing: chain.reachable && !isStale,
      staleThresholdMs: staleBlockMs(),
    },
    explorer: explorerStatus,
    price,
    restEndpoint: config.chain.rest.replace(/\/$/, ''),
  }
}

async function getOverview(req, res) {
  const ttl = ttlMs()
  const now = Date.now()
  if (cached && now - cached.at < ttl) {
    return res.json({ ...cached.payload, fromCache: true })
  }

  if (!inflight) {
    inflight = buildOverview()
      .then((payload) => {
        cached = { at: Date.now(), payload }
        return payload
      })
      .finally(() => { inflight = null })
  }

  try {
    const payload = await inflight
    return res.json({ ...payload, fromCache: false })
  } catch (err) {
    // buildOverview degrades per-source rather than throwing; reaching here
    // means something unexpected happened, so say that instead of rendering
    // an empty status table.
    logger.error('networkOverview', 'Overview build failed', err, { path: req.originalUrl })
    return res.status(503).json({
      error: { code: 'NETWORK_OVERVIEW_UNAVAILABLE', message: 'Network status is momentarily unavailable', statusCode: 503 },
    })
  }
}

module.exports = {
  getOverview,
  resetOverviewCache,
  __buildOverview: buildOverview,
}
