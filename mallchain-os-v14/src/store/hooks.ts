import { useSyncExternalStore, useCallback, useRef } from 'react';
import { store, type AppState } from './store';

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Slice-based store subscription. Only re-renders when the selected slice changes.
 * Uses shallow equality for object returns, Object.is for primitives.
 *
 * @example
 *   const wallet = useStoreSlice(s => s.wallet);
 *   const mallBalance = useStoreSlice(s => s.balances.MALL);
 *   const { address, pinHash } = useStoreSlice(s => ({ address: s.wallet.address, pinHash: s.wallet.pinHash }));
 */
export function useStoreSlice<T>(selector: (state: AppState) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const prevValueRef = useRef<T | undefined>(undefined);
  const cachedRef = useRef<T | undefined>(undefined);
  const hasCachedRef = useRef(false);

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.state);
    if (hasCachedRef.current && shallowEqual(cachedRef.current, next)) {
      return cachedRef.current as T;
    }
    cachedRef.current = next;
    hasCachedRef.current = true;
    return next;
  }, []);

  const subscribe = useCallback((onStoreChange: () => void) => {
    return store.subscribe(() => {
      const next = selectorRef.current(store.state);
      if (!shallowEqual(prevValueRef.current, next)) {
        prevValueRef.current = next;
        onStoreChange();
      }
    });
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
