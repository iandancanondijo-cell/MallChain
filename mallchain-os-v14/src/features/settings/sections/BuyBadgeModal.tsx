import { useEffect, useRef, useState } from 'react';
import { Modal, toast } from '../../../components/ui';
import { badgeApi, type BadgeQuote } from '../../../services/badgeApi';

type Step = 'form' | 'awaiting_payment' | 'stalled' | 'awaiting_admin' | 'done' | 'rejected';

/**
 * Buying the Mallchain badge with M-Pesa. Unchanged behaviour, moved out of the
 * page file: STK push is silent when a prompt is never answered, so the wait has
 * to end on its own (~2 minutes) and say what it concluded instead of sitting on
 * "check your phone" forever. Admin review after payment has no buyer-side
 * deadline, so that poll keeps running.
 */
export function BuyBadgeModal({
  walletAddress,
  priceKes,
  stkConfigured,
  onClose,
  onIssued,
}: {
  walletAddress: string;
  priceKes: number;
  stkConfigured: boolean;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [quote, setQuote] = useState<BadgeQuote | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const pollStatus = (quoteId: string, timeoutTicks: number, onTimeout: () => void) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      const res = await badgeApi.getStatus(quoteId);
      if (res.ok && res.data) {
        setQuote(res.data);
        if (res.data.status === 'awaiting_admin') {
          setStep('awaiting_admin');
          clearInterval(pollRef.current);
          pollStatus(quoteId, Infinity, () => {});
          return;
        } else if (res.data.status === 'issued') {
          clearInterval(pollRef.current);
          setStep('done');
          setBusy(false);
          onIssued();
          return;
        } else if (res.data.status === 'rejected') {
          clearInterval(pollRef.current);
          setRejectReason(res.data.reason || 'Purchase was rejected by admin');
          setStep('rejected');
          setBusy(false);
          return;
        } else if (res.data.status === 'failed') {
          clearInterval(pollRef.current);
          setRejectReason(res.data.reason || 'Payment failed');
          setStep('rejected');
          setBusy(false);
          return;
        }
      }
      if (ticks >= timeoutTicks) {
        clearInterval(pollRef.current);
        onTimeout();
      }
    }, 4000);
  };

  const submit = async () => {
    if (!/^254\d{9}$/.test(phone)) {
      toast('Enter phone as 254XXXXXXXXX', false);
      return;
    }

    setBusy(true);
    const reserveRes = await badgeApi.reserve({ walletAddress, phone });
    if (!reserveRes.ok || !reserveRes.data) {
      toast(reserveRes.error || 'Failed to reserve quote', false);
      setBusy(false);
      return;
    }

    const { quoteId } = reserveRes.data;

    // The mount-time config fetch may have failed while the backend was down,
    // so re-check once before declaring M-Pesa unavailable.
    let stkOk = stkConfigured;
    if (!stkOk) {
      const cfgRes = await badgeApi.getConfig();
      if (cfgRes.ok && cfgRes.data?.providerMode === 'live') stkOk = true;
    }
    if (!stkOk) {
      toast('Quote reserved, but M-Pesa STK push is not configured in this environment.', false);
      setBusy(false);
      return;
    }

    const mpesaRes = await badgeApi.initiateMpesa({ quoteId, phone });
    if (!mpesaRes.ok || !mpesaRes.data) {
      toast(mpesaRes.error || 'Failed to start M-Pesa payment', false);
      setBusy(false);
      return;
    }

    setStep('awaiting_payment');
    toast('Check your phone for the M-Pesa prompt');
    pollStatus(quoteId, 30, () => {
      setStep('stalled');
      setBusy(false);
    });
  };

  return (
    <Modal title="Buy Mallchain badge" onClose={onClose}>
      {step === 'form' && (
        <>
          <p className="tiny" style={{ marginBottom: 12 }}>
            KSh {priceKes} via M-Pesa — after payment an admin reviews and issues your badge on-chain to
            your wallet, unlocking the monthly Mallpoints → Mallcoin conversion window.
          </p>
          <div className="field">
            <label htmlFor="badge-phone">M-Pesa phone number</label>
            <input
              id="badge-phone"
              className="input"
              type="tel"
              placeholder="254712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy && <span className="spin" />} Pay KSh {priceKes}
          </button>
        </>
      )}

      {step === 'awaiting_payment' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40 }}>📲</div>
          <h2 style={{ margin: '8px 0' }}>Check your phone</h2>
          <div className="muted">Complete the M-Pesa prompt sent to <b>{phone}</b> for {priceKes} KES.</div>
          {quote && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>Quote {quote.quoteId}</div>}
          <div className="muted" style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
            This wait ends after ~2 minutes if the prompt is left unanswered.
          </div>
          <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn" onClick={() => { clearInterval(pollRef.current); setBusy(false); setStep('form'); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'stalled' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>⏱</div>
          <h2 style={{ margin: '8px 0' }}>No payment received</h2>
          <div className="muted">
            We did not get a payment from <b>{phone}</b>. The prompt may have expired or been missed — check the handset and try again.
          </div>
          {quote && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>Quote {quote.quoteId}</div>}
          <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => setStep('form')}>Try again</button>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      )}

      {step === 'awaiting_admin' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div className="spin" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ margin: '8px 0' }}>Payment confirmed</h2>
          <div className="muted">Your payment has been received. An admin will review and issue your badge shortly.</div>
          {quote && <div className="mono" style={{ fontSize: 11, marginTop: 12, opacity: 0.6 }}>Quote {quote.quoteId}</div>}
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', opacity: 0.7 }}>
            This window updates automatically…
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h2 style={{ margin: '8px 0' }}>Badge issued!</h2>
          <div className="muted">Your badge has been issued on-chain. It now appears next to your username.</div>
          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}

      {step === 'rejected' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>✕</div>
          <h2 style={{ margin: '8px 0' }}>Badge not issued</h2>
          <div className="muted">{rejectReason}</div>
          <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => { setStep('form'); setRejectReason(''); }}>Try again</button>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
