import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getValidatorApplications, reviewValidatorApplication } from '../../core/admin/adminApi'

// Per-application notes — avoids shared state bleeding between cards
function AppCard({ app, onReviewed }) {
  const [notes, setNotes]       = useState('')
  const [reviewing, setReviewing] = useState(false)

  const handle = async (action) => {
    setReviewing(true)
    try {
      await reviewValidatorApplication(app._id, action, notes)
      toast.success(`Application ${action}`)
      onReviewed()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setReviewing(false)
    }
  }

  const statusColor = {
    pending:  'bg-amber-500/20 text-amber-300',
    approved: 'bg-emerald-500/20 text-emerald-300',
    rejected: 'bg-red-500/20 text-red-300',
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="font-semibold text-lg">{app.moniker || 'Unnamed Validator'}</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[app.status] || 'bg-slate-700 text-slate-300'}`}>
              {app.status}
            </span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {[
              { label: 'Applicant',      value: app.applicantAddress },
              { label: 'Validator addr', value: app.validatorAddress || 'N/A' },
              { label: 'Website',        value: app.website || 'N/A' },
              { label: 'Self-delegation',value: `${app.selfDelegationAmount || 0} ${app.denom || 'stake'}` },
              { label: 'Submitted',      value: new Date(app.submittedAt || app.createdAt).toLocaleString() },
              app.reviewedAt && { label: 'Reviewed', value: new Date(app.reviewedAt).toLocaleString() },
              app.reviewer   && { label: 'Reviewer', value: app.reviewer },
            ].filter(Boolean).map(({ label, value }) => (
              <div key={label} className="flex gap-2">
                <dt className="text-slate-500 w-32 flex-shrink-0">{label}:</dt>
                <dd className="text-slate-300 truncate">{value}</dd>
              </div>
            ))}
            {app.details && (
              <div className="sm:col-span-2 flex gap-2">
                <dt className="text-slate-500 w-32 flex-shrink-0">Details:</dt>
                <dd className="text-slate-300">{app.details}</dd>
              </div>
            )}
            {app.reviewNotes && (
              <div className="sm:col-span-2 flex gap-2">
                <dt className="text-slate-500 w-32 flex-shrink-0">Review notes:</dt>
                <dd className="text-slate-300">{app.reviewNotes}</dd>
              </div>
            )}
          </dl>
        </div>

        {app.status === 'pending' && (
          <div className="flex flex-col gap-2 w-full sm:w-52">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Review notes (optional)" rows={2}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-purple-500"/>
            <div className="flex gap-2">
              <button onClick={() => handle('approved')} disabled={reviewing}
                className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl text-sm disabled:opacity-50">
                <CheckCircle size={14}/> Approve
              </button>
              <button onClick={() => handle('rejected')} disabled={reviewing}
                className="flex-1 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 px-3 py-2 rounded-xl text-sm disabled:opacity-50">
                <XCircle size={14}/> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminValidators() {
  const [applications, setApplications] = useState([])
  const [total, setTotal]               = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading]           = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (statusFilter) params.status = statusFilter
      const res = await getValidatorApplications(params)
      setApplications(res.applications || [])
      setTotal(res.total || 0)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Validator Applications</h1>
        <button onClick={load} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14}/> Refresh
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-slate-400">{total} applications</span>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2"/>Loading…
        </div>
      ) : applications.length === 0 ? (
        <div className="text-slate-500 text-center py-12">No applications found</div>
      ) : (
        <div className="space-y-4">
          {applications.map(app => <AppCard key={app._id} app={app} onReviewed={load}/>)}
        </div>
      )}
    </div>
  )
}
