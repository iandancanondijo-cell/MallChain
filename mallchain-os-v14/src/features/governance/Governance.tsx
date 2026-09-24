import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Modal, toast } from '../../components/ui';
import { governanceApi, type Proposal, type DepositParams } from '../../services/governanceApi';
import { castVote, submitProposal, GovernanceTxError, type VoteOption } from '../../services/governanceTx';
import { delegate, DelegateTxError } from '../../services/stakingDelegateTx';
import { validatorsApi, type ChainValidator } from '../../services/validatorsApi';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { Scale, Vote, FileText, Shield, AlertTriangle, Users, ChevronRight } from 'lucide-react';

const VOTE_OPTIONS: { label: string; value: VoteOption; color: string }[] = [
  { label: 'Yes', value: 'VOTE_OPTION_YES', color: 'var(--green-2)' },
  { label: 'No', value: 'VOTE_OPTION_NO', color: 'var(--red-2)' },
  { label: 'Abstain', value: 'VOTE_OPTION_ABSTAIN', color: 'var(--txt-3)' },
  { label: 'No with veto', value: 'VOTE_OPTION_NO_WITH_VETO', color: 'var(--gold)' },
];

const STAKE_DECIMALS = 6;
const toBaseUnits = (display: number) => Math.floor(display * 10 ** STAKE_DECIMALS).toString();
const toDisplay = (base: string) => Number(base) / 10 ** STAKE_DECIMALS;

