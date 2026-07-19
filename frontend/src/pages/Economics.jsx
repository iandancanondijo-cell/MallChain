import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Flame, Coins, BarChart3, Lock, Unlock,
  RefreshCw, Loader, ArrowRight, CircleDollarSign, Calendar,
  Zap, Users, PieChart
} from 'lucide-react'
import { fetchEconomyState, fetchEconomyWallets } from '../core/wallet/economyApi'

function StatCard({ label, value, sub, icon, tone = 'cyan' }) {
  const tones = {
    cyan:    'border-cyan-500/20   bg-cyan-500/10   text-cyan-300',
    amber:   'border-amber-500/20  bg-amber-500/10  text-amber-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    rose:    'border-rose-500/20   bg-rose-500/10   text-rose-300',
    purple:  'border-purple-500/20 bg-purple-500/10 text-purple-300',
    slate:   'border-slate-700     bg-slate-800/60  text-slate-300',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 ${tones[tone]}`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-70 mb-3">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-60">{sub}</div>}
    </motion.div>
  )
}

function WalletRow({ label, address, balance, locked, tone }) {
  const locked_ = Boolean(locked)
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800/60 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${tone}`} />
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="text-xs text-slate-500 font-mono">{address.slice(0, 18)}…{address.slice(-6)}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold text-white">
          {Number(balance).toLocaleString()} MLC
        </div>
        <div className={`text-xs flex items-center gap-1 justify-end ${locked_ ? 'text-rose-400' : 'text-emerald-400'}`}>
          {locked_ ? <Lock size={10} /> : <Unlock size={10} />}
          {locked_ ? 'Locked' : 'Unlocked'}
        </div>
      </div>
    </div>
  )
}

