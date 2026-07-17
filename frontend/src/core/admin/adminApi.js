import { appConfig } from '../../config/app'

const API_BASE = appConfig.apiUrl

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || `Request failed: ${res.status}`)
  return data
}

// Dashboard
export const getDashboard = () => request('/admin/dashboard')

// Users
export const getUsers = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/users?${qs}`)
}
export const getUser = (id) => request(`/admin/users/${id}`)
export const setUserRole = (id, role) => request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })
export const banUser = (id, banned, reason) => request(`/admin/users/${id}/ban`, { method: 'PUT', body: JSON.stringify({ banned, reason }) })
export const deleteUser = (id) => request(`/admin/users/${id}`, { method: 'DELETE' })

// Validators
export const getValidatorApplications = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/validators/applications?${qs}`)
}
export const reviewValidatorApplication = (id, action, notes) =>
  request(`/admin/validators/applications/${id}/review`, { method: 'POST', body: JSON.stringify({ action, notes }) })

// Treasury
export const getTreasuryPolicies = () => request('/admin/treasury/policies')
export const createTreasuryPolicy = (data) => request('/admin/treasury/policies', { method: 'POST', body: JSON.stringify(data) })
export const deleteTreasuryPolicy = (activity) => request(`/admin/treasury/policies/${activity}`, { method: 'DELETE' })
export const getTreasuryThresholds = () => request('/admin/treasury/dynamic-thresholds')
export const createTreasuryThreshold = (data) => request('/admin/treasury/dynamic-thresholds', { method: 'POST', body: JSON.stringify(data) })
export const deleteTreasuryThreshold = (id) => request(`/admin/treasury/dynamic-thresholds/${id}`, { method: 'DELETE' })
export const getTreasuryLedger = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/treasury/ledger?${qs}`)
}
export const getTreasuryMetrics = () => request('/admin/treasury/metrics')

// Mining
export const getMiningCampaigns = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/mining/campaigns?${qs}`)
}
export const getPendingSubmissions = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/mining/submissions/pending?${qs}`)
}
export const approveSubmission = (id, rewardAmount) =>
  request(`/admin/mining/submissions/${id}/approve`, { method: 'POST', body: JSON.stringify({ rewardAmount }) })
export const rejectSubmission = (id, note) =>
  request(`/admin/mining/submissions/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) })
export const updateCampaign = (id, data) =>
  request(`/admin/mining/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) })

// Governance
export const getGovernanceStats = () => request('/admin/governance/stats')

// Audit
export const getAuditLogs = (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request(`/admin/audit?${qs}`)
}

// System
export const runReconcile = () => request('/admin/reconcile', { method: 'POST' })
export const runReconciliation = () => request('/admin/reconciliation/run', { method: 'POST' })

// Task Assignment & Validator Voting
export const getTasksPendingAssignment = () => request('/task-assignment/tasks/pending-assignment')
export const getTasksInVoting = () => request('/task-assignment/tasks/voting')
export const getTasksVoteComplete = () => request('/task-assignment/tasks/vote-complete')
export const getActiveValidatorsForAssignment = () => request('/task-assignment/validators/active')
export const assignValidatorsToTask = (taskId, validatorIds) =>
  request(`/task-assignment/tasks/${taskId}/assign`, { method: 'POST', body: JSON.stringify({ validator_ids: validatorIds }) })
export const getTaskDetails = (taskId) => request(`/task-assignment/tasks/${taskId}/details`)
export const finalApproveTask = (taskId, rewardAmount) =>
  request(`/task-assignment/tasks/${taskId}/final-approve`, { method: 'POST', body: JSON.stringify({ rewardAmount }) })
export const finalRejectTask = (taskId, note) =>
  request(`/task-assignment/tasks/${taskId}/final-reject`, { method: 'POST', body: JSON.stringify({ note }) })

// Validator Voting (for validator users)
export const getMyAssignedTasks = () => request('/task-assignment/my-assigned')
export const castVote = (taskId, vote) =>
  request(`/task-assignment/tasks/${taskId}/vote`, { method: 'POST', body: JSON.stringify({ vote }) })
