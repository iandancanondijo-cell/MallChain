import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney } from '../../components/ui';
import { useWalletData } from '../../hooks/useWalletData';
import { config } from '../../services/config';

/**
 * SECTION 15: Remove Mock Data & Migration
 * Task 15.5-15.6: WalletHub empty state and connect wallet button
 * 
 * - Shows "Connect Wallet" button when no wallet is connected
 * - Displays empty balance cards with "—" when no data
 * - Shows "Unable to load wallet" fallback when API fails
 * - Retry functionality on errors
 * - Real wallet integration when API is available
 */
export default function WalletHub({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const walletAddress = st.wallet.address;
  const walletCreatedAt = st.wallet.createdAt;

  // Fetch real wallet data from API
  const { balance, loading, error, retry } = useWalletData(walletAddress);

  // Calculate wallet age
  const getWalletAge = () => {
    if (!walletCreatedAt) return 'Unknown';
    const now = Date.now();
    const diff = now - walletCreatedAt;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`;
  };

  // Asset pricing constants - would come from price API in production
  const prices = {
    MALL: 0.42,
    MLPTS: 0.004,
    USD_M: 1.0,
  };

  // SECTION 15.3: Check if wallet is connected
  const isWalletConnected = walletAddress && walletAddress.length > 0;

  // Use real balance if available, fallback to store
  const realBalance = balance || {
    address: walletAddress,
    MALL: st.balances.MALL,
    MLPTS: st.balances.MLPTS,
    USD_M: st.balances.USD_M,
  };

  const assets = [
    { sym: 'MALL', name: 'Mallcoin', val: realBalance.MALL, usd: realBalance.MALL * prices.MALL, color: 'var(--gold)' },
    { sym: 'MLPTS', name: 'Mallpoints', val: realBalance.MLPTS, usd: realBalance.MLPTS * prices.MLPTS, color: 'var(--cyan)' },
    { sym: 'USD-M', name: 'USD stablecoin', val: realBalance.USD_M, usd: realBalance.USD_M * prices.USD_M, color: 'var(--green)' },
  ];

  const actions = [
    { label: 'Send', icon: '➤', p: '/wallet/send' },
    { label: 'Receive', icon: '⬇', p: '/wallet/receive' },
    { label: 'Swap', icon: '⇄', p: '/wallet/swap' },
    { label: 'History', icon: '▤', p: '/wallet/history' },
  ];

  // SECTION 15.5: Empty state skeleton loader
  const BalanceSkeleton = () => (
    <div className="card" style={{ opacity: 0.6 }}>
      <div className="card-label">Loading balance...</div>
      <div className="card-value" style={{ backgroundColor: 'var(--bg-2)', height: '32px', borderRadius: '4px' }} />
      <div className="card-sub" style={{ backgroundColor: 'var(--bg-2)', height: '16px', borderRadius: '4px', marginTop: '8px' }} />
    </div>
  );

  return (
    <div>
      <div className="view-head">
        <h1>Wallet</h1>
        <span className="sub mono" style={{ fontSize: 11.5 }}>
          {isWalletConnected ? walletAddress : '🔗 No wallet connected'}
        </span>
        {isWalletConnected && (
          <span className="chip" style={{ fontSize: '10px', opacity: 0.7 }}>
            🕐 {getWalletAge()}
          </span>
        )}
        <span className="chip gold">{cur}</span>
        {balance && <span className="chip" style={{ fontSize: '10px', opacity: 0.7 }}>✓ Real-time</span>}
        {isWalletConnected && (
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/wallet/settings')}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            ⚙️ Settings
          </button>
        )}
      </div>

      {/* SECTION 15.5: Empty state - No wallet connected */}
      {!isWalletConnected && !config.demoMode && (
        <div className="card" style={{ backgroundColor: 'var(--bg-2)', borderLeft: '4px solid var(--cyan)', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>🔗 No Wallet Connected</h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--txt-3)', fontSize: '13px' }}>
            Connect your wallet to view balances and transact on Mallchain.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/wallet/connect')}
            style={{ display: 'inline-block' }}
          >
            🔗 Connect Wallet
          </button>
        </div>
      )}

      {/* SECTION 15.9-15.10: Error state with retry */}
      {error && (
        <div className="card" style={{ backgroundColor: 'var(--red-dark)', borderColor: 'var(--red)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ color: 'var(--red)', fontSize: '13px' }}>
            <div style={{ marginBottom: '8px' }}>⚠ Unable to load wallet: {error}</div>
            <button
              onClick={() => retry && retry()}
              style={{ cursor: 'pointer', color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0 }}
            >
              [Retry]
            </button>
          </div>
        </div>
      )}

      {/* SECTION 15.5: Balance cards - show with data or empty state */}
      <div className="stat-grid">
        {loading ? (
          <>
            <BalanceSkeleton />
            {[1, 2, 3].map((i) => <BalanceSkeleton key={i} />)}
          </>
        ) : !isWalletConnected && !config.demoMode ? (
          // SECTION 15.5: Empty state - no wallet connected
          <>
            <div className="card">
              <div className="card-label">Total balance</div>
              <div className="card-value">—</div>
              <div className="card-sub">connect wallet to view</div>
            </div>
            {assets.map((a) => (
              <div key={a.sym} className="card">
                <div className="card-label">{a.name} ({a.sym})</div>
                <div className="card-value" style={{ color: a.color }}>—</div>
                <div className="card-sub">—</div>
              </div>
            ))}
          </>
        ) : (
          // Show actual data when wallet is connected or demo mode is on
          <>
            <div className="card">
              <div className="card-label">Total balance</div>
              <div className="card-value">{fmtMoney(assets.reduce((a, x) => a + x.usd, 0), cur)}</div>
              <div className="card-sub">across {assets.length} assets</div>
            </div>
            {assets.map((a) => (
              <div key={a.sym} className="card">
                <div className="card-label">{a.name} ({a.sym})</div>
                <div className="card-value" style={{ color: a.color }}>{fmtNum(a.val)}</div>
                <div className="card-sub">≈ {fmtMoney(a.usd, cur)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* SECTION 15.6: Actions section */}
      <div className="card mb">
        <div className="sec-title"><h2>Actions</h2></div>
        <div className="row">
          {isWalletConnected || config.demoMode ? (
            <>
              {actions.map((a) => (
                <button key={a.label} className="btn btn-ghost" onClick={() => navigate(a.p)}>
                  <span style={{ fontSize: 15 }}>{a.icon}</span> {a.label} MALL
                </button>
              ))}
              <button className="btn btn-ghost gold" onClick={() => navigate('/marketplace')}>🛍 Marketplace</button>
            </>
          ) : (
            <div style={{ color: 'var(--txt-3)', fontSize: '13px', padding: '12px' }}>
              Connect your wallet to enable wallet actions.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 15.7: Assets section with empty state */}
      <div className="card">
        <div className="sec-title"><h2>Assets</h2></div>
        {!isWalletConnected && !config.demoMode ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
            <div>No wallet connected</div>
            <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>Connect a wallet to view your assets</div>
          </div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Asset</th><th className="num">Balance</th><th className="num">Value ({cur})</th></tr></thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.sym}><td><b>{a.sym}</b> <span className="muted">· {a.name}</span></td><td className="num">{fmtNum(a.val)}</td><td className="num">{fmtMoney(a.usd, cur)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
