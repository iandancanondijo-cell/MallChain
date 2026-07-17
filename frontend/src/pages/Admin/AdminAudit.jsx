import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getAuditLogs } from '../../core/admin/adminApi'

export default function AdminAudit() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = { limit: 200 }
      if (actionFilter) params.action = actionFilter
      const res = await getAuditLogs(params)
      setLogs(res.logs || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [actionFilter])

  const actionColor = (action) => {
    if (action?.includes('delete') || action?.includes('reject') || action?.includes('ban')) return 'text-red-400'
    if (action?.includes('approve') || action?.includes('create') || action?.includes('bootstrap')) return 'text-emerald-400'
    if (action?.includes('review') || action?.includes('change')) return 'text-amber-400'
    return 'text-slate-300'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
          >
            <option value="">All Actions</option>
            <option value="dashboard_view">Dashboard View</option>
            <option value="user_role_change">Role Change</option>
            <option value="user_ban">User Ban</option>
            <option value="user_delete">User Delete</option>
            <option value="validator_review">Validator Review</option>
            <option value="treasury_policy_update">Treasury Policy</option>
            <option value="treasury_threshold_update">Treasury Threshold</option>
            <option value="mining_submission_approve">Mining Approve</option>
            <option value="mining_submission_reject">Mining Reject</option>
            <option value="system_reconcile">System Reconcile</option>
            <option value="admin_bootstrap">Admin Bootstrap</option>
          </select>
          <button onClick={load} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-400">No audit logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-3 px-4">Time</th>
                  <th className="text-left py-3 px-4">Action</th>
                  <th className="text-left py-3 px-4">Actor</th>
                  <th className="text-left py-3 px-4">Details</th>
                  <th className="text-left py-3 px-4">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span className={`font-mono text-xs ${actionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="py-3 px-4 text-xs">{log.actor}</td>
                    <td className="py-3 px-4 text-xs text-slate-400 max-w-xs truncate">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs ${log.outcome === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {log.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
