/**
 * Public, unauthenticated read of the real backend maintenance kill-switch
 * (backend/src/routes/maintenanceStatus.js — distinct from the admin-gated
 * /api/admin/maintenance used to toggle it). Used to drive an app-wide
 * banner and to gate money-moving actions client-side; the actual
 * enforcement boundary is server-side (maintenanceGuard middleware) — this
 * is UX only.
 */
import { useEffect, useState } from 'react';
import { api } from './api';

export interface MaintenanceStatus {
  global: boolean;
  scopes: Record<string, boolean>;
  reason: string;
}

const FALLBACK: MaintenanceStatus = { global: false, scopes: {}, reason: '' };

export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  const res = await api.get<MaintenanceStatus & { ok: boolean }>('/api/maintenance');
  if (res.ok && res.data) {
    return { global: !!res.data.global, scopes: res.data.scopes || {}, reason: res.data.reason || '' };
  }
  return FALLBACK;
}

export function isScopePaused(status: MaintenanceStatus | null, scope: string): boolean {
  if (!status) return false;
  return status.global || !!status.scopes?.[scope];
}

/**
 * One poller for the whole app, not one per mount.
 *
 * useMaintenanceStatus() is consumed twice on every page at once — App.tsx
 * renders the wide banner, TopBar.tsx renders the compact chip — and each
 * mount used to run its own setInterval, so a single page load doubled the
 * traffic to a public endpoint that shares the rate-limit budget with the
 * rest of the app's polling. Maintenance state is one global fact, so it is
 * fetched once and handed to however many subscribers are mounted.
 *
 * Polling also pauses while the tab is hidden and resumes with an immediate
 * refresh when it becomes visible again: nobody reads a banner in a background
 * tab, and an admin tab left open all day was quietly spending the budget the
 * visible tab needs.
 *
 * Deliberately not stored in the persisted app store (store/store.ts) —
 * that state round-trips through localStorage, and a stale "global: true"
 * left over from a past incident must never render before the backend has
 * confirmed it. `current` starts at FALLBACK (all-clear) and is only ever
 * replaced by a value that actually came back from /api/maintenance in this
 * page session, so a newly mounted subscriber can render it directly without
 * waiting on a duplicate request.
 */
type Listener = (status: MaintenanceStatus) => void;

const subscribers = new Map<Listener, number>();
let current: MaintenanceStatus = FALLBACK;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let visibilityBound = false;

function sameStatus(a: MaintenanceStatus, b: MaintenanceStatus): boolean {
  if (a.global !== b.global || a.reason !== b.reason) return false;
  const ka = Object.keys(a.scopes || {});
  const kb = Object.keys(b.scopes || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => !!a.scopes[k] === !!b.scopes[k]);
}

async function refresh(): Promise<void> {
  // Concurrent callers share one request instead of stacking fetches.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const next = await fetchMaintenanceStatus();
      if (!sameStatus(next, current)) {
        current = next;
        for (const listener of subscribers.keys()) listener(current);
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function intervalMs(): number {
  let smallest = Infinity;
  for (const ms of subscribers.values()) smallest = Math.min(smallest, ms);
  return Number.isFinite(smallest) ? smallest : 60_000;
}

function startTimer(): void {
  if (timer !== null || typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  timer = setInterval(() => void refresh(), intervalMs());
}

function stopTimer(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function handleVisibility(): void {
  if (document.visibilityState === 'visible') {
    void refresh();
    startTimer();
  } else {
    stopTimer();
  }
}

function subscribe(listener: Listener, pollMs: number): () => void {
  subscribers.set(listener, pollMs);
  if (typeof document !== 'undefined' && !visibilityBound) {
    document.addEventListener('visibilitychange', handleVisibility);
    visibilityBound = true;
  }
  stopTimer();
  startTimer();
  listener(current);
  void refresh();
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) {
      stopTimer();
      if (typeof document !== 'undefined' && visibilityBound) {
        document.removeEventListener('visibilitychange', handleVisibility);
        visibilityBound = false;
      }
    } else {
      // A subscriber may have asked for a different cadence; rebuild the
      // timer so the shortest remaining interval is the one that runs.
      stopTimer();
      startTimer();
    }
  };
}

export function useMaintenanceStatus(pollMs = 60_000): MaintenanceStatus {
  const [status, setStatus] = useState<MaintenanceStatus>(current);

  useEffect(() => subscribe(setStatus, pollMs), [pollMs]);

  return status;
}
