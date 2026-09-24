import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { referralsApi, type ReferralStats } from '../../services/referralsApi';
import { Users, Gift, Copy, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';

/** Referrals — growth/social glassmorphism layout with real invite code + claimable commission. */
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

  useEffect(() => { load(); }, [load]);

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
      <div className="view-head">
        <h1>Referrals</h1>
        <span className="sub">Earn 10 MLPTS for every friend who signs up with your code</span>
      </div>

      {error && (
        <div className="wallet-error-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>{error}</span>
          <button onClick={load} className="sec-link-btn" style={{ color: 'var(--red)' }}>Retry</button>
        </div>
      )}

      {/* Hero panel */}
      <div className="wallet-hero">
        <div className="wallet-hero-left">
          <div className="wallet-hero-label">Your referral code</div>
          <div className="wallet-hero-balance">
            <div className="wallet-hero-num" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '2px' }}>
              {loading ? '—' : stats?.code}
            </div>
          </div>
          <div className="wallet-hero-meta">
            <span className="chip"><Users size={12} style={{ marginRight: 4 }} />{loading ? '—' : stats?.count ?? 0} referrals</span>
            <span className="chip"><TrendingUp size={12} style={{ marginRight: 4 }} />{loading ? '—' : fmtNum(stats?.earned ?? 0)} MLPTS earned</span>
            <button className="btn btn-ghost btn-sm" onClick={copyCode} disabled={!stats} style={{ marginLeft: 'auto' }}>
              <Copy size={12} /> Copy invite link
            </button>
          </div>
        </div>
        <div className="wallet-hero-right" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Gift size={36} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>10 MLPTS per signup</div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>Instant commission</div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="card-label">Referrals</div>
            <div className="card-value">{loading ? '—' : stats?.count ?? 0}</div>
            <div className="card-sub">signups via your code</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)', color: 'var(--green-2)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="card-label">Total earned</div>
            <div className="card-value" style={{ color: 'var(--green-2)' }}>{loading ? '—' : fmtNum(stats?.earned ?? 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">lifetime commission</div>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.10)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div className="card-label">Claimable</div>
            <div className="card-value" style={{ color: 'rgb(var(--section-accent-rgb))' }}>{loading ? '—' : fmtNum(claimable)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">
              <button className="btn btn-primary btn-sm" onClick={claim} disabled={claiming || claimable <= 0}>
                {claiming && <span className="spin" />} Claim commission
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Gift size={18} style={{ color: 'rgb(var(--section-accent-rgb))', flexShrink: 0 }} />
        <div className="tiny" style={{ color: 'var(--txt-2)' }}>
          10 MLPTS is credited to your account the moment someone signs up using your referral link. Claim moves it into your spendable Mallpoints balance.
        </div>
      </div>
    </div>
  );
}
