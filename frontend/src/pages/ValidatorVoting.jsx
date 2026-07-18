import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, AlertTriangle } from 'lucide-react'
import { getMyAssignedTasks, castVote } from '../core/admin/adminApi'

export default function ValidatorVoting() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getMyAssignedTasks()
      setTasks(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleVote = async (taskId, vote) => {
    if (!confirm(`Are you sure you want to vote ${vote.toUpperCase()} on this task?`)) return
    setVoting(taskId)
    try {
      await castVote(taskId, vote)
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setVoting(null)
    }
  }

  const timeLeft = (deadline) => {
    if (!deadline) return 'No deadline'
    const diff = new Date(deadline) - new Date()
    if (diff <= 0) return 'Expired'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${mins}m left`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Assigned Tasks</h1>
        <button onClick={load} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
        Review the mining task submissions below. Your vote contributes to the consensus. 
        You need to vote YES or NO on each task assigned to you before the deadline.
      </div>

      {loading ? (
        <div className="text-slate-400">Loading assigned tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-slate-400 text-lg">No tasks assigned to you</div>
          <div className="text-slate-500 text-sm mt-2">Check back later for new assignments</div>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task._id} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{task.title || task.task_type || 'Mining Task'}</h3>
                    {task.has_voted ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">
                        Voted: {task.my_vote?.toUpperCase()}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300">
                        Awaiting your vote
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-400">
                    <div><span className="text-slate-500">Miner:</span> {task.miner_id}</div>
                    <div><span className="text-slate-500">Type:</span> {task.task_type || 'N/A'}</div>
                    {task.proof_url && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500">Proof:</span>{' '}
                        <a href={task.proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                          {task.proof_url}
                        </a>
                      </div>
                    )}
                    {task.description && (
                      <div className="sm:col-span-2"><span className="text-slate-500">Description:</span> {task.description}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock size={12} />
                      {timeLeft(task.voting_deadline)}
                    </div>
                    <div className="text-slate-400">
                      Votes so far: <span className="text-emerald-400">{task.votes_yes || 0} YES</span> / <span className="text-red-400">{task.votes_no || 0} NO</span>
                    </div>
                  </div>
                </div>

                {!task.has_voted && (
                  <div className="flex flex-col gap-2 min-w-[120px]">
                    <button
                      onClick={() => handleVote(task._id, 'yes')}
                      disabled={voting === task._id}
                      className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl text-sm font-medium"
                    >
                      <CheckCircle size={16} /> YES
                    </button>
                    <button
                      onClick={() => handleVote(task._id, 'no')}
                      disabled={voting === task._id}
                      className="flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-xl text-sm font-medium"
                    >
                      <XCircle size={16} /> NO
                    </button>
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
