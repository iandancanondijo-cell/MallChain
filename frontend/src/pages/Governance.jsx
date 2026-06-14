import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Vote,
  CheckCircle,
  Users,
  TrendingUp,
  AlertCircle,
  Loader,
  ChevronRight,
  Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet } from '../core/wallet/walletUtils'
import {
  fetchProposals,
  formatProposalForUi,
  getTimeRemaining,
} from '../core/governance/governanceApi'
import { fetchStakingSummary, displayDenom } from '../core/staking/stakingApi'

export default function Governance() {
  const [loading, setLoading] = useState(true)
  const [proposals, setProposals] = useState([])
  const [filter, setFilter] = useState('all')
  const [votingPower, setVotingPower] = useState(0)
  const [walletAddress, setWalletAddress] = useState('')
  const [stats, setStats] = useState({ total: 0, active: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const wallet = loadWallet()
      const voter = wallet?.address
      if (wallet) setWalletAddress(wallet.address)

      const [govData, staking] = await Promise.all([
        fetchProposals({ voter }),
        voter ? fetchStakingSummary(voter).catch(() => null) : null,
      ])

      const list = (govData.proposals || []).map(formatProposalForUi)
      setProposals(list)
      setStats(govData.stats || { total: list.length, active: list.filter((p) => p.status === 'active').length })
      if (staking) setVotingPower(staking.votingPower || 0)
    } catch (e) {
      toast.error(e.message || 'Failed to load governance')
      setProposals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = proposals.filter((p) => {
    if (filter === 'all') return true
    if (filter === 'active') return p.status === 'active'
    return p.status !== 'active'
  })

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'passed':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      case 'rejected':
        return 'text-red-400 bg-red-500/10 border-red-500/20'
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20'
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-4xl font-black text-white mb-2">Governance</h1>
        <p className="text-slate-400">
          Vote on on-chain proposals. Voting power follows your bonded {displayDenom} stake.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Vote className="w-6 h-6 text-cyan-400" />}
          label="Your voting power"
          value={
            walletAddress
              ? `${votingPower.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${displayDenom}`
              : 'No wallet'
          }
        />
        <StatCard
          icon={<Users className="w-6 h-6 text-purple-400" />}
          label="Active proposals"
          value={stats.active ?? 0}
        />
        <StatCard
          icon={<CheckCircle className="w-6 h-6 text-green-400" />}
          label="Total proposals"
          value={stats.total ?? proposals.length}
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6 text-yellow-400" />}
          label="Network"
          value="Cosmos Gov"
          sub="mallchain-1"
        />
      </div>

      {!walletAddress && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-100 font-medium">Wallet required to vote</p>
            <p className="text-amber-200/80 text-sm mt-1">
              <Link to="/wallet/create" className="underline">Create a wallet</Link> or import one, then stake{' '}
              {displayDenom} to gain voting power.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h2 className="text-xl font-bold text-white">Proposals</h2>
        <div className="flex gap-2">
          {['all', 'active', 'closed'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
                filter === f
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Filter className="w-3 h-3 inline mr-1 opacity-60" />
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader className="w-8 h-8 text-slate-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-12 text-center text-slate-400">
          No proposals on chain yet. Submit one via the node CLI or governance module.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((proposal, index) => (
            <motion.div
              key={proposal.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                to={`/governance/${proposal.id}`}
                className="block rounded-3xl border border-slate-800 bg-slate-900/70 p-6 hover:border-cyan-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(proposal.status)}`}
                      >
                        {proposal.status}
                      </span>
                      <span className="text-slate-500 text-sm">#{proposal.id}</span>
                      {proposal.userVoted && (
                        <span className="text-cyan-400 text-xs">You voted · {proposal.userVoteOption}</span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">{proposal.title}</h3>
                    <p className="text-slate-400 text-sm line-clamp-2">{proposal.description}</p>
                    {proposal.status === 'active' && (
                      <p className="text-slate-500 text-xs mt-2">
                        {getTimeRemaining(proposal.votingEnds)}
                      </p>
                    )}
                    {proposal.totalVotes > 0 && (
                      <div className="mt-3 h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${proposal.yesPct}%` }}
                        />
                        <div
                          className="bg-red-500 h-full"
                          style={{ width: `${proposal.noPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-6 h-6 text-slate-500 shrink-0" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <p className="text-xl font-black text-white">{value}</p>
          {sub && <p className="text-slate-500 text-xs">{sub}</p>}
        </div>
      </div>
    </div>
  )
}
