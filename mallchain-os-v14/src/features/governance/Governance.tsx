import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Modal, toast } from '../../components/ui';
import { governanceApi, type Proposal } from '../../services/governanceApi';
import { castVote, GovernanceTxError } from '../../services/governanceTx';
import { type VoteOption } from '../../services/governanceProto';

const VOTE_OPTIONS: { label: string; value: VoteOption }[] = [
  { label: 'Yes', value: 'VOTE_OPTION_YES' },
  { label: 'No', value: 'VOTE_OPTION_NO' },
  { label: 'Abstain', value: 'VOTE_OPTION_ABSTAIN' },
  { label: 'No with veto', value: 'VOTE_OPTION_NO_WITH_VETO' },
];

/** Governance — real on-chain proposals + MsgVote (backend/src/routes/governance.js, x/governance). */
export default function Governance() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [stats, setStats] = useState<{ total: number; active: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Proposal | null>(null);
  const [voting, setVoting] = useState<VoteOption | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await governanceApi.listProposals();
    if (res.ok && res.data) {
      setProposals(res.data.proposals);
      setStats(res.data.stats);
    } else {
      setError(res.error || 'Failed to load proposals');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openProposal = async (p: Proposal) => {
    setSel(p);
    if (!address) return;
    const res = await governanceApi.getUserVote(p.id, address);
    if (res.ok && res.data) {
      setSel((cur) => (cur && cur.id === p.id ? { ...cur, userVote: res.data!.userVote } : cur));
    }
  };

  const vote = async (option: VoteOption) => {
    if (!sel) return;
    if (!st.wallet.mnemonic || !address) return toast('Wallet not connected', false);
    setVoting(option);
    try {
      const result = await castVote({ mnemonic: st.wallet.mnemonic, fromAddress: address, proposalId: sel.id, option });
      toast(`Vote cast — tx ${result.txHash.slice(0, 10)}…`);
      setSel((cur) => (cur ? { ...cur, userVote: { voted: true, option } } : cur));
      load();
    } catch (e) {
      toast(e instanceof GovernanceTxError || e instanceof Error ? e.message : 'Vote failed', false);
    } finally {
      setVoting(null);
    }
  };

  return (
    <div>
      <div className="view-head">
        <h1>Governance</h1>
        <span className="sub">On-chain proposals</span>
      </div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card"><div className="card-label">Open proposals</div><div className="card-value">{loading ? '—' : stats?.active ?? 0}</div><div className="card-sub">active now</div></div>
        <div className="card"><div className="card-label">Total proposals</div><div className="card-value">{loading ? '—' : stats?.total ?? 0}</div></div>
      </div>

      <div className="sec-title"><h2>Proposals</h2></div>

      {!loading && (proposals?.length ?? 0) === 0 && (
        <div className="empty-state"><div className="es-ico">⚖️</div><div className="es-t">No proposals yet</div></div>
      )}

      <div className="vgrid" style={{ display: 'grid', gap: 12 }}>
        {(proposals || []).map((p) => (
          <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => openProposal(p)}>
            <div className="row">
              <span className="chip gold">#{p.id}</span>
              <div className="grow"><b>{p.title}</b></div>
              <StatusChip status={p.status} />
            </div>
            <div className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
              Yes: {p.tally.yesPct.toFixed(1)}% · No: {p.tally.noPct.toFixed(1)}% · Abstain: {p.tally.abstainPct.toFixed(1)}%
            </div>
            <div className="bar"><i style={{ width: `${p.tally.yesPct}%` }} /></div>
          </div>
        ))}
      </div>

      {sel && (
        <Modal title={`Proposal #${sel.id}`} onClose={() => setSel(null)} wide>
          <h2 style={{ marginBottom: 4 }}>{sel.title}</h2>
          <div className="muted mb" style={{ fontSize: 13 }}>{sel.summary}</div>
          <StatusChip status={sel.status} />

          <div className="sec-title mt"><h3>Tally</h3></div>
          <table className="tbl mb">
            <tbody>
              <tr><td className="muted">Yes</td><td className="num">{sel.tally.yes} ({sel.tally.yesPct.toFixed(1)}%)</td></tr>
              <tr><td className="muted">No</td><td className="num">{sel.tally.no} ({sel.tally.noPct.toFixed(1)}%)</td></tr>
              <tr><td className="muted">Abstain</td><td className="num">{sel.tally.abstain} ({sel.tally.abstainPct.toFixed(1)}%)</td></tr>
            </tbody>
          </table>

          <div className="sec-title mt"><h3>Vote</h3></div>
          {!address && <div className="tiny red mb">Connect a wallet to vote.</div>}
          {sel.userVote?.voted ? (
            <span className="chip green mb">You voted: {sel.userVote.option}</span>
          ) : (
            <div className="row mb">
              {VOTE_OPTIONS.map((o) => (
                <button key={o.value} className="btn btn-ghost" disabled={!address || voting !== null} onClick={() => vote(o.value)}>
                  {voting === o.value && <span className="spin" />} {o.label}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
