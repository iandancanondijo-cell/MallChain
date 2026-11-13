/**
 * useTxTypes — the client's reader for GET /api/tx/types.
 *
 * The filter controls on two different history views call this, and `/api/tx`
 * is behind the same per-IP rate limiter as everything else, so the two
 * behaviours that matter are: the table is fetched once and shared, and a
 * server that cannot answer leaves the caller with the two directions the
 * endpoint has always supported rather than an empty dropdown that looks like
 * the account has no categories.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { walletApi, type TxTypeEntry } from '../services/walletApi';
import { useTxTypes } from './useTxTypes';

vi.mock('../services/walletApi', () => ({
  walletApi: { getTxTypes: vi.fn() },
}));

const CATALOGUE: TxTypeEntry[] = [
  { value: 'send', label: 'Sent', description: 'd1', msgTypes: ['/a'] },
  { value: 'stake', label: 'Staked', description: 'd2', msgTypes: ['/b'] },
];

beforeEach(() => {
  vi.resetModules();
  vi.mocked(walletApi.getTxTypes).mockReset();
});

describe('useTxTypes', () => {
  it('loads the catalogue once and gives both callers the same table', async () => {
    const { useTxTypes: hook } = await import('./useTxTypes');
    vi.mocked(walletApi.getTxTypes).mockResolvedValue({ ok: true, data: { types: CATALOGUE, directions: ['send', 'receive'] } });

    const first = renderHook(() => hook());
    const second = renderHook(() => hook());

    await act(async () => {
      await Promise.resolve();
    });

    expect(walletApi.getTxTypes).toHaveBeenCalledTimes(1);
    expect(first.result.current.types.map((entry) => entry.value)).toEqual(['send', 'stake']);
    expect(second.result.current.types).toEqual(first.result.current.types);
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.error).toBeNull();
  });

  it('keeps the direction filter usable and says what went wrong when the endpoint fails', async () => {
    const { useTxTypes: hook } = await import('./useTxTypes');
    vi.mocked(walletApi.getTxTypes).mockResolvedValue({ ok: false, error: 'HTTP 503' });

    const { result } = renderHook(() => hook());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.types).toEqual([]);
    expect(result.current.directions).toEqual(['send', 'receive']);
    expect(result.current.error).toContain('503');
  });

  it('serves a component mounted after the fetch from the cache, without a second request', async () => {
    const { useTxTypes: hook } = await import('./useTxTypes');
    vi.mocked(walletApi.getTxTypes).mockResolvedValue({ ok: true, data: { types: CATALOGUE, directions: ['send', 'receive'] } });

    const first = renderHook(() => hook());
    await act(async () => {
      await Promise.resolve();
    });

    const late = renderHook(() => hook());

    expect(walletApi.getTxTypes).toHaveBeenCalledTimes(1);
    expect(late.result.current.types).toHaveLength(2);
    expect(late.result.current.loading).toBe(false);
    expect(first.result.current.loading).toBe(false);
  });
});
