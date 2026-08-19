import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, StatusChip, Modal, toast } from '../../components/ui';
import { governanceApi, type Proposal, type DepositParams } from '../../services/governanceApi';
import { castVote, submitProposal, GovernanceTxError, type VoteOption } from '../../services/governanceTx';
import { delegate, DelegateTxError } from '../../services/stakingDelegateTx';
import { validatorsApi, type ChainValidator } from '../../services/validatorsApi';

const VOTE_OPTIONS: { label: string; value: VoteOption }[] = [
  { label: 'Yes', value: 'VOTE_OPTION_YES' },
  { label: 'No', value: 'VOTE_OPTION_NO' },
  { label: 'Abstain', value: 'VOTE_OPTION_ABSTAIN' },
  { label: 'No with veto', value: 'VOTE_OPTION_NO_WITH_VETO' },
];

const STAKE_DECIMALS = 6;
const toBaseUnits = (display: number) => Math.floor(display * 10 ** STAKE_DECIMALS).toString();
const toDisplay = (base: string) => Number(base) / 10 ** STAKE_DECIMALS;

/** Governance — real on-chain proposals + MsgVote (cosmos.gov.v1, this chain's real module). */
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

  useEffect(() => {
    load();
    loadPowerAndParams();
  }, [load, loadPowerAndParams]);

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

  const doDelegate = async () => {
    if (!st.wallet.mnemonic || !address) return toast('Wallet not connected', false);
    if (!validator) return toast('No validator available to delegate to', false);
    const amt = Number(delegateAmount);
    if (!amt || amt <= 0) return toast('Enter a valid amount', false);
    setDelegating(true);
    try {
      const result = await delegate({
        mnemonic: st.wallet.mnemonic,
        fromAddress: address,
        validatorAddress: validator.operatorAddress,
        amount: toBaseUnits(amt),
        denom: 'stake',
      });
      toast(`Delegated — tx ${result.txHash.slice(0, 10)}…`);
      setDelegateOpen(false);
      setDelegateAmount('');
      loadPowerAndParams();
    } catch (e) {
      toast(e instanceof DelegateTxError || e instanceof Error ? e.message : 'Delegation failed', false);
    } finally {
      setDelegating(false);
    }
  };

  const doSubmitProposal = async () => {
    if (!st.wallet.mnemonic || !address) return toast('Wallet not connected', false);
    if (!npTitle.trim() || !npSummary.trim()) return toast('Title and summary are required', false);
    const amt = Number(npDeposit);
    if (!amt || amt <= 0) return toast('Enter a valid deposit amount', false);
    setSubmitting(true);
    try {
      const result = await submitProposal({
        mnemonic: st.wallet.mnemonic,
        fromAddress: address,
        title: npTitle.trim(),
        summary: npSummary.trim(),
        initialDepositAmount: toBaseUnits(amt),
        denom: 'stake',
      });
      toast(`Proposal submitted — tx ${result.txHash.slice(0, 10)}…`);
      setNewProposalOpen(false);
      setNpTitle('');
      setNpSummary('');
      load();
    } catch (e) {
      toast(e instanceof GovernanceTxError || e instanceof Error ? e.message : 'Proposal submission failed', false);
    } finally {
      setSubmitting(false);
    }
  };

  const minDepositDisplay = depositParams?.min_deposit?.[0] ? toDisplay(depositParams.min_deposit[0].amount) : null;

  return (
    <div>
      <div className="view-head">
        <h1>Governance</h1>
        <span className="sub">On-chain proposals</span>
        {address && (
          <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setNewProposalOpen(true)}>
            + New proposal
          </button>
        )}
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
        <div className="card">
          <div className="card-label">Your voting power</div>
          <div className="card-value">{votingPower === null ? '—' : `${votingPower.toLocaleString()} STAKE`}</div>
          <div className="card-sub">
            {votingPower === 0 ? (
              <span className="red">No delegated stake — your vote won't count toward the tally</span>
            ) : (
              <>
                Bonded to the network validator ·{' '}
                <button className="link-btn" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold)', cursor: 'pointer', font: 'inherit' }} onClick={() => setDelegateOpen(true)}>
                  Delegate more
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {address && (votingPower === 0 || votingPower === null) && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="grow" style={{ fontSize: 13 }}>
            Real governance voting power comes from bonded stake (x/staking), not your MLCNS balance. Delegate some STAKE to gain real voting weight.
          </div>
          <button className="btn btn-primary" onClick={() => setDelegateOpen(true)}>Delegate stake</button>
        </div>
      )}

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
          {address && (
            <div className="tiny muted mb">
              Voting with weight: {votingPower === null ? '…' : `${votingPower.toLocaleString()} STAKE`}
              {votingPower === 0 && <span className="red"> — this vote will be recorded but won't count toward the tally until you delegate stake.</span>}
            </div>
          )}
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
