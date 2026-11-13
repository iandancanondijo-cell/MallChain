/**
 * walletSync — the primer and the push behind `wallet:<address>`.
 *
 * Replaces `{ getCachedWallet: () => null }`. That stub made the primer branch
 * in index.js permanently unreachable while its comment claimed a cache existed
 * (and the room itself had no emitter, so the "real-time wallet" contract was
 * two sentences deep in a header comment). These cases pin what a real cache
 * must not do: hand out a stale balance as though it were current, or turn a
 * failed read into a zero.
 */
jest.mock('../services/mallcoinService', () => ({ getWalletBalance: jest.fn() }))
jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

const { getWalletBalance } = require('../services/mallcoinService')
const walletSync = require('../services/walletSync')

const ADDRESS = 'mall1abcdefghijklmnopqrstuvwxyz012345678'

function balance(available = 950, locked = 50) {
  getWalletBalance.mockResolvedValue({
    address: ADDRESS,
    balance: String((available + locked) * 1e6),
    locked: String(locked * 1e6),
    available: String(available * 1e6),
    balanceDisplay: available + locked,
    availableDisplay: available,
    lockedDisplay: locked,
    denom: 'MLCNS',
    exists: true,
  })
}

const makeIo = (room, subscribers) => {
  const emitted = []
  return {
    emitted,
    sockets: {
      adapter: {
        rooms: new Map([[room, new Set(Array.from({ length: subscribers }, (_, i) => `s${i}`))]]),
      },
    },
    to(target) {
      const self = this
      return {
        emit(event, payload) {
          emitted.push({ room: target, event, payload })
          return self
        },
      }
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  walletSync.clearCache()
  balance()
})

describe('snapshot', () => {
  test('maps the chain balance into the display units the client renders', async () => {
    const data = await walletSync.snapshot(ADDRESS)

    expect(data.address).toBe(ADDRESS)
    // 6-decimal MALL converted by mallcoinService, keyed by what the token is
    // actually called. Not the old fixtures' `{ mallcoin, gold }`: this chain
    // has one market token and no gold.
    expect(data.balances).toEqual({ mlcns: 1000, mlcnsAvailable: 950, mlcnsLocked: 50 })
    expect(typeof data.timestamp).toBe('number')
  })

  test('returns null when the balance cannot be read', async () => {
    getWalletBalance.mockRejectedValue(new Error('ECONNREFUSED'))

    expect(await walletSync.snapshot(ADDRESS)).toBeNull()
    // Nothing cached either, so the primer will not serve a half-truth.
    expect(walletSync.getCachedWallet(ADDRESS)).toBeNull()
  })
})

describe('getCachedWallet', () => {
  test('is null until something has actually been read', () => {
    expect(walletSync.getCachedWallet(ADDRESS)).toBeNull()
  })

  test('serves the snapshot the last read produced', async () => {
    await walletSync.snapshot(ADDRESS)
    expect(walletSync.getCachedWallet(ADDRESS).balances.mlcns).toBe(1000)
  })

  test('goes stale rather than serving an old balance as current', async () => {
    jest.useFakeTimers()
    await walletSync.snapshot(ADDRESS)
    expect(walletSync.getCachedWallet(ADDRESS)).not.toBeNull()

    jest.advanceTimersByTime(46_000)

    // 45s is one beat past mallcoinService's own 30s chain cache. Past that the
    // entry is dropped and the caller fetches, because a balance presented as
    // live when it is minutes old is the failure this cache exists to avoid.
    expect(walletSync.getCachedWallet(ADDRESS)).toBeNull()
    jest.useRealTimers()
  })

  test('forget() drops an account immediately', async () => {
    await walletSync.snapshot(ADDRESS)
    expect(walletSync.forget(ADDRESS)).toBe(true)
    expect(walletSync.getCachedWallet(ADDRESS)).toBeNull()
  })

  test('stays bounded across many wallets', async () => {
    getWalletBalance.mockImplementation(async (address) => ({
      address,
      balanceDisplay: 1,
      availableDisplay: 1,
      lockedDisplay: 0,
      denom: 'MLCNS',
      exists: true,
    }))
    for (let i = 0; i < 520; i += 1) {
      await walletSync.snapshot(`mall1${String(i).padStart(38, '0')}`)
    }
    expect(walletSync.getStatus().cachedWallets).toBe(500)
  })
})

describe('publish', () => {
  test('emits wallet:update to that wallet room only', async () => {
    const io = makeIo(walletSync.roomFor(ADDRESS), 1)

    const data = await walletSync.publish(ADDRESS, io)

    expect(io.emitted).toHaveLength(1)
    expect(io.emitted[0].room).toBe(walletSync.roomFor(ADDRESS))
    expect(io.emitted[0].event).toBe('wallet:update')
    expect(io.emitted[0].payload.balances.mlcns).toBe(1000)
    expect(data.timestamp).toEqual(expect.any(Number))
  })

  test('reads and caches even with nobody watching, so the next joiner gets a primer', async () => {
    const io = makeIo(walletSync.roomFor(ADDRESS), 0)

    await walletSync.publish(ADDRESS, io)

    expect(io.emitted).toHaveLength(0)
    expect(walletSync.getCachedWallet(ADDRESS)).not.toBeNull()
  })

  test('says nothing when the read failed instead of reporting a zero balance', async () => {
    const io = makeIo(walletSync.roomFor(ADDRESS), 2)
    getWalletBalance.mockRejectedValue(new Error('chain unreachable'))

    const data = await walletSync.publish(ADDRESS, io)

    expect(data).toBeNull()
    expect(io.emitted).toHaveLength(0)
  })

  test('a failed emit still leaves the fresh value cached', async () => {
    getWalletBalance.mockImplementation(async () => {
      throw new Error('chain unreachable')
    })
    expect(await walletSync.publish(ADDRESS, { to() { throw new Error('transport gone') } })).toBeNull()

    balance()
    const io = makeIo(walletSync.roomFor(ADDRESS), 1)
    await walletSync.publish(ADDRESS, io)
    expect(walletSync.getCachedWallet(ADDRESS).balances.mlcns).toBe(1000)
  })

  test('an empty address is not a room to publish to', async () => {
    const io = makeIo('wallet:', 1)
    expect(await walletSync.publish('', io)).toBeNull()
    expect(getWalletBalance).not.toHaveBeenCalled()
    expect(io.emitted).toHaveLength(0)
  })
})
