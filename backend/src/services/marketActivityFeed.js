/**
 * Market activity feed — the server half of the `market:feed` room.
 *
 * What this file used to be:
 *
 *   const marketFeed = { getRecentEvents: (limit) => [] };
 *
 * `index.js` emitted that array to everybody who emitted `subscribe:market`, so
 * the room's entire content was a promise of an empty feed. No page consumed it
 * (which is why nobody noticed), and the wire was there waiting for numbers
 * that were never filled in.
 *
 * Real sources, both already written by the flows they describe:
 * - `models/LiquidityPoolActivity` — every value movement in the economy lands
 *   here (services/liquidityActivityService.js is the single funnel), so
 *   settled purchases and cash-outs are facts already in the database rather
 *   than something this module has to estimate.
 * - `models/MarketplaceListing` — storefront listings created through
 *   routes/marketplaceCatalog.js.
 *
 * What is deliberately NOT here:
 * - Seller or buyer identity. This room is joined by anonymous sockets, so a
 *   row carries a token amount, a flow and a timestamp — no userId, no wallet
 *   address, no phone. The on-chain hash is included because that movement is
 *   already public in the explorer; anyone can verify the row against it.
 * - Fiat amounts. The KES figure a person paid is theirs, not market colour.
 * - `type: 'sale'` events. Marketplace checkout settles in on-chain escrow
 *   (x/marketplace) and is read back from the chain by
 *   controllers/escrowController.js; there is no local sale ledger, so this
 *   module does not invent one. Until an escrow event source exists, the feed
 *   says nothing about sales rather than saying something unverified.
 * - Transfers, faucet grants, rewards and refunds. Those are informational
 *   ledger rows (see the affectsReserves comment in the model); publishing P2P
 *   movements as "market activity" would both mislabel them and expose one
 *   person's transfer timing to another's screen.
 */
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')
const MarketplaceListing = require('../models/MarketplaceListing')
const logger = require('../utils/logger')

const DEFAULT_ROOM = 'market:feed'
const MAX_EVENTS = 100
const DEFAULT_LIMIT = 20

// Ledger flows that describe a market action rather than bookkeeping. 'buy' is
// a credited MLCN purchase, 'withdraw' is a settled cash-out (the sell side of
// the same market), 'mallpoints_purchase' is buying Mallpoints with MLCN.
const TRADE_FLOWS = ['buy', 'withdraw', 'mallpoints_purchase', 'mallpoints_convert']

/**
 * A ledger row → a trade event. `creditTxHash` is the first hash that exists on
 * a row (a buy credits the buyer, a withdrawal pays out), and it is what lets a
 * viewer check the event against the chain instead of taking the server's word.
 */
function toTradeEvent(row) {
  const amount = Number(row?.amountMlcns || 0)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return {
    id: String(row._id || row.creditTxHash || `${row.flow}-${row.recordedAt?.getTime?.()}`),
    type: 'trade',
    flow: row.flow,
    amountMlcns: amount,
    currency: row.currency || 'KES',
    timestamp: row.recordedAt ? new Date(row.recordedAt).toISOString() : new Date().toISOString(),
    txHash: row.creditTxHash || row.liquidityTxHash || row.sellTxHash || null,
  }
}

/** A catalog listing → a listing event. Priced in MAL, the escrow denom. */
function toListingEvent(listing) {
  const price = Number(listing?.price || 0)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    id: String(listing._id || listing.listingId || ''),
    type: 'listing',
    title: String(listing.title || '').slice(0, 120),
    category: listing.category || 'other',
    price,
    currency: 'MAL',
    timestamp: new Date(listing.createdAt || Date.now()).toISOString(),
  }
}

/**
 * Most recent activity, newest first, trades and listings merged on their
 * timestamps. Both reads are indexed on the fields they filter by
 * (recordedAt / status+createdAt), so this stays a bounded query rather than a
 * collection scan dressed up as a feed.
 */
async function getRecentEvents(limit = DEFAULT_LIMIT) {
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_EVENTS)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [ledger, listings] = await Promise.all([
    LiquidityPoolActivity.find({
      flow: { $in: TRADE_FLOWS },
      status: 'success',
      recordedAt: { $gte: since },
    })
      .sort({ recordedAt: -1 })
      .limit(cap)
      .lean()
      .catch((err) => {
        logger.warn('marketActivityFeed', 'Ledger read failed', err, {})
        return []
      }),
    MarketplaceListing.find({ status: 'active', createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(cap)
      .lean()
      .catch((err) => {
        logger.warn('marketActivityFeed', 'Listing read failed', err, {})
        // An empty backlog is a truthful answer; a thrown error would take the
        // trade events down with it.
        return []
      }),
  ])

  const events = [
    ...ledger.map(toTradeEvent),
    ...listings.map(toListingEvent),
  ].filter(Boolean)

  return events
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, cap)
}

function roomSize(io, room) {
  try {
    return io?.sockets?.adapter?.rooms?.get?.(room)?.size ?? 0
  } catch {
    return 0
  }
}

/**
 * Holds the io reference so the money paths can publish without threading a
 * socket server through every call site.
 */
function createMarketFeed(options = {}) {
  const room = options.room || DEFAULT_ROOM
  let io = null

  return {
    start(socketServer) {
      io = socketServer
      return this
    },
    stop() {
      io = null
    },
    /**
     * Broadcast one event to the room. Never throws: this is called from inside
     * settlement paths, and a socket problem must not fail a payment that has
     * already been recorded.
     */
    publish(event) {
      if (!io || !event) return false
      try {
        if (roomSize(io, room) === 0) return false
        // `market:feed` stays the primer (an array, sent on join, matching what
        // the client's onMarketFeed expects); live rows arrive as `market:event`
        // so a listener can tell a backlog page from something that just
        // happened. Both shapes are documented in socket.ts.
        io.to(room).emit('market:event', event)
        return true
      } catch (err) {
        logger.warn('marketActivityFeed', 'Publish failed', err, { room })
        return false
      }
    },
    getRoom: () => room,
  }
}

let activeFeed = null

function startMarketFeed(socketServer, options = {}) {
  if (activeFeed) return activeFeed.stop.bind(activeFeed)
  const feed = createMarketFeed(options)
  activeFeed = feed
  feed.start(socketServer)
  return () => {
    feed.stop()
    if (activeFeed === feed) activeFeed = null
  }
}

/**
 * Publish from anywhere in the backend — the ledger funnel and the catalog
 * route use this. Fire-and-forget by design; callers must not await socket
 * delivery for a financial result.
 */
function publishMarketEvent(event) {
  if (!activeFeed) return false
  return activeFeed.publish(event)
}

module.exports = {
  getRecentEvents,
  toTradeEvent,
  toListingEvent,
  createMarketFeed,
  startMarketFeed,
  publishMarketEvent,
  TRADE_FLOWS,
}
