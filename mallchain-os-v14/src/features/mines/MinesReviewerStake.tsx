import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { minesApi, type ReviewerProfile } from '../../services/minesApi';

/** Stake MLPTS to become eligible for random Proof Reviewer assignment. Separate from x/mlcoin StakingRecords and real chain validator bonding. */
export default function MinesReviewerStake() {
  useStoreVersion();

  const [profile, setProfile] = useState<ReviewerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<'stake' | 'unstake' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await minesApi.getReviewerProfile();
    if (result.ok && result.data) {
      setProfile(result.data);
    } else {
      setError(result.error || 'Failed to load reviewer profile');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doStake = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return toast('Enter a valid amount', false);
    setBusy('stake');
    const result = await minesApi.stake(n);
    setBusy(null);
    if (result.ok) {
      toast(`Staked ${fmtNum(n)} MLPTS`);
      setAmount('');
      load();
    } else {
      toast(result.error || 'Stake failed', false);
    }
  };

  const doUnstake = async (full: boolean) => {
    const n = full ? undefined : Number(amount);
    if (!full && (!Number.isFinite(n as number) || (n as number) <= 0)) return toast('Enter a valid amount', false);
    setBusy('unstake');
    const result = await minesApi.unstake(n);
    setBusy(null);
    if (result.ok) {
      toast('Unstaked successfully');
      setAmount('');
      load();
    } else {
      toast(result.error || 'Unstake failed', false);
    }
  };

  return (
    <div>
      <div className="view-head"><h1>Stake to Review</h1><span className="sub">Reviewer-specific MLPTS deposit — required to be randomly assigned Mines submissions</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="mc-stats-grid" style={{ marginBottom: 16 }}>
        <div className="card"><div className="lbl">Current stake</div><div className="num">{loading ? '—' : fmtNum(profile?.stakedAmount ?? 0)} MLPTS</div></div>
        <div className="card"><div className="lbl">Minimum required</div><div className="num">{loading ? '—' : fmtNum(profile?.minRequiredStake ?? 0)} MLPTS</div></div>
        <div className="card"><div className="lbl">Status</div><div className="num" style={{ fontSize: 14 }}>{loading ? '—' : profile?.stakeStatus ?? 'unstaked'}</div></div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="sec-title"><h2>Manage stake</h2></div>
        <div className="field">
          <label>Amount (MLPTS)</label>
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy !== null} onClick={doStake}>{busy === 'stake' && <span className="spin" />} Stake</button>
          <button className="btn btn-ghost" disabled={busy !== null} onClick={() => doUnstake(false)}>{busy === 'unstake' && <span className="spin" />} Unstake amount</button>
          <button className="btn btn-ghost" disabled={busy !== null} onClick={() => doUnstake(true)}>Unstake all</button>
        </div>
        <div className="tiny mt">Unstaking is blocked while you have an open assigned vote that hasn't been cast yet.</div>
      </div>
    </div>
  );
}
