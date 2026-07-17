import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Shield,
  Wallet,
  Pickaxe,
  Vote,
  ClipboardList,
  Settings,
  Menu,
  X,
  LogOut,
  ArrowLeft,
  ClipboardCheck,
} from 'lucide-react'
import { useAuthStore } from '../core/store/authStore'

const adminLinks = [
  { name: 'Dashboard', path: '/admin', exact: true, icon: <LayoutDashboard size={18} /> },
  { name: 'Task Assignment', path: '/admin/task-assignment', icon: <ClipboardCheck size={18} /> },
  { name: 'Mining', path: '/admin/mining', icon: <Pickaxe size={18} /> },
  { name: 'Users', path: '/admin/users', icon: <Users size={18} /> },
  { name: 'Validators', path: '/admin/validators', icon: <Shield size={18} /> },
  { name: 'Treasury', path: '/admin/treasury', icon: <Wallet size={18} /> },
  { name: 'Governance', path: '/admin/governance', icon: <Vote size={18} /> },
  { name: 'Audit Log', path: '/admin/audit', icon: <ClipboardList size={18} /> },
  { name: 'Settings', path: '/admin/settings', icon: <Settings size={18} /> },
]

export default function AdminLayout() {
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    window.requestAnimationFrame(() => setSidebarOpen(false))
  }, [location.pathname])

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const sidebarContent = (
    <>
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="text-slate-400 mt-1 text-sm">Mallchain Administration</p>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {adminLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
              isActive(link.path, link.exact)
                ? 'bg-purple-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {link.icon}
            {link.name}
          </Link>
        ))}
      </nav>

      <div className="mt-auto pt-8 flex flex-col gap-2">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        >
          <ArrowLeft size={18} />
          Back to App
        </Link>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-72 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-800 bg-slate-900 p-6 overflow-y-auto transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Admin</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl px-4 lg:px-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-800"
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300">
              <Shield size={14} />
              {user?.role === 'superadmin' ? 'Superadmin' : 'Admin'}
            </div>
            <span className="text-sm text-slate-400 hidden sm:block">{user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
