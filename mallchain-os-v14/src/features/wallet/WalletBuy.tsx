import { useEffect, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { buyApi, type BuyConfig, type BuyQuote } from '../../services/buyApi';

type Step = 'form' | 'awaiting_payment' | 'crediting' | 'done';

const KES_PER_MLCNS = 0.62; // illustrative default rate; user can adjust the KES amount before reserving

/** Buy Mallcoin with real money via M-Pesa STK push (real API: reserve -> STK -> poll -> on-chain credit). */
export default function WalletBuy() {
  useStoreVersion();
  const st = store.state;
  const address = st.wallet.address;

  const [config, setConfig] = useState<BuyConfig | null>(null);
  const [amount, setAmount] = useState('100');
  const [fiat, setFiat] = useState(String(Math.round(100 * KES_PER_MLCNS)));
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [quote, setQuote] = useState<BuyQuote | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    buyApi.getConfig().then((r) => {
      if (r.ok && r.data) setConfig(r.data);
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const onAmountChange = (v: string) => {
    setAmount(v);
    const n = parseFloat(v);
    if (Number.isFinite(n)) setFiat(String(Math.round(n * KES_PER_MLCNS)));
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
      // No live Safaricom credentials in this environment — the quote is
      // reserved, but the STK push (and therefore payment confirmation)
      // can't actually happen. Surface that clearly instead of hanging.
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
        // Payment confirmed by Safaricom's callback — trigger the on-chain credit.
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
        <div className="view-head"><h1>Buy Mallcoin</h1></div>
        <div className="card">
          <div className="empty" style={{ color: 'var(--txt-3)', padding: 24, textAlign: 'center' }}>
            Connect a wallet to buy Mallcoin.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head">
        <h1>Buy Mallcoin</h1>
        <span className="sub">Pay with M-Pesa · Mallcoin is credited to your wallet on-chain</span>
      </div>

      {config && !config.configured.stkPush && (
        <div className="card" style={{ backgroundColor: 'var(--bg-2)', borderLeft: '4px solid var(--gold)', padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13 }}>
            ⚠ M-Pesa STK push isn't configured in this environment (missing Safaricom credentials).
            You can still reserve a quote, but payment can't be completed here.
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        {step === 'form' && (
          <>
            <div className="field">
              <label>Amount (MLCNS)</label>
              <input className="input" type="number" min="1" value={amount} onChange={(e) => onAmountChange(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>You pay (KES)</label>
              <input className="input" type="number" min="1" value={fiat} onChange={(e) => setFiat(e.target.value)} disabled={busy} />
              <div className="hint">Illustrative rate ≈ {KES_PER_MLCNS} KES / MLCNS — adjust if needed.</div>
            </div>
            <div className="field">
              <label>M-Pesa phone number</label>
              <input
                className="input"
                type="tel"
                placeholder="254712345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
            </div>
            <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
              {busy && <span className="spin" />} Buy Mallcoin
            </button>
          </>
        )}

        {step === 'awaiting_payment' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 40 }}>📲</div>
            <h2 style={{ margin: '8px 0' }}>Check your phone</h2>
            <div className="muted">
              Complete the M-Pesa prompt sent to <b>{phone}</b> for {fiat} KES.
            </div>
            {quote && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>Quote {quote.quoteId}</div>}
          </div>
        )}

        {step === 'crediting' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spin" style={{ margin: '0 auto 12px' }} />
            <h2 style={{ margin: '8px 0' }}>Payment confirmed</h2>
            <div className="muted">Crediting Mallcoin to your wallet on-chain…</div>
          </div>
        )}

        {step === 'done' && quote && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 40 }}>✓</div>
            <h2 style={{ margin: '8px 0' }}>
              {quote.status === 'credited' ? 'Mallcoin credited' : `Status: ${quote.status}`}
            </h2>
            {quote.txHash && <div className="mono" style={{ fontSize: 11, opacity: 0.6 }}>{quote.txHash}</div>}
            {quote.reason && quote.status !== 'credited' && (
              <div className="muted" style={{ marginTop: 8 }}>{quote.reason}</div>
            )}
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setStep('form');
                  setQuote(null);
                }}
              >
                New purchase
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
