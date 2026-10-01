import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, Phone, Coins, CheckCircle2, Loader2, Smartphone, ShoppingBag, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { useStoreVersion, toast } from '../components/ui';

type Step = 'form' | 'awaiting_payment' | 'crediting' | 'done';

/**
 * Mallpoints price in KES — a fixed product constant (backend default:
 * MALLPOINT_PRICE_KES=2, see backend/src/routes/mallpointsPurchase.js).
 * The purchase lifecycle mirrors WalletBuy's MLCNS flow: reserve a quote →
 * M-Pesa STK push → poll status → credit the MLPTS balance.
 */
const MALLPOINT_PRICE_KES = 2;
const MIN_MLPTS = 5; // backend enforces amount_kes >= 10

const STEP_META: { label: string; icon: typeof CreditCard }[] = [
  { label: 'Details', icon: ShoppingBag },
  { label: 'Pay', icon: Smartphone },
  { label: 'Credit', icon: Loader2 },
  { label: 'Done', icon: CheckCircle2 },
];

const STEP_INDEX: Record<Step, number> = { form: 0, awaiting_payment: 1, crediting: 2, done: 3 };

/** Purchase Mallpoints (MLPTS) with real money via M-Pesa STK push. */
export default function MallpointsPurchase() {
  useStoreVersion();

  const [amount, setAmount] = useState(50);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [credited, setCredited] = useState(0);
  const [newBalance, setNewBalance] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const pollTicksRef = useRef(0);

  const loadBalance = useCallback(async () => {
    const res = await api.get<{ ok: boolean; mlpts_balance: number; walletAddress?: string }>('/api/creator-space/balance');
    if (res.ok && res.data) {
      setBalance(res.data.mlpts_balance || 0);
      setWalletAddress(res.data.walletAddress || '');
    }
  }, []);

  useEffect(() => {
    loadBalance();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadBalance]);

  const totalKes = Math.max(0, amount) * MALLPOINT_PRICE_KES;

  /** Poll the quote every 3s until Safaricom's callback confirms or fails it. */
  const pollStatus = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollTicksRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollTicksRef.current += 1;
      if (pollTicksRef.current > 200) { // quote expires server-side after 10 min
        if (pollRef.current) clearInterval(pollRef.current);
        toast('Payment timed out — the quote expired', false);
        setStep('form');
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
          setStep('form');
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
        setStep('form');
        setBusy(false);
      }
    }, 3000);
  };

  const submit = async () => {
    if (!walletAddress) {
      toast('No wallet connected — reload the page or log in again', false);
      return;
    }
    if (!Number.isFinite(amount) || amount < MIN_MLPTS) {
      toast(`Minimum purchase is ${MIN_MLPTS} MLPTS (KSH ${MIN_MLPTS * MALLPOINT_PRICE_KES})`, false);
      return;
    }
    const normalized = phone.replace(/\s/g, '').replace(/^0/, '254');
    if (!/^254\d{9}$/.test(normalized)) {
      toast('Enter a valid M-Pesa phone — 254 followed by 9 digits', false);
      return;
    }

    setBusy(true);

    const reserveRes = await api.post<{ ok: boolean; quoteId: string; mallpointsAmount: number }>('/api/mallpoints/purchase/reserve', {
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
        <div className="wo-hero-icon" style={{ background: 'rgba(243, 186, 47, 0.1)', color: 'var(--gold)' }}>
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
      <div className="wo-card" style={{ maxWidth: 520 }}>
        {step === 'form' && (
          <>
            <div className="field mb">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={13} style={{ color: 'var(--gold)' }} /> Amount (MLPTS)
              </label>
              <input
                className="input"
                type="number"
                min={MIN_MLPTS}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                disabled={busy}
              />
              <div className="hint" style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 4 }}>
                Your balance: {balance === null ? '…' : balance} MLPTS · minimum {MIN_MLPTS} MLPTS (KSH {MIN_MLPTS * MALLPOINT_PRICE_KES})
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
                <span className="wo-summary-value" style={{ color: 'var(--gold)' }}>{Math.max(0, amount) || 0} MLPTS</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">You pay</span>
                <span className="wo-summary-value">{totalKes.toLocaleString()} KES</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">Phone</span>
                <span className="wo-summary-value mono">{phone || '—'}</span>
              </div>
              <div className="wo-summary-row total">
                <span className="wo-summary-label">Rate</span>
                <span className="wo-summary-value">{MALLPOINT_PRICE_KES} KES / MLPTS</span>
              </div>
            </div>

            {walletAddress && (
              <div className="tiny" style={{ marginBottom: 10, color: 'var(--txt-3)' }}>
                Credited to <span className="mono">{walletAddress}</span>
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={busy || !walletAddress}
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
              Complete the M-Pesa prompt sent to <b className="mono">{phone}</b> for <b>{totalKes.toLocaleString()} KES</b>.
            </div>
            {quoteId && <div className="wo-hash" style={{ marginTop: 12 }}>Quote {quoteId}</div>}
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
              onClick={() => { setStep('form'); setQuoteId(null); }}
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
