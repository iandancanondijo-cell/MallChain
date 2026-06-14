import { Loader2 } from 'lucide-react'

/**
 * Displays live network status from health endpoint.
 * Props:
 *   health      - chain health object { latestHeight, latestBlockTime, moniker }
 *   healthState - 'live' | 'retrying' | 'down' | 'loading'
 *   validators  - number of validators (optional)
 */
export default function NetworkActivity({ health, healthState, validators }) {
  const isLoading = healthState === 'loading'

  const statusColor = {
    live: 'text-emerald-400',
    retrying: 'text-amber-400',
    down: 'text-red-400',
    loading: 'text-slate-400',
  }[healthState] || 'text-slate-400'

  const statusLabel = {
    live: 'Online',
    retrying: 'Retrying',
    down: 'Offline',
    loading: 'Checking…',
  }[healthState] || 'Unknown'

  const blockTime = health?.latestBlockTime
    ? `${((Date.now() - new Date(health.latestBlockTime).getTime()) / 1000).toFixed(1)}s ago`
    : '—'

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6">
      <h2 className="text-2xl font-bold mb-6">Network Status</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between">
            <span className="text-slate-400">Status</span>
            <span className={statusColor}>{statusLabel}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Moniker</span>
            <span className="text-white">{health?.moniker || '—'}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Validators</span>
            <span className="text-white">
              {validators != null ? `${validators} Active` : '—'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Block Height</span>
            <span className="text-white">
              {health?.latestHeight ? `#${Number(health.latestHeight).toLocaleString()}` : '—'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-400">Last Block</span>
            <span className="text-white">{blockTime}</span>
          </div>
        </div>
      )}
    </div>
  )
}
