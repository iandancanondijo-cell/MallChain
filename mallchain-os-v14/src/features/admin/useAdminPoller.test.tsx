/**
 * useAdminPoller — the three rules the admin windows now depend on.
 *
 * Each window used to own a bare `setInterval(() => load(), ms)` whose loader
 * began with `setLoading(true)` and cleared its rows on a failed read, so a
 * perfectly healthy panel blinked "loading…" every few seconds and an admin
 * who had paged or filtered lost their place on the next tick. These tests pin
 * the replacement behaviour rather than the old one, because the old one is
 * what made populated panels look broken.
 *
 * Timers are faked and flushed with `advanceTimersByTimeAsync`, which drives
 * the microtask queue along with the timers — the plain `waitFor` form spun
 * until the test timeout under fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdminPoller } from './adminShared';

function setVisible(visible: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  });
}

describe('useAdminPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisible(true);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('runs once as a load, then as refreshes on the interval', async () => {
    const load = vi.fn(async () => {});
    renderHook(() => useAdminPoller(load, 1000));

    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(2000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(load.mock.calls.map(([refresh]) => refresh)).toEqual([false, true, true]);
  });

  it('does not run on mount when the panel owns its first read', async () => {
    const load = vi.fn(async () => {});
    renderHook(() => useAdminPoller(load, 1000, [], { skipInitial: true }));

    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith(true);
  });

  it('skips ticks while the tab is hidden and catches up when it returns', async () => {
    const load = vi.fn(async () => {});
    renderHook(() => useAdminPoller(load, 1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    setVisible(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);

    setVisible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(true);
  });

  it('never stacks a tick on a request that has not returned', async () => {
    let release: () => void = () => {};
    const load = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    renderHook(() => useAdminPoller(load, 1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    // Five ticks pass while the first read is still outstanding.
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the panel unmounts', async () => {
    const load = vi.fn(async () => {});
    const { unmount } = renderHook(() => useAdminPoller(load, 1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);

    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('treats a dependency change as a fresh load, not a refresh', async () => {
    const load = vi.fn(async () => {});
    const { rerender } = renderHook(
      ({ filter }: { filter: string }) => useAdminPoller(load, 60000, [filter]),
      { initialProps: { filter: 'all' } },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenLastCalledWith(false);

    rerender({ filter: 'burn' });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(false);
  });
});
