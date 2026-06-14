import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock, Loader, Vote } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadWallet } from '../core/wallet/walletUtils'
import SecureSigningModal from '../components/SecureSigningModal'
import { withSigningKey } from '../core/wallet/secureSigner'
import {
  fetchProposal,
  formatProposalForUi,
  getTimeRemaining,
  submitVote,
} from '../core/governance/governanceApi'
import { fetchStakingSummary, displayDenom } from '../core/staking/stakingApi'

export default function GovernanceProposal() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [proposal, setProposal] = useState(null)
  const [wallet, setWallet] = useState(null)
  const [votingPower, setVotingPower] = useState(0)
  const [submitting, setSubmitting] = useState(null)
  const [showSigningModal, setShowSigningModal] = useState(false)
  const [pendingVoteOption, setPendingVoteOption] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const w = loadWallet()
      setWallet(w)
      const data = await fetchProposal(id, w?.address)
      setProposal(formatProposalForUi(data.proposal))
      if (w?.address) {
        const summary = await fetchStakingSummary(w.address).catch(() => null)
        setVotingPower(summary?.votingPower || 0)
      }
    } catch (e) {
      toast.error(e.message || 'Proposal not found')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const initialize = async () => {
      await load()
    }
    initialize()
  }, [load])

  const handleVote = (option) => {
    if (!wallet?.address) {
      toast.error('Wallet required to sign votes')
      return
    }
    setPendingVoteOption(option)
    setShowSigningModal(true)
  }

  const handleVoteWithMnemonic = async (mnemonic) => {
    if (!pendingVoteOption) return

    setSubmitting(pendingVoteOption)
    try {
      await withSigningKey(mnemonic, async (privateKeyHex) => {
        const { txHash } = await submitVote({
          privateKeyHex,
          voterAddress: wallet.address,
          proposalId: id,
          option: pendingVoteOption,
        })
        toast.success(`Vote submitted · ${txHash.slice(0, 12)}…`)
      })
      await load()
    } catch (e) {
      toast.error(e.message || 'Vote failed')
    } finally {
      setSubmitting(null)
      setPendingVoteOption(null)
      setShowSigningModal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!proposal) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400 mb-4">Proposal not found</p>
        <Link to="/governance" className="text-cyan-400 hover:underline">
          Back to governance
        </Link>
      </div>
    )
  }

  const canVote = proposal.status === 'active' && wallet?.address && !proposal.userVoted

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Link
        to="/governance"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> All proposals
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-slate-500 text-sm mb-1">Proposal #{proposal.id}</p>
        <h1 className="text-3xl font-black text-white mb-4">{proposal.title}</h1>
        <p className="text-slate-300 whitespace-pre-wrap">{proposal.description || 'No description.'}</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Info label="Status" value={proposal.status} />
        <Info
          label="Voting ends"
          value={
            proposal.status === 'active'
              ? getTimeRemaining(proposal.votingEnds)
              : proposal.votingEnds
                ? new Date(proposal.votingEnds).toLocaleString()
                : '—'
          }
        />
        <Info
          label="Your voting power"
          value={wallet ? `${votingPower.toFixed(4)} ${displayDenom}` : '—'}
        />
        <Info
          label="Your vote"
          value={proposal.userVoted ? proposal.userVoteOption : 'Not voted'}
        />
      </div>

      <TallyBar label="Yes" pct={proposal.yesPct} color="bg-green-500" />
      <TallyBar label="No" pct={proposal.noPct} color="bg-red-500" />
      <TallyBar label="Abstain" pct={proposal.abstainPct} color="bg-yellow-500" />
      <TallyBar label="Veto" pct={proposal.vetoPct} color="bg-purple-500" />

      {proposal.status === 'active' && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Clock className="w-4 h-4" />
          {getTimeRemaining(proposal.votingEnds)}
        </div>
      )}

      {canVote && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">
            <Vote className="w-5 h-5 text-cyan-400" /> Cast your vote
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['yes', 'no', 'abstain', 'veto'].map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => handleVote(opt)}
                className="py-3 rounded-xl font-semibold capitalize bg-slate-800 hover:bg-cyan-500/20 border border-slate-700 hover:border-cyan-500/40 disabled:opacity-50"
              >
                {submitting === opt ? <Loader className="w-5 h-5 mx-auto animate-spin" /> : opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {proposal.userVoted && (
        <p className="text-center text-cyan-400 text-sm">You already voted on this proposal.</p>
      )}

      <SecureSigningModal
        isOpen={showSigningModal}
        onClose={() => {
          setShowSigningModal(false)
          setPendingVoteOption(null)
        }}
        title="Sign Governance Vote"
        description="Enter your recovery phrase to securely sign and submit your vote."
        onSign={handleVoteWithMnemonic}
        isLoading={Boolean(submitting)}
      />
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-800/80 p-3">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-white font-medium capitalize">{value}</p>
    </div>
  )
}

function TallyBar({ label, pct, color }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}
