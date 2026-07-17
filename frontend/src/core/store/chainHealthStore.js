/**
 * chainHealthStore — single shared source of truth for /api/health.
 *
 * Stores only primitive values so Zustand's useSyncExternalStore never
 * sees a new object reference when the data hasn't changed.
 * This prevents the "getSnapshot should be cached" infinite loop.
 *
 * Usage:
 *   import { useChainHealth, useHealthState, startHealthPolling } from '../store/chainHealthStore'
 *   useEffect(() => startHealthPolling(), [])
 *   const { latestHeight, healthState } = useChainHealth()
 */

import { create } from 'zustand'
import { appConfig } from '../../config/app'
import { fetchWithTimeout } from '../api/fetchWithTimeout'

const POLL_INTERVAL_MS = 20_000
let _pollerHandle = null
let _pollerRefCount = 0

export const useChainHealthStore = create(() => ({
  // Primitives only — no nested objects
  latestHeight: '',
  latestBlockTime: '',
  latestHash: '',
  chainId: '',
  moniker: '',
  chainStatusOk: false,
  healthState: 'loading',   // 'loading' | 'live' | 'retrying' | 'down'
  error: null,
}))

async function fetchHealth() {
  try {
    const res = await fetchWithTimeout(`${appConfig.apiBase}/api/health`, { timeout: 8_000 })
    if (!res.ok) throw new Error('health unavailable')
    const data = await res.json()
    const chain = data?.dependencies?.chain || {}

    const latestBlockTime = chain.latestBlockTime || ''
    const blockTime = latestBlockTime ? new Date(latestBlockTime).getTime() : Date.now()
    const stale = Date.now() - blockTime > 30_000

    useChainHealthStore.setState({
      latestHeight: chain.latestHeight || '',
      latestBlockTime,
      latestHash: chain.latestHash || '',
      chainId: chain.chainId || '',
      moniker: chain.moniker || '',
      chainStatusOk: chain.status === 'ok',
      healthState: stale ? 'retrying' : 'live',
      error: null,
    })
  } catch (err) {
    useChainHealthStore.setState({
      chainStatusOk: false,
      healthState: 'down',
      error: err?.code === 'FETCH_TIMEOUT'
        ? 'Unable to reach the blockchain node (timeout). Retrying…'
        : 'Unable to reach the blockchain node. Retrying…',
    })
  }
}

export function startHealthPolling() {
  _pollerRefCount++
  if (!_pollerHandle) {
    fetchHealth()
    _pollerHandle = setInterval(fetchHealth, POLL_INTERVAL_MS)
  }
  return function stopHealthPolling() {
    _pollerRefCount = Math.max(0, _pollerRefCount - 1)
    if (_pollerRefCount === 0 && _pollerHandle) {
      clearInterval(_pollerHandle)
      _pollerHandle = null
    }
  }
}

/**
 * useChainHealth — returns a plain object but using individual primitive
 * selectors so each field comparison is a stable primitive equality check.
 *
 * Each field is selected independently — Zustand only re-renders when
 * a primitive value actually changes, never on reference churn.
 */
export function useChainHealth() {
  const latestHeight  = useChainHealthStore((s) => s.latestHeight)
  const latestBlockTime = useChainHealthStore((s) => s.latestBlockTime)
  const latestHash     = useChainHealthStore((s) => s.latestHash)
  const chainId       = useChainHealthStore((s) => s.chainId)
  const moniker       = useChainHealthStore((s) => s.moniker)
  const chainStatusOk = useChainHealthStore((s) => s.chainStatusOk)
  const healthState   = useChainHealthStore((s) => s.healthState)
  const error         = useChainHealthStore((s) => s.error)

  // Reconstruct the chainStatus shape that existing consumers expect.
  // This object is built during render and is stable enough because
  // each field is a primitive — React won't loop on it.
  return {
    chainStatus: {
      latestHeight,
      latestBlockTime,
      latestHash,
      chainId,
      moniker,
      status: chainStatusOk ? 'ok' : 'down',
    },
    healthState,
    error,
  }
}

/** Convenience: just the healthState string. */
export function useHealthState() {
  return useChainHealthStore((s) => s.healthState)
}
