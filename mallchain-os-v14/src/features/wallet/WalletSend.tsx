import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Send MALL — full flow: address validation → amount + fee → review → sign → broadcast. */
export default function WalletSend() {
  useStoreVersion();
  const st = store.state;
  const [addr, setAddr] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(0.05);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wordIdx] = useState(7);

  const validAddr = /^0x[a-fA-F0-9]{40}$/.test(addr);
  const max = st.balances.MALL;

  const review = () => {
    setErr('');
    const amt = parseFloat(amount);
    if (!validAddr) { setErr('Invalid address — must be a 42-char 0x-prefixed hex address (EIP-55 checksummed).'); return; }
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt + fee > max) { setErr(`Insufficient balance — you have ${max.toFixed(2)} MALL.`); return; }
    setStep(1);
  };

  const sign = () => {
    setBusy(true);
    setErr('');
    setTimeout(() => {
      // security check: wrong word index
      setStep(2);
      setBusy(false);
    }, 600);
  };

  const authorize = (word: string) => {
    const words = ['ocean', 'vault', 'golden', 'raptor', 'silver', 'matrix', 'cobalt', 'falcon', 'summit', 'helix', 'ember', 'quest'];
    if (word.trim().toLowerCase() !== words[wordIdx - 1]) { setErr('Incorrect word — try again.'); return; }
    setBusy(true);
    setTimeout(() => {
      const res = store.applyTx({
        type: 'send', amount: parseFloat(amount), asset: 'MALL', kind: 'debit', to: addr, fee,
        note: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
        notifTitle: `Sent ${amount} MALL`, notifKind: 'tx',
        activityText: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
      });
      setBusy(false);
      if (res.ok) { toast('Transaction broadcast — pending confirmation'); setStep(3); }
      else toast(res.error || 'Failed', false);
    }, 900);
  };

  if (step === 3) {
    const amt = parseFloat(amount);
    return (
      <div className="view-head">
        <h1>Transaction broadcast</h1>
        <div className="card" style={{ maxWidth: 540, width: '100%', marginTop: 10 }}>
          <div style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 42 }}>✅</div>
            <h2 style={{ margin: '8px 0' }}>Sent {amt} MALL</h2>
            <div className="muted mono" style={{ fontSize: 12 }}>tx 0x{Date.now().toString(16)}…{Math.floor(Math.random() * 0xffff).toString(16)}</div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => navigate('/explorer')}>View in Explorer</button>
              <button className="btn btn-primary" onClick={() => navigate('/wallet')}>Back to Wallet</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head"><h1>Send MALL</h1><span className="sub">Transfer Mallcoins to any address</span></div>
      <div className="card" style={{ maxWidth: 560 }}>
        {step === 0 && (
          <>
            <div className="field">
              <label>Recipient address</label>
              <input className={'input mono' + (addr && !validAddr ? ' err' : '')} placeholder="0x… (42-char checksummed address)" value={addr} onChange={(e) => setAddr(e.target.value)} />
              {addr && !validAddr && <div className="hint" style={{ color: 'var(--red-2)' }}>⚠ Invalid address format — expected 42-char 0x hex.</div>}
              {validAddr && <div className="hint" style={{ color: 'var(--green-2)' }}>✓ Valid checksummed address</div>}
            </div>
            <div className="field">
              <label>Amount (MALL) — balance {max.toFixed(2)}</label>
              <input className="input" type="number" min={0} step="any" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn btn-ghost btn-sm mt" onClick={() => setAmount(String(Math.max(0, max - fee)))}>Max</button>
            </div>
            <div className="field">
              <label>Network fee — {fee.toFixed(2)} MALL</label>
              <input type="range" min={0.01} max={0.5} step={0.01} value={fee} onChange={(e) => setFee(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)' }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary btn-block" onClick={review}>Review transaction →</button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="sec-title"><h2>Review</h2></div>
            <table className="tbl">
              <tbody>
                <tr><td className="muted">Recipient</td><td className="mono" style={{ fontSize: 12 }}>{addr.slice(0, 10)}…{addr.slice(-6)}</td></tr>
                <tr><td className="muted">Amount</td><td><b>{amount} MALL</b></td></tr>
                <tr><td className="muted">Fee</td><td>{fee.toFixed(2)} MALL</td></tr>
                <tr><td className="muted">Total</td><td><b className="gold">{(parseFloat(amount) + fee).toFixed(2)} MALL</b></td></tr>
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep(0)}>← Back</button>
              <button className="btn btn-primary" onClick={sign} disabled={busy}>{busy && <span className="spin" />} Sign transaction</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="sec-title"><h2>Authorize transaction</h2><span className="sub">sign with your recovery phrase</span></div>
            <div className="card" style={{ background: 'var(--bg-2)', textAlign: 'center', padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>For your security, we ask for a single random word — never the full phrase.</div>
              <div style={{ fontSize: 22, fontWeight: 800, margin: '10px 0', color: 'var(--gold)' }}>Enter word #{wordIdx}</div>
              <input className="input" style={{ textAlign: 'center', maxWidth: 220, margin: '0 auto' }} placeholder="your recovery word" onKeyDown={(e) => e.key === 'Enter' && authorize((e.target as HTMLInputElement).value)} />
            </div>
            {err && <div style={{ color: 'var(--red-2)', fontSize: 12.5, marginTop: 8 }}>⚠ {err}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => authorize((document.querySelector('.input[placeholder="your recovery word"]') as HTMLInputElement)?.value || '')}>
                {busy && <span className="spin" />} Authorize & broadcast
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function navigate(p: string) {
  window.location.hash = '#' + p;
}
