import { useCallback, useEffect, useState } from 'react';
import { useStoreVersion, fmtNum, toast } from '../../components/ui';
import { referralsApi, type ReferralStats } from '../../services/referralsApi';
import { useWalletGate } from '../wallet/walletGate';
import WalletGateNotice from '../wallet/WalletGateNotice';
import { Users, Gift, Copy, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';

/** Referrals — growth/social glassmorphism layout with real invite code + claimable commission. */
export default function Referrals() {
  useStoreVersion();

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  // The code is earned by connecting a wallet, and a wallet is gated behind
  // verification — so this page needs the same verdict every other door uses,
  // not a guess. It is the reason shown when `stats.code` comes back null.
  const { gate, refresh } = useWalletGate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await referralsApi.get();
    if (res.ok && res.data) setStats(res.data);
    else setError(res.error || 'Failed to load referral stats');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Null is the server saying "this account has no code yet", and it is the only
  // honest answer before a wallet is connected. Copying a null used to build
  // `#/auth?ref=null` — an invite link that silently referred nobody.
  const code = stats?.code ?? null;
  const copyCode = async () => {
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}#/auth?ref=${code}`;
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
        <h1 className="text-gradient">Referrals</h1>
        <span className="sub">Earn 10 MLPTS for every friend who signs up with your code and connects their wallet</span>
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
              {loading ? '—' : code}
            </div>
          </div>
          <div className="wallet-hero-meta">
            <span className="chip"><Users size={12} style={{ marginRight: 4 }} />{loading ? '—' : stats?.count ?? 0} referrals</span>
            <span className="chip"><TrendingUp size={12} style={{ marginRight: 4 }} />{loading ? '—' : fmtNum(stats?.earned ?? 0)} MLPTS earned</span>
            <button className="btn btn-ghost btn-sm" onClick={copyCode} disabled={!code} style={{ marginLeft: 'auto' }} title={code ? 'Copy your invite link' : 'Connect a wallet to get your code'}>
              <Copy size={12} /> Copy invite link
            </button>
          </div>
        </div>
        <div className="wallet-hero-right" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Gift size={36} style={{ color: 'rgb(var(--section-accent-rgb))', marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: 'var(--txt-3)' }}>10 MLPTS per referral</div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 2 }}>Credited when their wallet connects</div>
          </div>
        </div>
      </div>

      {/* The unearned-code state: what it means, and the one step that changes it. */}
      {!loading && !code && !error && (
        <div className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Gift size={18} style={{ color: 'var(--txt-3)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt-2)', marginBottom: 4 }}>No code yet</div>
            <div className="tiny" style={{ color: 'var(--txt-3)' }}>
              A referral code is issued the moment this account connects a wallet — that is also the moment it can be paid,
              because commissions land in your Mallpoints balance. Until then there is nothing to share, and this page says
              so instead of showing a code that would credit nobody.
            </div>
            {!gate.allowed && (
              <div style={{ marginTop: 10 }}>
                <WalletGateNotice gate={gate} onRetry={refresh} />
              </div>
            )}
            {gate.allowed && stats?.walletConnected !== true && (
              <a className="btn btn-primary btn-sm" href="#/wallet/connect" style={{ marginTop: 10 }}>Connect a wallet</a>
            )}
            {gate.allowed && stats?.walletConnected === true && (
              <button className="btn btn-ghost btn-sm" onClick={() => { refresh(); load(); }} style={{ marginTop: 10 }}>
                Wallet is connected — check again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid stagger">
        <div className="card card-glow bg-gradient-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--section-accent-rgb),0.12)', color: 'rgb(var(--section-accent-rgb))' }}>
            <Users size={20} />
          </div>
          <div>
            <div className="card-label">Referrals</div>
            <div className="card-value">{loading ? '—' : stats?.count ?? 0}</div>
            <div className="card-sub">friends who joined and connected a wallet</div>
          </div>
        </div>
        <div className="card card-glow bg-gradient-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(34,197,94,0.12)', color: 'var(--green-2)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="card-label">Total earned</div>
            <div className="card-value" style={{ color: 'var(--green-2)' }}>{loading ? '—' : fmtNum(stats?.earned ?? 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">lifetime commission</div>
          </div>
        </div>
        <div className="card card-glow bg-gradient-card card-hover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
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

      <div className="card card-glow bg-gradient-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Gift size={18} style={{ color: 'rgb(var(--section-accent-rgb))', flexShrink: 0 }} />
        <div className="tiny" style={{ color: 'var(--txt-2)' }}>
          10 MLPTS is credited to you when a friend who signed up with your code connects their own wallet — the same step that
          makes your reward spendable. Claim moves it into your Mallpoints balance.
        </div>
      </div>
    </div>
  );
}
