import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney } from '../../components/ui';
import { useWalletData } from '../../hooks/useWalletData';
import { priceApi } from '../../services/priceApi';
import { useFxRate, toDisplayCurrency } from '../../services/currency';
import {
  ArrowUpRight, ArrowDownLeft, CreditCard, Building2, Sparkles,
  Repeat, Clock, BarChart3, Wallet, Copy, ExternalLink, Settings, Lock
} from 'lucide-react';

/**
 * Wallet — portfolio overview with glassmorphism asset cards,
 * quick-action tiles, and recent activity. Leverages [data-section="wallet"]
 * emerald accent from global.css.
 */
export default function WalletHub({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const fxRate = useFxRate(cur);
  const disp = (usd: number | null) => (usd === null ? null : toDisplayCurrency(usd, cur, fxRate));
  const walletAddress = st.wallet.address;
  const walletCreatedAt = st.wallet.createdAt;

  const { balance, loading, error, retry } = useWalletData(walletAddress);

  const getWalletAge = () => {
    if (!walletCreatedAt) return 'Unknown';
    const now = Date.now();
    const diff = now - walletCreatedAt;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    return `${Math.floor(days / 365)}y`;
  };

  const [mallPrice, setMallPrice] = useState<number | null>(null);
  useEffect(() => {
    priceApi.getMallPrice().then((res) => {
      if (res.ok && res.data) setMallPrice(res.data.mid);
    });
  }, []);

  const isWalletConnected = walletAddress && walletAddress.length > 0;

  const realBalance = balance || {
    address: walletAddress,
    MALL: st.balances.MALL,
    MLPTS: st.balances.MLPTS,
    USD_M: st.balances.USD_M,
  };

  const mallLocked = balance?.MALL_LOCKED ?? 0;
  const mallUnlockTime = balance?.MALL_UNLOCK_TIME ?? null;

  const assets = [
    {
      sym: 'MALL',
      name: 'Mallcoin',
      val: realBalance.MALL,
      usd: mallPrice !== null ? realBalance.MALL * mallPrice : null,
      gradient: 'linear-gradient(135deg, rgba(243, 186, 47, 0.15), rgba(243, 186, 47, 0.05))',
      accentColor: 'var(--gold)',
      iconBg: 'rgba(243, 186, 47, 0.12)',
      note: mallLocked > 0
        ? `${fmtNum(mallLocked)} locked${mallUnlockTime ? ` until ${new Date(mallUnlockTime).toLocaleDateString()}` : ''}`
        : null,
    },
    {
      sym: 'MLPTS',
      name: 'Mallpoints',
      val: realBalance.MLPTS,
      usd: null,
      gradient: 'linear-gradient(135deg, rgba(34, 211, 238, 0.12), rgba(34, 211, 238, 0.04))',
      accentColor: 'var(--cyan)',
      iconBg: 'rgba(34, 211, 238, 0.12)',
      note: null,
    },
    {
      sym: 'USD-M',
      name: 'USD Stable',
      val: realBalance.USD_M,
      usd: realBalance.USD_M,
      gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0.04))',
      accentColor: 'var(--green-2)',
      iconBg: 'rgba(34, 197, 94, 0.12)',
      note: null,
    },
  ];

  const totalUsd = assets.reduce((a, x) => a + (x.usd ?? 0), 0);
  const totalDisplay = (() => {
    const t = disp(totalUsd);
    return t === null ? '...' : fmtMoney(t, cur);
  })();

  const actions = [
    { label: 'Send', icon: ArrowUpRight, p: '/wallet/send', color: 'var(--green-2)' },
    { label: 'Receive', icon: ArrowDownLeft, p: '/wallet/receive', color: 'var(--cyan)' },
    { label: 'Buy', icon: CreditCard, p: '/wallet/buy', color: 'var(--gold)' },
    { label: 'Withdraw', icon: Building2, p: '/wallet/withdraw', color: 'var(--purple)' },
    { label: 'Swap', icon: Repeat, p: '/wallet/swap', color: 'var(--emerald)' },
    { label: 'Points', icon: Sparkles, p: '/wallet/points', color: 'var(--cyan)' },
    { label: 'History', icon: Clock, p: '/wallet/history', color: 'var(--txt-2)' },
    { label: 'Performance', icon: BarChart3, p: '/wallet/performance', color: 'var(--green-2)' },
  ];

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = walletAddress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  };

  const BalanceSkeleton = () => (
    <div className="wallet-asset-card" aria-busy="true" aria-label="Loading balance">
      <div className="wallet-asset-icon" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="wallet-asset-body">
        <div className="card-label">Loading...</div>
        <div className="card-value" style={{ backgroundColor: 'var(--bg-3)', height: '28px', borderRadius: '6px', marginTop: 4 }} />
        <div style={{ backgroundColor: 'var(--bg-3)', height: '14px', borderRadius: '4px', marginTop: 6, width: '60%' }} />
      </div>
    </div>
  );

  return (
    <div>
      {/* ── hero ── */}
      <div className="wallet-hero">
        <div className="wallet-hero-left">
          <div className="wallet-hero-head">
            <h1>Wallet</h1>
            {isWalletConnected && (
              <button className="wallet-addr-chip" onClick={copyAddress} title="Copy address">
                <span className="mono">{walletAddress.slice(0, 8)}...{walletAddress.slice(-4)}</span>
                <Copy size={11} />
              </button>
            )}
            {isWalletConnected && (
              <button className="wallet-settings-btn" onClick={() => navigate('/wallet/settings')} title="Wallet settings">
                <Settings size={14} />
              </button>
            )}
          </div>

          <div className="wallet-hero-balance">
            <span className="wallet-hero-label">Total balance</span>
            <span className="wallet-hero-num">{loading ? '...' : totalDisplay}</span>
            <span className="wallet-hero-meta">
              {isWalletConnected ? (
                <>
                  <span className="chip" style={{ fontSize: 10 }}>
                    <Clock size={10} style={{ marginRight: 3 }} />{getWalletAge()} old
                  </span>
                  <span className="chip gold" style={{ fontSize: 10 }}>{cur}</span>
                  {balance && <span className="chip green" style={{ fontSize: 10 }}>Live</span>}
                </>
              ) : (
                <span style={{ color: 'var(--txt-3)', fontSize: 11 }}>No wallet connected</span>
              )}
            </span>
          </div>
        </div>

        <div className="wallet-hero-right">
          {!isWalletConnected && (
            <div className="wallet-connect-card">
              <Wallet size={18} style={{ color: 'var(--cyan)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Connect your wallet</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 2 }}>View balances and transact on Mallchain</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/auth')}>Connect</button>
            </div>
          )}
          {isWalletConnected && (
            <div className="wallet-quick-send">
              <button className="btn btn-primary" onClick={() => navigate('/wallet/send')} style={{ flex: 1 }}>
                <ArrowUpRight size={14} /> Send MALL
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/wallet/receive')} style={{ flex: 1 }}>
                <ArrowDownLeft size={14} /> Receive
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── error ── */}
      {error && (
        <div className="wallet-error-card">
          <div>Unable to load wallet: {error}</div>
          <button className="link-btn" onClick={() => retry && retry()}>Retry</button>
        </div>
      )}

      {/* ── asset cards ── */}
      <div className="wallet-assets-grid">
        {loading ? (
          <>
            <BalanceSkeleton />
            <BalanceSkeleton />
            <BalanceSkeleton />
          </>
        ) : (
          assets.map((a) => (
            <div key={a.sym} className="wallet-asset-card card-hover" style={{ background: a.gradient }}>
              <div className="wallet-asset-icon" style={{ background: a.iconBg, color: a.accentColor }}>
                {a.sym === 'MALL' && <span style={{ fontWeight: 900, fontSize: 13 }}>M</span>}
                {a.sym === 'MLPTS' && <Sparkles size={15} />}
                {a.sym === 'USD-M' && <span style={{ fontWeight: 900, fontSize: 12 }}>$</span>}
              </div>
              <div className="wallet-asset-body">
                <div className="card-label">{a.name}</div>
                <div className="card-value" style={{ color: a.accentColor }}>{fmtNum(a.val)} <span className="unit">{a.sym}</span></div>
                <div className="card-sub">
                  {a.usd !== null ? (disp(a.usd) !== null ? `~ ${fmtMoney(disp(a.usd)!, cur)}` : '...') : 'no market price'}
                </div>
                {a.note && <div className="card-sub" style={{ color: 'var(--txt-3)', marginTop: 2 }}>{a.note}</div>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── action grid ── */}
      <div className="wallet-actions-section">
        <div className="sec-title"><h2>Actions</h2></div>
        <div className="wallet-action-grid">
          {actions.map((a) => {
            const isLocked = !isWalletConnected && a.p !== '/wallet/history';
            return (
              <button
                key={a.label}
                className={`wallet-action-tile${isLocked ? ' wallet-action-tile--locked' : ''}`}
                onClick={() => navigate(a.p)}
                disabled={isLocked}
                title={isLocked ? 'Connect your wallet to use this feature' : a.label}
              >
                <div className="wallet-action-icon" style={{ color: a.color }}>
                  <a.icon size={18} />
                </div>
                <span>{a.label}</span>
                {isLocked && <Lock size={10} className="wallet-action-lock" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── recent activity + address ── */}
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="sec-title">
            <h2>Recent transactions</h2>
            <button className="sec-link-btn" onClick={() => navigate('/wallet/history')}>View all</button>
          </div>
          {st.txs.length === 0 ? (
            <div className="wallet-empty-inline">
              <Clock size={20} style={{ opacity: 0.3 }} />
              <p>No transactions yet</p>
              <span>Send or receive MALL to get started</span>
            </div>
          ) : (
            st.txs.slice(0, 5).map((t) => (
              <div key={t.id} className="list-row">
                <div className="wallet-tx-dot" style={{
                  background: t.type === 'send' ? 'var(--red-2)' : t.type === 'receive' ? 'var(--green-2)' : 'var(--cyan)',
                }} />
                <div className="grow">
                  <div className="t">{t.type.charAt(0).toUpperCase() + t.type.slice(1)} {fmtNum(t.amount)} {t.asset}</div>
                  <div className="m">{t.note || t.to || ''}</div>
                </div>
                <span className="chip" style={{ fontSize: 10 }}>{t.status}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="sec-title"><h2>Wallet details</h2></div>
          {!isWalletConnected ? (
            <div className="wallet-empty-inline">
              <Wallet size={20} style={{ opacity: 0.3 }} />
              <p>No wallet connected</p>
            </div>
          ) : (
            <div className="wallet-details-list">
              <div className="wallet-detail-row">
                <span className="wallet-detail-label">Address</span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--txt-2)', wordBreak: 'break-all' }}>{walletAddress}</span>
              </div>
              <div className="wallet-detail-row">
                <span className="wallet-detail-label">Network</span>
                <span>{st.settings.network}</span>
              </div>
              <div className="wallet-detail-row">
                <span className="wallet-detail-label">Wallet age</span>
                <span>{getWalletAge()}</span>
              </div>
              <div className="wallet-detail-row">
                <span className="wallet-detail-label">Display currency</span>
                <span>{cur}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/wallet/settings')}>
                  <Settings size={12} /> Settings
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/explorer')}>
                  <ExternalLink size={12} /> Explorer
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/security')}>
                  Security
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
