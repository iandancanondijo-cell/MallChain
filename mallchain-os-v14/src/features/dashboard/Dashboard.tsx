import { useCallback, useEffect, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, fmtNum, fmtMoney, fmtUnitPrice, BarChart, StatusChip, toast } from '../../components/ui';
import { minesApi, type MinesSubmission, type MinesCampaign, type ReviewerProfile, type WalletTx } from '../../services/minesApi';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';
import { walletApi, type Transaction } from '../../services/walletApi';
import { notificationsApi, type AppNotification } from '../../services/notificationsApi';
import { useLivePrice } from '../../hooks/useLivePrice';
import { useNetworkIdentity } from '../../hooks/useNetworkIdentity';
import { useCurrencyConverter } from '../../services/currency';
import { api } from '../../services/api';
import { authService } from '../../services/auth';
import NetworkDots from './NetworkDots';
import WalletFlowChart from './WalletFlowChart';
import { useWalletGate, reportLinkFailure, linkAttemptGuard } from '../wallet/walletGate';
import WalletGateNotice from '../wallet/WalletGateNotice';
import { AddressIdentity } from '../../components/WalletIdentity';
import { TrendingUp, Wallet, Zap, Shield, ArrowUpRight, ArrowDownLeft, Repeat, Sparkles, CheckCircle2, XCircle, Bell, RefreshCw } from 'lucide-react';
import { Button, Card, Badge, Heading, Text } from '../../components/shared';
import './Dashboard.css';

/** UTC YYYY-MM-DD — matches the day key /api/history/performance buckets by. */
function dayKey(iso: string): string {
  return String(iso).slice(0, 10);
}

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Shape of GET /api/kyc/status (kycController.getKYCStatus). The payload also
 * carries the submitter's PII — name, address, ID number — which this
 * component deliberately never reads or renders: the container needs the
 * admin's verdict, not the user's own data handed back to them.
 */
interface KycStatusResponse {
  kycId?: string;
  status?: string;
  riskLevel?: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  /** The admin's reason, written by routes/adminPanel.js when they decide. */
  notes?: string;
}

type KycVerdict = 'verified' | 'invalid' | 'review' | 'needed' | 'unknown';

function verdictFor(status: string | undefined, fetchFailed: boolean): KycVerdict {
  if (fetchFailed) return 'unknown';
  switch (status) {
    case 'approved': return 'verified';
    case 'rejected': return 'invalid';
    case 'pending':
    case 'review': return 'review';
    case 'draft':
    case 'not_submitted': return 'needed';
    default: return 'unknown';
  }
}

/** How long the green "verified" card stays before folding away. */
const VERIFIED_VISIBLE_MS = 6000;

/**
 * KYC container — a readout of the admin verification queue, nothing else.
 *
 * The version this replaces pushed five internal enum values through one
 * generic "under review" banner, read a `reviewNotes` field the backend never
 * sends (the real field is `notes`), and keyed itself off the local
 * `kycLevel` flag — so a user could sit under a "pending" banner long after an
 * admin decided. It now reads the same document the admin writes
 * (`KYC.findOne({ userId }).sort({ submittedAt: -1 })`) and gives one of two
 * permanent answers — "Verified, ready to go" (green, ticks itself away after
 * a few seconds) or "Details are invalid" (red, with the admin's own note) —
 * plus the honest in-between states.
 */
