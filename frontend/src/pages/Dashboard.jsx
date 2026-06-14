import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

import socket from '../core/socket/socket'
import HeroMetrics from '../components/dashboard/HeroMetrics'
import LiveChart from '../components/dashboard/LiveChart'
import RecentTransactions from '../components/dashboard/RecentTransactions'
import NetworkActivity from '../components/dashboard/NetworkActivity'
import LoadingState from '../components/shared/LoadingState'
import ErrorState from '../components/shared/ErrorState'

export default function Dashboard() {

  const [blocks, setBlocks] =
    useState([])

  const [marketEvents, setMarketEvents] =
    useState([])

  const [priceData, setPriceData] =
    useState(null)

  const [treasury, setTreasury] =
    useState(null)

  const [health, setHealth] =
    useState(null)

  const [healthState, setHealthState] =
    useState('loading')

  const [archiveTxs, setArchiveTxs] =
    useState([])

  const [showArchive, setShowArchive] =
    useState(false)

  const [error, setError] =
    useState(null)

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

    const loadHealth = async () => {
      try {
        const response = await fetch(`${base}/api/health`)
        if (!response.ok) throw new Error('health unavailable')
        const data = await response.json()
        const latest = data?.chain || null
        const blockTime = latest?.latestBlockTime ? new Date(latest.latestBlockTime).getTime() : Date.now()
        const stale = Date.now() - blockTime > 30000
        setHealth(latest)
        setHealthState(stale ? 'retrying' : 'live')
        setError(null)
      } catch {
        setHealth(null)
        setHealthState('down')
        setError('Unable to reach the blockchain node. Retrying…')
      }
    }

    loadHealth()
    const timer = setInterval(loadHealth, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

    const loadArchive = async () => {
      try {
        const response = await fetch(`${base}/api/blockchain/tx/all?limit=25`)
        if (!response.ok) throw new Error('archive unavailable')
        const data = await response.json()
        setArchiveTxs(data?.transactions || [])
      } catch {
        setArchiveTxs([])
      }
    }

    loadArchive()
  }, [])

  useEffect(() => {

    socket.emit('subscribe:blocks')

    socket.emit('subscribe:market')

    socket.emit('subscribe:price')

    socket.on(
      'block:new',
      block => {

        setBlocks(prev => [
          block,
          ...prev.slice(0, 9)
        ])

      }
    )

    socket.on(
      'market:event',
      event => {

        setMarketEvents(prev => [
          event,
          ...prev.slice(0, 9)
        ])

      }
    )

    socket.on(
      'price:update',
      data => {
        setPriceData(data)
      }
    )

    socket.on(
      'treasury_update',
      data => {
        setTreasury(data)
      }
    )

    return () => {

      socket.off('block:new')

      socket.off('market:event')

      socket.off('price:update')

      socket.off('treasury_update')

    }

  }, [])

  const networkBars = useMemo(() => healthState === 'live' ? 5 : healthState === 'retrying' ? 3 : 1, [healthState])

  const currentBlockTxs = useMemo(() => {
    const latestHeight = Number(health?.latestHeight || 0)
    if (!latestHeight) return []
    return archiveTxs.filter(tx => Number(tx.height) === latestHeight)
  }, [archiveTxs, health?.latestHeight])

  const formatAmount = (amount) => {
    if (!amount) return '0'
    if (Array.isArray(amount)) {
      return amount
        .map(item => `${item.amount || 0} ${item.denom || ''}`.trim())
        .filter(Boolean)
        .join(', ')
    }
    if (typeof amount === 'string') return amount
    if (typeof amount === 'object') return `${amount.amount || 0} ${amount.denom || ''}`.trim()
    return String(amount)
  }

  const truncate = (value, length = 12) => {
    if (!value) return '—'
    return value.length > length ? `${value.slice(0, length)}…` : value
  }

  const statusTone = {
    live: 'bg-emerald-500',
    retrying: 'bg-amber-400',
    down: 'bg-rose-500',
    loading: 'bg-slate-500'
  }[healthState]

  const statusLabel = {
    live: 'Live',
    retrying: 'Retrying',
    down: 'Offline',
    loading: 'Checking'
  }[healthState]

  return (
    <div
      className="
        min-h-screen
        bg-slate-950
        text-white
        p-8
      "
    >

      <div
        className="
          max-w-7xl
          mx-auto
        "
      >

        <div className="mb-10">

          <h1
            className="
              text-5xl
              font-black
            "
          >
            Mallcoin Network
          </h1>

          <p
            className="
              text-slate-400
              mt-3
            "
          >
            Realtime blockchain dashboard
          </p>

        </div>

        <div className="mb-10 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <motion.div
            whileHover={{ y: -4 }}
            className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-slate-400">Network Health</p>
                <h2 className="mt-2 text-2xl font-black">Live Blocks</h2>
                <p className="mt-2 text-sm text-slate-400">Real block height from the chain endpoint, with live status and network bars.</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-800/80 px-4 py-3 text-sm text-slate-200">
                <span className={`h-3 w-3 rounded-full ${statusTone}`} />
                <span>{statusLabel}</span>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-end gap-4">
              <div>
                <div className="text-slate-400 text-xs uppercase tracking-[0.25em]">Current block</div>
                <div className="mt-2 text-4xl font-black text-white">#{health?.latestHeight || '—'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-800/80 px-4 py-3 text-sm text-slate-300">
                {health?.moniker || 'Mallchain'}
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2" aria-label="Blockchain speed bars">
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  key={index}
                  className={`h-5 w-2 rounded-full ${index < networkBars ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Current block activity</p>
                  <p className="mt-1 text-slate-300">{currentBlockTxs.length ? `${currentBlockTxs.length} transaction${currentBlockTxs.length === 1 ? '' : 's'} recorded in this block.` : 'No on-chain transactions were recorded in the current block yet.'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchive(v => !v)}
                  className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200 transition hover:bg-cyan-400/20"
                >
                  {showArchive ? 'Hide archive' : 'View archive'}
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {currentBlockTxs.length === 0 ? (
                  <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 text-center text-slate-300">
                    <div>
                      <div className="text-lg font-semibold text-white">No transaction</div>
                      <p className="mt-1 text-sm text-slate-400">This block currently has no transaction data to display.</p>
                    </div>
                  </div>
                ) : currentBlockTxs.slice(0, 3).map((tx, idx) => {
                  const transfers = (tx.messages || []).filter(message => message['@type']?.includes('MsgSend') || message['@type']?.includes('Transfer'))
                  return (
                    <div key={`${tx.txHash || idx}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="font-semibold uppercase tracking-[0.25em] text-cyan-200">Tx {idx + 1}</span>
                        <span>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Timestamp unavailable'}</span>
                      </div>
                      <div className="mt-2 text-sm text-white">{truncate(tx.txHash || 'Unknown tx hash', 18)}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1">Gas used: {tx.gas_used || 0}</span>
                        <span className="rounded-full bg-violet-400/10 px-2 py-1">Status: {tx.code === 0 ? 'Success' : 'Failed'}</span>
                      </div>
                      {transfers.length > 0 ? (
                        <ul className="mt-3 space-y-2 text-xs text-slate-300">
                          {transfers.map((message, txIndex) => (
                            <li key={`${tx.txHash || idx}-${txIndex}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                              <div className="font-semibold text-slate-100">{message['@type'] || 'Transfer'}</div>
                              <div className="mt-1">From: {truncate(message.from_address || message.sender || 'Unknown')}</div>
                              <div>To: {truncate(message.to_address || message.recipient || 'Unknown')}</div>
                              <div>Amount: {formatAmount(message.amount)}</div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">No transfer message was decoded from this transaction payload.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {showArchive && (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Archive transactions</p>
                    <p className="mt-1 text-slate-300">Recent chain history pulled from the archive endpoint for deeper review.</p>
                  </div>
                </div>
                <div className="mt-4 max-h-96 space-y-3 overflow-auto pr-1">
                  {archiveTxs.slice(0, 12).map((tx, idx) => (
                    <div key={`${tx.txHash || idx}-archive`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span className="font-semibold uppercase tracking-[0.25em] text-cyan-200">#{tx.height || '—'}</span>
                        <span>{tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Timestamp unavailable'}</span>
                      </div>
                      <div className="mt-2 text-sm text-white">{truncate(tx.txHash || 'Unknown tx hash', 18)}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1">Gas used: {tx.gas_used || 0}</span>
                        <span className="rounded-full bg-violet-400/10 px-2 py-1">Status: {tx.code === 0 ? 'Success' : 'Failed'}</span>
                      </div>
                      {(tx.messages || []).slice(0, 2).map((message, i) => (
                        <div key={`${tx.txHash || idx}-${i}`} className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                          <div className="font-semibold text-slate-100">{message['@type'] || 'Transfer'}</div>
                          <div className="mt-1">From: {truncate(message.from_address || message.sender || 'Unknown')}</div>
                          <div>To: {truncate(message.to_address || message.recipient || 'Unknown')}</div>
                          <div>Amount: {formatAmount(message.amount)}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          <MetricCard title="Latest Height" value={health?.latestHeight ? `#${health.latestHeight}` : '—'} />
        </div>

        {/* Error Banner */}
        {error && healthState === 'down' && (
          <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Live Hero Metrics */}
        <div className="mb-10">
          <HeroMetrics
            priceData={priceData}
            treasury={treasury}
            health={health}
            validators={null}
            loading={healthState === 'loading'}
          />
        </div>

        {/* Live Chart + Network Activity */}
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-8 mb-10">
          <LiveChart priceData={priceData} loading={healthState === 'loading'} />
          <NetworkActivity health={health} healthState={healthState} validators={null} />
        </div>

        {/* Recent Transactions */}
        <div className="mb-10">
          <RecentTransactions />
        </div>

        <div
          className="
            grid
            grid-cols-1
            xl:grid-cols-2
            gap-8
          "
        >

          <Panel title="Live Blocks">

            {
              blocks.length === 0 && (
                <EmptyState
                  text="Waiting for blocks..."
                />
              )
            }

            {
              blocks.map(
                (block, index) => (

                  <LiveCard
                    key={index}

                    title={
                      `Block #${block.height}`
                    }

                    value={
                      block.transactions
                    }

                    sub={
                      block.time
                    }
                  />

                )
              )
            }

          </Panel>

          <Panel title="Market Activity">

            {
              marketEvents.length === 0 && (
                <EmptyState
                  text="Waiting for activity..."
                />
              )
            }

            {
              marketEvents.map(
                (event, index) => (

                  <LiveCard
                    key={index}

                    title={event.type}

                    value={event.amount}

                    sub={event.user}
                  />

                )
              )
            }

          </Panel>

        </div>

      </div>

    </div>
  )
}

function MetricCard({
  title,
  value
}) {

  return (
    <motion.div

      whileHover={{
        y: -5
      }}

      className="
        rounded-3xl
        border
        border-slate-800
        bg-slate-900/70
        p-6
        backdrop-blur-xl
      "
    >

      <div className="text-slate-400">
        {title}
      </div>

      <div
        className="
          text-3xl
          font-black
          mt-4
        "
      >
        {value}
      </div>

    </motion.div>
  )
}

function Panel({
  title,
  children
}) {

  return (
    <div
      className="
        rounded-3xl
        border
        border-slate-800
        bg-slate-900/70
        p-6
      "
    >

      <h2
        className="
          text-2xl
          font-bold
          mb-6
        "
      >
        {title}
      </h2>

      <div className="space-y-4">
        {children}
      </div>

    </div>
  )
}

function LiveCard({
  title,
  value,
  sub
}) {

  return (
    <motion.div

      initial={{
        opacity: 0,
        y: 10
      }}

      animate={{
        opacity: 1,
        y: 0
      }}

      className="
        bg-slate-800/60
        rounded-2xl
        p-4
      "
    >

      <div
        className="
          flex
          justify-between
        "
      >

        <div>
          <div className="font-bold">
            {title}
          </div>

          <div
            className="
              text-slate-400
              text-sm
              mt-1
            "
          >
            {sub}
          </div>

        </div>

        <div className="text-cyan-400">
          {value}
        </div>

      </div>

    </motion.div>
  )
}

function EmptyState({
  text
}) {

  return (
    <div
      className="
        text-slate-500
        py-10
        text-center
      "
    >
      {text}
    </div>
  )
}