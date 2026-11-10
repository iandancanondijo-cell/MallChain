/**
 * The wallet-address → identity lookup's own contract.
 *
 * What each test below defends:
 *
 *  - A logged-out visitor is never sent to the login page by a lookup. The
 *    route is behind auth and api.ts treats a 401 as an expired session, so
 *    asking while signed out would clear a visitor's state mid-browse.
 *  - One screen of rows is one request. Twenty transaction rows used to be
 *    twenty round trips if each asked for its own counterparty.
 *  - `null` and `undefined` stay distinguishable: the server answers `null` for
 *    an address it will not name, and says nothing at all when a request failed.
 *    Collapsing those would cache a permanent blank over a retryable error.
 *  - A batch wider than the server's cap keeps its tail instead of being
 *    silently truncated.
 *  - Answers belong to the account that asked for them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const post = vi.hoisted(() => vi.fn());

vi.mock('./api', () => ({ api: { post } }));

import { store } from '../store/store';
import {
  clearIdentityCache,
  identityFor,
  requestIdentities,
  subscribeToIdentities,
} from './identityApi';

const ADDR_A = 'mall1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = 'mall1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** `api.post` returns the parsed body, and the body is the route's envelope —
 *  so a payload the client reads must be wrapped twice to mean "here are the
 *  answers". Getting this wrong leaves every address looking nameless. */
function body(map: Record<string, unknown>) {
  return { ok: true, data: { ok: true, data: map } };
}

function answer(address: string, value: unknown) {
  return body({ [address]: value });
}

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset();
  post.mockResolvedValue(body({}));
  clearIdentityCache();
  store.state.user.authed = true;
  store.state.user.id = 'u-owner';
});

afterEach(() => {
  vi.useRealTimers();
  store.state.user.authed = false;
  store.state.user.id = '';
  clearIdentityCache();
});

describe('requestIdentities', () => {
  it('asks nothing while signed out', async () => {
    store.state.user.authed = false;
    store.state.user.id = '';

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    // The 401 this would otherwise produce is what logs a browsing visitor out.
    expect(post).not.toHaveBeenCalled();
    expect(identityFor(ADDR_A)).toBeUndefined();
  });

  it('coalesces every address requested on the same screen into one call', async () => {
    requestIdentities([ADDR_A]);
    requestIdentities([ADDR_B, ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/identity/resolve', { addresses: [ADDR_A, ADDR_B] });
  });

  it('drops blank entries from a batch', async () => {
    post.mockResolvedValue(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));

    requestIdentities(['  ', null, undefined, ADDR_A, '']);
    await vi.advanceTimersByTimeAsync(5);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/identity/resolve', { addresses: [ADDR_A] });
  });

  it('trims the address it asks for and caches it under the trimmed form', async () => {
    post.mockResolvedValue(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));

    requestIdentities([`  ${ADDR_A}  `]);
    await vi.advanceTimersByTimeAsync(5);

    expect(post.mock.calls[0][1]).toEqual({ addresses: [ADDR_A] });
    expect(identityFor(ADDR_A)).toEqual({ displayName: 'Ada', avatarUrl: null });
    expect(identityFor(`  ${ADDR_A} `)).toEqual({ displayName: 'Ada', avatarUrl: null });
  });

  it('keeps the tail of a batch wider than the server cap', async () => {
    const wide = Array.from({ length: 60 }, (_, i) => `mall1${String(i).padStart(41, '0')}`);

    requestIdentities(wide);
    await vi.advanceTimersByTimeAsync(5);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1].addresses).toHaveLength(50);
    expect(post.mock.calls[1][1].addresses).toHaveLength(10);
    expect(post.mock.calls[1][1].addresses[0]).toBe(wide[50]);
  });

  it('re-asks after a transport failure instead of caching a blank', async () => {
    post.mockResolvedValueOnce({ ok: false, error: 'boom' });

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);
    expect(identityFor(ADDR_A)).toBeUndefined();

    post.mockResolvedValueOnce(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));
    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(post).toHaveBeenCalledTimes(2);
    expect(identityFor(ADDR_A)).toEqual({ displayName: 'Ada', avatarUrl: null });
  });

  it('leaves an address unanswered when the server does not key it in the payload', async () => {
    post.mockResolvedValue(body({ [ADDR_B]: { displayName: 'Other', avatarUrl: null } }));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    // An absent key is a protocol surprise, not "this address has no identity".
    expect(identityFor(ADDR_A)).toBeUndefined();
  });

  it('leaves every address unanswered when the route reports a failure', async () => {
    // What a 400 looks like after api.ts parses the body: transport succeeded,
    // the envelope says no. Treating this as an answer would pin the rows blank.
    post.mockResolvedValueOnce({ ok: true, data: { ok: false, error: 'at most 50 addresses per request' } });

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(identityFor(ADDR_A)).toBeUndefined();
  });

  it('does not ask again for an address already answered', async () => {
    post.mockResolvedValue(answer(ADDR_A, null));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);
    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('identityFor', () => {
  it('separates "the account hides its profile" from "nobody asked yet"', async () => {
    post.mockResolvedValue(answer(ADDR_A, null));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(identityFor(ADDR_A)).toBeNull();
    expect(identityFor(ADDR_B)).toBeUndefined();
    expect(identityFor('')).toBeUndefined();
    expect(identityFor(null)).toBeUndefined();
  });

  it('treats an answer with no name and no picture as no identity', async () => {
    post.mockResolvedValue(answer(ADDR_A, { displayName: '   ', avatarUrl: '' }));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(identityFor(ADDR_A)).toBeNull();
  });

  it('keeps a picture-only answer', async () => {
    post.mockResolvedValue(answer(ADDR_A, { displayName: '', avatarUrl: '/uploads/avatars/a.png' }));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(identityFor(ADDR_A)).toEqual({ displayName: null, avatarUrl: '/uploads/avatars/a.png' });
  });
});

describe('cache ownership', () => {
  it('forgets answers when a different account signs in', async () => {
    post.mockResolvedValue(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));
    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);
    expect(identityFor(ADDR_A)).not.toBeNull();

    store.state.user.id = 'u-next';
    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    // Not the new account's answer to reuse, and asked again under its session.
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('drops in-flight answers when the session changes hands mid-request', async () => {
    let release: ((value: unknown) => void) | null = null;
    post.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    store.state.user.authed = false;
    store.state.user.id = '';
    clearIdentityCache();
    release?.(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));
    await vi.advanceTimersByTimeAsync(5);

    expect(identityFor(ADDR_A)).toBeUndefined();
  });

  it('notifies subscribers when answers land', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToIdentities(listener);

    post.mockResolvedValue(answer(ADDR_A, { displayName: 'Ada', avatarUrl: null }));
    requestIdentities([ADDR_A]);
    await vi.advanceTimersByTimeAsync(5);

    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    requestIdentities([ADDR_B]);
    await vi.advanceTimersByTimeAsync(5);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clearIdentityCache cancels a batch that has not gone out', async () => {
    requestIdentities([ADDR_A]);
    clearIdentityCache();
    await vi.advanceTimersByTimeAsync(5);

    expect(post).not.toHaveBeenCalled();
  });
});
