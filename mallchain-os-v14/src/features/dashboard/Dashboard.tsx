import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, BarChart, StatusChip } from '../../components/ui';
import { config } from '../../services/config';
import { minesApi, type MinesSubmission, type MinesCampaign, type ReviewerProfile, type WalletTx } from '../../services/minesApi';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
}

/**
 * SECTION 15: Remove Mock Data & Migration
 * - Dashboard initializes empty in production mode
 * - Shows empty states when no data is available
 * - Fallback UI when API fails
 * - Real wallet data when connected
 *
 * Mines/Reviewer snapshot cards pull from the real backend (see
 * services/minesApi.ts) — they used to read the local fictional
 * `store.state.mines`/`store.state.validators` slices, which nothing
 * populates anymore now that those feature pages call real APIs.
 */
export default function Dashboard({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  const st = store.state;
  const cur = st.prefs.currency;

  const isWalletConnected = st.wallet.address && st.wallet.address.length > 0;

  const totalValue =
    st.balances.MALL * 0.42 +
    st.balances.MLPTS * 0.004 +
    st.balances.USD_M +
    (cur === 'KES' ? st.balances.USD_M * 129 : cur === 'EUR' ? st.balances.USD_M * 0.92 : cur === 'GBP' ? st.balances.USD_M * 0.79 : 0);

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

  return (
    <div>
      <div className="view-head">
        <h1>Mission Control</h1>
        <span className="sub">Welcome back, {st.user.name ? st.user.name.split(' ')[0] : 'Guest'}</span>
        {st.user.frozen && <span className="frozen-badge">❄ Frozen</span>}
        <span className="chip gold">Network: {st.settings.network}</span>
      </div>

      {/* SECTION 15.9-15.10: Fallback UI when wallet is not connected */}
      {!isWalletConnected && !config.demoMode && (
        <div className="card" style={{ backgroundColor: 'var(--bg-2)', borderLeft: '4px solid var(--cyan)', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>🔗 Connect Your Wallet</h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--txt-3)', fontSize: '13px' }}>
            Connect your wallet to view your portfolio, track earnings, and participate in campaigns.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/auth')}
            style={{ display: 'inline-block' }}
          >
            🔗 Connect Wallet
          </button>
        </div>
      )}

      <div className="stat-grid">
        <div className="card">
          <div className="card-label">Total portfolio value</div>
          <div className="card-value">{fmtMoney(totalValue || 0, cur)}</div>
          <div className="card-sub"><span className="gold">▲ 4.2%</span> this week</div>
        </div>
        <div className="card">
          <div className="card-label">MALL balance</div>
          <div className="card-value">{fmtNum(st.balances.MALL || 0)} <span className="unit">MALL</span></div>
          <div className="card-sub">≈ {fmtMoney((st.balances.MALL || 0) * 0.42, cur)}</div>
        </div>
        <div className="card">
          <div className="card-label">Mallpoints</div>
          <div className="card-value">{fmtNum(st.balances.MLPTS || 0)} <span className="unit">MLPTS</span></div>
          <div className="card-sub">from campaign participation</div>
        </div>
        <div className="card">
          <div className="card-label">Proof Reviewer earnings</div>
          <div className="card-value up">+{fmtNum(reviewer?.total_earnings || 0)} <span className="unit">MLPTS</span></div>
          <div className="card-sub">reputation {reviewer?.mining_reputation ?? '—'}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="sec-title"><h2>Portfolio 7-day trend</h2><span className="sub">earnings in MLPTS</span></div>
          {spark.length ? <BarChart data={spark} labels={sparkLabels} height={140} /> : <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>📊<br/>No earnings yet — join a campaign.</div>}
        </div>
        <div className="card">
          <div className="sec-title"><h2>Recent transactions</h2><span className="sec-link" onClick={() => navigate('/wallet/history')}>View all ›</span></div>
          {st.txs.length === 0 ? (
            <div className="empty" style={{ color: 'var(--txt-3)', padding: 30, textAlign: 'center' }}>
              💰<br/>No transactions yet — send or receive MALL to get started.
            </div>
          ) : (
            st.txs.slice(0, 5).map((t) => (
              <div key={t.id} className="list-row">
                <span style={{ fontSize: 16 }}>{t.type === 'send' ? '➤' : t.type === 'receive' ? '⬇' : t.type === 'swap' ? '⇄' : '✦'}</span>
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

      <div className="grid-3" style={{ marginTop: 14 }}>
        <div className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate('/mines')}>
          <div className="card-label">Mines snapshot</div>
          <div className="card-value" style={{ fontSize: 18 }}>{activeMines} active · {pendingValidation} pending review</div>
          <div className="card-sub">Campaigns available: {campaigns.length}</div>
        </div>
        <div className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate('/validators')}>
          <div className="card-label">Validators snapshot</div>
          <div className="card-value" style={{ fontSize: 18 }}>Real Cosmos x/staking</div>
          <div className="card-sub">view chain validators &amp; your application status</div>
        </div>
        <div className="card card-hover" style={{ cursor: 'pointer' }} onClick={() => navigate('/staking')}>
          <div className="card-label">Staking</div>
          <div className="card-value" style={{ fontSize: 18 }}>{fmtNum(staking?.totalStaked ?? 0)} MLCNS staked</div>
          <div className="card-sub">{staking?.active.length ?? 0} active stake{staking?.active.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="sec-title"><h2>Quick actions</h2></div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => navigate('/wallet/send')}>➤ Send MALL</button>
          <button className="btn btn-ghost" onClick={() => navigate('/wallet/receive')}>⬇ Receive</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/discover')}>🧭 Discover campaigns</button>
          <button className="btn btn-ghost" onClick={() => navigate('/mines/validator-queue')}>🛂 Proof Reviewer queue</button>
          <button className="btn btn-ghost" onClick={() => navigate('/governance')}>🗳 Vote</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="sec-title"><h2>Live activity</h2><span className="chip green">● live</span></div>
        {st.activity.length === 0 ? (
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 20 }}>📝 No activity yet.</div>
        ) : (
          st.activity.slice(0, 8).map((a) => (
            <div key={a.id} className="list-row">
              <div className="grow"><div className="t">{a.text}</div><div className="m">{new Date(a.ts).toLocaleString()}</div></div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
