import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { referralsApi, type ReferralStats } from '../../services/referralsApi';

/** Referrals — real invite code + claimable commission (backend/src/routes/referrals.js). */
export default function Referrals() {
  useStoreVersion();

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await referralsApi.get();
    if (res.ok && res.data) setStats(res.data);
    else setError(res.error || 'Failed to load referral stats');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyCode = async () => {
    if (!stats) return;
    const link = `${window.location.origin}${window.location.pathname}#/auth?ref=${stats.code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Referral link copied');
  };

  const claim = async () => {
    setClaiming(true);
    const res = await referralsApi.claim();
    setClaiming(false);
    if (res.ok && res.data) {
      toast(res.data.message);
      load();
    } else {
      toast(res.error || 'Nothing to claim', false);
    }
  };

  const claimable = stats ? stats.earned - stats.claimed : 0;

  return (
    <div>
      <div className="view-head"><h1>Referrals</h1><span className="sub">Earn 10 MLPTS for every friend who signs up with your code</span></div>

      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: 16, marginBottom: 16 }}>
          <div style={{ color: 'var(--red)', fontSize: 13 }}>
            ⚠ {error}{' '}
            <button onClick={load} style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}>[Retry]</button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Your code</div>
          <div className="card-value mono" style={{ fontSize: 19 }}>{loading ? '—' : stats?.code}</div>
          <div className="card-sub"><button className="btn btn-ghost btn-sm" onClick={copyCode} disabled={!stats}>Copy invite link</button></div>
        </div>
        <div className="card"><div className="card-label">Referrals</div><div className="card-value">{loading ? '—' : stats?.count ?? 0}</div><div className="card-sub">signups via your code</div></div>
        <div className="card"><div className="card-label">Total earned</div><div className="card-value up">{loading ? '—' : fmtNum(stats?.earned ?? 0)} <span className="unit">MLPTS</span></div><div className="card-sub">lifetime commission</div></div>
        <div className="card">
          <div className="card-label">Claimable</div>
          <div className="card-value" style={{ color: 'var(--gold)' }}>{loading ? '—' : fmtNum(claimable)} <span className="unit">MLPTS</span></div>
          <div className="card-sub"><button className="btn btn-primary btn-sm" onClick={claim} disabled={claiming || claimable <= 0}>{claiming && <span className="spin" />} Claim commission</button></div>
        </div>
      </div>

      <div className="card">
        <div className="tiny">10 MLPTS is credited to your account the moment someone signs up using your referral link. Claim moves it into your spendable Mallpoints balance.</div>
      </div>
    </div>
  );
}
