import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Swap — pair select + rate preview (0.3% fee) + slippage + approve → swap → confirm. */
export default function WalletSwap() {
  useStoreVersion();
  const st = store.state;
  const [from, setFrom] = useState<'MALL' | 'USD_M' | 'MLPTS'>('MALL');
  const [to, setTo] = useState<'MALL' | 'USD_M' | 'MLPTS'>('USD_M');
  const [amt, setAmt] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const RATE: Record<string, number> = { 'MALL:USD_M': 0.42, 'USD_M:MALL': 2.38, 'MALL:MLPTS': 105, 'MLPTS:MALL': 0.0095, 'USD_M:MLPTS': 250, 'MLPTS:USD_M': 0.004 };
  const rate = RATE[`${from}:${to}`] || 1;
  const out = parseFloat(amt || '0') * rate;
  const fee = out * 0.003;
  const bal = st.balances[from];

  const doSwap = () => {
    if (!parseFloat(amt) || parseFloat(amt) > bal) { toast('Invalid amount or insufficient balance', false); return; }
    setBusy(true);
    setTimeout(() => {
      store.applyTx({ type: 'swap', amount: parseFloat(amt), asset: from, kind: 'debit', note: `Swap ${from} → ${to}`, notifTitle: `Swapped ${amt} ${from} → ${to}`, notifKind: 'tx', activityText: `Swapped ${amt} ${from} to ${to}` });
      store.credit(to, out, 'swap', `Swap receive ${to}`);
      setBusy(false);
      setDone(true);
      toast(`Swapped ${amt} ${from} → ${out.toFixed(4)} ${to}`);
    }, 900);
  };

  const flip = () => { setFrom(to); setTo(from); };

  return (
    <div>
      <div className="view-head"><h1>Swap</h1><span className="sub">0.3% fee · slippage {slippage}%</span></div>
      <div className="card" style={{ maxWidth: 520 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 40 }}>🔄</div>
            <h2 style={{ margin: '8px 0' }}>Swap complete</h2>
            <div className="muted">You received <b className="gold">{out.toFixed(4)} {to}</b></div>
            <div className="modal-actions" style={{ justifyContent: 'center' }}><button className="btn btn-primary" onClick={() => { setDone(false); setAmt(''); }}>New swap</button></div>
          </div>
        ) : (
          <>
            <div className="field">
              <label>You pay — balance {bal.toFixed(2)} {from}</label>
              <div className="row">
                <input className="input" type="number" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ flex: 1 }} />
                <select className="input" style={{ width: 130 }} value={from} onChange={(e) => setFrom(e.target.value as never)}>
                  <option>MALL</option><option>USD_M</option><option>MLPTS</option>
                </select>
              </div>
            </div>
            <div style={{ textAlign: 'center', margin: '6px 0' }}>
              <button className="btn btn-ghost btn-sm" onClick={flip} title="Flip pair">⇅</button>
            </div>
            <div className="field">
              <label>You receive</label>
              <div className="row">
                <input className="input" readOnly value={out ? out.toFixed(4) : '0'} style={{ flex: 1 }} />
                <select className="input" style={{ width: 130 }} value={to} onChange={(e) => setTo(e.target.value as never)}>
                  <option>USD_M</option><option>MALL</option><option>MLPTS</option>
                </select>
              </div>
              <div className="hint">Rate: 1 {from} = {rate} {to} · fee ≈ {fee.toFixed(4)} {to}</div>
            </div>
            <div className="field">
              <label>Slippage tolerance: {slippage}%</label>
              <input type="range" min={0.1} max={3} step={0.1} value={slippage} onChange={(e) => setSlippage(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)' }} />
            </div>
            <button className="btn btn-primary btn-block" onClick={doSwap} disabled={busy}>{busy && <span className="spin" />} Approve & swap</button>
          </>
        )}
      </div>
    </div>
  );
}
