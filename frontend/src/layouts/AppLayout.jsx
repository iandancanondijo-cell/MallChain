import { useEffect, useState } from 'react'
import {
  Outlet,
  Link,
  useLocation
} from 'react-router-dom'

import {
  LayoutDashboard,
  Wallet,
  Search,
  Landmark,
  Vote,
  Droplets,
  History,
  Shield,
  Menu,
  X,
  LogOut,
  BarChart3
} from 'lucide-react'
import { appConfig } from '../config/app'
import { useAuthStore } from '../core/store/authStore'

export default function AppLayout() {
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const [chainStatus, setChainStatus] = useState(null)
  const [healthState, setHealthState] = useState('loading')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar on route change (mobile)
  useEffect(() => {
    window.requestAnimationFrame(() => setSidebarOpen(false))
  }, [location.pathname])

  useEffect(() => {
    const base = appConfig.apiBase

    const loadChainStatus = async () => {
      try {
        const response = await fetch(`${base}/api/health`)
        if (!response.ok) throw new Error('health unavailable')
        const data = await response.json()
        const latest = data?.chain || null
        const blockTime = latest?.latestBlockTime ? new Date(latest.latestBlockTime).getTime() : Date.now()
        const stale = Date.now() - blockTime > 30000
        setChainStatus(latest)
        setHealthState(stale ? 'retrying' : 'live')
      } catch {
        setChainStatus(null)
        setHealthState('down')
      }
    }

    loadChainStatus()
    const timer = setInterval(loadChainStatus, 10000)
    return () => clearInterval(timer)
  }, [])

  const statusTone = {
    live: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]',
    retrying: 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]',
    down: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]',
    loading: 'bg-slate-500 shadow-[0_0_0_4px_rgba(148,163,184,0.15)]'
  }[healthState]

  const stateLabel = {
    live: 'Live',
    retrying: 'Retrying',
    down: 'Offline',
    loading: 'Checking'
  }[healthState]

  const networkBars = healthState === 'live' ? 5 : healthState === 'retrying' ? 3 : 1

  const walletLinks = [
    { name: 'Overview', path: '/wallet', exact: true, icon: <Wallet size={16} /> },
    { name: 'Transactions', path: '/wallet/transactions', icon: <History size={16} /> },
  ]

  const governanceLinks = [
    { name: 'Proposals', path: '/governance', exact: false, icon: <Vote size={16} /> },
  ]

  const stakingLinks = [
    { name: 'Dashboard', path: '/staking', exact: true, icon: <Landmark size={16} /> },
    { name: 'Validators', path: '/staking/validators', icon: <Search size={16} /> },
    { name: 'Validator Center', path: '/validator-center', icon: <Shield size={16} /> },
    { name: 'My Validator Center', path: '/my-validator-center', icon: <Shield size={16} /> },
  ]

  const isSubLinkActive = (path, exact) => {
    if (exact) {
      return location.pathname === path || location.pathname === `${path}/`
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const links = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: <LayoutDashboard size={18} />
    },
    {
      name: 'Explorer',
      path: '/explorer',
      icon: <Search size={18} />
    },
    {
      name: 'Liquidity',
      path: '/liquidity',
      icon: <Droplets size={18} />
    },
    {
      name: 'Economics',
      path: '/economics',
      icon: <BarChart3 size={18} />
    },
  ]

  const renderSubNav = (title, items) => (
    <div>
      <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {items.map((link) => {
          const active = isSubLinkActive(link.path, link.exact)
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {link.icon}
              {link.name}
            </Link>
          )
        })}
      </div>
    </div>
  )

  const sidebarContent = (
    <>
      <div>
        <h1 className="text-3xl font-bold">
          {appConfig.name}
        </h1>
        <p className="text-slate-400 mt-2">
          {appConfig.networkLabel}
        </p>
      </div>

      <nav className="mt-10 flex flex-col gap-3">
        <Link
          to="/dashboard"
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
            location.pathname === '/dashboard' ? 'bg-blue-600' : 'hover:bg-slate-800'
          }`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </Link>

        {renderSubNav('Wallet', walletLinks)}
        {renderSubNav('Governance', governanceLinks)}
        {renderSubNav('Staking', stakingLinks)}

        {links.filter((link) => link.path !== '/dashboard').map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              location.pathname === link.path ||
              location.pathname.startsWith(`${link.path}/`)
                ? 'bg-blue-600'
                : 'hover:bg-slate-800'
            }`}
          >
            {link.icon}
            {link.name}
          </Link>
        ))}
      </nav>
    </>
  )

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl p-6 overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-800 bg-slate-900 p-6 overflow-y-auto transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigation sidebar"
      >
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">{appConfig.name}</h1>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-xl hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">

        <header className="h-16 lg:h-20 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl px-4 lg:px-8 flex items-center justify-between gap-4">

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-800"
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>

          <div className="hidden sm:block">
            <h2 className="text-lg lg:text-2xl font-semibold truncate">
              {appConfig.networkLabel} · {appConfig.chain.id}
            </h2>
          </div>

          <div className="flex items-center gap-2 lg:gap-4 ml-auto">

            <div className="hidden md:flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-800/80 px-3 lg:px-4 py-2 text-sm text-slate-200">
              <span className="text-slate-400">Block</span>
              <strong className="text-white">#{chainStatus?.latestHeight || '—'}</strong>
            </div>

            <div className="flex items-center gap-2 lg:gap-3 rounded-2xl border border-slate-800 bg-slate-800/80 px-3 lg:px-4 py-2 text-sm text-slate-200">
              <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
              <span className="hidden sm:inline">{stateLabel}</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 rounded-2xl border border-slate-800 bg-slate-800/80 px-3 py-2" aria-label="Network speed bars">
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  key={index}
                  className={`h-4 w-1.5 rounded-full ${index < networkBars ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
              aria-label="Logout"
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
