/**
 * Wallet performance — real on-chain inflow/outflow aggregation from
 * backend/src/routes/history.js's GET /api/history/performance (public,
 * lenient-rate-limited, no auth required — same as the rest of history.js's
 * address-keyed reads).
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface PerformancePoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulativeNet: number;
}

export interface PerformanceResponse {
  address: string;
  days: number;
  series: PerformancePoint[];
}

export async function fetchPerformance(address: string, days = 30) {
  return api.get<PerformanceResponse>('/api/history/performance', { address, days });
}

export function usePerformance(address: string | null | undefined, days = 30) {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    const res = await fetchPerformance(address, days);
    if (res.ok && res.data) setData(res.data);
    else setError(res.error || 'Failed to load performance data');
    setLoading(false);
  }, [address, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
