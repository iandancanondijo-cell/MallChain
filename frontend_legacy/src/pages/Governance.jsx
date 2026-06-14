import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { coins } from '@cosmjs/stargate'
import { MsgVote, MsgSubmitProposal } from 'cosmjs-types/cosmos/gov/v1beta1/tx'
import { TextProposal } from 'cosmjs-types/cosmos/gov/v1beta1/gov'
import { Registry, encodePubkey } from '@cosmjs/proto-signing'
import { SigningStargateClient } from '@cosmjs/stargate'

const CHAIN_ID = import.meta.env.VITE_CHAIN_ID || 'mallchain-1'
const CHAIN_RPC = import.meta.env.VITE_CHAIN_RPC || 'http://localhost:26657'
const GOV_DEPOSIT_DENOM = import.meta.env.VITE_GOV_DEPOSIT_DENOM || 'umal'
const GOV_DEFAULT_DEPOSIT = import.meta.env.VITE_GOV_DEFAULT_DEPOSIT || '1000000' // 1 token in micro units
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

const voteOptions = [
  { label: 'Yes', value: 1 },
  { label: 'Abstain', value: 2 },
  { label: 'No', value: 3 },
  { label: 'No with Veto', value: 4 },
]

function statusColor(status) {
  if (!status) return '#9ba7bc'
  if (status.includes('DEPOSIT')) return '#fbbf24'
  if (status.includes('VOTING')) return '#34d399'
  if (status.includes('PASSED')) return '#4ade80'
  if (status.includes('REJECTED') || status.includes('VETO')) return '#fca5a5'
  return '#9ba7bc'
}

function normalizeProposal(p) {
  if (!p) return null
  const tally = p.tally || p.final_tally_result || {}
  return {
    id: p.id,
    title: p.title || p.content?.title || 'Untitled proposal',
    summary: p.summary || p.description || p.content?.summary || p.content?.description || '',
    status: p.status || 'PROPOSAL_STATUS_UNSPECIFIED',
    votingEndTime: p.voting_end_time || p.votingEndTime || p.voting_end || null,
    tally: {
      yes: tally.yes || tally.yes_count || '0',
      no: tally.no || tally.no_count || '0',
      abstain: tally.abstain || tally.abstain_count || '0',
      veto: tally.no_with_veto || tally.no_with_veto_count || '0'
    }
  }
}

async function connectWallet() {
  const wallet = window.keplr || window.leap
  if (!wallet) throw new Error('Keplr/Leap not found. Install the extension.')
  await wallet.enable(CHAIN_ID)
  const offlineSigner = window.getOfflineSignerAuto
    ? await window.getOfflineSignerAuto(CHAIN_ID)
    : wallet.getOfflineSigner(CHAIN_ID)
  const accounts = await offlineSigner.getAccounts()
  if (!accounts.length) throw new Error('No accounts found in wallet')
  return { offlineSigner, account: accounts[0] }
}

async function signAndBroadcastVote(proposalId, option, memo = '') {
  const { offlineSigner, account } = await connectWallet()
  const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, offlineSigner)

  const msg = {
    typeUrl: '/cosmos.gov.v1beta1.MsgVote',
    value: MsgVote.fromPartial({
      voter: account.address,
      proposalId: BigInt(proposalId),
      option,
    })
  }

  const fee = { amount: coins('5000', GOV_DEPOSIT_DENOM), gas: '200000' }
  const result = await client.signAndBroadcast(account.address, [msg], fee, memo)
  await client.disconnect()
  return result
}

async function signAndBroadcastProposal(title, description, depositAmount, memo = '') {
  const { offlineSigner, account } = await connectWallet()
  const registry = new Registry()
  // Register needed types
  registry.register('/cosmos.gov.v1beta1.MsgSubmitProposal', MsgSubmitProposal)
  registry.register('/cosmos.gov.v1beta1.TextProposal', TextProposal)

  const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, offlineSigner, { registry })

  const content = TextProposal.encode(TextProposal.fromPartial({ title, description })).finish()

  const msg = {
    typeUrl: '/cosmos.gov.v1beta1.MsgSubmitProposal',
    value: MsgSubmitProposal.fromPartial({
      content: {
        typeUrl: '/cosmos.gov.v1beta1.TextProposal',
        value: content
      },
      initialDeposit: coins(depositAmount, GOV_DEPOSIT_DENOM),
      proposer: account.address,
    })
  }

  const fee = { amount: coins('8000', GOV_DEPOSIT_DENOM), gas: '300000' }
  const result = await client.signAndBroadcast(account.address, [msg], fee, memo)
  await client.disconnect()
  return result
}