function KycStatusCard({ navigate }: { navigate: (p: string) => void }) {
  const userId = store.state.user.id;
  const [snap, setSnap] = useState<KycStatusResponse | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  // Remembered per account for the browser session: a verified user sees the
  // tick once rather than on every dashboard mount, and a *revoked*
  // verification still reappears because only the verified verdict consults
  // the flag. The key is built only from a real account id — on a cold mount
  // `user.id` is still the empty default, and writing
  // `mallchain_kyc_verified:` under that id let one account's dismissal hide
  // the banner from the next one.
  const seenKey = userId ? `mallchain_kyc_verified:${userId}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!seenKey) return false;
    try { return sessionStorage.getItem(seenKey) === '1'; } catch { return false; }
  });

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const res = await api.get<KycStatusResponse>('/api/kyc/status');
    setLoading(false);
    setFetchFailed(!res.ok || !res.data);
    if (res.ok && res.data) setSnap(res.data);
  }, []);

  useEffect(() => {
    // Nothing to ask about until the account is known — /api/kyc/status is
    // authenticated, so a pre-login call would just 401 and render a "we
    // could not reach the service" banner that isn't about anyone.
    if (!userId) return;
    // Then drop the previous account's answer before this one's arrives.
    setSnap(null);
    setFetchFailed(false);
    let wasSeen = false;
    try { wasSeen = seenKey !== null && sessionStorage.getItem(seenKey) === '1'; } catch { wasSeen = false; }
    setDismissed(wasSeen);
    fetchStatus();
  }, [userId, seenKey, fetchStatus]);

  const verdict = verdictFor(snap?.status, fetchFailed);

  useEffect(() => {
    if (verdict !== 'verified' || dismissed || seenKey === null) return;
    const id = window.setTimeout(() => {
      setDismissed(true);
      try { sessionStorage.setItem(seenKey, '1'); } catch { /* private mode: it just shows again next mount */ }
    }, VERIFIED_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [verdict, dismissed, seenKey]);

  if (verdict === 'verified' && dismissed) return null;
  // Before the first answer lands there is no verdict to claim — an "unavailable"
  // banner here would say the service failed when nothing has been asked yet.
  if (snap === null && !fetchFailed) return null;

  const verified = verdict === 'verified';
  const invalid = verdict === 'invalid';

  return (
    <Card
      variant="featured"
      className={`kyc-banner kyc-${verified ? 'verified' : invalid ? 'invalid' : verdict === 'review' ? 'review' : 'needed'}${verified ? ' kyc-fade' : ''}`}
      role={verified ? 'status' : 'alert'}
    >
      <div className={`kyc-banner-icon${verified ? ' ok' : invalid ? ' bad' : ''}`}>
        {verified ? <CheckCircle2 size={20} /> : invalid ? <XCircle size={20} /> : <Shield size={20} />}
      </div>
      <div className="kyc-banner-content">
        <div className="kyc-banner-header">
          <Heading level={3} className="kyc-banner-title">
            {verified
              ? 'Verified, ready to go'
              : invalid
                ? 'Details are invalid'
                : verdict === 'review'
                  ? 'Verification under review'
                  : verdict === 'needed'
                    ? 'Identity verification recommended'
                    : 'Verification status unavailable'}
          </Heading>
          <Badge color={verified ? 'success' : invalid ? 'error' : verdict === 'review' ? 'gold' : 'info'}>
            {verified ? 'Approved' : invalid ? 'Rejected' : verdict === 'review' ? 'Pending' : verdict === 'needed' ? 'Not verified' : 'Unknown'}
          </Badge>
        </div>
        <Text size="sm" color="secondary" className="kyc-banner-message">
          {verified
            ? 'Your identity checks out. Withdrawals and high-value transfers are unlocked.'
            : invalid
              ? (snap?.notes ? `The verification team rejected your submission: ${snap.notes}` : 'The verification team rejected your submission. Check your details and resubmit.')
              : verdict === 'review'
                ? 'An examiner has your submission. Withdrawals and high-value transfers stay limited until it is decided.'
                : verdict === 'needed'
                  ? 'You have not submitted your identity verification yet. Some features (withdrawals, high-value transactions) are limited until verification is complete.'
                  : 'We could not reach the verification service, so this is neither a pass nor a fail. Try again in a moment.'}
        </Text>
        {verified ? (
          snap?.reviewedAt && (
            <Text size="xs" color="tertiary" className="kyc-banner-timestamp">
              Approved: {new Date(snap.reviewedAt).toLocaleString()}
            </Text>
          )
        ) : (
          snap?.submittedAt && (
            <Text size="xs" color="tertiary" className="kyc-banner-timestamp">
              Submitted: {new Date(snap.submittedAt).toLocaleString()}
              {snap.reviewedAt ? ` · Decided: ${new Date(snap.reviewedAt).toLocaleString()}` : ''}
            </Text>
          )
        )}
      </div>
      {(invalid || verdict === 'needed') && (
        <Button variant="primary" size="sm" onClick={() => navigate('/kyc')} className="kyc-banner-button">
          {invalid ? 'Fix my details' : 'Start verification'}
        </Button>
      )}
      {(verdict === 'review' || verdict === 'unknown') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fetchStatus();
            toast('Status refreshed');
          }}
          loading={loading}
          className="kyc-banner-button"
        >
          Refresh Status
        </Button>
      )}
    </Card>
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
  const toDisplay = useCurrencyConverter(cur);

  const isWalletConnected = st.wallet.address && st.wallet.address.length > 0;
  const net = useNetworkIdentity();
  const { midKes, pointPriceKes, error: priceError, loading: priceLoading } = useLivePrice();
  // Whether this account may attach a wallet at all. Verified identity comes
  // first (backend/src/middleware/requireKyc.js answers 403 on the link), so a
  // "Link wallet" button shown without it would only cost the user a cipher
  // prompt they can never use.
  const { gate, refresh: refreshWalletGate } = useWalletGate();

  // "Connected" used to be a local flag that kept surviving the server saying
  // no. Ask the account which address it actually holds (GET /api/auth/me →
  // user.walletAddress — the same field /api/send/* rejects broadcasts
  // against) and let that answer drive both the chip and the button, so
  // "Link wallet" only ever appears on a wallet the account really isn't
  // linked to.
  const [linkCheck, setLinkCheck] = useState<{ checked: boolean; serverAddress: string | null; error?: string }>({ checked: false, serverAddress: null });
  const refreshLinkCheck = useCallback(async () => {
    const res = await authService.getServerWalletLink();
    if (!res.ok) {
      setLinkCheck({ checked: true, serverAddress: null, error: res.reason });
      return;
    }
    setLinkCheck({ checked: true, serverAddress: res.address });
    const linked = Boolean(res.address) && res.address === store.state.wallet.address;
    if (store.state.wallet.linkedOnServer !== linked) {
      store.state.wallet.linkedOnServer = linked;
      store.commit();
    }
  }, []);

  useEffect(() => {
    if (st.user.authed) refreshLinkCheck();
  }, [st.user.authed, st.wallet.address, refreshLinkCheck]);

  const serverLinked = Boolean(linkCheck.serverAddress) && linkCheck.serverAddress === st.wallet.address;
  const linkUnconfirmed = !linkCheck.checked || Boolean(linkCheck.error);

  const [linkingWallet, setLinkingWallet] = useState(false);
  const linkWalletNow = async () => {
    if (!st.wallet.address || linkingWallet) return;
    // The button is rendered from the same verdict, so this is the race guard:
    // restore mode allows exactly one address and refuses every other.
    const refused = linkAttemptGuard(gate, st.wallet.address);
    if (refused) { toast(refused, false); return; }
    setLinkingWallet(true);
    const res = await authService.linkWallet(st.wallet.address);
    setLinkingWallet(false);
    // Never trust the flag the link call set — re-read the account, so a
    // "Connected" chip always means the backend has this address.
    await refreshLinkCheck();
    if (res.ok) {
      toast('Wallet linked to your account');
      return;
    }
    // The server's verification gate outranks whatever this page rendered.
    // reportLinkFailure drops the cached verdict so the button becomes the
    // notice on the next paint rather than offering a second signing prompt
    // that would fail the same way.
    reportLinkFailure(res.reason);
  };

  const [submissions, setSubmissions] = useState<MinesSubmission[]>([]);
  const [campaigns, setCampaigns] = useState<MinesCampaign[]>([]);
  const [campaignMlpts, setCampaignMlpts] = useState<number | null>(null);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);
  const [earnings, setEarnings] = useState<WalletTx[]>([]);
  const [staking, setStaking] = useState<StakingSummary | null>(null);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [recentTxError, setRecentTxError] = useState<string | null>(null);
  const [feed, setFeed] = useState<AppNotification[]>([]);

  const loadMinesSnapshot = useCallback(async () => {
    const [subResult, campResult, reviewerResult, txResult, stakingResult] = await Promise.all([
      minesApi.mySubmissions(),
      minesApi.listAvailableCampaigns(),
      minesApi.getReviewerProfile(),
      minesApi.getTransactions(30),
      st.wallet.address ? stakingApi.getSummary(st.wallet.address) : Promise.resolve({ ok: false as const }),
    ]);
    if (subResult.ok && subResult.data) setSubmissions(subResult.data);
    if (campResult.ok && campResult.data) {
      setCampaigns(campResult.data.campaigns);
      setCampaignMlpts(campResult.data.available_mlpts);
    }
    if (reviewerResult.ok && reviewerResult.data) setReviewer(reviewerResult.data);
    if (txResult.ok && txResult.data) setEarnings(txResult.data);
    if (stakingResult.ok && 'data' in stakingResult && stakingResult.data) setStaking(stakingResult.data.summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.wallet.address]);

  useEffect(() => {
    loadMinesSnapshot();
  }, [loadMinesSnapshot]);

  // The two lower panels used to read store fields this view never populated
  // (st.txs, st.activity), so they could only ever say "none yet". Fetch them
  // from the modules that own them, and keep a failure visible instead of
  // letting it decay into an empty list that looks like "nothing happened".
  useEffect(() => {
    if (!st.wallet.address) {
      setRecentTxs([]);
      setRecentTxError(null);
      return;
    }
    let cancelled = false;
    walletApi.getTransactions({ walletAddress: st.wallet.address, pageSize: 5 }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data) {
        setRecentTxs(res.data.transactions);
        setRecentTxError(null);
      } else {
        setRecentTxs([]);
        setRecentTxError(res.error || 'Transaction history unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [st.wallet.address]);

  useEffect(() => {
    let cancelled = false;
    notificationsApi.list().then((res) => {
      if (!cancelled && res.ok && res.data) setFeed(res.data.notifications.slice(0, 6));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeMines = submissions.filter((s) => !['auto_approved', 'rejected'].includes(s.status)).length;
  const pendingValidation = submissions.filter((s) => ['assigned', 'voting'].includes(s.assignment_status)).length;

  // Mallpoints credits from the mines ledger, bucketed by calendar day. The
  // version this replaces bucketed by *weekday name* across the whole 30-day
  // pull, so every Monday in the window collapsed into one bar labelled "Mon"
  // and the chart misreported which week an earning landed in.
  const creditsByDay = earnings
    .filter((t) => t.type === 'credit')
    .reduce<Record<string, number>>((acc, t) => {
      const k = dayKey(t.created_at);
      acc[k] = (acc[k] || 0) + t.amount;
      return acc;
    }, {});
  const earningDays = Object.keys(creditsByDay).sort().slice(-14);
  const sparkLabels = earningDays.map(dayLabel);
  const spark = earningDays.map((d) => creditsByDay[d]);

  const mallKes = midKes !== null ? (st.balances.MALL || 0) * midKes : null;

  const portfolioDisplay = (() => {
    const mallDisp = toDisplay(mallKes, 'KES');
    const usdDisp = toDisplay(st.balances.USD_M || 0, 'USD');
    if (mallDisp === null || usdDisp === null) return '…';
    return fmtMoney(mallDisp + usdDisp, cur);
  })();

  const mallValueDisplay = (() => {
    if (midKes === null) return priceError ? 'price feed unreachable' : 'price unavailable';
    const t = toDisplay(mallKes, 'KES');
    return t === null ? '…' : `≈ ${fmtMoney(t, cur)}`;
  })();

  // "from campaign participation" was a static claim about where the balance
  // came from that nothing verified. It now states what the points are worth
  // at the live Mallpoints rate instead.
  const mlpointsValueDisplay = (() => {
    if (pointPriceKes === null) return 'Mallpoints rate unavailable';
    const t = toDisplay((st.balances.MLPTS || 0) * pointPriceKes, 'KES');
    return t === null ? '…' : `≈ ${fmtMoney(t, cur)}`;
  })();

  // The chain quotes MLCNS in KES, so the unit price must go through the KES
  // rate like every other figure here. Printing `midKes` straight into
  // fmtMoney(…, cur) put a "$0.60" label on a Kenyan-shilling number — for a
  // USD user that read as roughly 1/130th of the real price.
  const mallRateDisplay = (() => {
    if (midKes === null) return 'MALL price unavailable';
    const d = toDisplay(midKes, 'KES');
    return d === null ? 'MALL @ —' : `MALL @ ${fmtUnitPrice(d, cur)}`;
  })();

  const displayName = st.user.name?.trim() || st.user.email?.split('@')[0] || 'Guest';

  const txIcon = (type: string) => {
    switch (type) {
      case 'send': return <ArrowUpRight size={14} />;
      case 'receive': return <ArrowDownLeft size={14} />;
      case 'swap': return <Repeat size={14} />;
      default: return <Sparkles size={14} />;
    }
  };

  return (
    <div className="dash-stack">
      {/* ── balance card: which chain, whose account, what it holds ── */}
      <section className="dash-hero bg-gradient-hero" aria-label="Balance summary">
        <div className="dash-hero-left">
          <div className="dash-hero-greeting">
            <h1 className="text-gradient">{net.networkName}</h1>
            {st.user.frozen && <span className="frozen-badge">❄ Frozen</span>}
          </div>
          <p className="dash-hero-sub">
            <span className="dash-hero-account">{displayName}</span>
            {net.chainId && (
              <span
                className={`dash-hero-chainid${net.matchesConfig ? '' : ' mismatch'}`}
                title={net.matchesConfig ? 'Chain ID reported by the node' : `The node is on ${net.chainId}, not the chain this build is configured for`}
              >
                {net.chainId}{net.matchesConfig ? '' : ' · not this chain'}
              </span>
            )}
          </p>
          <div className="dash-hero-value">
            <span className="dash-hero-label">Total portfolio</span>
            <span className="dash-hero-num">{portfolioDisplay}</span>
            <span className="dash-hero-meta">
              <NetworkDots
                signals={[
                  { tone: 'green', label: 'Chain node', ok: net.loading ? null : net.reachable },
                  { tone: 'yellow', label: 'MLCNS price feed', ok: priceLoading ? null : midKes !== null },
                  { tone: 'orange', label: 'Account-to-wallet link', ok: linkCheck.error ? null : linkCheck.checked ? serverLinked : null },
                ]}
              />
              <span className="dash-hero-height" title={net.latestBlockTime ? `Last block at ${new Date(net.latestBlockTime).toLocaleString()}` : undefined}>
                {net.loading ? 'Checking…' : net.reachable ? (net.latestHeight ? `block ${net.latestHeight.toLocaleString()}` : 'height unavailable') : 'node unreachable'}
              </span>
              {serverLinked ? (
                <span className="chip green" style={{ fontSize: 10 }}>Connected</span>
              ) : gate.state === 'checking' ? (
                <span className="chip" style={{ fontSize: 10, color: 'var(--txt-3)' }} title="Checking whether this account may attach a wallet">Checking verification…</span>
              ) : !gate.allowed ? (
                <a
                  className="chip chip-action"
                  style={{ fontSize: 10 }}
                  href="#/kyc"
                  title="The account needs a verified identity before a wallet can be attached to it"
                >
                  Verification needed
                </a>
              ) : isWalletConnected ? (
                <button
                  className="chip chip-action"
                  style={{ fontSize: 10 }}
                  onClick={linkWalletNow}
                  disabled={linkingWallet}
                  title={linkCheck.error ? `${linkCheck.error} — click to link this wallet anyway` : 'Confirm your cipher to link this wallet to your account'}
                >
                  {linkingWallet ? 'Linking…' : linkUnconfirmed ? 'Re-check & link wallet' : 'Link wallet'}
                </button>
              ) : (
                <span className="chip" style={{ fontSize: 10, color: 'var(--txt-3)' }}>No wallet on this device</span>
              )}
              <span style={{ color: 'var(--txt-3)', fontSize: 11 }}>{mallRateDisplay}</span>
            </span>
          </div>
        </div>
        <div className="dash-hero-right">
          {!isWalletConnected ? (
            <div className="dash-connect-card">
              <Wallet size={18} style={{ color: 'var(--cyan)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Wallet not connected</div>
                <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 2 }}>Connect to view balances and transact</div>
              </div>
              {/* The Connect button starts a wallet on this device, and the
                  server will refuse to attach that wallet to an unverified
                  account — so an unverified account is offered the verification
                  step instead, never a wallet it cannot keep. */}
              {gate.allowed ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => navigate('/wallet/connect')}
                  title={gate.restoreOnly
                    ? 'This account is not verified yet, so it can only re-connect the wallet already attached to it'
                    : 'Start a wallet on this device'}
                >
                  {gate.restoreOnly ? 'Re-connect' : 'Connect'}
                </button>
              ) : gate.state === 'checking' ? (
                <span className="chip" style={{ fontSize: 11, color: 'var(--txt-3)' }}>Checking…</span>
              ) : (
                <a
                  className="btn btn-primary btn-sm"
                  href="#/kyc"
                  title="A wallet is attached to an account only after its identity is verified"
                >
                  Verify first
                </a>
              )}
            </div>
          ) : (
            <WalletFlowChart address={st.wallet.address} balanceCoins={st.balances.MALL || 0} midKes={midKes} currency={cur} height={130} />
          )}
        </div>
      </section>

      {/* One sentence, in the app's own words, for why the wallet actions above
          are disabled — shown whenever the gate refuses and the account does
          not already hold this address on the server. */}
      {gate.blocked && !serverLinked && (
        <WalletGateNotice gate={gate} onRetry={refreshWalletGate} />
      )}

      {/* ── KYC container: the admin's verdict, verbatim ── */}
      {st.user.authed && st.user.role !== 'admin' && st.user.role !== 'superadmin' && (
        <KycStatusCard navigate={navigate} />
      )}

      {/* ── stat cards ── */}
      <section className="stat-grid dash-stats stagger" aria-label="Balances">
        <div className="card card-hover card-glow dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
            <TrendingUp size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">MALL balance</div>
            <div className="card-value">{fmtNum(st.balances.MALL || 0)} <span className="unit">MALL</span></div>
            <div className="card-sub">{mallValueDisplay}</div>
          </div>
        </div>
        <div className="card card-hover card-glow dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(167, 139, 250, 0.12)', color: 'var(--purple)' }}>
            <Zap size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Mallpoints</div>
            <div className="card-value">{fmtNum(st.balances.MLPTS || 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">{mlpointsValueDisplay}</div>
          </div>
        </div>
        <div className="card card-hover card-glow dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--green-2)' }}>
            <Shield size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Reviewer earnings</div>
            <div className="card-value up">+{fmtNum(reviewer?.total_earnings || 0)} <span className="unit">MLPTS</span></div>
            <div className="card-sub">reputation {reviewer?.mining_reputation ?? '—'}</div>
          </div>
        </div>
        <div className="card card-hover card-glow dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(34, 211, 238, 0.12)', color: 'var(--cyan)' }}>
            <Sparkles size={16} />
          </div>
          <div className="dash-stat-body">
            <div className="card-label">Staking</div>
            <div className="card-value">{fmtNum(staking?.totalStaked ?? 0)} <span className="unit">MLCNS</span></div>
            <div className="card-sub">{staking?.active.length ?? 0} active stake{staking?.active.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      </section>

      {/* ── main grid: campaign earnings + transactions ── */}
      <section className="grid-2" aria-label="Earnings and transactions">
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title">
            <h2>Campaign earnings</h2>
            <span className="sub">MLPTS credited per day, last 30 days</span>
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
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title">
            <h2>Recent transactions</h2>
            <button className="sec-link-btn" onClick={() => navigate('/wallet/history')}>View all</button>
          </div>
          {!isWalletConnected ? (
            <div className="dash-empty">
              <Wallet size={24} style={{ opacity: 0.4 }} />
              <p>No wallet connected</p>
              <span>Connect a wallet to see its history</span>
            </div>
          ) : recentTxError ? (
            <div className="dash-empty">
              <RefreshCw size={24} style={{ opacity: 0.4 }} />
              <p>History unavailable</p>
              <span>{recentTxError}</span>
            </div>
          ) : recentTxs.length === 0 ? (
            <div className="dash-empty">
              <Wallet size={24} style={{ opacity: 0.4 }} />
              <p>No transactions yet</p>
              <span>Send or receive MALL to get started</span>
            </div>
          ) : (
            recentTxs.map((t) => (
              <div key={t.id} className="list-row dash-tx-row">
                <div className="dash-tx-icon">{txIcon(t.type)}</div>
                <div className="grow">
                  <div className="t">{t.type.charAt(0).toUpperCase() + t.type.slice(1)} {fmtNum(t.amount)} {t.asset}</div>
                  <div className="m">{t.note || <AddressIdentity address={t.type === 'receive' ? t.from : (t.to || t.from)} label={t.type === 'receive' ? 'From' : 'To'} size={18} />}</div>
                </div>
                <StatusChip status={t.status} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── quick actions ── */}
      <section className="dash-quick-actions" aria-label="Quick actions">
        <div className="sec-title"><h2>Quick actions</h2></div>
        <div className="dash-action-grid stagger">
          <button className="dash-action-card card-glow" onClick={() => navigate('/wallet/send')}>
            <ArrowUpRight size={18} />
            <span>Send MALL</span>
          </button>
          <button className="dash-action-card card-glow" onClick={() => navigate('/wallet/receive')}>
            <ArrowDownLeft size={18} />
            <span>Receive</span>
          </button>
          <button className="dash-action-card card-glow" onClick={() => navigate('/mines/discover')}>
            <Sparkles size={18} />
            <span>Discover campaigns</span>
          </button>
          <button className="dash-action-card card-glow" onClick={() => navigate('/mines/validator-queue')}>
            <Shield size={18} />
            <span>Reviewer queue</span>
          </button>
          <button className="dash-action-card card-glow" onClick={() => navigate('/governance')}>
            <Zap size={18} />
            <span>Vote</span>
          </button>
        </div>
      </section>

      {/* ── snapshots + notifications ── */}
      <section className="grid-2" aria-label="Network and notifications">
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title"><h2>Network snapshots</h2></div>
          <div className="dash-snap-list">
            <button className="dash-snap-row" onClick={() => navigate('/mines')}>
              <div className="grow">
                <div className="t">Mines</div>
                <div className="m">{activeMines} active · {pendingValidation} pending review · {campaigns.length} new to you{campaignMlpts != null ? ` · ${fmtNum(campaignMlpts)} MLPTS earnable` : ''}</div>
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
            <button className="dash-snap-row" onClick={() => net.reload()} title="Re-read node_info and the latest block">
              <div className="grow">
                <div className="t">Chain</div>
                <div className="m">
                  {net.loading
                    ? 'Reading node_info…'
                    : net.reachable
                      ? `${net.chainId} · block ${net.latestHeight?.toLocaleString() ?? '?'}${net.latestBlockTime ? ` · ${new Date(net.latestBlockTime).toLocaleTimeString()}` : ''}`
                      : 'Chain node unreachable — balances may be stale'}
                </div>
              </div>
              <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>Refresh</span>
            </button>
          </div>
        </div>
        <div className="card card-glow bg-gradient-card">
          <div className="sec-title">
            <h2>Notifications</h2>
            <button className="sec-link-btn" onClick={() => navigate('/notifications')}>View all</button>
          </div>
          {feed.length === 0 ? (
            <div className="dash-empty" style={{ padding: '24px 0' }}>
              <Bell size={22} style={{ opacity: 0.4 }} />
              <p style={{ fontSize: 12.5 }}>Nothing new right now</p>
            </div>
          ) : (
            feed.map((n) => (
              <button key={n._id} className="list-row dash-notif-row" onClick={() => navigate('/notifications')}>
                <div className="grow">
                  <div className="t" style={{ fontSize: 12.5, fontWeight: n.read ? 400 : 700 }}>{n.title}</div>
                  <div className="m">{new Date(n.createdAt).toLocaleString()}</div>
                </div>
                {!n.read && <span className="chip gold" style={{ fontSize: 10 }}>new</span>}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
