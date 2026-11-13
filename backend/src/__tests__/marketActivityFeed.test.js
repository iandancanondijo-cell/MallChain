/**
 * marketActivityFeed — the `market:feed` room.
 *
 * Replaces `{ getRecentEvents: (limit) => [] }`, which index.js emitted to every
 * subscriber as though an empty array were the market's state. The cases below
 * are therefore about two things: that rows come from the ledger and the
 * catalog that already record these events, and that a row leaves no more
 * identity behind than the explorer already publishes.
 */
jest.mock('../models/LiquidityPoolActivity', () => ({ find: jest.fn() }))
jest.mock('../models/MarketplaceListing', () => ({ find: jest.fn() }))
jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const LiquidityPoolActivity = require('../models/LiquidityPoolActivity')
const MarketplaceListing = require('../models/MarketplaceListing')
const {
  getRecentEvents,
  toTradeEvent,
  toListingEvent,
  createMarketFeed,
} = require('../services/marketActivityFeed')

/** The real driver returns a thenable chain; this mirrors the calls made. */
function chain(rows) {
  const c = {
    rows,
    sort: jest.fn(() => c),
    limit: jest.fn(() => c),
    // `lean()` is where the promise is actually returned, which is why the
    // failures below resolve to [] instead of throwing at the caller.
    lean: jest.fn(() => Promise.resolve(c.rows)),
  }
  return c
}

function buys(...specs) {
  LiquidityPoolActivity.find.mockReturnValue(
    chain(specs.map(([amount, at, extra = {}], i) => ({
      _id: `led${i}`,
      flow: 'buy',
      status: 'success',
      amountMlcns: amount,
      fiatAmount: amount * 0.6,
      currency: 'KES',
      recordedAt: at,
      creditTxHash: `HASH${i}`,
      userId: 'user-secret',
      walletAddress: 'mall1aaa',
      phone: '+254700000000',
      ...extra,
    })))
  )
}

function listings(...specs) {
  MarketplaceListing.find.mockReturnValue(
    chain(specs.map(([title, price, at], i) => ({
      _id: `lst${i}`,
      title,
      price,
      category: 'food',
      status: 'active',
      createdAt: at,
      sellerUserId: 'seller-secret',
      sellerName: 'Jane Trader',
      sellerAddress: 'mall1selleraddress',
    })))
  )
}

const HOUR = 3600_000
const hoursAgo = (h) => new Date(Date.now() - h * HOUR)

beforeEach(() => {
  jest.clearAllMocks()
  buys([])
  listings([])
})

describe('getRecentEvents', () => {
  test('merges ledger trades and catalog listings newest first', async () => {
    buys([100, hoursAgo(6)])
    listings(['Maize flour 2kg', 12.5, hoursAgo(2)])

    const events = await getRecentEvents(50)

    expect(events.map((e) => e.type)).toEqual(['listing', 'trade'])
    expect(events[0].title).toBe('Maize flour 2kg')
    expect(events[1].amountMlcns).toBe(100)
  })

  test('publishes no participant identity, even though the rows carry it', async () => {
    buys([250, hoursAgo(1)])
    listings(['Beans 1kg', 8, hoursAgo(3)])

    const events = await getRecentEvents(50)
    const serialized = JSON.stringify(events)

    // This room is joinable by an anonymous socket. The ledger row knows who
    // bought and for how much in fiat; the catalog row knows the seller's name
    // and address. None of that may leave through here — the amounts and the
    // public tx hash are the whole payload.
    for (const banned of ['user-secret', 'mall1aaa', 'mall1selleraddress', 'Jane Trader', 'seller-secret', '+254700000000']) {
      expect(serialized).not.toContain(banned)
    }
    for (const event of events) {
      for (const field of ['fiatAmount', 'userId', 'walletAddress', 'phone', 'sellerName', 'sellerAddress', 'sellerUserId', 'metadata']) {
        expect(Object.keys(event)).not.toContain(field)
      }
    }
  })

  test('asks the ledger only for settled market flows', async () => {
    await getRecentEvents(10)

    const query = LiquidityPoolActivity.find.mock.calls[0][0]
    expect(query.status).toBe('success')
    expect(query.flow.$in.sort()).toEqual(
      ['buy', 'mallpoints_convert', 'mallpoints_purchase', 'withdraw'].sort()
    )
    // A seven-day horizon, so the backlog is "what the market did this week",
    // not the whole collection sorted at request time.
    expect(query.recordedAt.$gte.getTime()).toBeLessThan(Date.now() - 6 * 24 * HOUR)
  })

  test('respects the cap after merging, not before', async () => {
    buys([1, hoursAgo(1)], [2, hoursAgo(2)], [3, hoursAgo(3)])
    listings(['A', 1, hoursAgo(4)], ['B', 2, hoursAgo(5)])

    const events = await getRecentEvents(2)

    expect(events).toHaveLength(2)
    expect(events.map((e) => e.type)).toEqual(['trade', 'trade'])
  })

  test('one unreadable source still returns the other rather than throwing', async () => {
    buys([100, hoursAgo(1)])
    MarketplaceListing.find.mockReturnValue({
      sort: function () { return this },
      limit: function () { return this },
      lean: () => Promise.reject(new Error('mongo down')),
    })

    const events = await getRecentEvents(20)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('trade')
  })

  test('an empty market is an empty array, which is now a measured answer', async () => {
    const events = await getRecentEvents(20)
    expect(events).toEqual([])
    // The point of the pin: the stub returned [] without looking. This one has
    // to have looked to know.
    expect(LiquidityPoolActivity.find).toHaveBeenCalled()
    expect(MarketplaceListing.find).toHaveBeenCalled()
  })
})

