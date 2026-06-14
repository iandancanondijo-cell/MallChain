import { appConfig } from '../../config/app'
import { voteOnProposal } from '../chain/cosmosTx'

const API = appConfig.apiUrl

export async function fetchProposals({ voter } = {}) {
  const qs = voter ? `?voter=${encodeURIComponent(voter)}` : ''
  const res = await fetch(`${API}/governance/proposals${qs}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load proposals')
  return data
}

export async function fetchProposal(id, voter) {
  const qs = voter ? `?voter=${encodeURIComponent(voter)}` : ''
  const res = await fetch(`${API}/governance/proposal/${id}${qs}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Proposal not found')
  return data
}

export async function submitVote({ privateKeyHex, voterAddress, proposalId, option }) {
  const { txHash } = await voteOnProposal({
    privateKeyHex,
    voterAddress,
    proposalId,
    option,
  })
  return { success: true, txHash }
}

export function formatProposalForUi(p) {
  const tally = p.tally || {}
  const total = BigInt(tally.total || '0')
  const toNum = (v) => Number(BigInt(v || '0')) / 1e6
  return {
    ...p,
    yesVotes: toNum(tally.yes),
    noVotes: toNum(tally.no),
    abstainVotes: toNum(tally.abstain),
    vetoVotes: toNum(tally.veto),
    totalVotes: toNum(tally.total),
    yesPct: tally.yesPct ?? 0,
    noPct: tally.noPct ?? 0,
    abstainPct: tally.abstainPct ?? 0,
    description: p.summary,
    votingEnds: p.votingEndTime,
    category: p.status === 'active' ? 'Voting' : 'Closed',
    userVoted: p.userVote?.voted,
    userVoteOption: mapVoteOption(p.userVote?.option),
  }
}

function mapVoteOption(option) {
  const map = { 1: 'yes', 2: 'abstain', 3: 'no', 4: 'veto', VOTE_OPTION_YES: 'yes' }
  return map[option] || null
}

export function getTimeRemaining(endDate) {
  if (!endDate) return '—'
  const end = new Date(endDate)
  const now = new Date()
  const diff = end - now
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}d ${hours}h remaining`
}