export default function Economics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)
    try {
      const d = await fetchEconomyState()
      setData(d)
    } catch (e) {
      setError(e.message || 'Failed to load economy data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-300 mb-4">{error}</p>
          <button onClick={() => load()} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm">Retry</button>
        </div>
      </div>
    )
  }

  const { emission, schedule, conversion, wallets, mlcnsPriceKes, pointPriceKes } = data || {}
  const e = emission || {}
  const phasePct = e.totalAvailable > 0 ? ((Number(e.emittedTotal || 0) / e.totalAvailable) * 100).toFixed(2) : '0.00'
  const burnPct  = Number(e.burnRatePercent || 0)

  // Genesis wallet details
  const genesisWallets = [
    { label: 'Founder',     key: 'founder',    address: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg', locked: true,  tone: 'bg-amber-400' },
    { label: 'Team',        key: 'team',       address: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5', locked: false, tone: 'bg-purple-400' },
    { label: 'AFA Charity', key: 'afa',        address: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6', locked: false, tone: 'bg-emerald-400' },
    { label: 'Orthopharm',  key: 'orthopharm', address: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f', locked: false, tone: 'bg-cyan-400' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-8 px-2">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Economics</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Live token supply, emission schedule, and wallet allocations
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-sm"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="MLCNS Price" value={`KSh ${mlcnsPriceKes}`}        sub="per MLCNS"         icon={<CircleDollarSign size={12} />} tone="cyan"   />
        <StatCard label="Mallpoint"   value={`KSh ${pointPriceKes}`}         sub="per point"         icon={<Coins size={12} />}            tone="amber"  />
        <StatCard label="Value Ratio" value={`1 MP = ${conversion?.valueRatio}x`} sub="vs MLCNS price" icon={<TrendingUp size={12} />}     tone="emerald"/>
        <StatCard label="Burn Rate"   value={`${burnPct}%`}                  sub="per transaction"   icon={<Flame size={12} />}            tone="rose"   />
      </div>

      {/* Emission metrics */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Zap className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Emission State</h2>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-300">
            Phase {e.phase} · Month {e.currentMonth}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Supply"    value={Number(e.totalSupply||0).toLocaleString()}    sub="MLCNS ever"     icon={<PieChart size={12}/>}  tone="slate"  />
          <StatCard label="Emittable"       value={Number(e.totalAvailable||0).toLocaleString()} sub="in schedule"    icon={<BarChart3 size={12}/>} tone="slate"  />
          <StatCard label="Monthly Cap"     value={Number(e.monthlyCap||0).toLocaleString()}     sub="this phase"     icon={<Calendar size={12}/>}  tone="slate"  />
          <StatCard label="Daily Limit"     value={Number(e.dailyLimit||0).toLocaleString()}     sub="tokens/day"     icon={<Zap size={12}/>}       tone="slate"  />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Emitted Total"  value={Number(e.emittedTotal||0).toLocaleString()}   sub={`${phasePct}% of schedule`} icon={<TrendingUp size={12}/>} tone="cyan"   />
          <StatCard label="Burned Total"   value={Number(e.burnedTotal||0).toLocaleString()}    sub="permanently removed"        icon={<Flame size={12}/>}      tone="rose"   />
          <StatCard label="Remaining"      value={Number(e.remainingInSchedule||0).toLocaleString()} sub={`~${e.monthsRemaining} months left`} icon={<ArrowRight size={12}/>} tone="emerald"/>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Emission progress</span>
            <span>{phasePct}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
              style={{ width: `${Math.min(parseFloat(phasePct), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Emission schedule */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Emission Schedule</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                <th className="pb-3 px-2">Phase</th>
                <th className="pb-3 px-2">Months</th>
                <th className="pb-3 px-2 text-right">Monthly</th>
                <th className="pb-3 px-2 text-right">Cumulative</th>
                <th className="pb-3 px-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(schedule?.phases || []).map(p => {
                const isCurrent = p.phase === e.phase
                return (
                  <tr key={p.phase} className={`border-b border-slate-800/50 ${isCurrent ? 'bg-cyan-500/5' : ''}`}>
                    <td className="py-3 px-2 font-bold text-white">Phase {p.phase}</td>
                    <td className="py-3 px-2 text-slate-300">Months {p.months}</td>
                    <td className="py-3 px-2 text-right text-slate-200">{p.monthly} MLC</td>
                    <td className="py-3 px-2 text-right text-slate-200">{p.cumulative}</td>
                    <td className="py-3 px-2 text-center">
                      {isCurrent
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-300">▶ Active</span>
                        : p.phase < e.phase
                          ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">Done</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-500">Upcoming</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion rules */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center gap-2 mb-5">
          <ArrowRight className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Mallpoints → MLCNS Conversion</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Rate</div>
            <div className="text-xl font-black text-white">{conversion?.rate}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="text-xs uppercase tracking-widest text-amber-400 mb-2">Badge Holders</div>
            <div className="text-sm font-semibold text-white">{conversion?.badgeHolders}</div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Non-Badge</div>
            <div className="text-sm font-semibold text-white">{conversion?.nonBadge}</div>
          </div>
        </div>
      </div>

      {/* Genesis wallets */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-bold text-white">Genesis Wallet Allocations</h2>
        </div>

        {/* Allocation bar */}
        <div className="mb-5">
          <div className="flex h-4 rounded-full overflow-hidden gap-px">
            <div className="bg-amber-400" style={{ width: '23.9%' }} title="Founder 160M" />
            <div className="bg-purple-400" style={{ width: '13.4%' }} title="Team 90M" />
            <div className="bg-cyan-400"   style={{ width:  '0.2%' }} title="AFA 1.5M" />
            <div className="bg-emerald-400"style={{ width:  '0.4%' }} title="Orthopharm 3M" />
            <div className="bg-slate-700"  style={{ width: '62.1%' }} title="Remaining supply" />
          </div>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400">
            <span><span className="text-amber-400">■</span> Founder 23.9%</span>
            <span><span className="text-purple-400">■</span> Team 13.4%</span>
            <span><span className="text-cyan-400">■</span> AFA 0.2%</span>
            <span><span className="text-emerald-400">■</span> Orthopharm 0.4%</span>
            <span><span className="text-slate-500">■</span> Remaining 62.1%</span>
          </div>
        </div>

        <div className="divide-y divide-slate-800/60">
          {genesisWallets.map(w => (
            <WalletRow
              key={w.key}
              label={w.label}
              address={w.address}
              balance={wallets?.[w.key] ?? '—'}
              locked={w.locked}
              tone={w.tone}
            />
          ))}
        </div>
      </div>

    </div>
  )
}
