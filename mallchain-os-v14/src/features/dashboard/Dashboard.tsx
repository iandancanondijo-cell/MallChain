import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, BarChart, StatusChip, toast } from '../../components/ui';
import { minesApi, type MinesSubmission, type MinesCampaign, type ReviewerProfile, type WalletTx } from '../../services/minesApi';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';
import { priceApi } from '../../services/priceApi';
import { useFxRate, toDisplayCurrency } from '../../services/currency';
import { api } from '../../services/api';
import { TrendingUp, Wallet, Zap, Shield, ArrowUpRight, ArrowDownLeft, Repeat, Sparkles } from 'lucide-react';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * KYC pending banner — shown on the dashboard when the user's kycLevel < 2.
 * Fetches the latest KYC status from the backend and displays it with a
 * "Check Status" button that refreshes the status.
 */
function KycPendingBanner() {
  const [status, setStatus] = useState<{ status: string; riskLevel?: string; submittedAt?: string; reviewedAt?: string; reviewNotes?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const res = await api.get<{ status: string; riskLevel?: string; submittedAt?: string; reviewedAt?: string; reviewNotes?: string }>('/api/kyc/status');
    setLoading(false);
    if (res.ok && res.data) {
      setStatus(res.data);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return { text: 'Under Review', color: 'var(--gold)' };
      case 'approved': return { text: 'Approved', color: 'var(--green)' };
      case 'rejected': return { text: 'Rejected', color: 'var(--red)' };
      default: return { text: s, color: 'var(--txt-2)' };
    }
  };

  const label = status ? statusLabel(status.status) : { text: 'Loading...', color: 'var(--txt-3)' };

  return (
    <div className="card" style={{
      marginTop: 14,
      background: 'linear-gradient(135deg, rgba(243, 186, 47, 0.08), rgba(243, 186, 47, 0.02))',
      border: '1px solid rgba(243, 186, 47, 0.3)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'rgba(243, 186, 47, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <Shield size={20} style={{ color: 'var(--gold)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>
            Identity Verification
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            background: `${label.color}20`,
            color: label.color
          }}>
            {label.text}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.5 }}>
          {status?.status === 'rejected'
            ? `Your KYC submission was rejected.${status.reviewNotes ? ` Reason: ${status.reviewNotes}` : ''} Please resubmit.`
            : 'Your KYC submission is under review. Some features (withdrawals, high-value transactions) are limited until verification is complete.'}
        </div>
        {status?.submittedAt && (
          <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>
            Submitted: {new Date(status.submittedAt).toLocaleString()}
          </div>
        )}
      </div>
      <button
        className="btn btn-sm"
        onClick={() => {
          fetchStatus();
          toast('Status refreshed');
        }}
        disabled={loading}
        style={{
          background: 'rgba(243, 186, 47, 0.15)',
          border: '1px solid var(--gold)',
          color: 'var(--gold)',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap'
        }}
      >
        {loading ? 'Loading...' : 'Refresh Status'}
      </button>
    </div>
  );
}

/**
 * Dashboard — Mission Control.
 * Gold-accent command center with glassmorphism cards, a hero portfolio
 * panel, and quick-action tiles. Leverages [data-section="dashboard"]
 * theming from global.css.
 */
export default function Dashboard({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;
  const fxRate = useFxRate(cur);

  const isWalletConnected = st.wallet.address && st.wallet.address.length > 0;

  const [mallPrice, setMallPrice] = useState<number | null>(null);
  useEffect(() => {
    priceApi.getMallPrice().then((res) => {
      if (res.ok && res.data) setMallPrice(res.data.mid);
    });
  }, []);

  const totalValue = (mallPrice !== null ? st.balances.MALL * mallPrice : 0) + st.balances.USD_M;

  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [campaigns, setCampaigns] = useState<MinesCampaign[]>([]);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [earnings, setEarnings] = useState<WalletTx[]>([]);
  const [staking, setStaking] = useState<StakingSummary | null>(null);

  const loadMinesSnapshot = useCallback(async () => {
    const [subResult, campResult, reviewerResult, txResult, stakingResult] = await Promise.all([
      minesApi.mySubmissions(),
      minesApi.listActiveCampaigns(),
      minesApi.getReviewerProfile(),
      minesApi.getTransactions(30),
      st.wallet.address ? stakingApi.getSummary(st.wallet.address) : Promise.resolve({ ok: false as const }),
    ]);
    if (subResult.ok && subResult.data) setSubmissions(subResult.data);
    if (campResult.ok && campResult.data) setCampaigns(campResult.data);
    if (reviewerResult.ok && reviewerResult.data) setReviewer(reviewerResult.data);
    if (txResult.ok && txResult.data) setEarnings(txResult.data);
    if (stakingResult.ok && 'data' in stakingResult && stakingResult.data) setStaking(stakingResult.data.summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.wallet.address]);

  useEffect(() => {
    loadMinesSnapshot();
  }, [loadMinesSnapshot]);

  const activeMines = submissions.filter((s) => !['auto_approved', 'rejected'].includes(s.status)).length;
  const pendingValidation = submissions.filter((s) => ['assigned', 'voting'].includes(s.assignment_status)).length;
  const credits = earnings.filter((t) => t.type === 'credit');
  const byDay: Record<string, number> = {};
  for (const t of credits) byDay[dayKey(t.created_at)] = (byDay[dayKey(t.created_at)] || 0) + t.amount;
  const sparkLabels = Object.keys(byDay);
  const spark = sparkLabels.map((k) => byDay[k]);

  const portfolioDisplay = (() => {
    const t = toDisplayCurrency(totalValue || 0, cur, fxRate);
    return t === null ? '…' : fmtMoney(t, cur);
  })();

  const mallValueDisplay = (() => {
    if (mallPrice === null) return 'price unavailable';
    const t = toDisplayCurrency((st.balances.MALL || 0) * mallPrice, cur, fxRate);
    return t === null ? '…' : `≈ ${fmtMoney(t, cur)}`;
  })();

  const txIcon = (type: string) => {
    switch (type) {
      case 'send': return <ArrowUpRight size={14} />;
      case 'receive': return <ArrowDownLeft size={14} />;
      case 'swap': return <Repeat size={14} />;
      default: return <Sparkles size={14} />;
    }
  };

  return (
    <div>
      {/* ── hero ── */}
      <div className="dash-hero">
        <div className="dash-hero-left">
          <div className="dash-hero-greeting">
            <h1>Mission Control</h1>
            {st.user.frozen && <span className="frozen-badge">❄ Frozen</span>}
          </div>
          <p className="dash-hero-sub">Welcome back, {st.user.name ? st.user.name.split(' ')[0] : 'Guest'}</p>
          <div className="dash-hero-value">
            <span className="dash-hero-label">Total portfolio</span>
            <span className="dash-hero-num">{portfolioDisplay}</span>
            <span className="dash-hero-meta">
              <span className="chip gold" style={{ fontSize: 10 }}>Network: {st.settings.network}</span>
              <span style={{ color: 'var(--txt-3)', fontSize: 11 }}>{mallPrice === null ? 'MALL price unavailable' : `MALL @ $${mallPrice.toFixed(4)}`}</span>
            </span>
          </div>
        </div>
        <div className="dash-hero-right">
          {!isWalletConnected && (
            <div className="dash-connect-card">
              <Wallet size={18} style={{ color: 'var(--cyan)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Wallet not connected</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 2 }}>Connect to view balances and transact</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/auth')}>Connect</button>
            </div>
          )}
          {spark.length > 0 && (
            <div className="dash-mini-chart">
              <span style={{ fontSize: 11, color: 'var(--txt-3)', fontWeight: 600 }}>7-day earnings</span>
              <BarChart data={spark} labels={sparkLabels} height={60} />
            </div>
          )}
        </div>
      </div>

      {/* ── KYC pending banner ── */}
      {st.user.authed && st.user.kycLevel < 2 && (
        <KycPendingBanner />
      )}

      {/* ── stat cards ── */}
      <div className="stat-grid dash-stats">
        <div className="card card-hover dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(243, 186, 47, 0.12)', color: 'var(--gold)' }}>
            <TrendingUp size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">MALL balance</div>
            <div className="card-value">{fmtNum(st.balances.MALL || 0)} <span className="unit">MALL</span></div>
            <div className="card-sub">{mallValueDisplay}</div>
          </div>
        </div>
        <div className="card card-hover dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(167, 139, 250, 0.12)', color: 'var(--purple)' }}>
            <Zap size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Mallpoints</div>
            <div className="card-value">{fmtNum(st.balances.MLPTS || 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">from campaign participation</div>
          </div>
        </div>
        <div className="card card-hover dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--green-2)' }}>
            <Shield size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Reviewer earnings</div>
            <div className="card-value up">+{fmtNum(reviewer?.total_earnings || 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">reputation {reviewer?.mining_reputation ?? '—'}</div>
          </div>
        </div>
        <div className="card card-hover dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(34, 211, 238, 0.12)', color: 'var(--cyan)' }}>
            <Sparkles size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Staking</div>
            <div className="card-value">{fmtNum(staking?.totalStaked ?? 0)} <span className="unit">MLCNS</span></div>
            <div className="card-sub">{staking?.active.length ?? 0} active stake{staking?.active.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      {/* ── main grid: chart + transactions ── */}
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="sec-title">
            <h2>Portfolio trend</h2>
            <span className="sub">earnings in MLPTS</span>
          </div>
          {spark.length ? (
            <BarChart data={spark} labels={sparkLabels} height={140} />
          ) : (
            <div className="dash-empty">
              <TrendingUp size={24} style={{ opacity: 0.4 }} />
              <p>No earnings yet</p>
              <span>Join a campaign to start earning</span>
            </div>
          )}
        </div>
        <div className="card">
          <div className="sec-title">
            <h2>Recent transactions</h2>
            <button className="sec-link-btn" onClick={() => navigate('/wallet/history')}>View all</button>
          </div>
          {st.txs.length === 0 ? (
            <div className="dash-empty">
              <Wallet size={24} style={{ opacity: 0.4 }} />
              <p>No transactions yet</p>
              <span>Send or receive MALL to get started</span>
            </div>
          ) : (
            st.txs.slice(0, 5).map((t) => (
              <div key={t.id} className="list-row dash-tx-row">
                <div className="dash-tx-icon">{txIcon(t.type)}</div>
                <div className="grow">
                  <div className="t">{t.type.charAt(0).toUpperCase() + t.type.slice(1)} {t.amount} {t.asset}</div>
                  <div className="m">{t.note || t.to || ''}</div>
                </div>
                <StatusChip status={t.status} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── quick actions ── */}
      <div className="dash-quick-actions">
        <div className="sec-title"><h2>Quick actions</h2></div>
        <div className="dash-action-grid">
          <button className="dash-action-card" onClick={() => navigate('/wallet/send')}>
            <ArrowUpRight size={18} />
            <span>Send MALL</span>
          </button>
          <button className="dash-action-card" onClick={() => navigate('/wallet/receive')}>
            <ArrowDownLeft size={18} />
            <span>Receive</span>
          </button>
          <button className="dash-action-card" onClick={() => navigate('/mines/discover')}>
            <Sparkles size={18} />
            <span>Discover campaigns</span>
          </button>
          <button className="dash-action-card" onClick={() => navigate('/mines/validator-queue')}>
            <Shield size={18} />
            <span>Reviewer queue</span>
          </button>
          <button className="dash-action-card" onClick={() => navigate('/governance')}>
            <Zap size={18} />
            <span>Vote</span>
          </button>
        </div>
      </div>

      {/* ── snapshots + activity ── */}
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="sec-title"><h2>Network snapshots</h2></div>
          <div className="dash-snap-list">
            <button className="dash-snap-row" onClick={() => navigate('/mines')}>
              <div className="grow">
                <div className="t">Mines</div>
                <div className="m">{activeMines} active · {pendingValidation} pending review · {campaigns.length} campaigns available</div>
              </div>
              <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>View →</span>
            </button>
            <button className="dash-snap-row" onClick={() => navigate('/validators')}>
              <div className="grow">
                <div className="t">Validators</div>
                <div className="m">Real Cosmos x/staking validators</div>
              </div>
              <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>View →</span>
            </button>
            <button className="dash-snap-row" onClick={() => navigate('/staking')}>
              <div className="grow">
                <div className="t">Staking</div>
                <div className="m">{fmtNum(staking?.totalStaked ?? 0)} MLCNS staked · {staking?.active.length ?? 0} active</div>
              </div>
              <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>View →</span>
            </button>
          </div>
        </div>
        <div className="card">
          <div className="sec-title">
            <h2>Live activity</h2>
            <span className="chip green" style={{ fontSize: 10 }}>● live</span>
          </div>
          {st.activity.length === 0 ? (
            <div className="dash-empty" style={{ padding: '24px 0' }}>
              <p style={{ fontSize: 12.5 }}>No activity yet</p>
            </div>
          ) : (
            st.activity.slice(0, 6).map((a) => (
              <div key={a.id} className="list-row">
                <div className="grow">
                  <div className="t" style={{ fontSize: 12.5 }}>{a.text}</div>
                  <div className="m">{new Date(a.ts).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
