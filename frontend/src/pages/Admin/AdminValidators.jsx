import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Eye } from 'lucide-react'
import { getValidatorApplications, reviewValidatorApplication } from '../../core/admin/adminApi'

export default function AdminValidators() {
  const [applications, setApplications] = useState([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(null)
  const [notes, setNotes] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (statusFilter) params.status = statusFilter
      const res = await getValidatorApplications(params)
      setApplications(res.applications)
      setTotal(res.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  const handleReview = async (id, action) => {
    setReviewing(id)
    try {
      await reviewValidatorApplication(id, action, notes)
      setNotes('')
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setReviewing(null)
    }
  }

  const statusColor = {
    pending: 'bg-amber-500/20 text-amber-300',
    approved: 'bg-emerald-500/20 text-emerald-300',
    rejected: 'bg-red-500/20 text-red-300',
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Validator Applications</h1>

      <div className="flex gap-4 items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="text-sm text-slate-400">{total} applications</span>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading...</div>
      ) : applications.length === 0 ? (
        <div className="text-slate-400 text-center py-12">No applications found</div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div key={app._id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{app.moniker || 'Unnamed Validator'}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[app.status] || ''}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-400">
                    <div><span className="text-slate-500">Applicant:</span> {app.applicantAddress}</div>
                    <div><span className="text-slate-500">Validator:</span> {app.validatorAddress || 'N/A'}</div>
                    <div><span className="text-slate-500">Website:</span> {app.website || 'N/A'}</div>
                    <div><span className="text-slate-500">Self-delegation:</span> {app.selfDelegationAmount || '0'} {app.denom || 'stake'}</div>
                    <div className="sm:col-span-2"><span className="text-slate-500">Details:</span> {app.details || 'N/A'}</div>
                    <div><span className="text-slate-500">Submitted:</span> {new Date(app.submittedAt || app.createdAt).toLocaleString()}</div>
                    {app.reviewedAt && <div><span className="text-slate-500">Reviewed:</span> {new Date(app.reviewedAt).toLocaleString()}</div>}
                    {app.reviewer && <div><span className="text-slate-500">Reviewer:</span> {app.reviewer}</div>}
                    {app.reviewNotes && <div className="sm:col-span-2"><span className="text-slate-500">Notes:</span> {app.reviewNotes}</div>}
                  </div>
                </div>

                {app.status === 'pending' && (
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Review notes (optional)"
                      className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(app._id, 'approved')}
                        disabled={reviewing === app._id}
                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl text-sm"
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={() => handleReview(app._id, 'rejected')}
                        disabled={reviewing === app._id}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 px-3 py-2 rounded-xl text-sm"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
