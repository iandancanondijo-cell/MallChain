/**
 * Market price feed — the server half of the `price:updates` room.
 *
 * What this file used to be:
 *
 *   const priceEngine = {
 *     getMarketData: () => ({ mallcoin: { usd: 0, kes: 0 }, mlpts: { usd: 0, kes: 2 } }),
 *     resetDailyVolume: () => {},
 *   };
 *
 * `index.js` handed that object to every socket that emitted `subscribe:price`,
 * so the realtime price channel reported that MALL was worth nothing and that a
 * Mallpoint cost 2 KES because a source file once said so. It also exported a
 * `resetDailyVolume()` no-op that a daily `setInterval` in `index.js` called and
 * then logged "Daily volume reset" — a log line describing work that did not
 * happen.
 *
 * What it does now: reads the same on-chain market params the REST endpoints use
 * (`mallcoinService.getMarketPrice`, which is where `GET /api/economy/state` and
 * the landing page get their numbers), adds the Mallpoint peg from
 * `economyConstants` (the single source of truth for 1 MLPTS = n KES), derives
 * USD from a live FX rate, and takes 24h volume from the ledger that already
 * records every value movement (`LiquidityPoolActivity`).
 *
 * Honest degradation, field by field:
 * - chain unreachable → `source: 'configured-default'` and the configured
 *   buy/sell spread, the same fallback `mallcoinService` documents. Never a 0.
 * - FX provider unreachable → `usd` is null. A dollar price is omitted rather
 *   than invented from a stale constant.
 * - not enough price history yet → `change24h` is null, not 0.
 *
 * The feed polls on its own timer, but only while somebody is in the room, and
 * only emits when a number actually moved. Same self-gating shape as
 * `services/blockBroadcaster.js`.
 */
const { getMarketPrice } = require('./mallcoinService')
const { getMallpointPriceKes } = require('./economyConstants')
const { getFxRate } = require('./fxService')
const LiquidityPoolActivity = require('./../models/LiquidityPoolActivity')
const logger = require('../utils/logger')

const DEFAULT_ROOM = 'price:updates'
const DEFAULT_POLL_MS = Number(process.env.PRICE_FEED_POLL_MS || 30000)
const DAY_MS = 24 * 60 * 60 * 1000

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

function roomSize(io, room) {
  try {
    return io?.sockets?.adapter?.rooms?.get?.(room)?.size ?? 0
  } catch {
    return 0
  }
}

/**
 * KES->USD for the two quoted prices. Returns nulls when the FX provider is
 * down or does not quote USD; the caller then omits the dollar figures. A
 * provider failure is not a licence to publish a dollar price we do not have.
 */
async function readUsd(midPriceKes, mlptsPriceKes) {
  try {
    const { rate, date } = await getFxRate('KES', 'USD')
    if (!Number.isFinite(rate) || rate <= 0) return null
    return {
      rate,
      fxAsOf: date || null,
      midPriceUsd: round(midPriceKes * rate, 8),
      mlptsPriceUsd: round(mlptsPriceKes * rate, 8),
    }
  } catch (err) {
    logger.warn('priceEngine', 'USD conversion unavailable; publishing KES only', err, {})
    return null
  }
}

/**
 * 24h of settled value movement, straight from the ledger.
 *
 * Only rows that moved value in count: `flow: 'buy'` with `status: 'success'`
 * is what a credited purchase looks like (see the RESERVE SEMANTICS comment in
 * models/LiquidityPoolActivity.js). Informational rows — rewards, P2P
 * transfers, faucet grants, refunds — are deliberately excluded, so this is
 * "MALL bought in the last 24h" and not a number padded with bookkeeping noise.
 */
