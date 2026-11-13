import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Phone, Coins, CheckCircle2, Loader2, Smartphone, ShoppingBag, ArrowRight, Wallet, AlertTriangle, Link2 } from 'lucide-react';
import { api } from '../services/api';
import { store } from '../store/store';
import { authService } from '../services/auth';
import { useMallpointsPrice } from '../hooks/useMallpointsPrice';
import { useStoreVersion, toast } from '../components/ui';
import { useWalletGate, reportLinkFailure, linkAttemptGuard } from '../features/wallet/walletGate';
import WalletGateNotice from '../features/wallet/WalletGateNotice';

type Step = 'form' | 'awaiting_payment' | 'stalled' | 'crediting' | 'done';

/**
 * The Mallpoints rate is whatever the server's economy constants say — read
 * from its own endpoint (GET /api/mallpoints/price, backed by
 * `MALLPOINT_PRICE_KES` in services/economyConstants.js) rather than borrowed
 * from `/api/economy/state`, which answers with the whole tokenomics payload to
 * state one number. It is the same number the reserve quote divides by.
 * Quoting a total from a client-side constant would show a buyer one figure
 * and STK-push them another the moment a deployment moves off the default, so
 * there is deliberately no fallback rate here: with no rate loaded, nothing can
 * be paid.
 *
 * The purchase lifecycle mirrors WalletBuy's MLCNS flow: reserve a quote →
 * M-Pesa STK push → poll status → credit the MLPTS balance.
 */
// routes/mallpointsPurchase.js refuses a quote under KSH 10; the field asks for
// MLPTS, so that floor is expressed through the live rate.
const MIN_KES = 10;

// 40 × 3s ≈ 2 minutes with no callback means the prompt was never answered.
const STALL_TICKS = 40;

const STEP_META: { label: string; icon: typeof CreditCard }[] = [
  { label: 'Details', icon: ShoppingBag },
  { label: 'Pay', icon: Smartphone },
  { label: 'Credit', icon: Loader2 },
  { label: 'Done', icon: CheckCircle2 },
];

const STEP_INDEX: Record<Step, number> = { form: 0, awaiting_payment: 1, stalled: 1, crediting: 2, done: 3 };

