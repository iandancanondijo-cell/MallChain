import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Box, FileText, Loader2, Clock, Hash, Layers, Code } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiFetch } from '../lib/api'
import { appConfig } from '../config/app'

function ContractDetails({ contract }) {
  return (
    <motion.div
      className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <Code className="w-8 h-8 text-purple-400" />
        <div>
          <h2 className="text-xl font-bold">Contract</h2>
          <p className="text-slate-400 text-sm">{contract.address}</p>
        </div>
      </div>

      <dl>
        <DetailRow label="Code ID" value={String(contract.codeId)} />
        <DetailRow label="Creator" value={contract.creator} mono />
        <DetailRow label="Admin" value={contract.admin} mono />
        <DetailRow label="Label" value={contract.label} />
        <DetailRow label="Created" value={contract.created} />
      </dl>
    </motion.div>
  )
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-3 border-b border-slate-800 last:border-0">
      <dt className="text-slate-500 text-sm shrink-0 sm:w-40">{label}</dt>
      <dd className={`text-white text-sm break-all ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</dd>
    </div>
  )
}

function TimeBlock({ time }) {
  if (!time?.iso) return <span className="text-slate-500">—</span>
  return (
    <div className="space-y-1">
      <p className="text-white font-medium">{time.local}</p>
      <p className="text-slate-500 text-xs font-mono">{time.utc}</p>
      <p className="text-slate-600 text-xs">Unix: {time.unix}</p>
    </div>
  )
}

function BlockDetails({ block }) {
  return (
    <motion.div
      className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <Layers className="w-8 h-8 text-blue-400" />
        <div>
          <h2 className="text-xl font-bold">Block #{block.height}</h2>
          <p className="text-slate-400 text-sm">{block.chainId}</p>
        </div>
      </div>

      <dl>
        <DetailRow
          label="Block time"
          value={<TimeBlock time={block.blockTime} />}
        />
        <DetailRow label="Hash" value={block.hash} mono />
        <DetailRow label="Transactions" value={String(block.txCount)} />
        <DetailRow label="Proposer" value={block.proposer} mono />
        <DetailRow
          label="Previous commit"
          value={
            block.lastCommit
              ? `#${block.lastCommit.height} (${block.lastCommit.signatureCount} sigs)`
              : '—'
          }
        />
      </dl>

      <p className="mt-4 text-xs text-amber-200/80 bg-amber-500/10 rounded-xl px-4 py-3">
        {block.lastCommit?.note ||
          'The commit section in raw chain data refers to the previous block, not this block\'s time.'}
      </p>
    </motion.div>
  )
}

function TxDetails({ transaction }) {
  return (
    <motion.div
      className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <FileText className="w-8 h-8 text-emerald-400" />
        <div>
          <h2 className="text-xl font-bold">Transaction</h2>
          <p className={`text-sm ${transaction.success ? 'text-emerald-400' : 'text-rose-400'}`}>
            {transaction.success ? 'Success' : `Failed (code ${transaction.code})`}
          </p>
        </div>
      </div>

      <dl>
        <DetailRow label="Time" value={<TimeBlock time={transaction.time} />} />
        <DetailRow label="Height" value={String(transaction.height)} />
        <DetailRow label="Hash" value={transaction.txHash} mono />
        <DetailRow label="Gas" value={`${transaction.gasUsed} / ${transaction.gasWanted}`} />
        {transaction.memo ? (
          <DetailRow label="Memo" value={transaction.memo} />
        ) : null}
      </dl>
    </motion.div>
  )
}

export default function Explorer() {
  const [mode, setMode] = useState('block')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [block, setBlock] = useState(null)
  const [transaction, setTransaction] = useState(null)
  const [contract, setContract] = useState(null)
  const [latest, setLatest] = useState(null)

  const loadLatest = async () => {
    try {
      const data = await apiFetch('/explorer/latest')
      setLatest(data)
      if (data.block) {
        setBlock(data.block)
        setTransaction(null)
        setQuery(String(data.latestBlock))
      }
    } catch (e) {
      toast.error(e.message || 'Could not load latest block')
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setBlock(null)
    setTransaction(null)
    setContract(null)
    try {
      if (mode === 'block') {
        const data = await apiFetch(`/explorer/block/${encodeURIComponent(query.trim())}`)
        setBlock(data.block)
      } else if (mode === 'tx') {
        const hash = query.trim().replace(/^0x/i, '')
        const data = await apiFetch(`/explorer/tx/${encodeURIComponent(hash)}`)
        setTransaction(data.transaction)
      } else {
        const data = await apiFetch(`/wasm/contract/${encodeURIComponent(query.trim())}`)
        setContract(data.contract)
      }
    } catch (err) {
      toast.error(err.message || 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black">Block Explorer</h1>
        <p className="text-slate-400 mt-2">
          Accurate block and transaction times from {appConfig.networkLabel} ({appConfig.chain.id}).
        </p>
      </div>

      <motion.div
        className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            type="button"
            onClick={() => setMode('block')}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${mode === 'block' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            <Box className="inline w-4 h-4 mr-1" /> Block
          </button>
          <button
            type="button"
            onClick={() => setMode('tx')}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${mode === 'tx' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            <FileText className="inline w-4 h-4 mr-1" /> Transaction
          </button>
          <button
            type="button"
            onClick={() => setMode('contract')}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${mode === 'contract' ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            <Code className="inline w-4 h-4 mr-1" /> Contract
          </button>
          <button
            type="button"
            onClick={loadLatest}
            className="ml-auto px-4 py-2 rounded-xl text-sm bg-slate-800 hover:bg-slate-700"
          >
            Latest block
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'block' ? 'Block height' : mode === 'tx' ? 'Transaction hash' : 'Contract address'}
            className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-2xl bg-blue-600 font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Search
          </button>
        </form>

        {latest && (
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <Hash className="w-4 h-4" />
              Latest #{latest.latestBlock}
            </span>
            {latest.latestBlockTime?.local && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {latest.latestBlockTime.local}
              </span>
            )}
          </div>
        )}
      </motion.div>

      {block && <BlockDetails block={block} />}
      {transaction && <TxDetails transaction={transaction} />}
      {contract && <ContractDetails contract={contract} />}
    </div>
  )
}
