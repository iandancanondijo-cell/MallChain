/**
 * priceEngine — the `price:updates` feed.
 *
 * The module this replaces was `{ getMarketData: () => ({ mallcoin: { usd: 0,
 * kes: 0 }, mlpts: { usd: 0, kes: 2 } }) }`, which index.js handed to every
 * subscriber. Nothing here is about that object except as the reason the cases
 * below are written the way they are: a price feed has to be unable to say zero
 * by accident, unable to say "0 USD" when the FX provider is down, and unable to
 * claim a flat market when it simply has no history yet.
 */
jest.mock('../services/mallcoinService', () => ({ getMarketPrice: jest.fn() }))
jest.mock('../services/economyConstants', () => ({ getMallpointPriceKes: jest.fn(() => 2) }))
jest.mock('../services/fxService', () => ({ getFxRate: jest.fn() }))
jest.mock('../models/LiquidityPoolActivity', () => ({ aggregate: jest.fn() }))
jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const { getMarketPrice } = require('../services/mallcoinService')
const { getFxRate } = require('../services/fxService')
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')
const {
  buildSnapshot,
  createPriceFeed,
  changeFromHistory,
  isSnapshotCurrent,
} = require('../services/priceEngine')

const CHAIN_PRICE = {
  buyPriceKes: 0.62,
  sellPriceKes: 0.58,
  midPriceKes: 0.6,
}

function chainUp() {
  getMarketPrice.mockResolvedValue({ ...CHAIN_PRICE, fallback: false })
}

function fxUp() {
  getFxRate.mockResolvedValue({ base: 'KES', quote: 'USD', rate: 0.0077, date: 'Wed, 11 Nov 2026' })
}

function ledgerHas(rows) {
  LiquidityPoolActivity.aggregate.mockResolvedValue(rows)
}

beforeEach(() => {
  jest.clearAllMocks()
  chainUp()
  fxUp()
  ledgerHas([{ _id: null, mlcns: 1234.5, kes: 740.7, trades: 9 }])
})

describe('buildSnapshot', () => {
  test('carries the on-chain spread rather than a constant', async () => {
    const snap = await buildSnapshot([])

    expect(snap.buyPriceKes).toBe(0.62)
    expect(snap.sellPriceKes).toBe(0.58)
    expect(snap.midPriceKes).toBe(0.6)
    expect(snap.mlptsPriceKes).toBe(2)
    expect(snap.source).toBe('chain')
    // The stub's signature value. A snapshot that reports either price as 0 is
    // indistinguishable from a market with no trading, which is why this is
    // pinned rather than left to the readers.
    expect(snap.buyPriceKes).not.toBe(0)
    expect(snap.midPriceKes).not.toBe(0)
  })

  test('derives USD from the live FX rate, not from a stored dollar figure', async () => {
    const snap = await buildSnapshot([])

    expect(snap.usd.rate).toBe(0.0077)
    expect(snap.usd.midPriceUsd).toBeCloseTo(0.6 * 0.0077, 8)
    expect(snap.usd.mlptsPriceUsd).toBeCloseTo(2 * 0.0077, 8)
    expect(snap.usd.fxAsOf).toBe('Wed, 11 Nov 2026')
  })

  test('omits USD entirely when the FX provider fails', async () => {
    getFxRate.mockRejectedValue(new Error('FX provider returned an unexpected response'))

    const snap = await buildSnapshot([])

    // null, not 0: a zero-dollar quote would be the same lie the stub told,
    // just with a live KES number attached to make it look sourced.
    expect(snap.usd).toBeNull()
    expect(snap.midPriceKes).toBe(0.6)
  })

  test('reports the configured fallback as the fallback, with real numbers', async () => {
    // What mallcoinService returns when the node is unreachable: the configured
    // buy/sell spread and fallback: true. Not zeros.
    getMarketPrice.mockResolvedValue({
      buyPriceKes: 0.62, sellPriceKes: 0.58, midPriceKes: 0.6, fallback: true,
    })

    const snap = await buildSnapshot([])

    expect(snap.source).toBe('configured-default')
    expect(snap.midPriceKes).toBe(0.6)
  })

  test('takes 24h volume from the ledger', async () => {
    const snap = await buildSnapshot([])

    expect(snap.volume24h).toEqual({ mlcns: 1234.5, kes: 740.7, trades: 9 })
    // Only settled buys count as traded volume; informational rows (rewards,
    // P2P transfers, faucet grants, refunds) must not inflate it.
    expect(LiquidityPoolActivity.aggregate).toHaveBeenCalledWith([
      { $match: { flow: 'buy', status: 'success', recordedAt: { $gte: expect.any(Date) } } },
      { $group: { _id: null, mlcns: { $sum: '$amountMlcns' }, kes: { $sum: '$fiatAmount' }, trades: { $sum: 1 } } },
    ])
  })

  test('says volume is unknown instead of calling it zero when the read fails', async () => {
    LiquidityPoolActivity.aggregate.mockRejectedValue(new Error('mongo down'))

    const snap = await buildSnapshot([])

    expect(snap.volume24h).toBeNull()
    // The price is the reason the room exists, so a volume failure still
    // leaves a usable snapshot.
    expect(snap.midPriceKes).toBe(0.6)
  })

  test('leaves change24h null until there is a window to compare against', async () => {
    const snap = await buildSnapshot([])
    expect(snap.change24h).toBeNull()

    const twoSamples = [
      { ts: Date.now() - 3600_000, mid: 0.5 },
      { ts: Date.now(), mid: 0.6 },
    ]
    const withHistory = await buildSnapshot(twoSamples)
    expect(withHistory.change24h).toBeCloseTo(20, 6)
  })

  test('ignores samples older than the 24h window instead of quoting them as 24h change', async () => {
    // Three days ago at 0.4, then two inside the window. If the stale sample
    // were used as the comparison point the answer would be +50%; against the
    // oldest in-window sample it is +9.09%. Two in-window samples are required
    // because changeFromHistory answers null rather than inventing a "flat"
    // comparison out of one data point.
    const samples = [
      { ts: Date.now() - 3 * 86_400_000, mid: 0.4 },
      { ts: Date.now() - 12 * 3600_000, mid: 0.55 },
      { ts: Date.now() - 6 * 3600_000, mid: 0.6 },
    ]
    // 4 decimals is the rounding the snapshot itself applies to a percentage.
    expect(changeFromHistory(samples, 0.6)).toBeCloseTo((0.6 - 0.55) / 0.55 * 100, 4)

    // And a window holding a single sample is not a change at all.
    expect(changeFromHistory([samples[1]], 0.6)).toBeNull()
  })
})

