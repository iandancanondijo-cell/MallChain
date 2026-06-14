import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

/**
 * Displays live network metrics from socket/API data.
 * Props:
 *   priceData   - { price, marketCap } from price:update socket
 *   treasury    - { treasury_balance, circulating_supply } from treasury_update socket
 *   health      - { latestHeight } from /api/health
 *   validators  - number of active validators (optional)
 *   loading     - whether data is still being fetched
 */
export default function HeroMetrics({ priceData, treasury, health, validators, loading }) {
  const metrics = [
    {
      title: 'Market Cap',
      value: priceData?.marketCap || null,
    },
    {
      title: 'Treasury',
      value: treasury?.treasury_balance || null,
    },
    {
      title: 'Block Height',
      value: health?.latestHeight ? `#${health.latestHeight}` : null,
    },
    {
      title: 'Validators',
      value: validators != null ? String(validators) : null,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
      {metrics.map((metric) => (
        <motion.div
          key={metric.title}
          whileHover={{ scale: 1.03 }}
          className="rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6"
        >
          <p className="text-slate-400">{metric.title}</p>

          <h2 className="text-4xl font-bold mt-4">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            ) : (
              metric.value || '—'
            )}
          </h2>

          <div className={`mt-4 text-sm ${metric.value ? 'text-emerald-400' : 'text-slate-500'}`}>
            {metric.value ? 'Live' : 'Waiting…'}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
