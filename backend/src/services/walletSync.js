/**
 * Wallet state cache and push — the server half of the `wallet:<address>` room.
 *
 * What this file used to be:
 *
 *   const walletSyncService = { getCachedWallet: (address) => null };
 *
 * `index.js` still had the primer branch that reads it ("Task 5.6: send cached
 * wallet data if available / walletSyncService maintains cache of recent wallet
 * states") — a comment describing a cache that did not exist, in a branch that
 * could never run. Nothing ever emitted `wallet:update` either, so the room the
 * client joins was structurally dead: the wallet page could only ever show a
 * balance it had fetched itself.
 *
 * What it does now:
 * - `snapshot(address)` reads the on-chain MLCN balance through
 *   `mallcoinService.getWalletBalance`, which is Redis-cached for 30 seconds, so
 *   an event-triggered read is not an extra chain hit per update.
 * - A short in-process TTL map feeds the synchronous join primer in `index.js`.
 *   The primer exists to avoid a flicker on mount, so it must never hand out a
 *   balance older than the TTL — a stale figure presented as current is worse
 *   than no figure, and the client falls back to fetching.
 * - `publish(address)` reads a fresh snapshot and emits it to that wallet's
 *   room. Called from the ledger funnel (services/liquidityActivityService.js)
 *   when a movement involving that address settles, which is the moment the
 *   balance actually changes.
 *
 * Privacy: `subscribe:wallet` verifies that the socket is authenticated AND that
 * the address belongs to the signed-in account (index.js), so a balance only
 * ever reaches its owner. The amounts here are the same ones that account's own
 * REST calls already return.
 */
const { getWalletBalance } = require('./mallcoinService')
const logger = require('../utils/logger')

// Slightly longer than mallcoinService's 30s chain cache, so a primer served
// from here is never staler than the number the REST path would have returned.
const CACHE_TTL_MS = Number(process.env.WALLET_SYNC_TTL_MS || 45000)
const MAX_CACHED_WALLETS = 500

/**
 * address → { data, at }. Module-level because the join primer is synchronous
 * and lives in index.js; the publish path writes into it so a subscriber that
 * connects right after an event gets the value that event produced.
 */
const cache = new Map()

function roomFor(address) {
  return `wallet:${address}`
}

function remember(address, data) {
  cache.set(address, { data, at: Date.now() })
  // Insertion order makes the first key the oldest entry, which is a cheap
  // approximation of LRU that is good enough for a 500-wallet primer cache.
  if (cache.size > MAX_CACHED_WALLETS) {
    const oldest = cache.keys().next().value
    if (oldest && oldest !== address) cache.delete(oldest)
  }
  return data
}

/**
 * Balance in the units the client displays. `*Display` fields come from
 * mallcoinService's base-unit conversion (6 decimals), so the socket and
 * GET /api/wallet/balance describe the same number the same way.
 */
function toWalletData(address, balance) {
  return {
    address,
    balances: {
      mlcns: Number(balance.balanceDisplay ?? 0),
      mlcnsAvailable: Number(balance.availableDisplay ?? 0),
      mlcnsLocked: Number(balance.lockedDisplay ?? 0),
    },
    // The client's WalletData.timestamp is a unix-milliseconds number, and it
    // is what a "updated Ns ago" label reads. Not an ISO string.
    timestamp: Date.now(),
    denom: balance.denom || 'MLCNS',
    exists: balance.exists !== false,
  }
}

/**
 * Fresh snapshot for one address, written to the primer cache. Returns null
 * when the balance could not be read — callers must not publish an unknown as
 * zero.
 */
async function snapshot(address) {
  if (!address) return null
  try {
    const balance = await getWalletBalance(address)
    if (!balance) return null
    return remember(address, toWalletData(address, balance))
  } catch (err) {
    logger.warn('walletSync', 'Balance snapshot failed', err, { address })
    return null
  }
}

/**
 * Synchronous primer for a socket that just joined. Null when nothing was
 * cached, when the address is unknown, or when the entry aged past the TTL —
 * all three mean "let the client fetch", which is the honest fallback.
 */
function getCachedWallet(address) {
  const entry = address ? cache.get(address) : null
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(address)
    return null
  }
  return entry.data
}

function roomSize(io, room) {
  try {
    return io?.sockets?.adapter?.rooms?.get?.(room)?.size ?? 0
  } catch {
    return 0
  }
}

/**
 * Read the new balance and push it to whoever is watching this wallet.
 *
 * Fire-and-forget from the money paths: it returns a boolean-ish result but
 * must never be awaited for a financial outcome, and a failure here only costs
 * a live update — the client's own fetch still shows the truth.
 */
async function publish(address, io) {
  if (!address) return null
  const socketServer = io || global.io
  const data = await snapshot(address)
  if (!data) return null
  if (socketServer && roomSize(socketServer, roomFor(address)) > 0) {
    try {
      socketServer.to(roomFor(address)).emit('wallet:update', data)
    } catch (err) {
      logger.warn('walletSync', 'wallet:update emit failed', err, { address })
    }
  }
  return data
}

/** Drops an address from the primer cache (wallet reset, logout, GDPR erasure). */
function forget(address) {
  if (!address) return false
  return cache.delete(address)
}

function getStatus() {
  return {
    cachedWallets: cache.size,
    ttlMs: CACHE_TTL_MS,
  }
}

function clearCache() {
  cache.clear()
}

module.exports = {
  snapshot,
  getCachedWallet,
  publish,
  forget,
  getStatus,
  // Tests only: the cache is module-level, so a case that asserts TTL behaviour
  // needs a way to start from an empty map.
  clearCache,
  roomFor,
}
