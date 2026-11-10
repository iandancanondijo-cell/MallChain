import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { minesApi, type ReviewerProfile } from '../../services/minesApi';

/**
 * Stake MLPTS toward becoming a Proof Reviewer. This deposit is one of two
 * required halves — the other is an approved validator application — and
 * GET /reviewer/profile reports both, because the page used to promise that
 * staking alone made the reader assignable. Separate from x/mlcoin
 * StakingRecords and from real chain validator bonding.
 */
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
      <div className="view-head"><h1 className="text-gradient">Stake to Review</h1><span className="sub">Reviewer-specific MLPTS deposit — one half of what assignment requires; the other is an approved validator application</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {error}</div>
        </div>
      )}

      <div className="mc-stats-grid stagger" style={{ marginBottom: 16 }}>
        <div className="card card-hover"><div className="lbl">Current stake</div><div className="num">{loading ? '—' : fmtNum(profile?.stakedAmount ?? 0)} MLPTS</div></div>
        <div className="card card-hover"><div className="lbl">Minimum required</div><div className="num">{loading ? '—' : fmtNum(profile?.minRequiredStake ?? 0)} MLPTS</div></div>
        <div className="card card-hover"><div className="lbl">Status</div><div className="num" style={{ fontSize: 14 }}>{loading ? '—' : profile?.stakeStatus ?? 'unstaked'}</div></div>
        <div className="card card-hover"><div className="lbl">Validator approval</div><div className="num" style={{ fontSize: 14 }}>{loading ? '—' : profile?.validator_allowed === null ? 'not reported' : profile?.validator_allowed ? 'approved' : 'not approved'}</div></div>
        <div className="card card-hover"><div className="lbl">Review earnings</div><div className="num">{loading ? '—' : fmtNum(profile?.total_earnings ?? 0)} MLPTS</div></div>
      </div>

      {profile && profile.review_eligible === false && (
        <div className="card mb" style={{ borderColor: 'var(--gold)', backgroundColor: 'var(--bg-2)' }}>
          <div className="tiny" style={{ color: 'var(--txt-2)' }}>
            {profile.stakeStatus !== 'active' && profile.validator_allowed === false
              ? 'Neither half is in place: no approved validator application and no active stake. Assignments need both.'
              : profile.stakeStatus !== 'active'
                ? `Your application is approved, but this bond is ${profile.stakeStatus} — top up to at least ${fmtNum(profile.minRequiredStake)} MLPTS below to complete the pair.`
                : 'The stake half is met, but no admin has approved a validator application for this account, so submissions will not be assigned to you. Apply on the Validators page.'}
          </div>
        </div>
      )}

      {profile && profile.review_eligible === null && profile.stakeStatus === 'active' && (
        <div className="card mb" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-2)' }}>
          <div className="tiny" style={{ color: 'var(--txt-2)' }}>
            Your stake is active. The approval list could not be read just now, so whether you are assignable is unknown — this page is not claiming you are not approved.
          </div>
        </div>
      )}

      {profile && profile.stakeStatus === 'suspended' && (
        <div className="card mb" style={{ borderColor: 'var(--red)', backgroundColor: 'var(--red-dark)' }}>
          <div style={{ color: 'var(--red-2)', fontSize: 12.5 }}>
            Your reviewer stake is suspended after missed votes. Staking again restores eligibility, but the reputation penalty stays until you review consistently.
          </div>
        </div>
      )}

      <div className="card card-glow bg-gradient-card" style={{ maxWidth: 480 }}>
        <div className="sec-title"><h2>Manage stake</h2></div>
        <div className="field">
          <label>Amount (MLPTS)</label>
          <input className="input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50" />
          <div className="hint">
            {profile?.minRequiredStake
              ? `At least ${fmtNum(profile.minRequiredStake)} MLPTS total is the stake half of the rule; an approved validator application is the other. It is held by the review system, not sent anywhere.`
              : 'Loading the minimum stake…'}
          </div>
          {profile && profile.stakedAmount < (profile.minRequiredStake ?? 0) && (
            <button type="button" className="btn btn-ghost btn-sm mt" disabled={busy !== null}
              onClick={() => setAmount(String(Math.max(0, (profile.minRequiredStake ?? 0) - profile.stakedAmount)))}>
              Top up to the minimum
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy !== null} onClick={doStake}>{busy === 'stake' && <span className="spin" />} Stake</button>
          <button className="btn btn-ghost" disabled={busy !== null || !(profile?.stakedAmount ?? 0)} onClick={() => doUnstake(false)}>{busy === 'unstake' && <span className="spin" />} Unstake amount</button>
          <button className="btn btn-ghost" disabled={busy !== null || !(profile?.stakedAmount ?? 0)} onClick={() => doUnstake(true)}>Unstake all</button>
        </div>
        <div className="tiny mt">Unstaking is blocked while you have an open assigned vote that hasn't been cast yet.</div>
        <div className="tiny mt" style={{ color: 'var(--txt-3)' }}>
          This is the review-system stake, separate from on-chain validator staking — see <a href="#/mines/validator-queue">your reviewer queue</a>.
        </div>
      </div>
    </div>
  );
}