/** Governance — civic glassmorphism layout with real on-chain proposals + MsgVote. */
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

  const [votingPower, setVotingPower] = useState<number | null>(null);
  const [validator, setValidator] = useState<ChainValidator | null>(null);
  const [depositParams, setDepositParams] = useState<DepositParams | null>(null);

  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateAmount, setDelegateAmount] = useState('');
  const [delegating, setDelegating] = useState(false);

  const [newProposalOpen, setNewProposalOpen] = useState(false);
  const [npTitle, setNpTitle] = useState('');
  const [npSummary, setNpSummary] = useState('');
  const [npDeposit, setNpDeposit] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const loadPowerAndParams = useCallback(async () => {
    if (address) {
      const p = await governanceApi.getVotingPower(address);
      if (p.ok && p.data) setVotingPower(toDisplay(p.data.totalStaked));
    }
    const dp = await governanceApi.getDepositParams();
    if (dp.ok && dp.data?.params) {
      setDepositParams(dp.data.params);
      const min = dp.data.params.min_deposit?.[0];
      if (min) setNpDeposit(String(toDisplay(min.amount)));
    }
    const vres = await validatorsApi.list();
    if (vres.ok && vres.data?.validators?.length) setValidator(vres.data.validators[0]);
  }, [address]);

  useEffect(() => { load(); loadPowerAndParams(); }, [load, loadPowerAndParams]);

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
    if (!st.wallet.pinEncryptedMnemonic || !address) return toast('Wallet not connected', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setVoting(option);
    try {
      const result = await castVote({ mnemonic, fromAddress: address, proposalId: sel.id, option });
      toast(`Vote cast — tx ${result.txHash.slice(0, 10)}…`);
      setSel((cur) => (cur ? { ...cur, userVote: { voted: true, option } } : cur));
      load();
    } catch (e) {
      toast(e instanceof GovernanceTxError || e instanceof Error ? e.message : 'Vote failed', false);
    } finally { setVoting(null); }
  };

  const doDelegate = async () => {
    if (!st.wallet.pinEncryptedMnemonic || !address) return toast('Wallet not connected', false);
    if (!validator) return toast('No validator available to delegate to', false);
    const amt = Number(delegateAmount);
    if (!amt || amt <= 0) return toast('Enter a valid amount', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setDelegating(true);
    try {
      const result = await delegate({
        mnemonic, fromAddress: address,
        validatorAddress: validator.operatorAddress,
        amount: toBaseUnits(amt), denom: 'stake',
      });
      toast(`Delegated — tx ${result.txHash.slice(0, 10)}…`);
      setDelegateOpen(false);
      setDelegateAmount('');
      loadPowerAndParams();
    } catch (e) {
      toast(e instanceof DelegateTxError || e instanceof Error ? e.message : 'Delegation failed', false);
    } finally { setDelegating(false); }
  };

  const doSubmitProposal = async () => {
    if (!st.wallet.pinEncryptedMnemonic || !address) return toast('Wallet not connected', false);
    if (!npTitle.trim() || !npSummary.trim()) return toast('Title and summary are required', false);
    const amt = Number(npDeposit);
    if (!amt || amt <= 0) return toast('Enter a valid deposit amount', false);
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;
    setSubmitting(true);
    try {
      const result = await submitProposal({
        mnemonic, fromAddress: address,
        title: npTitle.trim(), summary: npSummary.trim(),
        initialDepositAmount: toBaseUnits(amt), denom: 'stake',
      });
      toast(`Proposal submitted — tx ${result.txHash.slice(0, 10)}…`);
      setNewProposalOpen(false);
      setNpTitle(''); setNpSummary('');
      load();
    } catch (e) {
      toast(e instanceof GovernanceTxError || e instanceof Error ? e.message : 'Proposal submission failed', false);
    } finally { setSubmitting(false); }
  };

  const minDepositDisplay = depositParams?.min_deposit?.[0] ? toDisplay(depositParams.min_deposit[0].amount) : null;

  return (
    <div>
      <div className="view-head">
        <h1>Governance</h1>
        <span className="sub">On-chain proposals — shape the protocol's future</span>
        {address && (
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setNewProposalOpen(true)}>
            <FileText size={14} /> + New proposal
          </button>
        )}
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
        </div>
      )}

      {/* Hero panel */}
      <div className="wallet-hero" style={{ opacity: error ? 0.7 : 1 }}>
        <div className="wallet-hero-left">
          <div className="wallet-hero-label">Active governance</div>
          <div className="wallet-hero-balance">
            <div className="wallet-hero-num">
              {loading ? '—' : error ? 'N/A' : (stats?.active ?? 0)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--txt-3)', marginTop: 2 }}>open proposal{stats?.active !== 1 ? 's' : ''}</div>
          </div>
          <div className="wallet-hero-meta">
            <span className="chip"><Vote size={12} style={{ marginRight: 4 }} />{stats?.total ?? 0} total proposals</span>
            <span className="chip"><Shield size={12} style={{ marginRight: 4 }} />{votingPower === null ? '—' : `${votingPower.toLocaleString()} STAKE`}</span>
          </div>
        </div>
        <div className="wallet-hero-right" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Scale size={36} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>On-chain governance</div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>cosmos.gov.v1</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid" style={{ opacity: error ? 0.65 : 1 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Vote size={20} />
          </div>
          <div>
            <div className="card-label">Open proposals</div>
            <div className="card-value">{loading ? '—' : error ? 'N/A' : stats?.active ?? 0}</div>
            <div className="card-sub">{!error ? 'active now' : 'service unavailable'}</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.08)', color: 'rgb(var(--section-accent-rgb))' }}>
            <FileText size={20} />
          </div>
          <div>
            <div className="card-label">Total proposals</div>
            <div className="card-value">{loading ? '—' : error ? 'N/A' : stats?.total ?? 0}</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.08)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Shield size={20} />
          </div>
          <div>
            <div className="card-label">Your voting power</div>
            <div className="card-value">{votingPower === null ? '—' : `${votingPower.toLocaleString()} STAKE`}</div>
            <div className="card-sub">
              {votingPower === 0 ? (
                <span style={{ color: 'var(--red)' }}>No delegated stake — vote won't count</span>
              ) : (
                <>
                  Bonded ·{' '}
                  <button className="link-btn" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', font: 'inherit' }} onClick={() => setDelegateOpen(true)}>
                    Delegate more
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {address && (votingPower === 0 || votingPower === null) && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={18} style={{ color: 'rgb(var(--section-accent-rgb))', flexShrink: 0 }} />
          <div className="grow" style={{ fontSize: 13 }}>
            Real governance voting power comes from bonded stake (x/staking), not your MLCNS balance. Delegate some STAKE to gain real voting weight.
          </div>
          <button className="btn btn-primary" onClick={() => setDelegateOpen(true)}>Delegate stake</button>
        </div>
      )}

      <div className="sec-title">
        <h2>Proposals</h2>
        {error && <span className="sub" style={{ color: 'var(--gold-2)' }}>⚠ service unavailable — showing stale data</span>}
      </div>

      {!loading && error && (proposals?.length ?? 0) === 0 && (
        <div className="empty-state">
          <div className="es-ico"><AlertTriangle size={28} /></div>
          <div className="es-t">Proposal data unavailable</div>
          <div className="es-m">Couldn't fetch on-chain proposals right now — retry above.</div>
        </div>
      )}

      {!loading && !error && (proposals?.length ?? 0) === 0 && (
        <div className="empty-state"><div className="es-ico"><Scale size={28} /></div><div className="es-t">No proposals yet</div></div>
      )}

      <div className="vgrid" style={{ display: 'grid', gap: 12 }}>
        {((!error && proposals) || []).map((p) => (
          <div key={p.id} className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => openProposal(p)}>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="chip" style={{ background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))', fontWeight: 700 }}>#{p.id}</span>
              <div className="grow"><b>{p.title}</b></div>
              <StatusChip status={p.status} />
              <ChevronRight size={16} style={{ color: 'var(--txt-3)', marginLeft: 4 }} />
            </div>
            <div style={{ fontSize: 12, margin: '8px 0', color: 'var(--txt-2)' }}>
              <span style={{ color: 'var(--green-2)', fontWeight: 600 }}>Yes {p.tally.yesPct.toFixed(1)}%</span>
              {' · '}
              <span style={{ color: 'var(--red-2)' }}>No {p.tally.noPct.toFixed(1)}%</span>
              {' · '}
              <span style={{ color: 'var(--txt-3)' }}>Abstain {p.tally.abstainPct.toFixed(1)}%</span>
            </div>
            <div className="bar"><i style={{ width: `${p.tally.yesPct}%`, background: 'linear-gradient(90deg, rgb(var(--section-accent-rgb)), var(--green-2))' }} /></div>
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
          {!address && <div className="tiny" style={{ color: 'var(--red)', marginBottom: 8 }}>Connect a wallet to vote.</div>}
          {address && (
            <div className="tiny muted mb">
              Voting with weight: {votingPower === null ? '…' : `${votingPower.toLocaleString()} STAKE`}
              {votingPower === 0 && <span style={{ color: 'var(--red)' }}> — this vote will be recorded but won't count toward the tally until you delegate stake.</span>}
            </div>
          )}
          {sel.userVote?.voted ? (
            <span className="chip green mb">You voted: {sel.userVote.option}</span>
          ) : (
            <div className="row mb" style={{ gap: 8 }}>
              {VOTE_OPTIONS.map((o) => (
                <button key={o.value} className="btn btn-ghost" disabled={!address || voting !== null} onClick={() => vote(o.value)} style={{ borderColor: `rgba(${o.color === 'var(--green-2)' ? '34,197,94' : o.color === 'var(--red-2)' ? '220,38,38' : o.color === 'var(--gold)' ? '243,186,47' : '148,163,184'},0.3)` }}>
                  {voting === o.value && <span className="spin" />} {o.label}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {delegateOpen && (
        <Modal title="Delegate stake" onClose={() => setDelegateOpen(false)}>
          <div className="tiny muted mb">
            Delegating bonds STAKE to {validator ? validator.name : 'the network validator'}. This gives your address real weight in governance tallies. Unbonding later takes the chain's normal unbonding period.
          </div>
          <div className="field mb">
            <label>Amount (STAKE)</label>
            <input className="input" type="number" min="0" step="0.000001" value={delegateAmount} onChange={(e) => setDelegateAmount(e.target.value)} placeholder="0.00" />
          </div>
          <button className="btn btn-primary" disabled={delegating || !validator} onClick={doDelegate}>
            {delegating && <span className="spin" />} Delegate
          </button>
        </Modal>
      )}

      {newProposalOpen && (
        <Modal title="Submit a new proposal" onClose={() => setNewProposalOpen(false)} wide>
          <div className="tiny muted mb">
            Real on-chain proposal (cosmos.gov.v1.MsgSubmitProposal) — a signal/text proposal with no executable messages. Requires an initial deposit
            {minDepositDisplay !== null && <> (minimum {minDepositDisplay.toLocaleString()} STAKE to enter voting period; a smaller deposit is accepted but stays in the deposit period)</>}.
          </div>
          <div className="field mb">
            <label>Title</label>
            <input className="input" value={npTitle} onChange={(e) => setNpTitle(e.target.value)} placeholder="Proposal title" />
          </div>
          <div className="field mb">
            <label>Summary</label>
            <textarea className="input" rows={4} value={npSummary} onChange={(e) => setNpSummary(e.target.value)} placeholder="What is this proposal about?" />
          </div>
          <div className="field mb">
            <label>Initial deposit (STAKE)</label>
            <input className="input" type="number" min="0" step="0.000001" value={npDeposit} onChange={(e) => setNpDeposit(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={submitting} onClick={doSubmitProposal}>
            {submitting && <span className="spin" />} Submit proposal
          </button>
        </Modal>
      )}
    </div>
  );
}
