/**
 * The network label's data path.
 *
 * This is the frontend half of the fix for backend-handoff-2026-11-09 §5: the
 * app used to decide what a chain id *means* (`nameForChainId`) and print
 * `config.network`, a build flag, beside it. The name now comes from
 * `GET /api/network`, and what these tests pin is that the client stopped
 * answering the question it was never able to answer:
 *
 *  1. The server's `networkName` wins, even when it disagrees with the rule
 *     the client would have applied to the same chain id.
 *  2. The identity is read once, not on every health poll — a chain does not
 *     rename itself — but it IS re-read when the node starts reporting a
 *     different chain id.
 *  3. When `/api/network` does not answer, the label falls back to the local
 *     rule and says so (`identityVerified: null`), rather than pretending the
 *     node reported it.
 *  4. The decimals and the explorer template are carried through, because the
 *     wallet screens are the reason those fields exist on the endpoint.
 *
 * `api` is mocked wholesale; the polling/caching logic under test is the real
 * module state.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../api', () => ({ api: { get: vi.fn() } }));

import { api } from '../api';
import {
  _resetNetworkIdentity,
  getNetworkSnapshot,
  nameForChainId,
  networkLabel,
  refreshNetworkIdentity,
  subscribeNetworkIdentity,
} from '../networkIdentity';

const get = api.get as unknown as ReturnType<typeof vi.fn>;

type Health = { chainId?: string; latestHeight?: number; latestBlockTime?: string | null; moniker?: string };
type Identity = {
  chainId?: string | null;
  networkName?: string | null;
  verified?: boolean;
  source?: 'node' | 'config';
  decimals?: number;
  decimalsSource?: 'chain' | 'configured';
  displayDenom?: string;
  explorer?: { base?: string; tx?: string };
};

/**
 * Route the two reads the service performs. A `null` half means that endpoint
 * is down — reported the way `api` actually reports a failed HTTP call, as
 * `{ ok: false }` rather than a throw.
 */
function serve({ health, identity }: { health: Health | null; identity: Identity | null }) {
  get.mockImplementation((url: string) => {
    if (url === '/api/blockchain/health') {
      return Promise.resolve(health ? { ok: true, data: health } : { ok: false, error: 'offline' });
    }
    if (url === '/api/network') {
      return Promise.resolve(identity ? { ok: true, data: identity } : { ok: false, code: 500, error: 'boom' });
    }
    throw new Error(`unexpected api.get(${url})`);
  });
}

const callsTo = (url: string) => get.mock.calls.filter(([c]) => c === url).length;

/** Drive one poll and hand back the resulting shared snapshot. */
async function poll(): Promise<ReturnType<typeof getNetworkSnapshot>> {
  await refreshNetworkIdentity();
  return getNetworkSnapshot();
}

beforeEach(() => {
  get.mockReset();
  _resetNetworkIdentity();
});

afterEach(() => {
  _resetNetworkIdentity();
  vi.useRealTimers();
});

