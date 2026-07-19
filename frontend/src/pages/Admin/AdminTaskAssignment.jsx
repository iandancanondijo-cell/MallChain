import { useState, useEffect } from 'react'
import { Users, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getTasksPendingAssignment,
  getTasksInVoting,
  getTasksVoteComplete,
  getActiveValidatorsForAssignment,
  assignValidatorsToTask,
  getTaskDetails,
  finalApproveTask,
  finalRejectTask,
} from '../../core/admin/adminApi'

export default function AdminTaskAssignment() {
  const [tab, setTab] = useState('pending')
  const [pendingTasks, setPendingTasks] = useState([])
  const [votingTasks, setVotingTasks] = useState([])
  const [completeTasks, setCompleteTasks] = useState([])
  const [validators, setValidators] = useState([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(null)
  const [selectedValidators, setSelectedValidators] = useState([])
  const [expandedTask, setExpandedTask] = useState(null)
  const [taskDetails, setTaskDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [pend, vote, comp, vals] = await Promise.all([
        getTasksPendingAssignment(),
        getTasksInVoting(),
        getTasksVoteComplete(),
        getActiveValidatorsForAssignment(),
      ])
      setPendingTasks(pend.data || [])
      setVotingTasks(vote.data || [])
      setCompleteTasks(comp.data || [])
      setValidators(vals.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Reset validator selection whenever a different task is expanded
  useEffect(() => { setSelectedValidators([]) }, [expandedTask])

  const handleExpandTask = async (taskId) => {
    if (expandedTask === taskId) {
      setExpandedTask(null)
      setTaskDetails(null)
      return
    }
    setExpandedTask(taskId)
    setTaskDetails(null)
    setLoadingDetails(true)
    try {
      const res = await getTaskDetails(taskId)
      setTaskDetails(res.data)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoadingDetails(false)
    }
  }

  const toggleValidator = (vid) => {
    setSelectedValidators(prev =>
      prev.includes(vid) ? prev.filter(v => v !== vid) : [...prev, vid]
    )
  }

  const handleAssign = async (taskId) => {
    if (selectedValidators.length !== 6) {
      toast.error('Select exactly 6 validators')
      return
    }
    setAssigning(taskId)
    try {
      await assignValidatorsToTask(taskId, selectedValidators)
      setSelectedValidators([])
      setExpandedTask(null)
      await loadAll()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAssigning(null)
    }
  }

  const handleFinalApprove = async (taskId) => {
    const amount = window.prompt('Reward amount (MLPTS):', '0')
    if (amount === null) return
    try {
      await finalApproveTask(taskId, Number(amount))
      toast.success('Task approved')
      await loadAll()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleFinalReject = async (taskId) => {
    const note = window.prompt('Rejection reason:', '')
    if (note === null) return
    try {
      await finalRejectTask(taskId, note)
      toast.success('Task rejected')
      await loadAll()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const repColor = (rep) => {
    if (rep >= 80) return 'text-emerald-400'
    if (rep >= 60) return 'text-amber-400'
    return 'text-red-400'
  }

  const statusBadge = (status) => {
    const map = {
      none: { label: 'New', color: 'bg-slate-500/20 text-slate-300' },
      pending_assignment: { label: 'Awaiting Assignment', color: 'bg-blue-500/20 text-blue-300' },
      assigned: { label: 'Assigned', color: 'bg-purple-500/20 text-purple-300' },
      voting: { label: 'Voting', color: 'bg-amber-500/20 text-amber-300' },
      vote_complete: { label: 'Votes Complete', color: 'bg-emerald-500/20 text-emerald-300' },
      approved: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-300' },
      rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-300' },
    }
    const s = map[status] || map.none
    return <span className={`px-2 py-0.5 rounded-full text-xs ${s.color}`}>{s.label}</span>
  }

  const renderTask = (task, showAssign = false, showFinalReview = false) => {
    const isExpanded = expandedTask === task._id
    const details = isExpanded && taskDetails?.task?._id === task._id ? taskDetails : null

    return (
      <div key={task._id} className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/30"
          onClick={() => handleExpandTask(task._id)}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{task.title || task.task_type || 'Mining Task'}</span>
                {statusBadge(task.assignment_status || 'none')}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Miner: {task.miner_id} | Submitted: {new Date(task.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {task.votes_yes !== undefined && (
              <div className="text-xs text-slate-400">
                <span className="text-emerald-400">{task.votes_yes || 0} YES</span>
                {' / '}
                <span className="text-red-400">{task.votes_no || 0} NO</span>
              </div>
            )}
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-800 p-4 space-y-4">
            {/* Task details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {task.proof_url && <div><span className="text-slate-500">Proof:</span> <a href={task.proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{task.proof_url}</a></div>}
              {task.description && <div className="sm:col-span-2"><span className="text-slate-500">Description:</span> {task.description}</div>}
              {task.voting_deadline && <div><span className="text-slate-500">Voting Deadline:</span> {new Date(task.voting_deadline).toLocaleString()}</div>}
            </div>

            {/* Show assigned validators with their votes */}
            {details && details.assignedValidators?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Assigned Validators & Votes</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {details.assignedValidators.map((v) => (
                    <div key={v.validator_id} className="flex items-center justify-between bg-slate-800/50 rounded-xl px-3 py-2 text-xs">
                      <div>
                        <div className="font-medium">{v.validator_id?.slice(0, 12)}...</div>
                        <div className="text-slate-400">Rep: <span className={repColor(v.mining_reputation)}>{v.mining_reputation}</span> | Votes: {v.tasks_voted}</div>
                      </div>
                      <div>
                        {v.vote === 'yes' && <span className="text-emerald-400 font-bold">YES</span>}
                        {v.vote === 'no' && <span className="text-red-400 font-bold">NO</span>}
                        {!v.vote && <span className="text-slate-500">Pending</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assignment panel: show validators to select from */}
            {showAssign && !details && (
              <div>
                <h4 className="text-sm font-medium mb-2">Select 6 Validators to Assign</h4>
                <div className="text-xs text-slate-400 mb-2">
                  Selected: {selectedValidators.length}/6 | Validators sorted by mining reputation (best first)
                </div>
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {validators.map((v) => {
                    const isSelected = selectedValidators.includes(v.validator_id)
                    const isDisabled = !isSelected && selectedValidators.length >= 6
                    return (
                      <div
                        key={v.validator_id}
                        onClick={() => !isDisabled && toggleValidator(v.validator_id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-500/20 border border-purple-500/50'
                            : isDisabled
                              ? 'bg-slate-800/30 opacity-50 cursor-not-allowed'
                              : 'bg-slate-800/50 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => toggleValidator(v.validator_id)}
                            className="rounded"
                          />
                          <div>
                            <div className="font-medium">{v.moniker || v.email || v.validator_id?.slice(0, 16)}</div>
                            <div className="text-slate-400">
                              Rep: <span className={repColor(v.mining_reputation)}>{v.mining_reputation}</span>
                              {' | '}Assigned: {v.tasks_assigned} | Voted: {v.tasks_voted}
                              {' | '}Approval: {v.approval_rate}%
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star key={i} size={10} className={i < Math.round(v.mining_reputation / 20) ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  onClick={() => handleAssign(task._id)}
                  disabled={selectedValidators.length !== 6 || assigning === task._id}
                  className="mt-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-xl text-sm"
                >
                  {assigning === task._id ? 'Assigning...' : `Assign ${selectedValidators.length} Validators`}
                </button>
              </div>
            )}

            {/* Final review panel */}
            {showFinalReview && details && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleFinalApprove(task._id)}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-sm"
                >
                  <CheckCircle size={14} /> Approve Task
                </button>
                <button
                  onClick={() => handleFinalReject(task._id)}
                  className="flex items-center gap-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-sm"
                >
                  <XCircle size={14} /> Reject Task
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const tabs = [
    { key: 'pending', label: 'Pending Assignment', count: pendingTasks.length, color: 'blue' },
    { key: 'voting', label: 'In Voting', count: votingTasks.length, color: 'amber' },
    { key: 'complete', label: 'Votes Complete', count: completeTasks.length, color: 'emerald' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Task Assignment Window</h1>
        <button onClick={loadAll} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Flow explanation */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs font-bold">1</span> User submits task</div>
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold">2</span> Admin assigns 6 validators</div>
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs font-bold">3</span> Validators vote YES/NO</div>
          <div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-bold">4</span> Admin approves/rejects</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 ${
              tab === t.key ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              t.count > 0 ? 'bg-white/20' : 'bg-slate-700'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-3">
          {tab === 'pending' && (
            pendingTasks.length === 0
              ? <div className="text-slate-400 text-center py-12">No tasks pending assignment</div>
              : pendingTasks.map(t => renderTask(t, true))
          )}
          {tab === 'voting' && (
            votingTasks.length === 0
              ? <div className="text-slate-400 text-center py-12">No tasks in voting</div>
              : votingTasks.map(t => renderTask(t))
          )}
          {tab === 'complete' && (
            completeTasks.length === 0
              ? <div className="text-slate-400 text-center py-12">No tasks with completed votes</div>
              : completeTasks.map(t => renderTask(t, false, true))
          )}
        </div>
      )}
    </div>
  )
}
