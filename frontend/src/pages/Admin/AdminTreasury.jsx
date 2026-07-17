import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { getTreasuryPolicies, createTreasuryPolicy, deleteTreasuryPolicy, getTreasuryMetrics } from '../../core/admin/adminApi'

export default function AdminTreasury() {
  const [policies, setPolicies] = useState([])
  const [metrics, setMetrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ activity: '', burnPercentage: 0, description: '', enabled: true })

  const load = async () => {
    setLoading(true)
    try {
      const [polRes, metRes] = await Promise.all([getTreasuryPolicies(), getTreasuryMetrics()])
      setPolicies(polRes.policies || [])
      setMetrics(metRes.totals || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await createTreasuryPolicy(form)
      setShowForm(false)
      setForm({ activity: '', burnPercentage: 0, description: '', enabled: true })
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  const handleDelete = async (activity) => {
    if (!confirm(`Delete burn policy for "${activity}"?`)) return
    try {
      await deleteTreasuryPolicy(activity)
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Treasury Management</h1>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-xl text-sm">
            <Plus size={14} /> Add Policy
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
          <h2 className="font-semibold">New Burn Policy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Activity (e.g. marketplace_purchase)"
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
              required
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Burn %"
              value={form.burnPercentage}
              onChange={(e) => setForm({ ...form, burnPercentage: Number(e.target.value) })}
              required
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="rounded" />
              Enabled
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-sm">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="font-semibold mb-4">Burn Policies</h2>
        {loading ? (
          <div className="text-slate-400">Loading...</div>
        ) : policies.length === 0 ? (
          <div className="text-slate-400 text-center py-8">No policies configured</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2 px-3">Activity</th>
                  <th className="text-left py-2 px-3">Burn %</th>
                  <th className="text-left py-2 px-3">Description</th>
                  <th className="text-left py-2 px-3">Enabled</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.activity} className="border-b border-slate-800/50">
                    <td className="py-2 px-3 font-mono text-xs">{p.activity}</td>
                    <td className="py-2 px-3">{p.burnPercentage}%</td>
                    <td className="py-2 px-3 text-slate-400">{p.description || '-'}</td>
                    <td className="py-2 px-3">{p.enabled ? <span className="text-emerald-400">Yes</span> : <span className="text-slate-500">No</span>}</td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => handleDelete(p.activity)} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {metrics.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="font-semibold mb-4">Treasury Metrics</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2 px-3">Activity</th>
                  <th className="text-left py-2 px-3">Direction</th>
                  <th className="text-right py-2 px-3">Total Amount</th>
                  <th className="text-right py-2 px-3">Count</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    <td className="py-2 px-3 font-mono text-xs">{m.activity}</td>
                    <td className="py-2 px-3">{m.direction}</td>
                    <td className="py-2 px-3 text-right">{m.totalAmount?.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
