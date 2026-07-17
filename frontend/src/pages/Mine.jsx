import { useEffect, useState, useCallback } from 'react'
import { Pickaxe, ExternalLink, RefreshCw, Wallet, CheckCircle, Clock, ArrowUpRight } from 'lucide-react'
import { useAuthStore } from '../core/store/authStore'

const MINES_URL = 'http://localhost:5176'
const API_BASE = 'http://localhost:4000'

export default function Mine() {
  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const [miningStats, setMiningStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [minesConnected, setMinesConnected] = useState(false)

  const fetchMiningStats = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/api/mines/submissions/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const json = await res.json()
      if (json.ok) {
        const submissions = json.data || []
        const approved = submissions.filter(s => s.status === 'auto_approved' || s.status === 'approved')
        const pending = submissions.filter(s => ['pending', 'pending_assignment', 'assigned', 'voting'].includes(s.status))
        const totalReward = approved.reduce((sum, s) => sum + (s.reward_amount || 0), 0)
        setMiningStats({
          submissions,
          approved: approved.length,
          pending: pending.length,
          total_mlpts_earned: totalReward,
          mlpts_balance: user?.mlpts_balance || 0,
          recent_submissions: submissions.slice(-5),
        })
      }
    } catch (err) {
      console.error('Failed to fetch mining stats:', err)
    } finally {
      setLoading(false)
    }
  }, [token, user?.mlpts_balance])

  useEffect(() => {
    fetchMiningStats()
  }, [fetchMiningStats])

  // Listen for messages from Mines window
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== MINES_URL) return
      const { type, data } = event.data
      if (type === 'MINES_SYNC' || type === 'auth:share') {
        setMinesConnected(true)
        if (data) {
          setMiningStats(prev => ({
            ...prev,
            mlpts_balance: data.mlpts_balance || prev?.mlpts_balance,
            tasks_completed: data.tasks_completed || prev?.approved,
          }))
        }
      }
      if (type === 'MINES_READY') {
        setMinesConnected(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const openMines = () => {
    const params = new URLSearchParams({
      token: token || '',
    })
    window.open(`${MINES_URL}?${params.toString()}`, 'mallchain-mines')
  }

  const handleRefresh = () => {
    fetchMiningStats()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Pickaxe className="text-yellow-400" size={32} />
            Mallchain Mines
          </h1>
          <p className="text-slate-400 mt-2">
            Browse campaigns, submit tasks, and earn MallPoints
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="Refresh stats"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Launch Mines Button */}
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Launch Mines</h2>
            <p className="mt-2 text-slate-300">
              Open the Mines interface in a new window to browse campaigns and submit tasks.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <span className={`flex items-center gap-2 text-sm ${minesConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`h-2 w-2 rounded-full ${minesConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {minesConnected ? 'Connected' : 'Not connected'}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-sm text-slate-400">
                User: {user?.username || user?.email || 'Unknown'}
              </span>
            </div>
          </div>
          <button
            onClick={openMines}
            className="flex items-center gap-3 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-2xl transition-all hover:scale-105"
          >
            <Pickaxe size={20} />
            Open Mines
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Mining Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Wallet className="text-yellow-400" size={20} />
            <span className="text-sm text-slate-400">MLPTS Balance</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {loading ? '...' : (miningStats?.mlpts_balance || user?.mlpts_balance || 0).toLocaleString()}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="text-emerald-400" size={20} />
            <span className="text-sm text-slate-400">Tasks Completed</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {loading ? '...' : (miningStats?.approved || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="text-amber-400" size={20} />
            <span className="text-sm text-slate-400">Pending Tasks</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {loading ? '...' : (miningStats?.pending || 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <div className="flex items-center gap-3 mb-3">
            <ArrowUpRight className="text-blue-400" size={20} />
            <span className="text-sm text-slate-400">Total MLPTS Earned</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {loading ? '...' : (miningStats?.total_mlpts_earned || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Recent Submissions */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Submissions</h2>
        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : miningStats?.recent_submissions?.length > 0 ? (
          <div className="space-y-3">
            {miningStats.recent_submissions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700"
              >
                <div>
                  <p className="text-white font-medium">{sub.campaign_title || 'Untitled Task'}</p>
                  <p className="text-sm text-slate-400">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    sub.status === 'approved' || sub.status === 'auto_approved' ? 'bg-emerald-500/20 text-emerald-400' :
                    sub.status === 'rejected' ? 'bg-rose-500/20 text-rose-400' :
                    sub.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {sub.status}
                  </span>
                  {sub.reward_amount > 0 && (
                    <span className="text-yellow-400 font-medium">+{sub.reward_amount} MLPTS</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">No submissions yet. Open Mines to get started!</p>
        )}
      </div>
    </div>
  )
}
