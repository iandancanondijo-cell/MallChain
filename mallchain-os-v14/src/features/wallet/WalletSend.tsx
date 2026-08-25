import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { sendMallcoinTransfer, MallcoinTxError } from '../../services/mallcoinTx';
import { isValidMallAddress } from '../../services/wallet';
import { faucetApi } from '../../services/faucetApi';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { useWizard } from '../../hooks/useWizard';

const SEND_STEPS = ['recipient', 'review', 'authorize', 'broadcast'] as const;
type SendStep = typeof SEND_STEPS[number];

/** Recipient/amount/fee draft — non-sensitive, worth resuming even across a full browser restart. */
type SendData = {
  addr: string;
  amount: string;
  fee: number;
};
const INITIAL_SEND_DATA: SendData = { addr: '', amount: '', fee: 0.05 };

/** Send MALL — full flow: address validation → amount + fee → review → sign → broadcast. */
export default function WalletSend() {
  useStoreVersion();
  const st = store.state;

  // Draft (recipient/amount/fee) persists via the durable tier — losing a
  // partially-filled send to an accidental reload is bad UX and there's no
  // secret in it. The mnemonic-word authorize answer below is never put in
  // this wizard's data — it's read straight from the DOM at submit time and
  // must never be persisted.
  const wizard = useWizard<SendStep, SendData>({
    key: 'walletSend',
    tier: 'durable',
    steps: SEND_STEPS,
    initialData: INITIAL_SEND_DATA,
  });
  const step = wizard.step;
  const addr = wizard.data.addr;
  const setAddr = (a: string) => wizard.setData({ addr: a });
  const amount = wizard.data.amount;
  const setAmount = (a: string) => wizard.setData({ amount: a });
  const fee = wizard.data.fee;
  const setFee = (f: number) => wizard.setData({ fee: f });

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');

  const [gasError, setGasError] = useState(false);

  const validAddr = isValidMallAddress(addr);
  const max = st.balances.MALL;

  const review = () => {
    setErr('');
    const amt = parseFloat(amount);
    if (!validAddr) { setErr('Invalid address — not a valid Mallchain (mall1…) address.'); return; }
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt + fee > max) { setErr(`Insufficient balance — you have ${max.toFixed(2)} MALL.`); return; }
    wizard.next();
  };

  const authorize = async () => {
    if (!st.wallet.pinEncryptedMnemonic || !st.wallet.address) {
      toast('No wallet loaded — import or create a wallet first', false);
      return;
    }

    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;

    setBusy(true);
    setErr('');
    setGasError(false);
    try {
      const result = await sendMallcoinTransfer({
        mnemonic,
        fromAddress: st.wallet.address,
        toAddress: addr,
        amountMlcns: parseFloat(amount),
      });
      store.applyTx({
        type: 'send', amount: parseFloat(amount), asset: 'MALL', kind: 'debit', to: addr, fee,
        note: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
        notifTitle: `Sent ${amount} MALL`, notifKind: 'tx',
        activityText: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
      });
      setTxHash(result.txHash);
      setBusy(false);
      toast('Transaction broadcast — pending confirmation');
      wizard.next();
    } catch (e) {
      setBusy(false);
      if (e instanceof MallcoinTxError && e.code === 'NO_ON_CHAIN_HISTORY') {
        setGasError(true);
        return;
      }
      const message = e instanceof MallcoinTxError || e instanceof Error ? e.message : 'Failed to send';
      setErr(message);
      toast(message, false);
    }
  };

  const [gettingGas, setGettingGas] = useState(false);
  const getGas = async () => {
    if (!st.wallet.address) return;
    setGettingGas(true);
    const res = await faucetApi.fundGas(st.wallet.address);
    setGettingGas(false);
    if (res.ok) {
      toast('Network fee tokens received — you can retry now');
      setGasError(false);
    } else {
      toast(res.error || 'Could not get network fee tokens right now', false);
    }
  };

  if (step === 'broadcast') {
    const amt = parseFloat(amount);
    return (
      <div className="view-head">
        <h1>Transaction broadcast</h1>
        <div className="card" style={{ maxWidth: 540, width: '100%', marginTop: 10 }}>
          <div style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 42 }}>✅</div>
            <h2 style={{ margin: '8px 0' }}>Sent {amt} MALL</h2>
            <div className="muted mono" style={{ fontSize: 12 }}>tx {txHash}</div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => { wizard.reset(); navigate('/explorer'); }}>View in Explorer</button>
              <button className="btn btn-primary" onClick={() => { wizard.reset(); navigate('/wallet'); }}>Back to Wallet</button>
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
        {step === 'recipient' && (
          <>
            <div className="field">
              <label>Recipient address</label>
              <input className={'input mono' + (addr && !validAddr ? ' err' : '')} placeholder="mall1… (bech32 address)" value={addr} onChange={(e) => setAddr(e.target.value)} />
              {addr && !validAddr && <div className="hint" style={{ color: 'var(--red-2)' }}>⚠ Invalid address format — expected mall1… bech32 address.</div>}
              {validAddr && <div className="hint" style={{ color: 'var(--green-2)' }}>✓ Valid address</div>}
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
        {step === 'review' && (
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
              <button className="btn btn-ghost" onClick={() => wizard.back()}>← Back</button>
              <button className="btn btn-primary" onClick={() => wizard.next()}>Continue to authorize →</button>
            </div>
          </>
        )}
        {step === 'authorize' && (
          <>
            <div className="sec-title"><h2>Authorize transaction</h2><span className="sub">sign with your wallet PIN</span></div>
            <div className="card" style={{ background: 'var(--bg-2)', textAlign: 'center', padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>You'll be asked for your PIN to unlock your recovery phrase and sign this transaction.</div>
            </div>
            {err && <div style={{ color: 'var(--red-2)', fontSize: 12.5, marginTop: 8 }}>⚠ {err}</div>}
            {gasError && (
              <div className="card" style={{ background: 'var(--bg-2)', borderColor: 'var(--gold)', marginTop: 10, padding: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--txt-2)' }}>
                  Your wallet needs a small amount of network fee tokens before it can send — this is
                  separate from your MALL balance and only needed once.
                </div>
                <button className="btn btn-primary btn-sm mt" disabled={gettingGas} onClick={getGas}>
                  {gettingGas && <span className="spin" />} Get network fee tokens
                </button>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => wizard.back()}>← Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={authorize}>
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