/** Purchase Mallpoints (MLPTS) with real money via M-Pesa STK push. */
export default function MallpointsPurchase({ navigate }: { navigate: (p: string) => void }) {
  useStoreVersion();
  // MLPTS credit to a wallet, a wallet links to an account, and the link needs
  // a verified identity — the gate is checked before any of those are offered.
  const { gate, refresh: refreshGate } = useWalletGate();
  const peg = useMallpointsPrice();
  /** Null until the server states it — the rate is never assumed. */
  const rateKes = peg.pointPriceKes;
  const minMlpts = rateKes ? Math.ceil(MIN_KES / rateKes) : null;

  const [amount, setAmount] = useState(50);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  /** The server's own figures for the reserved quote, shown while it is being paid. */
  const [quote, setQuote] = useState<{ kes: number; mlpts: number } | null>(null);
  /** Set when a payment confirmed but the credit call refused — the id is the
   *  support reference, so the form keeps it visible until a new quote replaces it. */
  const [uncreditedQuoteId, setUncreditedQuoteId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [credited, setCredited] = useState(0);
  const [newBalance, setNewBalance] = useState(0);
  const [balLoaded, setBalLoaded] = useState(false);
  const [linking, setLinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollTicksRef = useRef(0);

  const loadBalance = useCallback(async () => {
    const res = await api.get<{ ok: boolean; mlpts_balance: number; walletAddress?: string }>('/api/creator-space/balance');
    if (res.ok && res.data) {
      setBalance(res.data.mlpts_balance || 0);
      setWalletAddress(res.data.walletAddress || '');
      setBalLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadBalance();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadBalance]);

  // The server-side link (user.walletAddress) is what credits a purchase —
  // but a wallet connected on THIS device whose background link-wallet never
  // completed (e.g. the cipher prompt was dismissed) used to be misreported as
  // "No wallet connected". Distinguish the two cases: offer a one-tap
  // "Link wallet" (cipher-verified signature) when the local wallet is present,
  // and only send genuinely wallet-less sessions through the connect flow.
  if (balLoaded && !walletAddress) {
    const localAddress = store.state.wallet.address;
    const linkWalletNow = async () => {
      if (!localAddress || linking) return;
      const refused = linkAttemptGuard(gate, localAddress);
      if (refused) { toast(refused, false); return; }
      setLinking(true);
      // Opens the cipher wall, signs the link message, POSTs /api/auth/link-wallet.
      const res = await authService.linkWallet(localAddress);
      const after = await api.get<{ ok: boolean; mlpts_balance: number; walletAddress?: string }>('/api/creator-space/balance');
      if (after.ok && after.data?.walletAddress) {
        toast('Wallet linked — you can purchase Mallpoints now');
      } else if (!res.ok) {
        // The verification refusal has its own words and its own way out; the
        // generic "try again and enter your cipher" is a lie when the cipher
        // was entered correctly and the account simply isn't verified yet.
        if (!reportLinkFailure(res.reason)) toast('Linking was cancelled — nothing was changed', false);
      } else {
        toast('The link did not land on your account — try again', false);
      }
      setLinking(false);
      loadBalance();
    };
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
            <Wallet size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Purchase Mallpoints</div>
            <div className="wo-hero-sub">{gate.blocked ? 'Verify your identity, then connect a wallet to buy MLPTS' : localAddress ? 'Link your wallet to buy MLPTS' : 'Connect a wallet to buy MLPTS'}</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              {localAddress ? <Link2 size={24} style={{ color: 'var(--cyan)' }} /> : <Wallet size={24} style={{ color: 'var(--cyan)', opacity: 0.5 }} />}
            </div>
            {/* A purchase can only be credited to a server-linked wallet, and
                only a verified account can have one — so an unverified session
                is sent to verification, not offered a cipher prompt that would
                come back 403. */}
            {gate.blocked ? (
              <WalletGateNotice gate={gate} onRetry={refreshGate} />
            ) : localAddress ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Wallet connected — one step left</div>
                <div style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                  This device holds your wallet <span style={{ fontFamily: 'monospace' }}>{localAddress.slice(0, 14)}…</span>, but it isn't linked to your account on the server yet. Confirm your cipher so purchases can be credited.
                </div>
                <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={linkWalletNow} disabled={linking || gate.state === 'checking'}>
                  {linking ? 'Waiting for cipher…' : gate.state === 'checking' ? 'Checking…' : 'Unlock with your cipher'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No wallet connected</div>
                <div style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                  Mallpoints are credited to a Mallchain wallet. Connect one first — purchases without a wallet can't be credited to you.
                </div>
                <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/auth')} disabled={gate.state === 'checking'}>
                  {gate.state === 'checking' ? 'Checking…' : 'Connect a wallet'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalKes = rateKes ? Math.max(0, amount) * rateKes : 0;

  /** Leave the payment screens: the quote reference goes with them. */
  const backToForm = () => {
    setStep('form');
    setQuoteId(null);
    setQuote(null);
  };

  /** Poll the quote every 3s until Safaricom's callback confirms or fails it. */
  const pollStatus = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollTicksRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollTicksRef.current += 1;
      // Bail out well before the 10 minute server-side expiry: an unanswered
      // prompt never gets a callback, so without this the page just spins.
      if (pollTicksRef.current > STALL_TICKS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('stalled');
        setBusy(false);
        return;
      }
      const res = await api.get<{ status: string }>(`/api/mallpoints/purchase/status/${id}`);
      if (!res.ok || !res.data) return;
      if (res.data.status === 'confirmed') {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('crediting');
        const creditRes = await api.post<{ ok: boolean; mallpointsCredited: number; newBalance: number }>('/api/mallpoints/purchase/credit', { quoteId: id });
        if (!creditRes.ok || !creditRes.data?.ok) {
          toast(creditRes.error || 'Payment received but crediting failed — contact support with your quote id', false);
          // The money moved. The quote id is the only thing support can work
          // from, so it stays on screen after returning to the form.
          setUncreditedQuoteId(id);
          setStep('form');
          setQuote(null);
          setBusy(false);
          return;
        }
        setCredited(creditRes.data.mallpointsCredited);
        setNewBalance(creditRes.data.newBalance);
        loadBalance();
        setStep('done');
        setBusy(false);
        toast('Mallpoints credited to your balance!');
      } else if (res.data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        toast('Payment failed — no Mallpoints were credited', false);
        backToForm();
        setBusy(false);
      }
    }, 3000);
  };

  const cancelPayment = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setBusy(false);
    backToForm();
  };

  const submit = async () => {
    if (!walletAddress) {
      toast('No wallet connected — reload the page or log in again', false);
      return;
    }
    if (!rateKes || !minMlpts) {
      toast('The Mallpoints rate is not loaded — reload to get the current price', false);
      return;
    }
    if (!Number.isFinite(amount) || amount < minMlpts) {
      toast(`Minimum purchase is KSH ${MIN_KES} — ${minMlpts} MLPTS at ${rateKes} KES each`, false);
      return;
    }
    const normalized = phone.replace(/\s/g, '').replace(/^0/, '254');
    if (!/^254\d{9}$/.test(normalized)) {
      toast('Enter a valid M-Pesa phone — 254 followed by 9 digits', false);
      return;
    }

    setBusy(true);

    const reserveRes = await api.post<{
      ok: boolean;
      quoteId: string;
      amountKes?: number;
      mallpointsAmount?: number;
      pricePerMallpoint?: number;
    }>('/api/mallpoints/purchase/reserve', {
      amount_kes: totalKes,
      address: walletAddress,
    });
    if (!reserveRes.ok || !reserveRes.data?.quoteId) {
      toast(reserveRes.error || 'Failed to create purchase quote', false);
      setBusy(false);
      return;
    }

    const id = reserveRes.data.quoteId;
    setQuoteId(id);
    setUncreditedQuoteId(null);
    // Once the server has priced the quote its figures are the truth for this
    // payment — if the rate moved between page load and reserve, the STK push
    // settles the quote's amount, not the one previewed on the form.
    setQuote({
      kes: reserveRes.data.amountKes ?? totalKes,
      mlpts: reserveRes.data.mallpointsAmount ?? amount,
    });
    if (reserveRes.data.pricePerMallpoint && reserveRes.data.pricePerMallpoint !== rateKes) {
      toast(`Rate updated to ${reserveRes.data.pricePerMallpoint} KES / MLPTS for this quote`);
    }

    const stkRes = await api.post<{ ok: boolean }>('/api/mallpoints/purchase/mpesa', {
      quoteId: id,
      phone: normalized,
    });
    if (!stkRes.ok || !stkRes.data?.ok) {
      toast(stkRes.error || 'Failed to start the M-Pesa payment', false);
      setBusy(false);
      return;
    }

    setStep('awaiting_payment');
    toast('Check your phone for the M-Pesa prompt');
    pollStatus(id);
  };

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'color-mix(in srgb, var(--section-accent) 10%, transparent)', color: 'var(--section-accent)' }}>
          <ShoppingBag size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title">Purchase Mallpoints</div>
          <div className="wo-hero-sub">Pay with M-Pesa — MLPTS credited to your Creator Space balance</div>
        </div>
      </div>

      {/* ── step indicator ── */}
      <div className="wo-steps">
        {STEP_META.map((s, i) => {
          const cur = STEP_INDEX[step];
          const cls = i < cur ? 'done' : i === cur ? 'active' : '';
          return (
            <div key={s.label} className={`wo-step ${cls}`}>
              <div className="wo-step-dot"><s.icon size={12} /></div>
              <span>{s.label}</span>
              {i < STEP_META.length - 1 && <div className={`wo-step-line ${i < cur ? 'done' : ''}`} />}
            </div>
          );
        })}
      </div>

      {/* ── main card ── */}
      <div className="wo-card card-glow bg-gradient-card" style={{ maxWidth: 520 }}>
        {step === 'form' && (
          <>
            {uncreditedQuoteId && (
              <div className="wo-status" role="alert" style={{ padding: '12px 14px', marginBottom: 14, textAlign: 'left' }}>
                <div className="wo-status-title" style={{ color: 'var(--warning, var(--gold))', fontSize: 14 }}>
                  A payment landed but was not credited
                </div>
                <div className="wo-status-text" style={{ fontSize: 12.5 }}>
                  Quote <span className="mono">{uncreditedQuoteId}</span> was confirmed and the balance credit failed.
                  Contact support with that id — do not pay the same quote again.
                </div>
              </div>
            )}
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={13} style={{ color: 'var(--gold)' }} /> Amount (MLPTS)
              </label>
              <input
                className="input"
                type="number"
                min={minMlpts ?? undefined}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                disabled={busy}
              />
              <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>
                Your balance: {balance === null ? '…' : balance} MLPTS
                {' · '}
                {rateKes && minMlpts
                  ? `minimum ${minMlpts} MLPTS (KSH ${MIN_KES})`
                  : 'minimum KSH 10'}
              </div>
            </div>

            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={13} style={{ color: 'var(--cyan)' }} /> M-Pesa phone number
              </label>
              <input
                className="input"
                type="tel"
                placeholder="254712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
              <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>
                254 followed by 9 digits
              </div>
            </div>

            {/* ── preview ── */}
            <div className="wo-summary" style={{ marginBottom: 16 }}>
              <div className="wo-summary-row">
                <span className="wo-summary-label">You receive</span>
                <span className="wo-summary-value" style={{ color: 'var(--gold)' }}>
                  {rateKes ? `${Math.max(0, amount) || 0} MLPTS` : '—'}
                </span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">You pay</span>
                <span className="wo-summary-value">{rateKes ? `${totalKes.toLocaleString()} KES` : '—'}</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">Phone</span>
                <span className="wo-summary-value mono">{phone || '—'}</span>
              </div>
              <div className="wo-summary-row total">
                <span className="wo-summary-label">Rate</span>
                <span className="wo-summary-value">
                  {rateKes
                    ? `${rateKes} KES / MLPTS`
                    : peg.loading
                      ? 'loading the current rate…'
                      : 'rate unavailable'}
                </span>
              </div>
            </div>

            {/* Nothing here is priced until the server states the rate; the
                reserve quote would still be right, but showing a "You pay"
                figure we made up next to real money is not. */}
            {!rateKes && (
              <div className="tiny" style={{ marginBottom: 10, color: 'var(--warning, var(--gold))' }}>
                {peg.loading
                  ? 'Waiting for the current Mallpoints rate from the network…'
                  : 'Could not load the current Mallpoints rate. Check your connection and reload — paying is disabled until the rate is known.'}
              </div>
            )}

            {walletAddress && (
              <div className="tiny" style={{ marginBottom: 10, color: 'var(--txt-3)' }}>
                Credited to <span className="mono">{walletAddress}</span>
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={busy || !walletAddress || !rateKes}
              style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {busy ? <><span className="wo-spinner" /> Processing…</> : <><CreditCard size={14} /> Pay with M-Pesa <ArrowRight size={14} /></>}
            </button>
          </>
        )}

        {step === 'awaiting_payment' && (
          <div className="wo-status" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Smartphone size={24} style={{ color: 'var(--cyan)' }} />
              </div>
              <div className="wo-pulse-ring" />
            </div>
            <div className="wo-status-title">Check your phone</div>
            <div className="wo-status-text">
              Complete the M-Pesa prompt sent to <b className="mono">{phone}</b> for{' '}
              <b>{(quote?.kes ?? totalKes).toLocaleString()} KES</b>
              {' · '}{quote ? `${quote.mlpts} MLPTS` : `${Math.max(0, amount) || 0} MLPTS`}.
            </div>
            {quoteId && <div className="wo-hash" style={{ marginTop: 12 }}>Quote {quoteId}</div>}
            <div className="wo-status-text" style={{ marginTop: 6, fontSize: 12, color: 'var(--txt-3)' }}>
              Stops waiting after ~2 minutes if the prompt is left unanswered.
            </div>
            <button className="btn btn-ghost" onClick={cancelPayment} style={{ marginTop: 16 }}>
              Cancel
            </button>
          </div>
        )}

        {step === 'stalled' && (
          <div className="wo-status" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(251, 191, 36, 0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: 'var(--gold)' }} />
            </div>
            <div className="wo-status-title" style={{ color: 'var(--warning)' }}>No payment received</div>
            <div className="wo-status-text">
              We did not get a payment from <b className="mono">{phone}</b>. The prompt may have expired or been missed — check the handset and start a new request.
            </div>
            {quoteId && <div className="wo-hash" style={{ marginTop: 12 }}>Quote {quoteId}</div>}
            <button className="btn btn-primary" onClick={backToForm} style={{ marginTop: 20 }}>
              Try again
            </button>
          </div>
        )}

        {step === 'crediting' && (
          <div className="wo-status" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} className="wo-spinner" style={{ color: 'var(--green)' }} />
              </div>
            </div>
            <div className="wo-status-title" style={{ color: 'var(--green)' }}>Payment confirmed</div>
            <div className="wo-status-text">Crediting Mallpoints to your balance…</div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
            </div>
            <div className="wo-status-title" style={{ color: 'var(--green)' }}>Mallpoints credited</div>
            <div className="wo-status-text">
              <b style={{ color: 'var(--gold)' }}>+{credited} MLPTS</b> · new balance <b>{newBalance} MLPTS</b>
            </div>
            {quoteId && <div className="wo-hash" style={{ marginTop: 12 }}>Quote {quoteId}</div>}
            <button
              className="btn btn-primary"
              onClick={backToForm}
              style={{ marginTop: 20 }}
            >
              New purchase
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
