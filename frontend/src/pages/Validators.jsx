import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader, Shield, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchValidators, displayDenom } from '../core/staking/stakingApi'

export default function Validators() {
  const [loading, setLoading] = useState(true)
  const [validators, setValidators] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const data = await fetchValidators()
        setValidators(data.validators || [])
      } catch (e) {
        toast.error(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtered = validators.filter(
    (v) =>
      v.name?.toLowerCase().includes(query.toLowerCase()) ||
      (v.operatorAddress || v.id || '').toLowerCase().includes(query.toLowerCase())
  )

  const totalBonded = filtered.reduce((s, v) => s + (v.totalStaked || 0), 0)

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <Link
        to="/staking"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back to staking
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-black text-white mb-2">Validator network</h1>
        <p className="text-slate-400">
          Live bonded validators from {displayDenom} staking module.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-slate-500 text-sm">Active validators</p>
          <p className="text-2xl font-black">{filtered.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-slate-500 text-sm">Total bonded (listed)</p>
          <p className="text-2xl font-black">{totalBonded.toLocaleString()} {displayDenom}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-slate-500 text-sm">Status</p>
          <p className="text-2xl font-black text-green-400">BONDED</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or address…"
          className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v, i) => (
            <motion.div
              key={v.operatorAddress || v.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">
                  {v.logo || <Shield className="w-6 h-6 text-cyan-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white">{v.name}</h3>
                  <p className="font-mono text-xs text-slate-500 truncate mt-1">
                    {v.operatorAddress || v.id}
                  </p>
                  {v.description && (
                    <p className="text-slate-400 text-sm mt-2">{v.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-sm">
                    <span className="text-slate-500">
                      Commission <strong className="text-white">{v.commission}%</strong>
                    </span>
                    <span className="text-slate-500">
                      Stake <strong className="text-green-400">{(v.totalStaked || 0).toLocaleString()} {displayDenom}</strong>
                    </span>
                    <span className="text-slate-500">
                      Est. APR <strong className="text-white">{v.apr}%</strong>
                    </span>
                  </div>
                </div>
                <Link
                  to="/staking"
                  className="shrink-0 px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 text-sm font-medium border border-cyan-500/30"
                >
                  Delegate
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
