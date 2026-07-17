import { useState, useEffect } from 'react'
import { Search, Ban, Trash2, UserCog } from 'lucide-react'
import { getUsers, setUserRole, banUser, deleteUser } from '../../core/admin/adminApi'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50 }
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      const res = await getUsers(params)
      setUsers(res.users)
      setTotal(res.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [page, roleFilter])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(0)
    loadUsers()
  }

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId)
    try {
      await setUserRole(userId, newRole)
      await loadUsers()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleBan = async (userId, currentlyBanned) => {
    const reason = currentlyBanned ? '' : prompt('Ban reason (optional):')
    if (currentlyBanned === false && reason === null) return
    setActionLoading(userId)
    try {
      await banUser(userId, !currentlyBanned, reason)
      await loadUsers()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (userId, email) => {
    if (!confirm(`Permanently delete user ${email}? This cannot be undone.`)) return
    setActionLoading(userId)
    try {
      await deleteUser(userId)
      await loadUsers()
    } catch (e) {
      alert(e.message)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">User Management</h1>

      <div className="flex flex-wrap gap-4 items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
          <button type="submit" className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl text-sm">
            <Search size={16} />
          </button>
        </form>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0) }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
        >
          <option value="">All Roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <span className="text-sm text-slate-400">{total} users</span>
      </div>

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
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-400">No users found</td></tr>
              ) : users.map((u) => (
                <tr key={u._id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-3 px-4">{u.email}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role || 'user'}
                      onChange={(e) => handleRoleChange(u._id, e.target.value)}
                      disabled={actionLoading === u._id}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    {u.banned ? (
                      <span className="text-red-400 text-xs">Banned</span>
                    ) : (
                      <span className="text-emerald-400 text-xs">Active</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleBan(u._id, u.banned)}
                        disabled={actionLoading === u._id}
                        className={`p-1.5 rounded-lg text-xs ${u.banned ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}
                        title={u.banned ? 'Unban' : 'Ban'}
                      >
                        <Ban size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(u._id, u.email)}
                        disabled={actionLoading === u._id}
                        className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs"
                        title="Delete"
                      >
                        <Trash2 size={14} />
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
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-50">Prev</button>
          <span className="px-4 py-2 text-sm text-slate-400">Page {page + 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total} className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  )
}
