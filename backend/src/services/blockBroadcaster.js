/**
 * Realtime block feed — the server half of the `blocks:live` room.
 *
 * Clients (see mallchain-os-v14/src/services/socket.ts) emit
 * `subscribe:blocks`, join `blocks:live` and wait for `block:new`. The join was
 * implemented and logged from day one, but nothing ever emitted the event, so
 * every "live" block panel was actually a poll: the explorer page sat on a 10s
 * `setInterval` while the chain produced a block every ~5s, and the height
 * visibly ticked two blocks at a time. This module is the missing emitter.
 *
 * How it gets blocks: it subscribes to the node's Tendermint event websocket
 * (`/websocket`, query `tm.event = 'NewBlock'`), which is push-based and costs
 * one connection for the whole backend rather than a request per client per
 * tick. A slow REST poll runs alongside it as the safety net, and asks the node
 * a question only while the push path is quiet — the socket is down, or it
 * connected but has delivered nothing for `BLOCK_BROADCAST_STALL_MS` (a node
 * with its event index disabled accepts the subscription and then says nothing,
 * which looks identical from the client's side). The poll is skipped entirely
 * while nobody is in the room, so an idle backend does no chain traffic here at
 * all.
 *
 * The payload carries the fields the explorer renders (height, hash, tx count,
 * proposer, block time in both ISO and unix form) on purpose: a client that can
 * paint a new block from the socket event alone does not need to spend a REST
 * round-trip per block, which is what the 10s poll was doing.
 */
const WebSocket = require('ws')
const axios = require('axios')
const { config } = require('../config')
const logger = require('../utils/logger')

const DEFAULT_WS_URL = `${(config.chain.rpc || 'http://127.0.0.1:26657').replace(/\/$/, '').replace(/^http/, 'ws')}/websocket`
const DEFAULT_REST_URL = (config.chain.rest || 'http://127.0.0.1:1317').replace(/\/$/, '')
const BLOCKS_LATEST_PATH = '/cosmos/base/tendermint/v1beta1/blocks/latest'

const MIN_BACKOFF_MS = Number(process.env.BLOCK_BROADCAST_MIN_BACKOFF_MS || 1000)
const MAX_BACKOFF_MS = Number(process.env.BLOCK_BROADCAST_MAX_BACKOFF_MS || 30000)
const FALLBACK_POLL_MS = Number(process.env.BLOCK_BROADCAST_FALLBACK_POLL_MS || 5000)
const STALL_MS = Number(process.env.BLOCK_BROADCAST_STALL_MS || 20000)
const FETCH_TIMEOUT_MS = Number(process.env.BLOCK_BROADCAST_FETCH_TIMEOUT_MS || 8000)

/**
 * Tendermint/CometBFT hashes travel as base64; the explorer displays uppercase
 * hex, which is also what the REST-based block endpoints return. Converting
 * here keeps socket data comparable with REST data on the client.
 */
function decodeHash(b64OrHex) {
  if (!b64OrHex) return ''
  if (/^[0-9a-fA-F]{64}$/.test(b64OrHex)) return b64OrHex.toUpperCase()
  const bytes = Buffer.from(b64OrHex, 'base64')
  // A CometBFT block hash is 32 bytes. Anything else was not a hash to begin
  // with, and rendering its base64 bytes as hex would invent one that looks
  // plausible in the UI.
  if (bytes.length === 32) return bytes.toString('hex').toUpperCase()
  return String(b64OrHex)
}

/**
 * Same normalization for a validator address (20 bytes). This one has to
 * tolerate both encodings because the node itself is inconsistent: the
 * `NewBlock` event JSON sends `proposer_address` as hex while the REST/RPC
 * block responses send it as base64. Normalizing here means the block list
 * shows one format no matter which path a row arrived on.
 */
function decodeAddress(b64OrHex) {
  if (!b64OrHex) return ''
  if (/^[0-9a-fA-F]{40}$/.test(b64OrHex)) return b64OrHex.toUpperCase()
  const bytes = Buffer.from(b64OrHex, 'base64')
  if (bytes.length === 20) return bytes.toString('hex').toUpperCase()
  return String(b64OrHex)
}

