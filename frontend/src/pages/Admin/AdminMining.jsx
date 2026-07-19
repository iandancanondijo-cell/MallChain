import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw, AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getPendingSubmissions, approveSubmission, rejectSubmission, getMiningCampaigns } from '../../core/admin/adminApi'

function InlineAction({ sub, onDone }) {
  const [mode, setMode]     = useState(null) // 'approve' | 'reject' | null
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')
  const [busy, setBusy]     = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      if (mode === 'approve') {
        await approveSubmission(sub._id, Number(amount) || 0)
        toast.success('Submission approved')
      } else {
        await rejectSubmission(sub._id, note)
        toast.success('Submission rejected')
      }
      onDone()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
      setMode(null)
    }
  }

  return (
    <div className="mt-3">
      {mode ? (
        <div className={`rounded-xl border p-3 ${mode === 'approve' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-semibold ${mode === 'approve' ? 'text-emerald-300' : 'text-red-300'}`}>
              {mode === 'approve' ? 'Approve — enter reward' : 'Reject — enter reason'}
            </span>
            <button onClick={() => setMode(null)} className="text-slate-400 hover:text-white"><X size={14}/></button>
          </div>
          <input
            type={mode === 'approve' ? 'number' : 'text'}
            value={mode === 'approve' ? amount : note}
            onChange={e => mode === 'approve' ? setAmount(e.target.value) : setNote(e.target.value)}
            placeholder={mode === 'approve' ? 'MLPTS reward (e.g. 50)' : 'Rejection reason'}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none"
          />
          <div className="flex gap-2">
            <button onClick={confirm} disabled={busy}
              className={`px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 ${mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {busy ? 'Saving…' : 'Confirm'}
            </button>
            <button onClick={() => setMode(null)} className="px-4 py-1.5 rounded-lg bg-slate-700 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setMode('approve')}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-xl text-xs">
            <CheckCircle size={12}/> Approve
          </button>
          <button onClick={() => setMode('reject')}
            className="flex items-center gap-1 bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-xl text-xs">
            <XCircle size={12}/> Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdminMining() {
  const [tab, setTab]             = useState('submissions')
  const [submissions, setSubmissions] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const loadSubmissions = async () => {
    setLoading(true); setError(null)
    try {
      const res = await getPendingSubmissions({ limit: 100 })
      setSubmissions(res.submissions || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const loadCampaigns = async () => {
    setLoading(true); setError(null)
    try {
      const res = await getMiningCampaigns({ limit: 100 })
      setCampaigns(res.campaigns || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { tab === 'submissions' ? loadSubmissions() : loadCampaigns() }, [tab])

  const onDone = () => loadSubmissions()

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mining Management</h1>

      <div className="flex gap-2 flex-wrap items-center">
        {['submissions','campaigns'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm capitalize ${tab===t ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            {t}{t==='submissions' && ` (${submissions.length})`}
          </button>
        ))}
        <button onClick={() => tab==='submissions' ? loadSubmissions() : loadCampaigns()}
          className="ml-auto flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-red-400"/>
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2"/>Loading…
        </div>
      ) : tab === 'submissions' ? (
        submissions.length === 0 ? (
          <div className="text-slate-500 text-center py-12">No pending submissions</div>
        ) : (
          <div className="space-y-3">
            {submissions.map(s => (
              <div key={s._id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-white">{s.title || s.task_type || 'Task'}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Miner: <span className="font-mono">{String(s.miner_id).slice(0,16)}…</span>
                      {s.campaign_id && ` · Campaign: ${String(s.campaign_id).slice(0,10)}…`}
                    </p>
                    {s.proof_url && (
                      <a href={s.proof_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:underline mt-1 block truncate">{s.proof_url}</a>
                    )}
                    <p className="text-xs text-slate-600 mt-1">{new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{s.status}</span>
                </div>
                <InlineAction sub={s} onDone={onDone}/>
              </div>
            ))}
          </div>
        )
      ) : (
        campaigns.length === 0 ? (
          <div className="text-slate-500 text-center py-12">No campaigns found</div>
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
                  {campaigns.map(c => (
                    <tr key={c._id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="py-3 px-4">{c.title || c.name || 'Untitled'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${c.status==='active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{c.rate_per_task ?? 0} MLPTS</td>
                      <td className="py-3 px-4 text-right">{c.budget_remaining ?? 0}</td>
                      <td className="py-3 px-4 text-right">{c.completions_count ?? 0}</td>
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
