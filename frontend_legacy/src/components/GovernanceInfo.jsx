import React, { useEffect, useState } from 'react'
import axios from 'axios'

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
  const tally = p.tally || p.final_tally_result || p.final_tally || {}
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

export default function GovernanceInfo() {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(false)
  const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000'

  useEffect(() => {
    setLoading(true)
    axios.get(`${base}/api/governance/proposals`)
      .then(res => {
        const incoming = res.data?.proposals || []
        setProposals(incoming.map(normalizeProposal).filter(Boolean))
      })
      .catch(err => {
        console.error('Failed to fetch governance proposals:', err.message)
        setProposals([])
      })
      .finally(() => setLoading(false))
  }, [base])

  if (loading) return <div style={{ color: '#a3e635' }}>Loading proposals…</div>
  if (!proposals.length) return <div style={{ color: '#fff', opacity: 0.7 }}>No proposals found.</div>

  return (
    <div style={{ color: '#fff', fontSize: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {proposals.map(p => (
        <div key={p.id} style={{ background: '#181f29', borderRadius: 10, padding: 12, border: '1px solid #1f2a38', boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ color: '#a3e635', fontWeight: 700 }}>#{p.id}: {p.title}</div>
            <span style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: statusColor(p.status), fontSize: 12, fontWeight: 700 }}>{p.status?.replace('PROPOSAL_STATUS_', '')}</span>
          </div>
          {p.summary && <div style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 8, opacity: 0.85 }}>{p.summary.slice(0, 160)}{p.summary.length > 160 ? '…' : ''}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div style={{ background: '#0f1624', borderRadius: 8, padding: 8, border: '1px solid #1f2a38' }}>
              <div style={{ fontSize: 11, color: '#8fb3ff' }}>Yes</div>
              <div style={{ fontWeight: 700, color: '#4ade80' }}>{p.tally?.yes || '0'}</div>
            </div>
            <div style={{ background: '#0f1624', borderRadius: 8, padding: 8, border: '1px solid #1f2a38' }}>
              <div style={{ fontSize: 11, color: '#8fb3ff' }}>No</div>
              <div style={{ fontWeight: 700, color: '#fca5a5' }}>{p.tally?.no || '0'}</div>
            </div>
            <div style={{ background: '#0f1624', borderRadius: 8, padding: 8, border: '1px solid #1f2a38' }}>
              <div style={{ fontSize: 11, color: '#8fb3ff' }}>Abstain</div>
              <div style={{ fontWeight: 700, color: '#cbd5e1' }}>{p.tally?.abstain || '0'}</div>
            </div>
            <div style={{ background: '#0f1624', borderRadius: 8, padding: 8, border: '1px solid #1f2a38' }}>
              <div style={{ fontSize: 11, color: '#8fb3ff' }}>Veto</div>
              <div style={{ fontWeight: 700, color: '#f87171' }}>{p.tally?.veto || '0'}</div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#9ba7bc' }}>
            Voting ends: {p.votingEndTime ? new Date(p.votingEndTime).toLocaleString() : '—'}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#9ba7bc' }}>
            To vote: sign a MsgVote with your wallet and POST to /api/governance/vote with {{ txBytes: base64 }}.
          </div>
        </div>
      ))}
    </div>
  )
}
