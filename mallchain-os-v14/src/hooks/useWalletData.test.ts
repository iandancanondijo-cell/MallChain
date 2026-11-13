/**
 * useWalletData — the REST balance fetch and the `wallet:update` push.
 *
 * The push path is the reason this suite exists. `wallet:update` is emitted by
 * backend/src/services/walletSync.js (and once as a join primer from
 * index.js) with the on-chain MLCN balance as
 * `{ mlcns, mlcnsAvailable, mlcnsLocked }`. The hook used to map
 * `balances.MALL / MLPTS / USD_M / KES / EUR / GBP` instead — keys no server
 * has ever put on the wire — each with an `|| 0` fallback, so the first live
 * update after a purchase replaced the freshly fetched balance with zeros in
 * both this hook's state and the global store that TopBar, Send and Staking
 * read, while still reporting `isRealTime: true`.
 *
 * Pinned here: a push overwrites only the numbers it carries, everything else
 * survives from the fetch, and a payload without a readable balance is
 * ignored rather than rendered as zero.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { walletApi, type WalletBalance } from '../services/walletApi';
import { socketManager, type WalletData } from '../services/socket';
import { store } from '../store/store';
import { useWalletData } from './useWalletData';

const ADDRESS = `mall1${'a'.repeat(38)}`;
const OTHER_ADDRESS = `mall1${'b'.repeat(38)}`;

/** Push timestamps arrive as unix milliseconds, not an ISO string. */
const PUSH_TS = 1_760_000_000_000;

const socketStub = vi.hoisted(() => ({
  connected: true,
  subscribeWallet: vi.fn(),
  listeners: new Set<(data: WalletData) => void>(),
}));

vi.mock('../services/socket', () => ({
  socketManager: {
    isConnected: () => socketStub.connected,
    subscribeWallet: socketStub.subscribeWallet,
    onWalletUpdate: (cb: (data: WalletData) => void) => {
      socketStub.listeners.add(cb);
      return () => { socketStub.listeners.delete(cb); };
    },
  },
}));

vi.mock('../services/walletApi', () => ({
  walletApi: { getBalance: vi.fn() },
}));

const getBalance = vi.mocked(walletApi.getBalance);

/**
 * What GET /api/wallet/{address} returns for a wallet holding Mallpoints with
 * a vesting lock. MLPTS and the fiat columns are ones only REST fills in —
 * `MallPointAccount` plus a chain points call, neither of which appears in a
 * socket payload — so a push must leave them alone.
 */
function restBalance(overrides: Partial<WalletBalance> = {}): WalletBalance {
  return {
    address: ADDRESS,
    MALL: 1_000,
    MALL_LOCKED: 250,
    MALL_UNLOCK_TIME: PUSH_TS + 86_400_000,
    MLPTS: 40,
    USD_M: 7,
    KES: 0,
    EUR: 0,
    GBP: 0,
    lastUpdated: PUSH_TS - 5_000,
    ...overrides,
  };
}

/**
 * Deliver a server payload to every listener the mounted hooks registered.
 * The balances argument is deliberately loose: several cases below send what
 * the server does NOT send, which is exactly what the hook has to survive.
 */
function push(balances: Record<string, unknown>, address = ADDRESS): void {
  const payload: WalletData = {
    address,
    balances: balances as WalletData['balances'],
    timestamp: PUSH_TS,
    denom: 'MLCNS',
    exists: true,
  };
  act(() => {
    for (const fn of Array.from(socketStub.listeners)) fn(payload);
  });
}

async function mount() {
  const view = renderHook(() => useWalletData(ADDRESS));
  await waitFor(() => expect(view.result.current.balance).not.toBeNull());
  return view;
}

beforeEach(() => {
  getBalance.mockReset();
  getBalance.mockImplementation(async (address: string) => ({
    ok: true,
    data: restBalance({ address }),
  }));
  socketStub.connected = true;
  socketStub.subscribeWallet.mockReset();
  socketStub.listeners.clear();
  store.reset();
});

