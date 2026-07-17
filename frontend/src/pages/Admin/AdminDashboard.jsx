import { useState, useEffect } from 'react'
import { Users, Shield, Pickaxe, AlertTriangle } from 'lucide-react'
import { getDashboard } from '../../core/admin/adminApi'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getDashboard()
      .then((res) => setStats(res.stats))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-slate-400">Loading dashboard...</div>
  if (error) return <div className="text-red-400">Error: {error}</div>

  const cards = [
    { label: 'Total Users', value: stats?.users?.total ?? 0, icon: <Users size={24} />, color: 'blue' },
    { label: 'Admins', value: stats?.users?.admins ?? 0, icon: <Shield size={24} />, color: 'purple' },
    { label: 'Active Validators', value: stats?.validators?.active ?? 0, icon: <Shield size={24} />, color: 'emerald' },
    { label: 'Pending Validators', value: stats?.validators?.pending ?? 0, icon: <AlertTriangle size={24} />, color: 'amber' },
    { label: 'Pending Submissions', value: stats?.mining?.pendingSubmissions ?? 0, icon: <Pickaxe size={24} />, color: 'orange' },
    { label: 'Total Campaigns', value: stats?.mining?.totalCampaigns ?? 0, icon: <Pickaxe size={24} />, color: 'cyan' },
    { label: 'Banned Users', value: stats?.users?.banned ?? 0, icon: <AlertTriangle size={24} />, color: 'red' },
  ]

  const colorMap = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-6 ${colorMap[card.color]}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-70">{card.label}</span>
              {card.icon}
            </div>
            <div className="text-3xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {stats?.recentUsers?.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Users</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2 px-3">Email</th>
                  <th className="text-left py-2 px-3">Role</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((u) => (
                  <tr key={u._id} className="border-b border-slate-800/50">
                    <td className="py-2 px-3">{u.email}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${u.role === 'superadmin' ? 'bg-purple-500/20 text-purple-300' : u.role === 'admin' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-500/20 text-slate-300'}`}>
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {u.banned ? <span className="text-red-400">Banned</span> : <span className="text-emerald-400">Active</span>}
                    </td>
                    <td className="py-2 px-3 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
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
