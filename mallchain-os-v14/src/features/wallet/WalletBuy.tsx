import { useEffect, useRef, useState } from 'react';
import { CreditCard, Phone, Coins, CheckCircle2, Loader2, Smartphone, AlertTriangle, Lock, ArrowRight, Banknote } from 'lucide-react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { buyApi, type BuyConfig, type BuyQuote } from '../../services/buyApi';

type Step = 'form' | 'awaiting_payment' | 'crediting' | 'done';

const FALLBACK_KES_PER_MLCNS = 0.62;

const STEP_META: { label: string; icon: typeof CreditCard }[] = [
  { label: 'Details', icon: CreditCard },
  { label: 'Pay', icon: Smartphone },
  { label: 'Credit', icon: Loader2 },
  { label: 'Done', icon: CheckCircle2 },
];

const STEP_INDEX: Record<Step, number> = { form: 0, awaiting_payment: 1, crediting: 2, done: 3 };

/** Buy Mallcoin with real money via M-Pesa STK push (real API: reserve -> STK -> poll -> on-chain credit). */
export default function WalletBuy() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [config, setConfig] = useState<BuyConfig | null>(null);
  const [amount, setAmount] = useState('100');
  const [fiat, setFiat] = useState(String(Math.round(100 * FALLBACK_KES_PER_MLCNS)));
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const buyRateKes = config?.rates?.buyPriceKes || FALLBACK_KES_PER_MLCNS;
  const directBuyLocked = config?.directBuy?.locked ?? false;

  useEffect(() => {
    buyApi.getConfig().then((r) => {
      if (r.ok && r.data) {
        setConfig(r.data);
        const n = parseFloat(amount);
        if (Number.isFinite(n)) setFiat(String(Math.round(n * (r.data.rates?.buyPriceKes || FALLBACK_KES_PER_MLCNS))));
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAmountChange = (v: string) => {
    setAmount(v);
    const n = parseFloat(v);
    if (Number.isFinite(n)) setFiat(String(Math.round(n * buyRateKes)));
  };

  const pollStatus = (paymentId: string, onConfirmed: () => void, onCredited: () => void) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const res = await buyApi.getStatus(paymentId);
      if (!res.ok || !res.data) return;
      setQuote(res.data);
      if (res.data.status === 'confirmed') {
        onConfirmed();
      } else if (res.data.status === 'credited') {
        onCredited();
      } else if (res.data.status === 'failed') {
        clearInterval(pollRef.current);
        toast(res.data.reason || 'Payment failed', false);
        setStep('form');
        setBusy(false);
      }
    }, 3000);
  };

  const submit = async () => {
    if (!address) {
      toast('Connect a wallet first', false);
      return;
    }
    const mlcns = parseFloat(amount);
    if (!mlcns || mlcns <= 0) {
      toast('Enter a valid MLCNS amount', false);
      return;
    }
    if (!/^254\d{9}$/.test(phone)) {
      toast('Enter phone as 254XXXXXXXXX', false);
      return;
    }

    setBusy(true);

    const reserveRes = await buyApi.reserve({
      amount: mlcns,
      fiat,
      currency: 'KES',
      walletAddress: address,
      phone,
    });

    if (!reserveRes.ok || !reserveRes.data) {
      toast(reserveRes.error || 'Failed to reserve quote', false);
      setBusy(false);
      return;
    }

    setQuote(reserveRes.data.quote);

    if (!config?.configured.stkPush) {
      toast('Quote reserved, but M-Pesa STK push is not configured in this environment.', false);
      setBusy(false);
      return;
    }

    const quoteId = reserveRes.data.quoteId;
    const mpesaRes = await buyApi.initiateMpesa({ quoteId, phone, amount: mlcns, description: `Buy ${mlcns} MLCNS` });

    if (!mpesaRes.ok || !mpesaRes.data) {
      toast(mpesaRes.error || 'Failed to start M-Pesa payment', false);
      setBusy(false);
      return;
    }

    setStep('awaiting_payment');
    toast('Check your phone for the M-Pesa prompt');

    pollStatus(
      mpesaRes.data.paymentId,
      async () => {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('crediting');
        const creditRes = await buyApi.credit({ quoteId });
        if (!creditRes.ok) {
          toast(creditRes.error || 'On-chain credit failed', false);
          setStep('form');
          setBusy(false);
          return;
        }
        pollStatus(
          mpesaRes.data!.paymentId,
          () => {},
          () => {
            if (pollRef.current) clearInterval(pollRef.current);
            setStep('done');
            setBusy(false);
            toast('Mallcoin credited to your wallet!');
          }
        );
      },
      () => {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('done');
        setBusy(false);
      }
    );
  };

  if (!address) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(243, 186, 47, 0.1)', color: 'var(--gold)' }}>
            <CreditCard size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Buy Mallcoin</div>
            <div className="wo-hero-sub">Pay with M-Pesa — Mallcoin credited on-chain</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(243, 186, 47, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Coins size={24} style={{ color: 'var(--gold)', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No wallet connected</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Connect a wallet to buy Mallcoin with M-Pesa.</div>
          </div>
        </div>
      </div>
    );
  }

  if (directBuyLocked) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)' }}>
            <Lock size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Buy Mallcoin</div>
            <div className="wo-hero-sub">Direct purchases are currently closed</div>
          </div>
        </div>
        <div className="wo-card wo-card--warning" style={{ maxWidth: 520 }}>
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Lock size={24} style={{ color: 'var(--red)' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Direct purchases are closed</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
              The MLCN/KES liquidity pool has reached its threshold. You can still get MLCNS by converting your Mallpoints or receiving a transfer from another wallet.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(243, 186, 47, 0.1)', color: 'var(--gold)' }}>
          <CreditCard size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title">Buy Mallcoin</div>
          <div className="wo-hero-sub">Pay with M-Pesa — Mallcoin credited to your wallet on-chain</div>
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

      {/* ── STK warning ── */}
      {config && !config.configured.stkPush && (
        <div className="wo-card wo-info--warning" style={{ maxWidth: 520, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12.5, color: 'var(--txt-2)', lineHeight: 1.5 }}>
              M-Pesa STK push isn't configured in this environment (missing Safaricom credentials). You can reserve a quote, but payment can't be completed here.
            </div>
          </div>
        </div>
      )}

      {/* ── main card ── */}
      <div className="wo-card" style={{ maxWidth: 520 }}>
        {step === 'form' && (
          <>
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={13} style={{ color: 'var(--gold)' }} /> Amount (MLCNS)
              </label>
              <input className="input" type="number" min="1" value={amount} onChange={(e) => onAmountChange(e.target.value)} disabled={busy} />
            </div>

            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Banknote size={13} style={{ color: 'var(--green-2)' }} /> You pay (KES)
              </label>
              <input className="input" type="number" min="1" value={fiat} onChange={(e) => setFiat(e.target.value)} disabled={busy} />
              <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>
                Rate ≈ {buyRateKes.toFixed(2)} KES / MLCNS
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
            </div>

            {/* ── preview ── */}
            <div className="wo-summary" style={{ marginBottom: 16 }}>
              <div className="wo-summary-row">
                <span className="wo-summary-label">You receive</span>
                <span className="wo-summary-value" style={{ color: 'var(--gold)' }}>{amount || '0'} MLCNS</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">You pay</span>
                <span className="wo-summary-value">{fiat || '0'} KES</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">Phone</span>
                <span className="wo-summary-value mono">{phone || '—'}</span>
              </div>
              <div className="wo-summary-row total">
                <span className="wo-summary-label">Rate</span>
                <span className="wo-summary-value">{buyRateKes.toFixed(2)} KES / MLCNS</span>
              </div>
            </div>

            <button className="btn btn-primary btn-block" onClick={submit} disabled={busy} style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {busy ? <><span className="wo-spinner" /> Processing…</> : <><CreditCard size={14} /> Buy Mallcoin <ArrowRight size={14} /></>}
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
              Complete the M-Pesa prompt sent to <b className="mono">{phone}</b> for <b>{fiat} KES</b>.
            </div>
            {quote && (
              <div className="wo-hash" style={{ marginTop: 12 }}>Quote {quote.quoteId}</div>
            )}
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
            <div className="wo-status-text">Crediting Mallcoin to your wallet on-chain…</div>
          </div>
        )}

        {step === 'done' && quote && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: quote.status === 'credited' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(243, 186, 47, 0.1)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <CheckCircle2 size={24} style={{ color: quote.status === 'credited' ? 'var(--green)' : 'var(--gold)' }} />
            </div>
            <div className="wo-status-title" style={{ color: quote.status === 'credited' ? 'var(--green)' : undefined }}>
              {quote.status === 'credited' ? 'Mallcoin credited' : `Status: ${quote.status}`}
            </div>
            {quote.txHash && <div className="wo-hash" style={{ marginTop: 8 }}>{quote.txHash}</div>}
            {quote.reason && quote.status !== 'credited' && (
              <div className="wo-status-text" style={{ marginTop: 8 }}>{quote.reason}</div>
            )}
            <button
              className="btn btn-primary"
              onClick={() => { setStep('form'); setQuote(null); }}
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