function toIso(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Normalize `{block, block_id}` — the shape the NewBlock event's `value` uses
 * and the shape the REST block endpoint wraps at the top level — into the
 * socket payload. Returns null for anything without a numeric height, because
 * an event we cannot date is worse than no event: the client dedupes on height
 * and would silently prefer it.
 */
function normalizeBlockValue(value) {
  const header = value?.block?.header
  const height = Number(header?.height)
  if (!Number.isFinite(height) || height <= 0) return null

  const txs = value?.block?.data?.txs
  const txCount = Array.isArray(txs) ? txs.length : 0
  const timestamp = toIso(header?.time)

  return {
    height,
    hash: decodeHash(value?.block_id?.hash),
    // `timestamp` is the field the client's BlockData contract has always
    // declared; the rest of the fields let a page render the block without a
    // follow-up REST call.
    timestamp,
    unixTime: timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : 0,
    txCount,
    numTxs: txCount,
    // Normalized to uppercase hex — see decodeAddress. Live-verified against
    // this node: the `NewBlock` event sends `proposer_address` as hex while
    // /cosmos/…/blocks/latest sends the same address as base64, so a socket row
    // and a polled row used to disagree in the same list.
    proposer: decodeAddress(header?.proposer_address),
    chainId: header?.chain_id || config.chain.id || null,
    source: 'ws',
  }
}

function roomSize(io, room) {
  try {
    return io?.sockets?.adapter?.rooms?.get?.(room)?.size ?? 0
  } catch {
    return 0
  }
}

/**
 * Create the feed. `start(io)` begins delivery; the returned `stop()` closes
 * the websocket and clears every timer, which is what graceful shutdown needs
 * (the previous listener left its loop running, so a restarting process could
 * briefly hold two pollers).
 */
function createBlockFeed(options = {}) {
  const room = options.room || 'blocks:live'
  const wsUrl = options.wsUrl || DEFAULT_WS_URL
  const restUrl = options.restUrl || DEFAULT_REST_URL
  const minBackoffMs = options.minBackoffMs ?? MIN_BACKOFF_MS
  const maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS
  const fallbackPollMs = options.fallbackPollMs ?? FALLBACK_POLL_MS
  const stallMs = options.stallMs ?? STALL_MS

  let io = null
  let socket = null
  let stopped = true
  let reconnectAttempts = 0
  let reconnectTimer = null
  let pollTimer = null
  let lastHeight = 0
  let lastBlockAtMs = 0
  let latest = null
  let fetching = false

  function publish(block, source) {
    const payload = { ...block, source }
    latest = payload
    lastHeight = payload.height
    lastBlockAtMs = Date.now()
    if (io) io.to(room).emit('block:new', payload)
  }

  // Duplicate/backwards deliveries are real: a resubscribe replays the current
  // height, and an event websocket can hand over the same block after the
  // fallback poll already saw it.
  function accept(height) {
    return Number.isFinite(height) && height > lastHeight
  }

  /**
   * Whether this tick should actually talk to the node. The push path is the
   * intended source of blocks; polling exists for the two ways it can be
   * silently dead — the websocket is down, or it connected and the node never
   * delivers events (an operator can turn the event index off, and the
   * subscription is accepted either way). Both are invisible from the client's
   * side, which is exactly the shape of the original bug.
   */
  function pushIsQuiet() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return true
    return Date.now() - lastBlockAtMs > stallMs
  }

  async function pollOnce() {
    if (stopped || fetching) return
    // No listeners, no chain traffic. The websocket stays subscribed either
    // way; only the polling path is guarded, since that is the one that costs
    // the node a request per tick.
    if (roomSize(io, room) === 0) return
    if (!pushIsQuiet()) return
    fetching = true
    try {
      const res = await axios.get(`${restUrl}${BLOCKS_LATEST_PATH}`, { timeout: FETCH_TIMEOUT_MS })
      const block = normalizeBlockValue(res.data)
      if (block && accept(block.height)) publish(block, 'rest')
    } catch (err) {
      logger.warn('blockBroadcaster', 'Fallback block poll failed', err, { restUrl })
    } finally {
      fetching = false
    }
  }

  function startPollingLoop() {
    if (pollTimer || stopped) return
    pollTimer = setInterval(() => {
      pollOnce()
    }, fallbackPollMs)
    if (typeof pollTimer.unref === 'function') pollTimer.unref()
  }

  function stopPollingLoop() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return
    const delay = Math.min(minBackoffMs * 2 ** reconnectAttempts, maxBackoffMs)
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
    if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref()
    logger.info('blockBroadcaster', 'Reconnecting to block events', { delayMs: delay, wsUrl })
  }

  function connect() {
    if (stopped) return
    let active
    try {
      active = new WebSocket(wsUrl)
    } catch (err) {
      logger.error('blockBroadcaster', 'Failed to open block event socket', err, { wsUrl })
      scheduleReconnect()
      return
    }
    socket = active

    active.on('open', () => {
      reconnectAttempts = 0
      active.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'subscribe',
          params: { query: "tm.event = 'NewBlock'" },
        })
      )
      logger.info('blockBroadcaster', 'Subscribed to NewBlock events', { wsUrl })
    })

    active.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.id === 1 && msg.error) {
        logger.error('blockBroadcaster', 'Node rejected the NewBlock subscription', new Error(JSON.stringify(msg.error)), { wsUrl })
        return
      }
      const value = msg.result?.data?.value
      const events = msg.result?.events?.['tm.event']
      if (!value?.block) return
      if (Array.isArray(events) && !events.includes('NewBlock')) return
      const block = normalizeBlockValue(value)
      if (!block) {
        logger.warn('blockBroadcaster', 'Ignored a NewBlock event without a usable height', { wsUrl })
        return
      }
      if (!accept(block.height)) return
      publish(block, 'ws')
    })

    const onDown = (reason) => {
      if (socket === active) socket = null
      if (stopped) return
      scheduleReconnect()
      logger.warn('blockBroadcaster', 'Block event socket down', new Error(reason), { wsUrl })
    }
    active.on('close', () => onDown('closed'))
    active.on('error', (err) => {
      // 'error' is always followed by 'close'; log once.
      if (!stopped) logger.warn('blockBroadcaster', 'Block event socket error', err, { wsUrl })
    })
  }

  return {
    /** Begin delivering `block:new` to `room`. Safe to call once per process. */
    start(socketServer) {
      if (io) return this
      io = socketServer
      stopped = false
      connect()
      startPollingLoop()
      // Prime the cache so a subscriber that joins between two blocks still
      // gets an immediate first paint instead of waiting for the next height.
      pollOnce()
      return this
    },
    stop() {
      stopped = true
      io = null
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      stopPollingLoop()
      if (socket) {
        try {
          socket.close()
        } catch {
          /* already gone */
        }
        socket = null
      }
    },
    /** Most recent block published, or null before the first one. */
    getLatest() {
      return latest
    },
    // Exposed for tests and for an operator-facing readiness check.
    pollOnce,
    getStatus() {
      return {
        connected: socket !== null && socket.readyState === WebSocket.OPEN,
        polling: pollTimer !== null,
        // True whenever the push path can't be relied on right now, which is
        // what makes the poll actually issue requests.
        pushQuiet: pushIsQuiet(),
        lastHeight,
        lastBlockAt: lastBlockAtMs ? new Date(lastBlockAtMs).toISOString() : null,
        wsUrl,
      }
    },
  }
}

let activeFeed = null

/**
 * Start the process-wide block feed for this Socket.IO server and return the
 * `stop` half of the graceful-shutdown contract.
 */
function startBlockBroadcaster(socketServer, options = {}) {
  if (activeFeed) return activeFeed.stop.bind(activeFeed)
  const feed = createBlockFeed(options)
  activeFeed = feed
  feed.start(socketServer)
  return () => {
    feed.stop()
    if (activeFeed === feed) activeFeed = null
  }
}

function getBroadcastLatestBlock() {
  return activeFeed ? activeFeed.getLatest() : null
}

/**
 * Whether the push path is currently carrying blocks. Useful when a "live"
 * panel looks frozen: `pushQuiet: true` with `connected: true` means the node
 * accepted the subscription and is not delivering, which is a node
 * configuration answer rather than an application one.
 */
function getBroadcastStatus() {
  return activeFeed ? { started: true, ...activeFeed.getStatus() } : { started: false }
}

module.exports = {
  createBlockFeed,
  startBlockBroadcaster,
  getBroadcastLatestBlock,
  getBroadcastStatus,
  normalizeBlockValue,
  decodeHash,
  decodeAddress,
}
