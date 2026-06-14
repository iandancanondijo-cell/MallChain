import { useState, useEffect } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
import { appConfig } from '../../config/app'

/**
 * Fetches and displays recent on-chain transactions.
 * Falls back to an empty state when the archive endpoint is unavailable.
 */
export default function RecentTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true)
      setError(null)
      try {
        const base = appConfig.apiBase
        const response = await fetch(`${base}/api/blockchain/tx/all?limit=10`)
        if (!response.ok) throw new Error('Failed to fetch transactions')
        const data = await response.json()
        setTransactions(data?.transactions || [])
      } catch (err) {
        setError(err.message)
        setTransactions([])
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
    const interval = setInterval(fetchTransactions, 30000)
    return () => clearInterval(interval)
  }, [])

  const truncateHash = (hash) => {
    if (!hash) return '—'
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Recent Transactions</h2>
        {!loading && !error && (
          <span className="text-xs text-slate-500">
            {transactions.length} tx{transactions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <p className="text-red-400 text-sm">{error}</p>
          <p className="text-slate-500 text-xs mt-1">Transactions will appear when the node is reachable</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-slate-500">
          <p className="text-lg font-semibold">No transactions yet</p>
          <p className="text-sm mt-1">On-chain activity will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.slice(0, 8).map((tx, idx) => (
            <div
              key={tx.txHash || idx}
              className="flex items-center justify-between rounded-2xl bg-slate-800/60 p-4"
            >
              <div>
                <p className="font-mono text-sm text-white">
                  {truncateHash(tx.txHash)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      tx.code === 0 ? 'bg-emerald-400' : 'bg-red-400'
                    }`}
                  />
                  <p className="text-slate-400 text-sm">
                    {tx.code === 0 ? 'Confirmed' : 'Failed'}
                    {tx.height && ` · #${tx.height}`}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className="text-emerald-400 font-bold text-sm">
                  {tx.gas_used ? `${tx.gas_used} gas` : '—'}
                </div>
                {tx.timestamp && (
                  <p className="text-slate-500 text-xs mt-1">
                    {formatTime(tx.timestamp)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