describe('event shapes', () => {
  test('a zero-amount ledger row is not a market event', () => {
    expect(toTradeEvent({ _id: 'x', flow: 'buy', status: 'success', amountMlcns: 0, recordedAt: new Date() })).toBeNull()
  })

  test('a listing without a price is not a market event', () => {
    expect(toListingEvent({ _id: 'x', title: 'Broken row', price: 0, createdAt: new Date() })).toBeNull()
  })

  test('a trade keeps the hash that makes it checkable', () => {
    const event = toTradeEvent({
      _id: 'led0', flow: 'withdraw', status: 'success', amountMlcns: 40,
      recordedAt: hoursAgo(1), sellTxHash: 'SELLHASH',
    })
    expect(event.txHash).toBe('SELLHASH')
    expect(event.flow).toBe('withdraw')
    // ISO, so a client cannot mistake it for the unix-milliseconds field
    // WalletData uses.
    expect(new Date(event.timestamp).getFullYear()).toBeGreaterThanOrEqual(2026)
  })

  test('a listing is priced in MAL, the escrow denom', () => {
    const event = toListingEvent({ _id: 'l', title: 'Oil 1L', price: 3.5, category: 'food', createdAt: new Date() })
    expect(event.currency).toBe('MAL')
    expect(event.price).toBe(3.5)
  })
})

describe('live publishing', () => {
  const makeIo = (subscribers) => {
    const emitted = []
    return {
      emitted,
      sockets: {
        adapter: {
          rooms: new Map([['market:feed', new Set(Array.from({ length: subscribers }, (_, i) => `s${i}`))]]),
        },
      },
      to() {
        const self = this
        return { emit(event, payload) { emitted.push({ event, payload }); return self } }
      },
    }
  }

  test('a live row arrives as market:event, separate from the join primer', () => {
    const io = makeIo(1)
    const feed = createMarketFeed()
    feed.start(io)

    feed.publish(toTradeEvent({
      _id: 'led1', flow: 'buy', status: 'success', amountMlcns: 60,
      recordedAt: new Date(), creditTxHash: 'H1',
    }))

    expect(io.emitted).toHaveLength(1)
    expect(io.emitted[0].event).toBe('market:event')
    expect(io.emitted[0].payload.amountMlcns).toBe(60)
  })

  test('an empty room costs nothing', () => {
    const io = makeIo(0)
    const feed = createMarketFeed()
    feed.start(io)
    expect(feed.publish({ id: 'x', type: 'trade' })).toBe(false)
    expect(io.emitted).toHaveLength(0)
  })

  test('stop() detaches the server, so a late settlement cannot emit', () => {
    const io = makeIo(1)
    const feed = createMarketFeed()
    feed.start(io)
    feed.stop()
    expect(feed.publish({ id: 'x', type: 'trade' })).toBe(false)
    expect(io.emitted).toHaveLength(0)
  })

  test('a socket that throws cannot fail the caller', () => {
    const feed = createMarketFeed()
    feed.start({
      sockets: { adapter: { rooms: new Map([['market:feed', new Set(['s1'])]]) } },
      to() { throw new Error('transport gone') },
    })
    expect(() => feed.publish({ id: 'x', type: 'trade' })).not.toThrow()
    expect(feed.publish({ id: 'x', type: 'trade' })).toBe(false)
  })
})