describe('useWalletData', () => {
  it('fetches over REST and joins the wallet room', async () => {
    const { result } = await mount();

    expect(getBalance).toHaveBeenCalledWith(ADDRESS);
    expect(socketStub.subscribeWallet).toHaveBeenCalledWith(ADDRESS);
    expect(result.current.isRealTime).toBe(true);
    expect(result.current.balance?.MALL).toBe(1_000);
    expect(store.state.balances.MALL).toBe(1_000);
    expect(store.state.balances.MLPTS).toBe(40);
  });

  it('a live push moves MALL to the available figure and MALL_LOCKED to the locked one', async () => {
    const { result } = await mount();

    push({ mlcns: 2_000, mlcnsAvailable: 1_750, mlcnsLocked: 250 });

    expect(result.current.balance?.MALL).toBe(1_750);
    expect(result.current.balance?.MALL_LOCKED).toBe(250);
    expect(result.current.balance?.lastUpdated).toBe(PUSH_TS);
    expect(result.current.lastUpdated).toBe(PUSH_TS);
    expect(result.current.isRealTime).toBe(true);
    // TopBar, Send and Staking read the store rather than this hook.
    expect(store.state.balances.MALL).toBe(1_750);
  });

  it('a push leaves the columns only REST can supply exactly as the fetch set them', async () => {
    const { result } = await mount();

    push({ mlcns: 2_000, mlcnsAvailable: 1_750, mlcnsLocked: 250 });

    // The regression this pins: `balances.MLPTS || 0` used to zero a real
    // Mallpoints balance because the socket never carries the key.
    expect(result.current.balance?.MLPTS).toBe(40);
    expect(result.current.balance?.USD_M).toBe(7);
    expect(result.current.balance?.MALL_UNLOCK_TIME).toBe(PUSH_TS + 86_400_000);
    expect(store.state.balances.MLPTS).toBe(40);
    expect(store.state.balances.USD_M).toBe(7);
  });

  it('a push with no numeric available balance changes nothing', async () => {
    const { result } = await mount();
    const before = result.current.balance;

    push({});
    expect(result.current.balance).toBe(before);
    expect(store.state.balances.MALL).toBe(1_000);

    push({ mlcnsAvailable: NaN });
    expect(result.current.balance).toBe(before);
    expect(store.state.balances.MALL).toBe(1_000);
    expect(result.current.balance?.MALL).toBe(1_000);
  });

  it('a push that carries no lock keeps the lock the fetch reported', async () => {
    getBalance.mockResolvedValue({
      ok: true,
      data: restBalance({ MALL_LOCKED: undefined, MALL_UNLOCK_TIME: null }),
    });
    const { result } = await mount();

    push({ mlcns: 1_000, mlcnsAvailable: 1_000 });

    expect(result.current.balance?.MALL).toBe(1_000);
    expect(result.current.balance?.MALL_LOCKED).toBeUndefined();
  });

  it('a push for a different address is ignored', async () => {
    const { result } = await mount();

    push({ mlcns: 9_999, mlcnsAvailable: 9_999, mlcnsLocked: 0 }, OTHER_ADDRESS);

    expect(result.current.balance?.MALL).toBe(1_000);
    expect(store.state.balances.MALL).toBe(1_000);
  });

  it('unsubscribes when the wallet changes so a prior account stops painting this one', async () => {
    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useWalletData(address),
      { initialProps: { address: ADDRESS } },
    );
    await waitFor(() => expect(result.current.balance).not.toBeNull());

    rerender({ address: OTHER_ADDRESS });
    await waitFor(() => expect(result.current.balance?.address).toBe(OTHER_ADDRESS));

    // Only the new wallet's listener remains attached, so a push addressed to
    // the previous one cannot arrive here at all.
    push({ mlcns: 9_999, mlcnsAvailable: 9_999, mlcnsLocked: 0 }, ADDRESS);
    expect(result.current.balance?.MALL).toBe(1_000);

    push({ mlcns: 9_999, mlcnsAvailable: 9_999, mlcnsLocked: 0 }, OTHER_ADDRESS);
    expect(result.current.balance?.MALL).toBe(9_999);
  });
});
