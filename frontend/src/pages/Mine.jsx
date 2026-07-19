import { useEffect, useState, useCallback } from 'react'
import { Pickaxe, ExternalLink, RefreshCw, Wallet, CheckCircle, Clock, ArrowUpRight } from 'lucide-react'
import { useAuthStore } from '../core/store/authStore'

const MINES_URL = import.meta.env.VITE_MINES_URL || 'http://localhost:5176'
const API_BASE  = import.meta.env.VITE_API_BASE  || 'http://localhost:4000'

export default function Mine() {
  const user  = useAuthStore(s => s.user)
  const token = useAuthStore(s => s.token)
  const [miningStats, setMiningStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [minesConnected, setMinesConnected] = useState(false)

  const fetchMiningStats = useCallback(async () => {
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/api/mines/submissions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.ok) {
        const submissions = json.data || []
        const approved    = submissions.filter(s => s.status === 'auto_approved' || s.status === 'approved')
        const pending     = submissions.filter(s => ['pending','pending_assignment','assigned','voting'].includes(s.status))
        const totalReward = approved.reduce((sum, s) => sum + (s.reward_amount || 0), 0)
        setMiningStats({
          submissions,
          approved: approved.length,
          pending:  pending.length,
          total_mlpts_earned: totalReward,
          mlpts_balance:      user?.mlpts_balance || 0,
          recent_submissions: submissions.slice(-5),
        })
      }
    } catch (err) {
      console.error('Failed to fetch mining stats:', err)
    } finally {
      setLoading(false)
    }
  }, [token, user?.mlpts_balance])

  useEffect(() => { fetchMiningStats() }, [fetchMiningStats])

  useEffect(() => {
    const handle = (event) => {
      if (event.origin !== MINES_URL) return
      const { type, data } = event.data || {}
      if (type === 'MINES_SYNC' || type === 'auth:share' || type === 'MINES_READY') {
        setMinesConnected(true)
        if (data?.mlpts_balance != null) {
          setMiningStats(prev => ({ ...prev, mlpts_balance: data.mlpts_balance }))
        }
      }
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [])

  const openMines = () => {
    const params = new URLSearchParams({ token: token || '' })
    window.open(`${MINES_URL}?${params}`, 'mallchain-mines')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Pickaxe className="text-yellow-400" size={32} />
            Mallchain Mines
          </h1>
          <p className="text-slate-400 mt-2">Browse campaigns, submit tasks, and earn MallPoints</p>
        </div>
        <button onClick={fetchMiningStats} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Launch card */}
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-8">
        <div className="flex items-center justify-between flex-wrap gap-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Launch Mines</h2>
            <p className="mt-2 text-slate-300 max-w-md">Open the Mines interface in a new window to browse campaigns and submit tasks for review.</p>
            <div className="flex items-center gap-4 mt-4">
              <span className={`flex items-center gap-2 text-sm ${minesConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`h-2 w-2 rounded-full ${minesConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {minesConnected ? 'Connected' : 'Not connected'}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-sm text-slate-400">{user?.username || user?.email || 'Guest'}</span>
            </div>
          </div>
          <button onClick={openMines}
            className="flex items-center gap-3 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-2xl transition-all hover:scale-105">
            <Pickaxe size={20} /> Open Mines <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'MLPTS Balance',     value: miningStats?.mlpts_balance     ?? user?.mlpts_balance ?? 0, icon: <Wallet size={20} className="text-yellow-400"/>  },
          { label: 'Tasks Completed',   value: miningStats?.approved          ?? 0,                        icon: <CheckCircle size={20} className="text-emerald-400"/> },
          { label: 'Pending Tasks',     value: miningStats?.pending           ?? 0,                        icon: <Clock size={20} className="text-amber-400"/>    },
          { label: 'Total MLPTS Earned',value: miningStats?.total_mlpts_earned ?? 0,                        icon: <ArrowUpRight size={20} className="text-blue-400"/>  },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="flex items-center gap-2 mb-3">{s.icon}<span className="text-sm text-slate-400">{s.label}</span></div>
            <p className="text-2xl font-bold text-white">
              {loading ? <span className="text-slate-500">…</span> : Number(s.value).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Recent submissions */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Submissions</h2>
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : (miningStats?.recent_submissions?.length ?? 0) === 0 ? (
          <p className="text-slate-500">No submissions yet. Open Mines to get started!</p>
        ) : (
          <div className="space-y-3">
            {miningStats.recent_submissions.map((sub, i) => (
              <div key={sub._id || i} className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div>
                  <p className="text-white font-medium">{sub.campaign_title || sub.title || 'Task'}</p>
                  <p className="text-sm text-slate-400">{new Date(sub.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    (sub.status === 'approved' || sub.status === 'auto_approved') ? 'bg-emerald-500/20 text-emerald-400' :
                    sub.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>{sub.status}</span>
                  {sub.reward_amount > 0 && <span className="text-yellow-400 font-medium">+{sub.reward_amount} MLPTS</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