async function readVolume24h() {
  try {
    const since = new Date(Date.now() - DAY_MS)
    const [row] = await LiquidityPoolActivity.aggregate([
      { $match: { flow: 'buy', status: 'success', recordedAt: { $gte: since } } },
      { $group: { _id: null, mlcns: { $sum: '$amountMlcns' }, kes: { $sum: '$fiatAmount' }, trades: { $sum: 1 } } },
    ])
    return {
      mlcns: round(row?.mlcns || 0, 6),
      kes: round(row?.kes || 0, 2),
      trades: Number(row?.trades || 0),
    }
  } catch (err) {
    // A volume read failing must not take the price snapshot down with it; the
    // price is the thing the room exists for. Null says "unknown", which the
    // client renders as a dash rather than as zero activity.
    logger.warn('priceEngine', '24h volume read failed; publishing without it', err, {})
    return null
  }
}

/**
 * One complete snapshot: what MALL costs, what a Mallpoint costs, what traded,
 * and how far the price has moved. Field names match the REST economy state
 * (`buyPriceKes`/`sellPriceKes`/`midPriceKes`) so the socket and the polled
 * path describe the same numbers with the same words.
 */
async function buildSnapshot(history = []) {
  const market = await getMarketPrice()
  const midPriceKes = market.midPriceKes
  const mlptsPriceKes = getMallpointPriceKes()
  const [usd, volume] = await Promise.all([
    readUsd(midPriceKes, mlptsPriceKes),
    readVolume24h(),
  ])

  const snapshot = {
    buyPriceKes: round(market.buyPriceKes, 6),
    sellPriceKes: round(market.sellPriceKes, 6),
    midPriceKes: round(midPriceKes, 6),
    mlptsPriceKes: round(mlptsPriceKes, 6),
    usd,
    volume24h: volume,
    change24h: changeFromHistory(history, midPriceKes),
    // 'chain' = read from the node; 'configured-default' = the node was
    // unreachable and these are the configured fallbacks. Surfaced because the
    // difference matters to anyone reading a stalled price panel.
    source: market.fallback ? 'configured-default' : 'chain',
    asOf: new Date().toISOString(),
  }
  return snapshot
}

/**
 * Percentage move over the last 24h against the oldest sample in the feed's own
 * window. Null when the process has not been running long enough to have a
 * comparison point — reporting 0% would claim a flat market, which is a
 * statement we have not earned.
 */
function changeFromHistory(history, currentMid) {
  const cutoff = Date.now() - DAY_MS
  const samples = (Array.isArray(history) ? history : []).filter((s) => s.ts >= cutoff)
  if (samples.length < 2) return null
  const past = samples[0].mid
  if (!Number.isFinite(past) || past === 0 || !Number.isFinite(currentMid)) return null
  return round(((currentMid - past) / past) * 100, 4)
}

/**
 * The push half. `start(io)` arms the loop; `stop()` clears it. Snapshots are
 * compared on the price fields only, so a fresh volume figure does not make
 * every subscriber's panel flash.
 */
