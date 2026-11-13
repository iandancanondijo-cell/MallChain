/**
 * The transport classification behind the landing status table.
 *
 * This is where the old bug actually lived: a helper that returned `null` for
 * every non-2xx and let the UI print "unreachable" for a 429. These tests pin
 * the distinction itself — status code, Retry-After, and the error envelope —
 * independent of any component, because every surface that shows network
 * status now reads through here.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchNetworkOverview,
  getNetworkStatus,
  subscribeNetworkStatus,
} from './networkStatus';

function response(init: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}) {
  const { ok = true, status = 200, json, text, headers = {} } = init;
  return {
    ok,
    status,
    headers: { get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => {
      if (text !== undefined) throw new SyntaxError('Unexpected token < in JSON');
      if (json === undefined) throw new SyntaxError('empty body');
      return json;
    },
  } as unknown as Response;
}

const OVERVIEW = {
  generatedAt: '2026-11-11T16:19:41.000Z',
  cachedForMs: 10000,
  sources: { chain: { ok: true, error: null }, explorer: { ok: true, error: null }, price: { ok: true, error: null } },
  chain: { reachable: true, producing: true, chainId: 'mallchain-1', height: 328919 },
  explorer: { ok: true, recentBlockCount: 3, error: null },
  price: { ok: true, midKes: 0.6, source: 'onchain', error: null },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchNetworkOverview', () => {
  test('a 200 with a usable body is ok', async () => {
    fetchMock.mockResolvedValue(response({ json: OVERVIEW }));
    const outcome = await fetchNetworkOverview();
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') expect(outcome.overview.chain.height).toBe(328919);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/blockchain/overview'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  test('a 429 is rate_limited and carries the server Retry-After', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 429, headers: { 'Retry-After': '137' } }));
    const outcome = await fetchNetworkOverview();
    expect(outcome).toEqual({ kind: 'rate_limited', status: 429, retryAfterSeconds: 137 });
  });

  test('a 429 with no Retry-After header falls back to the documented window, not zero', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 429 }));
    const outcome = await fetchNetworkOverview();
    expect(outcome.kind).toBe('rate_limited');
    if (outcome.kind === 'rate_limited') expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('a 5xx keeps the backend error code', async () => {
    fetchMock.mockResolvedValue(response({
      ok: false,
      status: 503,
      json: { error: { code: 'NETWORK_OVERVIEW_UNAVAILABLE', message: 'nope' } },
    }));
    const outcome = await fetchNetworkOverview();
    expect(outcome).toEqual({ kind: 'server_error', status: 503, code: 'NETWORK_OVERVIEW_UNAVAILABLE' });
  });

  test('a non-JSON error body is still a server error, never a silent null', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 500, text: '<html>boom</html>' }));
    const outcome = await fetchNetworkOverview();
    expect(outcome.kind).toBe('server_error');
    if (outcome.kind === 'server_error') expect(outcome.status).toBe(500);
  });

  test('a 200 whose body has no chain block is malformed, not empty-but-fine', async () => {
    fetchMock.mockResolvedValue(response({ json: { unexpected: true } }));
    const outcome = await fetchNetworkOverview();
    expect(outcome).toEqual({ kind: 'server_error', status: 200, code: 'malformed_overview' });
  });

  test('only a rejected fetch is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const outcome = await fetchNetworkOverview();
    expect(outcome).toEqual({ kind: 'unreachable', status: 0 });
  });
});

describe('the shared status poller', () => {
  test('two subscribers cost one request', async () => {
    fetchMock.mockResolvedValue(response({ json: OVERVIEW }));
    const un1 = subscribeNetworkStatus(() => {});
    const un2 = subscribeNetworkStatus(() => {});
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getNetworkStatus().overview).not.toBeNull();
    un1();
    un2();
  });

  test('a concurrent subscribe joins the in-flight poll instead of adding one', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const un1 = subscribeNetworkStatus(() => {});
    const un2 = subscribeNetworkStatus(() => {});
    release(response({ json: OVERVIEW }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    un1();
    un2();
  });

  test('a failed poll keeps the last good overview and records why it stopped', async () => {
    fetchMock.mockResolvedValue(response({ json: OVERVIEW }));
    const un = subscribeNetworkStatus(() => {});
    await settle();
    expect(getNetworkStatus().outcome?.kind).toBe('ok');

    fetchMock.mockResolvedValue(response({ ok: false, status: 429, headers: { 'Retry-After': '30' } }));
    await refresh();
    const s = getNetworkStatus();
    expect(s.outcome?.kind).toBe('rate_limited');
    expect(s.retryAfterSeconds).toBe(30);
    expect(s.overview?.chain.height).toBe(328919);
    un();
  });
});

/** Let the promise chain the poller awaits settle without depending on how
 *  many microtasks a given environment implementation uses. */
async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Drive the module's own poll — refreshNetworkStatus is not exported to keep
 *  the public surface to subscribe/refresh-through-the-hook. */
async function refresh() {
  const mod = await import('./networkStatus');
  await mod.refreshNetworkStatus();
}