export default function Governance() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(false)
  const [voteState, setVoteState] = useState({ proposalId: '', option: 1, memo: '' })
  const [submitState, setSubmitState] = useState({ title: '', description: '', deposit: GOV_DEFAULT_DEPOSIT, memo: '' })
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const inVoting = useMemo(() => proposals.filter(p => (p.status || '').includes('VOTING')), [proposals])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await axios.get(`${API_BASE}/api/governance/proposals`)
        const incoming = res.data?.proposals || []
        setProposals(incoming.map(normalizeProposal).filter(Boolean))
      } catch (e) {
        console.error('gov fetch error', e)
        setError('Failed to load proposals')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleVote() {
    setStatus('')
    setError('')
    try {
      if (!voteState.proposalId) throw new Error('Select a proposal')
      const res = await signAndBroadcastVote(voteState.proposalId, Number(voteState.option), voteState.memo)
      const txhash = res.transactionHash || res.txhash || res?.tx_response?.txhash
      setStatus(`Vote broadcasted. tx: ${txhash || 'unknown'}`)
    } catch (e) {
      setError(e.message || 'Vote failed')
    }
  }

  async function handleSubmit() {
    setStatus('')
    setError('')
    try {
      if (!submitState.title || !submitState.description) throw new Error('Title and description are required')
      const res = await signAndBroadcastProposal(submitState.title, submitState.description, submitState.deposit, submitState.memo)
      const txhash = res.transactionHash || res.txhash || res?.tx_response?.txhash
      setStatus(`Proposal submitted. tx: ${txhash || 'unknown'}`)
      setSubmitState({ title: '', description: '', deposit: GOV_DEFAULT_DEPOSIT, memo: '' })
    } catch (e) {
      setError(e.message || 'Submit failed')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#10151c', color: '#e5f4ff', padding: '28px 20px', fontFamily: 'Inter, system-ui' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>🏛️</span>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#c7f36b' }}>Governance</div>
            <div style={{ fontSize: 13, color: '#9ba7bc' }}>Vote and submit proposals using Keplr on {CHAIN_ID}</div>
          </div>
        </div>

        {status && <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)', padding: 12, borderRadius: 10, color: '#34d399', fontSize: 14 }}>{status}</div>}
        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: 12, borderRadius: 10, color: '#f87171', fontSize: 14 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
          <div style={{ background: 'radial-gradient(circle at 20% 20%, rgba(163,230,53,0.08), rgba(24,31,41,0.9))', border: '1px solid rgba(163,230,53,0.18)', borderRadius: 14, padding: 18, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: '#c7f36b', fontSize: 18 }}>Proposals</div>
              {loading && <div style={{ color: '#9ba7bc', fontSize: 12 }}>Loading…</div>}
            </div>
            {(!proposals || proposals.length === 0) && !loading && (
              <div style={{ color: '#fff', opacity: 0.7 }}>No proposals found.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {proposals.map(p => (
                <div key={p.id} style={{ background: '#0f1624', border: '1px solid #1f2a38', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ color: '#c7f36b', fontWeight: 700 }}>#{p.id}: {p.title}</div>
                    <span style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: statusColor(p.status), fontSize: 12, fontWeight: 700 }}>{(p.status || '').replace('PROPOSAL_STATUS_', '')}</span>
                  </div>
                  {p.summary && <div style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 8, opacity: 0.9 }}>{p.summary.slice(0, 200)}{p.summary.length > 200 ? '…' : ''}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                    <StatChip label="Yes" value={p.tally?.yes || '0'} color="#4ade80" />
                    <StatChip label="No" value={p.tally?.no || '0'} color="#fca5a5" />
                    <StatChip label="Abstain" value={p.tally?.abstain || '0'} color="#cbd5e1" />
                    <StatChip label="Veto" value={p.tally?.veto || '0'} color="#f87171" />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#9ba7bc' }}>
                    Voting ends: {p.votingEndTime ? new Date(p.votingEndTime).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#0f1624', border: '1px solid #1f2a38', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 800, color: '#c7f36b', marginBottom: 10 }}>Cast a Vote (Keplr)</div>
              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Proposal</label>
              <select
                value={voteState.proposalId}
                onChange={e => setVoteState(v => ({ ...v, proposalId: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 10 }}
              >
                <option value="">Select proposal</option>
                {inVoting.map(p => (
                  <option key={p.id} value={p.id}>#{p.id} — {p.title}</option>
                ))}
              </select>

              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Option</label>
              <select
                value={voteState.option}
                onChange={e => setVoteState(v => ({ ...v, option: Number(e.target.value) }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 10 }}
              >
                {voteOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Memo (optional)</label>
              <input
                type="text"
                value={voteState.memo}
                onChange={e => setVoteState(v => ({ ...v, memo: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 12 }}
              />

              <button
                onClick={handleVote}
                disabled={loading}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#c7f36b', color: '#0f1624', fontWeight: 800, cursor: 'pointer' }}
              >
                Vote with Keplr
              </button>
            </div>

            <div style={{ background: '#0f1624', border: '1px solid #1f2a38', borderRadius: 14, padding: 16 }}>
              <div style={{ fontWeight: 800, color: '#c7f36b', marginBottom: 10 }}>Submit Proposal (Text)</div>
              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Title</label>
              <input
                type="text"
                value={submitState.title}
                onChange={e => setSubmitState(s => ({ ...s, title: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 10 }}
              />

              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Description</label>
              <textarea
                value={submitState.description}
                onChange={e => setSubmitState(s => ({ ...s, description: e.target.value }))}
                rows={4}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 10 }}
              />

              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Deposit ({GOV_DEPOSIT_DENOM})</label>
              <input
                type="number"
                value={submitState.deposit}
                onChange={e => setSubmitState(s => ({ ...s, deposit: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 10 }}
              />

              <label style={{ fontSize: 12, color: '#9ba7bc', marginBottom: 6, display: 'block' }}>Memo (optional)</label>
              <input
                type="text"
                value={submitState.memo}
                onChange={e => setSubmitState(s => ({ ...s, memo: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #233044', background: '#101826', color: '#e5f4ff', marginBottom: 12 }}
              />

              <button
                onClick={handleSubmit}
                disabled={loading}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#c7f36b', color: '#0f1624', fontWeight: 800, cursor: 'pointer' }}
              >
                Submit Proposal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ background: '#101826', borderRadius: 8, padding: 8, border: '1px solid #1f2a38' }}>
      <div style={{ fontSize: 11, color: '#8fb3ff' }}>{label}</div>
      <div style={{ fontWeight: 800, color }}>{value}</div>
    </div>
  )
}
