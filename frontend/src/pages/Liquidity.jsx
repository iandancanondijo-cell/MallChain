import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Droplets, Loader2, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '../lib/api'

export default function Liquidity() {
  const [pools, setPools] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiFetch('/liquidity/pools')
        if (!cancelled) {
          setPools(data.pools || data || [])
        }
      } catch (e) {
        if (!cancelled) toast.error(e.message || 'Could not load pools')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black">Liquidity</h1>
        <p className="text-slate-400 mt-2">
          View pools and add liquidity to earn fees on swaps.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        </div>
      ) : pools.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center text-slate-400">
          No liquidity pools yet. Pools appear when the chain DEX module has active pairs.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pools.map((pool) => (
            <motion.div
              key={pool.id || pool.poolId}
              className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
              whileHover={{ y: -2 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <Droplets className="w-8 h-8 text-cyan-400" />
                <div>
                  <h2 className="font-bold text-lg">
                    {pool.name || `${pool.token0 || pool.tokenADenom} / ${pool.token1 || pool.tokenBDenom}`}
                  </h2>
                  <p className="text-sm text-slate-400">Pool #{pool.id || pool.poolId}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">TVL</dt>
                  <dd className="font-semibold">{pool.tvl ?? pool.totalLiquidity ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">APY</dt>
                  <dd className="font-semibold flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    {pool.apy != null ? `${pool.apy}%` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Fee</dt>
                  <dd>{pool.fee != null ? `${pool.fee}%` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">24h volume</dt>
                  <dd>{pool.volume24h ?? '—'}</dd>
                </div>
              </dl>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
