import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import socket from '../core/socket/socket'
import { useChainHealth, startHealthPolling } from '../core/store/chainHealthStore'
import HeroMetrics from '../components/dashboard/HeroMetrics'
import LiveChart from '../components/dashboard/LiveChart'
import RecentTransactions from '../components/dashboard/RecentTransactions'
import NetworkActivity from '../components/dashboard/NetworkActivity'
import { appConfig } from '../config/app'

export default function Dashboard() {
  const { chainStatus, healthState } = useChainHealth()
  const [blocks, setBlocks]           = useState([])
  const [marketEvents, setMarketEvents] = useState([])
  const [priceData, setPriceData]     = useState(null)
  const [treasury, setTreasury]       = useState(null)
  const [archiveTxs, setArchiveTxs]   = useState([])
  const [showArchive, setShowArchive] = useState(false)

  // Use shared health store — no extra polling here
  useEffect(() => startHealthPolling(), [])

  // Load archive transactions once on mount
  useEffect(() => {
    fetch(`${appConfig.apiBase}/api/blockchain/tx/all?limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.transactions) setArchiveTxs(d.transactions) })
      .catch(() => {})
  }, [])

  // Socket subscriptions
  useEffect(() => {
    socket.emit('subscribe:blocks')
    socket.emit('subscribe:market')
    socket.emit('subscribe:price')

    socket.on('block:new',      b => setBlocks(p => [b, ...p.slice(0, 9)]))
    socket.on('market:event',   e => setMarketEvents(p => [e, ...p.slice(0, 9)]))
    socket.on('price:update',   d => setPriceData(d))
    socket.on('treasury_update',d => setTreasury(d))

    return () => {
      socket.off('block:new')
      socket.off('market:event')
      socket.off('price:update')
      socket.off('treasury_update')
    }
  }, [])

  const networkBars = healthState === 'live' ? 5 : healthState === 'retrying' ? 3 : 1

  const statusTone = {
    live: 'bg-emerald-500', retrying: 'bg-amber-400',
    down: 'bg-rose-500', loading: 'bg-slate-500',
  }[healthState]

  const statusLabel = {
    live: 'Live', retrying: 'Retrying', down: 'Offline', loading: 'Checking',
  }[healthState]

  const formatAmount = (amount) => {
    if (!amount) return '0'
    if (Array.isArray(amount)) return amount.map(a => `${a.amount || 0} ${a.denom || ''}`.trim()).filter(Boolean).join(', ')
    if (typeof amount === 'object') return `${amount.amount || 0} ${amount.denom || ''}`.trim()
    return String(amount)
  }

  const trunc = (v, n = 14) => !v ? '—' : v.length > n ? `${v.slice(0, n)}…` : v

  return (
    <div className="max-w-7xl mx-auto space-y-10 py-6 px-2">

      {/* Header */}
      <div>
        <h1 className="text-4xl font-black text-white">Mallcoin Network</h1>
        <p className="text-slate-400 mt-2">Real-time blockchain dashboard</p>
      </div>

      {/* Health + metrics row */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6">
        <motion.div whileHover={{y:-2}}
          className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-slate-400 text-sm">Network Health</p>
              <p className="text-4xl font-black text-white mt-2">
                #{chainStatus.latestHeight || '—'}
              </p>
              <p className="text-slate-400 text-sm mt-1">{chainStatus.moniker || 'Mallchain'} · {chainStatus.chainId}</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-700 bg-slate-800/80 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`}/>
              <span>{statusLabel}</span>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5" aria-label="Network speed bars">
            {Array.from({length:5},(_,i) => (
              <span key={i} className={`h-4 w-2 rounded-full ${i < networkBars ? 'bg-emerald-400' : 'bg-slate-700'}`}/>
            ))}
          </div>
        </motion.div>

        <div className="flex flex-col gap-3 xl:min-w-[200px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex-1">
            <p className="text-slate-500 text-xs uppercase tracking-widest">Live Blocks</p>
            <p className="text-2xl font-black text-white mt-1">{blocks.length}</p>
            <p className="text-slate-500 text-xs mt-1">this session</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 flex-1">
            <p className="text-slate-500 text-xs uppercase tracking-widest">Market Events</p>
            <p className="text-2xl font-black text-white mt-1">{marketEvents.length}</p>
            <p className="text-slate-500 text-xs mt-1">this session</p>
          </div>
        </div>
      </div>

      {/* Down banner */}
      {healthState === 'down' && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3">
          <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse mt-0.5 flex-shrink-0"/>
          <p className="text-red-200 text-sm">Unable to reach the blockchain node. Retrying…</p>
        </div>
      )}

      {/* Hero metrics */}
      <HeroMetrics priceData={priceData} treasury={treasury} health={chainStatus}
        validators={null} loading={healthState === 'loading'}/>

      {/* Chart + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        <LiveChart priceData={priceData} loading={healthState === 'loading'}/>
        <NetworkActivity health={chainStatus} healthState={healthState} validators={null}/>
      </div>

      {/* Recent transactions */}
      <RecentTransactions/>

      {/* Live feeds */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <FeedPanel title="Live Blocks" empty="Waiting for blocks…">
          {blocks.map((b, i) => (
            <FeedCard key={i} title={`Block #${b.height}`} value={`${b.transactions ?? 0} txs`} sub={b.time}/>
          ))}
        </FeedPanel>
        <FeedPanel title="Market Activity" empty="Waiting for activity…">
          {marketEvents.map((e, i) => (
            <FeedCard key={i} title={e.type} value={e.amount} sub={e.user}/>
          ))}
        </FeedPanel>
      </div>

      {/* Archive */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Recent On-Chain Transactions</h2>
          <button onClick={() => setShowArchive(v => !v)}
            className="px-4 py-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 text-xs font-semibold hover:bg-cyan-400/20 transition">
            {showArchive ? 'Hide' : 'Show'} archive
          </button>
        </div>
        {showArchive && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {archiveTxs.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No on-chain transactions found</p>
            ) : archiveTxs.map((tx, i) => (
              <div key={tx.txHash || i} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span className="text-cyan-300 font-mono">#{tx.height || '—'}</span>
                  <span>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}</span>
                </div>
                <p className="text-sm text-white font-mono">{trunc(tx.txHash, 24)}</p>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="bg-emerald-400/10 rounded-full px-2 py-0.5">Gas: {tx.gas_used || 0}</span>
                  <span className="bg-violet-400/10 rounded-full px-2 py-0.5">{tx.code===0 ? 'Success' : 'Failed'}</span>
                </div>
                {(tx.messages||[]).slice(0,1).map((m,mi) => (
                  <div key={mi} className="mt-2 text-xs text-slate-400">
                    {m.from_address && <span>From: {trunc(m.from_address)} → {trunc(m.to_address)} · {formatAmount(m.amount)}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedPanel({ title, empty, children }) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : !!children
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="space-y-3">
        {hasChildren ? children : <p className="text-slate-500 text-center py-8">{empty}</p>}
      </div>
    </div>
  )
}

function FeedCard({ title, value, sub }) {
  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
      className="bg-slate-800/60 rounded-2xl p-4 flex justify-between items-start">
      <div>
        <p className="font-bold text-sm">{title}</p>
        {sub && <p className="text-slate-400 text-xs mt-0.5">{sub}</p>}
      </div>
      {value != null && <p className="text-cyan-400 text-sm font-semibold">{value}</p>}
    </motion.div>
  )
}
