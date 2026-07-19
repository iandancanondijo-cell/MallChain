import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { getGovernanceStats } from '../../core/admin/adminApi'

// Static color map — dynamic Tailwind class strings are purged in production
const statusColors = {
  slate:   { badge: 'bg-slate-500/20 text-slate-300',   count: 'text-slate-300'  },
  amber:   { badge: 'bg-amber-500/20 text-amber-300',   count: 'text-amber-400'  },
  emerald: { badge: 'bg-emerald-500/20 text-emerald-300', count: 'text-emerald-400' },
  red:     { badge: 'bg-red-500/20 text-red-300',       count: 'text-red-400'    },
}

function statusBadgeClass(status) {
  if (status?.includes('VOTING'))   return statusColors.amber.badge
  if (status?.includes('PASSED'))   return statusColors.emerald.badge
  if (status?.includes('REJECTED')) return statusColors.red.badge
  return statusColors.slate.badge
}

function formatStatus(s) {
  return s?.replace('PROPOSAL_STATUS_', '').replace(/_/g, ' ').toLowerCase() || 'unknown'
}

export default function AdminGovernance() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGovernanceStats()
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const stats = [
    { label: 'Total',    value: data?.stats?.total    ?? 0, color: 'slate'   },
    { label: 'Voting',   value: data?.stats?.voting   ?? 0, color: 'amber'   },
    { label: 'Passed',   value: data?.stats?.passed   ?? 0, color: 'emerald' },
    { label: 'Rejected', value: data?.stats?.rejected ?? 0, color: 'red'     },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Governance Overview</h1>
        <button onClick={load} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 py-8 text-center">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0"/>
          <p className="text-red-300 text-sm">{error}</p>
          <button onClick={load} className="ml-auto px-3 py-1 rounded-lg bg-red-600 text-white text-xs">Retry</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-center">
                <div className="text-sm text-slate-400">{s.label}</div>
                <div className={`text-2xl font-bold mt-1 ${statusColors[s.color].count}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {data?.note && (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-300">{data.note}</div>
          )}

          {(data?.proposals?.length ?? 0) > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="text-left py-3 px-4">ID</th>
                      <th className="text-left py-3 px-4">Title</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.proposals.map(p => (
                      <tr key={p.proposal_id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="py-3 px-4 text-slate-400">#{p.proposal_id}</td>
                        <td className="py-3 px-4 max-w-xs truncate">{p.content?.title || p.content?.description?.slice(0,80) || 'N/A'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadgeClass(p.status)}`}>{formatStatus(p.status)}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-xs">
                          {p.submit_time ? new Date(p.submit_time).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">No proposals on-chain</div>
          )}
        </>
      )}
    </div>
  )
}
