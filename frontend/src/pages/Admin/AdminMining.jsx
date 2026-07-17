import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { getPendingSubmissions, approveSubmission, rejectSubmission, getMiningCampaigns } from '../../core/admin/adminApi'

export default function AdminMining() {
  const [tab, setTab] = useState('submissions')
  const [submissions, setSubmissions] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectNote, setRejectNote] = useState('')

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const res = await getPendingSubmissions({ limit: 100 })
      setSubmissions(res.submissions || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const res = await getMiningCampaigns({ limit: 100 })
      setCampaigns(res.campaigns || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'submissions') loadSubmissions()
    else loadCampaigns()
  }, [tab])

  const handleApprove = async (id) => {
    const amount = prompt('Reward amount (MLPTS):', '0')
    if (amount === null) return
    setActionLoading(id)
    try {
      await approveSubmission(id, Number(amount))
      await loadSubmissions()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (id) => {
    const note = prompt('Rejection reason:', '')
    if (note === null) return
    setActionLoading(id)
    try {
      await rejectSubmission(id, note)
      await loadSubmissions()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mining Management</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('submissions')}
          className={`px-4 py-2 rounded-xl text-sm ${tab === 'submissions' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'}`}
        >
          Pending Submissions ({submissions.length})
        </button>
        <button
          onClick={() => setTab('campaigns')}
          className={`px-4 py-2 rounded-xl text-sm ${tab === 'campaigns' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'}`}
        >
          Campaigns
        </button>
        <button onClick={tab === 'submissions' ? loadSubmissions : loadCampaigns} className="ml-auto flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading...</div>
      ) : tab === 'submissions' ? (
        submissions.length === 0 ? (
          <div className="text-slate-400 text-center py-12">No pending submissions</div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s._id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.title || s.task_type || 'Task'}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Miner: {s.miner_id} | Campaign: {s.campaign_id || 'N/A'} | Status: {s.status}
                    </div>
                    {s.proof_url && <div className="text-xs text-slate-500 mt-1">Proof: {s.proof_url}</div>}
                    <div className="text-xs text-slate-500 mt-1">Submitted: {new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(s._id)}
                      disabled={actionLoading === s._id}
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl text-xs"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button
                      onClick={() => handleReject(s._id)}
                      disabled={actionLoading === s._id}
                      className="flex items-center gap-1 bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-xl text-xs"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        campaigns.length === 0 ? (
          <div className="text-slate-400 text-center py-12">No campaigns found</div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="text-left py-3 px-4">Title</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Rate/Task</th>
                    <th className="text-right py-3 px-4">Budget Left</th>
                    <th className="text-right py-3 px-4">Completions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c._id} className="border-b border-slate-800/50">
                      <td className="py-3 px-4">{c.title || c.name || 'Untitled'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{c.rate_per_task || 0}</td>
                      <td className="py-3 px-4 text-right">{c.budget_remaining || 0}</td>
                      <td className="py-3 px-4 text-right">{c.completions_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