describe('the network name comes from the server', () => {
  test('displays the name the endpoint gave, not the name the client would have inferred', async () => {
    // 'mallchain-frontier' is one the client rule cannot classify — it matches
    // neither the test/dev/local pattern nor a trailing -1 — so before this
    // change the chip showed the raw chain id. A server name overrides it.
    serve({
      health: { chainId: 'mallchain-frontier', latestHeight: 4242, latestBlockTime: null },
      identity: { chainId: 'mallchain-frontier', networkName: 'Mallchain Frontier', verified: true, source: 'node' },
    });

    const snap = await poll();

    expect(nameForChainId('mallchain-frontier')).toBe('mallchain-frontier');
    expect(snap.networkName).toBe('Mallchain Frontier');
    expect(networkLabel(snap)).toBe('frontier');
  });

  test('keeps the node-reported chain id, decimals and explorer template alongside the name', async () => {
    serve({
      health: { chainId: 'mallchain-1', latestHeight: 10, latestBlockTime: null },
      identity: {
        chainId: 'mallchain-1',
        networkName: 'Mallchain Mainnet',
        verified: true,
        source: 'node',
        decimals: 6,
        decimalsSource: 'chain',
        displayDenom: 'MALL',
        explorer: { base: 'http://localhost:5173/#/explorer', tx: 'http://localhost:5173/#/explorer?tx={hash}' },
      },
    });

    const snap = await poll();

    expect(snap).toMatchObject({
      chainId: 'mallchain-1',
      latestHeight: 10,
      networkName: 'Mallchain Mainnet',
      identityVerified: true,
      identitySource: 'node',
      decimals: 6,
      decimalsSource: 'chain',
      displayDenom: 'MALL',
      explorerTxUrl: 'http://localhost:5173/#/explorer?tx={hash}',
    });
    expect(networkLabel(snap)).toBe('mainnet');
  });

  test('falls back to the local rule and marks the label unverified when /api/network is down', async () => {
    serve({ health: { chainId: 'mallchain-test-1', latestHeight: 3, latestBlockTime: null }, identity: null });

    const snap = await poll();

    expect(snap.networkName).toBeNull();
    expect(snap.identityVerified).toBeNull();
    // Still a truthful chip: the chain id did come from the node, and the
    // naming rule applied to it is the same one the server publishes.
    expect(networkLabel(snap)).toBe('testnet');
  });

  test('labels an unverified server answer as unverified instead of promoting it', async () => {
    // The endpoint answers from its own configuration when the node is quiet.
    serve({
      health: { chainId: 'mallchain-1', latestHeight: 3, latestBlockTime: null },
      identity: { chainId: 'mallchain-1', networkName: 'Mallchain Mainnet', verified: false, source: 'config' },
    });

    const snap = await poll();

    expect(snap.identityVerified).toBe(false);
    expect(snap.identitySource).toBe('config');
  });

  test('does not invent a name when neither the node nor the identity endpoint answered', async () => {
    serve({ health: null, identity: null });

    const snap = await poll();

    expect(snap.chainId).toBeNull();
    expect(snap.networkName).toBeNull();
    // The offline case is the one place the build flag is still shown, and it
    // says which bundle you are looking at rather than which chain exists.
    expect(['mainnet', 'testnet']).toContain(networkLabel(snap));
  });
});

describe('the identity is read like configuration, not like a metric', () => {
  test('one /api/network read covers many health polls', async () => {
    vi.useFakeTimers();
    serve({
      health: { chainId: 'mallchain-1', latestHeight: 1, latestBlockTime: null },
      identity: { chainId: 'mallchain-1', networkName: 'Mallchain Mainnet', verified: true, source: 'node' },
    });

    const unsubscribe = subscribeNetworkIdentity(() => {});
    // Settle the first read (subscribe fires it, and poll() joins it rather
    // than starting a second one), then let the interval run.
    await poll();
    await vi.advanceTimersByTimeAsync(60_000 * 3);
    unsubscribe();

    expect(callsTo('/api/blockchain/health')).toBe(4); // first + three polls
    expect(callsTo('/api/network')).toBe(1);
  });

  test('re-reads the identity when the node starts reporting a different chain', async () => {
    serve({
      health: { chainId: 'mallchain-1', latestHeight: 1, latestBlockTime: null },
      identity: { chainId: 'mallchain-1', networkName: 'Mallchain Mainnet', verified: true, source: 'node' },
    });
    await poll();
    expect(callsTo('/api/network')).toBe(1);

    // A node that switched chains must not keep showing the old name.
    get.mockImplementation((url: string) => {
      if (url === '/api/blockchain/health') {
        return Promise.resolve({ ok: true, data: { chainId: 'mallchain-test-1', latestHeight: 9, latestBlockTime: null } });
      }
      return Promise.resolve({
        ok: true,
        data: { chainId: 'mallchain-test-1', networkName: 'Mallchain Testnet', verified: true, source: 'node' },
      });
    });

    const snap = await poll();

    expect(callsTo('/api/network')).toBe(2);
    expect(snap.networkName).toBe('Mallchain Testnet');
  });
});
