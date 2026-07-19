import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, ArrowDown, Copy, Filter, Calendar, Clock, CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet } from '../core/wallet/walletUtils'
import { appConfig } from '../config/app'
import { TOKENS } from '../config/tokens'

const API_URL = appConfig.apiUrl

export default function Transactions() {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)
  const wallet = loadWallet()
  const walletAddress = wallet?.address || ''
  const LIMIT = 20

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ address: walletAddress, page, limit: LIMIT })
      if (filter !== 'all') params.set('status', filter)
      const res = await fetch(`${API_URL}/tx/history?${params}`)
      const data = await res.json()
      if (data.success) {
        setTransactions(data.transactions || [])
        setTotal(data.total || 0)
      } else {
        throw new Error(data.error || 'Failed to load transactions')
      }
    } catch (e) {
      setError(e.message)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [walletAddress, filter, page])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied') }

  const statusClass = (s) => ({
    confirmed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    pending:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    failed:    'text-red-400 bg-red-500/10 border-red-500/20',
  }[s] || 'text-slate-400 bg-slate-700 border-slate-600')

  const statusIcon = (s) => s === 'confirmed' ? <CheckCircle size={12}/> : s === 'failed' ? <XCircle size={12}/> : <Clock size={12}/>

  const formatAmount = (raw) => {
    if (!raw) return '—'
    const n = parseFloat(raw) || 0
    const denom = TOKENS?.mallcoin?.symbol || 'MLCNS'
    return `${n.toLocaleString()} ${denom}`
  }

  if (!walletAddress) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <Calendar className="w-12 h-12 text-slate-600" />
        <h1 className="text-3xl font-black text-white">Transaction History</h1>
        <p className="text-slate-400">Import or create a wallet to view your transactions</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Transactions</h1>
          <p className="text-slate-400 text-sm mt-1 font-mono">{walletAddress.slice(0,20)}…{walletAddress.slice(-8)}</p>
        </div>
        <button onClick={fetchTransactions} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={16} className="text-slate-500" />
        {['all','confirmed','pending','failed'].map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1) }}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              filter === s ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-slate-500">{total} total</span>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader className="w-7 h-7 text-slate-500 animate-spin"/></div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">{error}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40"/>
            <p className="font-semibold text-white">No transactions</p>
            <p className="text-sm mt-1">On-chain activity will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {transactions.map((tx, i) => (
              <motion.div key={tx.hash || i} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
                className="flex items-center gap-4 p-5 hover:bg-slate-800/40 transition-colors">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type==='send' ? 'bg-red-500/15' : 'bg-emerald-500/15'}`}>
                  {tx.type==='send' ? <ArrowUp size={16} className="text-red-400"/> : <ArrowDown size={16} className="text-emerald-400"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-semibold text-sm ${tx.type==='send' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.type==='send' ? 'Sent' : 'Received'}
                    </span>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusClass(tx.status)}`}>
                      {statusIcon(tx.status)} {tx.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <span>{tx.type==='send' ? 'To:' : 'From:'}</span>
                    <span className="font-mono truncate max-w-[160px]">{tx.type==='send' ? tx.to : tx.from}</span>
                    <button onClick={() => copy(tx.type==='send' ? tx.to : tx.from)} className="hover:text-cyan-400"><Copy size={10}/></button>
                  </div>
                  {tx.timestamp && <p className="text-xs text-slate-600 mt-0.5">{new Date(tx.timestamp).toLocaleString()}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-white text-sm">{formatAmount(tx.amount)}</p>
                  <button onClick={() => copy(tx.hash)} className="text-xs text-slate-600 hover:text-cyan-400 font-mono">
                    {tx.hash ? `${tx.hash.slice(0,8)}…` : '—'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
            className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-slate-400">Page {page} of {Math.ceil(total/LIMIT)}</span>
          <button onClick={() => setPage(p => p+1)} disabled={page*LIMIT >= total}
            className="px-4 py-2 rounded-xl bg-slate-800 text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
