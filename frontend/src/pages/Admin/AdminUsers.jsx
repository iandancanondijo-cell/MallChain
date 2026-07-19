import { useState, useEffect, useCallback } from 'react'
import { Search, Ban, Trash2, RefreshCw, AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getUsers, setUserRole, banUser, deleteUser } from '../../core/admin/adminApi'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  // Inline confirmation states
  const [confirmDelete, setConfirmDelete] = useState(null) // userId
  const [banTarget, setBanTarget] = useState(null)         // { id, email, banned }
  const [banReason, setBanReason] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      const res = await getUsers(params)
      setUsers(res.users || [])
      setTotal(res.total || 0)
    } catch (e) {
      toast.error(e.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [page, roleFilter, search])

  useEffect(() => { loadUsers() }, [page, roleFilter])

  const handleSearch = (e) => { e.preventDefault(); setPage(0); loadUsers() }

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId)
    try {
      await setUserRole(userId, newRole)
      toast.success('Role updated')
      loadUsers()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleBanConfirm = async () => {
    if (!banTarget) return
    setActionLoading(banTarget.id)
    try {
      await banUser(banTarget.id, !banTarget.banned, banReason)
      toast.success(banTarget.banned ? 'User unbanned' : 'User banned')
      setBanTarget(null)
      setBanReason('')
      loadUsers()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return
    setActionLoading(confirmDelete)
    try {
      await deleteUser(confirmDelete)
      toast.success('User deleted')
      setConfirmDelete(null)
      loadUsers()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">User Management</h1>

      {/* Search & filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email…"
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 w-56"/>
          <button type="submit" className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-sm">
            <Search size={16}/>
          </button>
        </form>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0) }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm">
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <button onClick={loadUsers} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl text-sm ml-auto">
          <RefreshCw size={14}/> Refresh
        </button>
        <span className="text-sm text-slate-400">{total} users</span>
      </div>

      {/* Ban inline modal */}
      {banTarget && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-amber-300">
              {banTarget.banned ? 'Unban' : 'Ban'} {banTarget.email}?
            </h3>
            <button onClick={() => { setBanTarget(null); setBanReason('') }} className="text-slate-400 hover:text-white"><X size={16}/></button>
          </div>
          {!banTarget.banned && (
            <input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason (optional)"
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-amber-500"/>
          )}
          <div className="flex gap-2">
            <button onClick={handleBanConfirm} disabled={!!actionLoading}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm disabled:opacity-50">
              Confirm
            </button>
            <button onClick={() => { setBanTarget(null); setBanReason('') }}
              className="px-4 py-2 rounded-xl bg-slate-700 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Delete inline confirm */}
      {confirmDelete && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 flex items-center gap-4">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0"/>
          <p className="text-red-300 text-sm flex-1">Permanently delete this user? This cannot be undone.</p>
          <div className="flex gap-2">
            <button onClick={handleDeleteConfirm} disabled={!!actionLoading}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-50">Delete</button>
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl bg-slate-700 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left py-3 px-4">Email</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Joined</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2"/>Loading…
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-slate-500">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u._id} className={`border-b border-slate-800/50 hover:bg-slate-800/20 ${actionLoading===u._id ? 'opacity-60' : ''}`}>
                  <td className="py-3 px-4 font-medium">{u.email}</td>
                  <td className="py-3 px-4">
                    <select value={u.role || 'user'} onChange={e => handleRoleChange(u._id, e.target.value)}
                      disabled={actionLoading === u._id}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs ${u.banned ? 'text-red-400' : 'text-emerald-400'}`}>
                      {u.banned ? 'Banned' : 'Active'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setBanTarget({ id: u._id, email: u.email, banned: u.banned })}
                        disabled={actionLoading === u._id} title={u.banned ? 'Unban' : 'Ban'}
                        className={`p-1.5 rounded-lg ${u.banned ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}>
                        <Ban size={14}/>
                      </button>
                      <button onClick={() => setConfirmDelete(u._id)} disabled={actionLoading === u._id} title="Delete"
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-40">Prev</button>
          <span className="px-4 py-2 text-sm text-slate-400">Page {page+1}</span>
          <button onClick={() => setPage(p => p+1)} disabled={(page+1)*50>=total} className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
