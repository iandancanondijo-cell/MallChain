import { useState } from 'react'
import { RefreshCw, Database, Activity } from 'lucide-react'
import { runReconcile, runReconciliation } from '../../core/admin/adminApi'

export default function AdminSettings() {
  const [loading, setLoading] = useState(null)
  const [result, setResult] = useState(null)

  const handleReconcile = async () => {
    setLoading('reconcile')
    setResult(null)
    try {
      const res = await runReconcile()
      setResult({ type: 'success', data: res })
    } catch (e) {
      setResult({ type: 'error', message: e.message })
    } finally {
      setLoading(null)
    }
  }

  const handleReconciliation = async () => {
    setLoading('reconciliation')
    setResult(null)
    try {
      const res = await runReconciliation()
      setResult({ type: 'success', data: res })
    } catch (e) {
      setResult({ type: 'error', message: e.message })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">System Settings</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database size={20} className="text-purple-400" />
            <h2 className="font-semibold">Pool Reconciliation</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Run a one-off reconcile/report of on-chain pools and emission metrics.
          </p>
          <button
            onClick={handleReconcile}
            disabled={loading === 'reconcile'}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-sm disabled:opacity-50"
          >
            {loading === 'reconcile' ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
            Run Reconcile
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className="text-cyan-400" />
            <h2 className="font-semibold">Liquidity Reconciliation</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Run the full liquidity reconciliation job to detect and compensate discrepancies.
          </p>
          <button
            onClick={handleReconciliation}
            disabled={loading === 'reconciliation'}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-xl text-sm disabled:opacity-50"
          >
            {loading === 'reconciliation' ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
            Run Reconciliation
          </button>
        </div>
      </div>

      {result && (
        <div className={`rounded-2xl border p-6 ${result.type === 'error' ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
          <h3 className={`font-semibold mb-2 ${result.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
            {result.type === 'error' ? 'Error' : 'Result'}
          </h3>
          <pre className="text-sm text-slate-300 overflow-x-auto whitespace-pre-wrap">
            {result.type === 'error' ? result.message : JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="font-semibold mb-4">System Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">API Base:</span>{' '}
            <span className="font-mono text-slate-300">{import.meta.env.VITE_API_BASE || 'http://localhost:4000'}</span>
          </div>
          <div>
            <span className="text-slate-500">Chain ID:</span>{' '}
            <span className="font-mono text-slate-300">{import.meta.env.VITE_CHAIN_ID || 'mallchain-1'}</span>
          </div>
          <div>
            <span className="text-slate-500">Chain REST:</span>{' '}
            <span className="font-mono text-slate-300">{import.meta.env.VITE_CHAIN_REST || 'http://localhost:1317'}</span>
          </div>
          <div>
            <span className="text-slate-500">Chain RPC:</span>{' '}
            <span className="font-mono text-slate-300">{import.meta.env.VITE_CHAIN_RPC || 'http://localhost:26657'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
