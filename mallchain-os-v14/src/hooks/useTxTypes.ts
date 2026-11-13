/**
 * The published transaction categories (GET /api/tx/types).
 *
 * Exists because a history filter used to offer exactly two options, 'send'
 * and 'receive', on the reasoning that the endpoint "can never classify a tx
 * as swap/stake/reward" — which was true of the server at the time and became
 * a permanent lie about it once it could. Reading the table from the server
 * means the filter gains a category the moment the backend learns one, and an
 * option the running server does not support can never be rendered.
 *
 * Fetched once and shared: the catalogue is a property of the build, not of
 * the account, and `/api/tx` sits under the same per-IP rate limiter as every
 * other route, so two history views must not each spend a request on it.
 */
import { useEffect, useState } from 'react';
import { walletApi, type TxTypeEntry } from '../services/walletApi';

export interface TxTypes {
  types: TxTypeEntry[];
  /** 'send' | 'receive': the directions a row's own `type` can carry. */
  directions: string[];
  loading: boolean;
  error: string | null;
}

const LOADING: TxTypes = { types: [], directions: [], loading: true, error: null };

/**
 * 'send'/'receive' are what a row has always been filterable by, so a client
 * that cannot read the catalogue still offers those two rather than an empty
 * dropdown — the categories come back as soon as /api/tx/types answers.
 */
const FALLBACK: TxTypes = { types: [], directions: ['send', 'receive'], loading: false, error: null };

let cached: TxTypes | null = null;
let inflight: Promise<TxTypes> | null = null;
const listeners = new Set<(value: TxTypes) => void>();

function publish(value: TxTypes): void {
  cached = value;
  listeners.forEach((listener) => listener(value));
}

function fetchTypes(): Promise<TxTypes> {
  if (inflight) return inflight;
  inflight = walletApi
    .getTxTypes()
    .then((res) => (res.ok && res.data
      ? { types: res.data.types, directions: res.data.directions, loading: false, error: null }
      : { ...FALLBACK, error: res.error || 'Transaction categories are unavailable' }))
    .catch((error: unknown) => ({ ...FALLBACK, error: `Failed to fetch transaction categories: ${(error as Error).message}` }))
    .then((value) => {
      inflight = null;
      publish(value);
      return value;
    });
  return inflight;
}

export function useTxTypes(): TxTypes {
  const [value, setValue] = useState<TxTypes>(cached ?? LOADING);

  useEffect(() => {
    if (cached) {
      setValue(cached);
      return;
    }
    listeners.add(setValue);
    void fetchTypes();
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  return value;
}