function createPriceFeed(options = {}) {
  const room = options.room || DEFAULT_ROOM
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const snapshot = options.buildSnapshot || buildSnapshot

  let io = null
  let timer = null
  let stopped = true
  let fetching = false
  let latest = null
  // Kept inside the feed rather than the module so tests get a clean window,
  // and so the history reflects what this process actually observed.
  const history = []

  function record(mid, asOf) {
    const ts = asOf ? Date.parse(asOf) : Date.now()
    if (!Number.isFinite(ts)) return
    history.push({ ts, mid })
    // A 25h window at a 30s cadence is ~3000 points; prune by age so a
    // long-running backend does not grow this array forever.
    const cutoff = Date.now() - DAY_MS - 3600000
    while (history.length && history[0].ts < cutoff) history.shift()
  }

  function changed(prev, next) {
    if (!prev) return true
    return (
      prev.buyPriceKes !== next.buyPriceKes
      || prev.sellPriceKes !== next.sellPriceKes
      || prev.midPriceKes !== next.midPriceKes
      || prev.mlptsPriceKes !== next.mlptsPriceKes
    )
  }

  async function pollOnce() {
    if (stopped || fetching) return latest
    fetching = true
    try {
      const next = await snapshot(history)
      record(next.midPriceKes, next.asOf)
      const moved = changed(latest, next)
      latest = next
      // Nobody watching, and nothing to prime from: emitting to an empty room
      // is harmless but pointless, and a subscriber gets `latest` on join
      // anyway (see index.js's subscribe:price handler).
      if (moved && io) io.to(room).emit('price:current', next)
      return next
    } catch (err) {
      // getMarketPrice() already fails soft; reaching here means something else
      // broke. Keep the last good snapshot rather than replacing it with zeros.
      logger.error('priceEngine', 'Price snapshot failed', err, { room })
      return latest
    } finally {
      fetching = false
    }
  }

  /**
   * Whether the next tick should talk to the chain. The chain read itself is
   * Redis-cached for 30s inside mallcoinService, so this guard is mostly about
   * not holding a timer that asks a question nobody is waiting for.
   */
  function shouldPoll() {
    return roomSize(io, room) > 0
  }

  return {
    start(socketServer) {
      if (io) return this
      io = socketServer
      stopped = false
      // Prime immediately: a subscriber that joins in the first second should
      // not see an empty price panel while waiting for the first tick.
      pollOnce()
      timer = setInterval(() => {
        if (shouldPoll()) pollOnce()
      }, pollMs)
      if (typeof timer.unref === 'function') timer.unref()
      return this
    },
    stop() {
      stopped = true
      io = null
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    getLatest: () => latest,
    pollOnce,
    getStatus() {
      return {
        polling: timer !== null,
        room,
        pollMs,
        subscribers: roomSize(io, room),
        lastPriceAt: latest ? latest.asOf : null,
        // How old `lastPriceAt` is right now. On a room that has been empty
        // this grows without bound — that is the polling gate working, not a
        // stall, and it is what `subscribe:price` compares against `pollMs` to
        // decide whether to serve this snapshot or read a fresh one.
        snapshotAgeMs: latest ? Date.now() - Date.parse(latest.asOf) : null,
        source: latest ? latest.source : null,
      }
    },
  }
}

let activeFeed = null

/** Start the process-wide price feed; returns the stop half of shutdown. */
function startPriceFeed(socketServer, options = {}) {
  if (activeFeed) return activeFeed.stop.bind(activeFeed)
  const feed = createPriceFeed(options)
  activeFeed = feed
  feed.start(socketServer)
  return () => {
    feed.stop()
    if (activeFeed === feed) activeFeed = null
  }
}

/**
 * Cached snapshot for the join primer, synchronously. Null until the first
 * snapshot lands — and on a room that has been empty, possibly old. Callers
 * must run it through `isSnapshotCurrent` before treating it as current.
 */
function getLatestPriceSnapshot() {
  return activeFeed ? activeFeed.getLatest() : null
}

function getPriceFeedStatus() {
  // pollMs is reported even before a feed starts, so a caller that only wants
  // the freshness window (subscribe:price) does not have to duplicate the
  // default.
  return activeFeed
    ? { started: true, ...activeFeed.getStatus() }
    : { started: false, polling: false, room: DEFAULT_ROOM, pollMs: DEFAULT_POLL_MS, subscribers: 0, lastPriceAt: null, snapshotAgeMs: null, source: null }
}

/**
 * Whether a snapshot the feed is still holding can honestly be handed to a new
 * subscriber as "the current price".
 *
 * The feed only talks to the chain while `price:updates` has somebody in it, so
 * after a quiet period the newest snapshot the process holds is exactly as old
 * as that gap — measured live at eleven minutes on a backend whose room had
 * emptied. Serving that to a joiner produces a panel that looks populated and
 * is a lie about now, and because the next ticks find an unchanged price,
 * `changed()` correctly declines to re-emit, so it stays that way. Past one
 * poll interval the caller reads a fresh snapshot instead.
 */
function isSnapshotCurrent(snapshot, pollMs = DEFAULT_POLL_MS) {
  if (!snapshot || !snapshot.asOf) return false
  const age = Date.now() - Date.parse(snapshot.asOf)
  return Number.isFinite(age) && age <= pollMs
}

module.exports = {
  buildSnapshot,
  createPriceFeed,
  startPriceFeed,
  getLatestPriceSnapshot,
  getPriceFeedStatus,
  isSnapshotCurrent,
  changeFromHistory,
}
