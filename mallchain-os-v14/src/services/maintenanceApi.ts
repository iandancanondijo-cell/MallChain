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
 * Deliberately not stored in the persisted app store (store/store.ts) —
 * that state round-trips through localStorage, and a stale "global: true"
 * left over from a past incident must never render before this component's
 * own fetch completes. Each mount starts from FALLBACK (all-clear) and only
 * shows a paused state once the backend has actually confirmed it.
 */
export function useMaintenanceStatus(pollMs = 60_000): MaintenanceStatus {
  const [status, setStatus] = useState<MaintenanceStatus>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await fetchMaintenanceStatus();
      if (!cancelled) setStatus(s);
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return status;
}
