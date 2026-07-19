import { useState } from 'react'
import { RefreshCw, Database, Activity, AlertTriangle, X } from 'lucide-react'
import { runReconcile, runReconciliation } from '../../core/admin/adminApi'
import toast from 'react-hot-toast'
import { appConfig } from '../../config/app'

function OperationCard({ icon, title, description, onRun, busy, color = 'purple' }) {
  const [confirming, setConfirming] = useState(false)
  const colors = {
    purple: 'bg-purple-600 hover:bg-purple-700 border-purple-500/30 bg-purple-500/10',
    cyan:   'bg-cyan-600   hover:bg-cyan-700   border-cyan-500/30   bg-cyan-500/10',
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
      <div className="flex items-center gap-3">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-slate-400">{description}</p>

      {confirming ? (
        <div className={`rounded-xl border p-3 ${color === 'purple' ? 'border-purple-500/30 bg-purple-500/10' : 'border-cyan-500/30 bg-cyan-500/10'}`}>
          <p className="text-xs text-slate-300 mb-3">This is a system operation — confirm to proceed.</p>
          <div className="flex gap-2">
            <button onClick={() => { setConfirming(false); onRun() }}
              className={`px-4 py-2 rounded-xl text-sm ${color==='purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
              Run Now
            </button>
            <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl bg-slate-700 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} disabled={busy}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm disabled:opacity-50 ${color==='purple' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}>
          {busy ? <RefreshCw size={14} className="animate-spin"/> : <Activity size={14}/>}
          {title}
        </button>
      )}
    </div>
  )
}

export default function AdminSettings() {
  const [loading, setLoading]   = useState(null)
  const [result, setResult]     = useState(null)

  const run = async (key, fn) => {
    setLoading(key); setResult(null)
    try {
      const res = await fn()
      setResult({ type: 'success', key, data: res })
      toast.success(`${key} completed`)
    } catch (e) {
      setResult({ type: 'error', key, message: e.message })
      toast.error(e.message)
    } finally {
      setLoading(null)
    }
  }

  const ops = [
    { key: 'reconcile',      icon: <Database size={20} className="text-purple-400"/>, color: 'purple',
      title: 'Pool Reconciliation',     fn: runReconcile,
      desc:  'Run a one-off reconcile/report of on-chain pools and emission metrics.' },
    { key: 'reconciliation', icon: <Activity size={20} className="text-cyan-400"/>,   color: 'cyan',
      title: 'Liquidity Reconciliation', fn: runReconciliation,
      desc:  'Run the full liquidity reconciliation job to detect and compensate discrepancies.' },
  ]

  const sysInfo = [
    { label: 'API Base',   value: appConfig.apiBase          || 'http://localhost:4000'  },
    { label: 'Chain ID',   value: appConfig.chain?.id        || 'mallchain-1'             },
    { label: 'Chain REST', value: appConfig.chain?.rest      || 'http://localhost:1317'   },
    { label: 'Chain RPC',  value: appConfig.chain?.rpc       || 'http://localhost:26657'  },
    { label: 'Prefix',     value: appConfig.chain?.prefix    || 'mall'                    },
    { label: 'Denom',      value: appConfig.chain?.baseDenom || 'stake'                   },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">System Settings</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ops.map(op => (
          <OperationCard key={op.key} icon={op.icon} title={op.title} description={op.desc}
            color={op.color} busy={loading === op.key}
            onRun={() => run(op.key, op.fn)}/>
        ))}
      </div>

      {result && (
        <div className={`rounded-2xl border p-6 ${result.type==='error' ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${result.type==='error' ? 'text-red-400' : 'text-emerald-400'}`}>
              {result.type==='error' ? 'Error' : `Result — ${result.key}`}
            </h3>
            <button onClick={() => setResult(null)} className="text-slate-500 hover:text-white"><X size={16}/></button>
          </div>
          <pre className="text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-80 bg-slate-950/60 rounded-xl p-4">
            {result.type==='error' ? result.message : JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="font-semibold mb-4">System Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sysInfo.map(({ label, value }) => (
            <div key={label} className="flex gap-3 text-sm">
              <span className="text-slate-500 w-24 flex-shrink-0">{label}</span>
              <span className="font-mono text-slate-300 truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