describe('createPriceFeed', () => {
  // `start()` primes the snapshot without returning the promise (a boot path
  // must not block the listen callback), so every case below has to let that
  // in-flight read finish before it looks at what got emitted. Pumps
  // microtasks rather than immediates because four of these cases run under
  // fake timers, which also fake setImmediate.
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  }

  const makeIo = (subscribers = 1) => {
    const emitted = []
    return {
      emitted,
      subscribers,
      sockets: { adapter: { rooms: new Map([['price:updates', new Set(Array.from({ length: subscribers }, (_, i) => `s${i}`))]]) } },
      to() {
        const room = this
        return {
          emit(event, payload) { emitted.push({ event, payload }); return room },
        }
      },
    }
  }

  test('publishes the first snapshot immediately so a joiner is not left blank', async () => {
    jest.useFakeTimers()
    const io = makeIo(2)
    const feed = createPriceFeed({ pollMs: 30_000 })
    feed.start(io)
    await flush()

    const priceEvents = io.emitted.filter((e) => e.event === 'price:current')
    expect(priceEvents).toHaveLength(1)
    expect(priceEvents[0].payload.midPriceKes).toBe(0.6)
    feed.stop()
    jest.useRealTimers()
  })

  test('does not re-emit while only the volume moved', async () => {
    const io = makeIo(1)
    const feed = createPriceFeed({ pollMs: 60_000 })
    feed.start(io)
    await flush()
    const before = io.emitted.length

    ledgerHas([{ _id: null, mlcns: 9999, kes: 1, trades: 1 }])
    await feed.pollOnce()

    // A panel that re-rendered on every volume tick would look alive while
    // saying nothing had changed. Price movement is the trigger.
    expect(io.emitted).toHaveLength(before)
    feed.stop()
  })

  test('emits when the chain price moves', async () => {
    const io = makeIo(1)
    const feed = createPriceFeed({ pollMs: 60_000 })
    feed.start(io)
    await flush()
    const before = io.emitted.length

    getMarketPrice.mockResolvedValue({ buyPriceKes: 0.66, sellPriceKes: 0.62, midPriceKes: 0.64 })
    await feed.pollOnce()

    expect(io.emitted).toHaveLength(before + 1)
    expect(feed.getLatest().midPriceKes).toBe(0.64)
    feed.stop()
  })

  test('asks the chain nothing while nobody is subscribed', async () => {
    jest.useFakeTimers()
    const io = makeIo(0)
    const feed = createPriceFeed({ pollMs: 10_000 })
    feed.start(io)
    await flush()
    getMarketPrice.mockClear()

    await jest.advanceTimersByTimeAsync(50_000)

    // The primer above is a deliberate boot read; what must not happen is a
    // timer that keeps querying the node for an empty room.
    expect(getMarketPrice).not.toHaveBeenCalled()
    feed.stop()
    jest.useRealTimers()
  })

  // The other half of the gate above, and the one the mock-`io` unit tests were
  // originally missing entirely: with a subscriber in the room the timer has to
  // actually fire. Verified separately against a real Socket.IO adapter (a room
  // joined by a live client, not a Map stand-in) because the mock could pass
  // while `roomSize` read a path the real adapter never populates.
  test('polls on its interval while somebody is in the room', async () => {
    jest.useFakeTimers()
    const io = makeIo(1)
    const feed = createPriceFeed({ pollMs: 10_000 })
    feed.start(io)
    await flush()
    getMarketPrice.mockClear()

    await jest.advanceTimersByTimeAsync(25_000)

    expect(getMarketPrice).toHaveBeenCalledTimes(2)
    expect(feed.getStatus().subscribers).toBe(1)
    feed.stop()
    jest.useRealTimers()
  })

  test('getStatus publishes the freshness window the join primer needs', async () => {
    jest.useFakeTimers()
    const io = makeIo(1)
    const feed = createPriceFeed({ pollMs: 15_000 })
    feed.start(io)
    await flush()

    const status = feed.getStatus()
    expect(status.pollMs).toBe(15_000)
    expect(status.snapshotAgeMs).toBe(0)

    jest.advanceTimersByTime(40_000)
    expect(feed.getStatus().snapshotAgeMs).toBe(40_000)
    feed.stop()
    jest.useRealTimers()
  })

  test('keeps the last good snapshot when a read throws', async () => {
    const io = makeIo(1)
    const feed = createPriceFeed({ pollMs: 60_000 })
    feed.start(io)
    await flush()
    const good = feed.getLatest()

    getMarketPrice.mockRejectedValue(new Error('unexpected'))
    const after = await feed.pollOnce()

    // Falling back to zeros here is exactly how the stub behaved, and it is
    // indistinguishable from a collapse for anyone reading the panel.
    expect(after).toBe(good)
    expect(feed.getLatest().midPriceKes).toBe(0.6)
    feed.stop()
  })

  test('stop() clears the timer and releases the server', async () => {
    jest.useFakeTimers()
    const io = makeIo(3)
    const feed = createPriceFeed({ pollMs: 10_000 })
    feed.start(io)
    await flush()
    getMarketPrice.mockClear()
    feed.stop()

    await jest.advanceTimersByTimeAsync(60_000)
    expect(getMarketPrice).not.toHaveBeenCalled()
    expect(feed.getStatus().polling).toBe(false)
    jest.useRealTimers()
  })
})

describe('isSnapshotCurrent', () => {
  // index.js's subscribe:price serves the feed's held snapshot so that joining
  // is instant. That is only honest while the feed has been polling: the timer
  // stops for an empty room, so after a quiet gap the newest snapshot in
  // process is exactly as old as that gap (eleven minutes, measured live). The
  // handler asks this function instead of trusting `getLatest()` not being null.
  const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

  test('a snapshot inside the poll window is current', () => {
    expect(isSnapshotCurrent({ asOf: at(-5_000) }, 30_000)).toBe(true)
  })

  test('a snapshot from before a quiet gap is not', () => {
    expect(isSnapshotCurrent({ asOf: at(-11 * 60_000) }, 30_000)).toBe(false)
  })

  test('nothing to compare against is never current', () => {
    expect(isSnapshotCurrent(null, 30_000)).toBe(false)
    expect(isSnapshotCurrent({}, 30_000)).toBe(false)
    expect(isSnapshotCurrent({ asOf: 'not a date' }, 30_000)).toBe(false)
  })
})
