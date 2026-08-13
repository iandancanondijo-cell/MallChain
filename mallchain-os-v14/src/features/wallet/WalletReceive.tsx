import { useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';

/** Receive — generate fresh address + QR + copy + "awaiting payment" poll. */
export default function WalletReceive() {
  useStoreVersion();
  const st = store.state;
  const addr = st.wallet.address || 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
  const [awaiting, setAwaiting] = useState(false);
  const [paid, setPaid] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = addr;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Address copied to clipboard');
  };

  const startPoll = () => {
    setAwaiting(true);
    setPaid(false);
    // simulated poll — in demo mode resolves after ~4s
    setTimeout(() => {
      if (!store.state.settings.demoMode) {
        toast('Waiting for incoming payment…', false);
        return;
      }
      store.applyTx({
        type: 'receive', amount: 12.5, asset: 'MALL', kind: 'credit',
        note: 'Incoming payment detected on ' + addr.slice(0, 10) + '…',
        notifTitle: 'Payment received — +12.5 MALL', notifKind: 'tx',
        activityText: 'Received 12.5 MALL',
      });
      setPaid(true);
      setAwaiting(false);
      toast('Payment received: +12.5 MALL');
    }, 4200);
  };

  return (
    <div>
      <div className="view-head"><h1>Receive MALL</h1><span className="sub">Share your address to receive Mallcoins</span></div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="sec-title"><h2>Your address</h2><span className="chip">fresh per request</span></div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* QR mock (data URI SVG) */}
          <svg width={132} height={132} viewBox="0 0 29 29" style={{ background: '#fff', padding: 6, borderRadius: 10, flex: 'none' }}>
            {Array.from({ length: 29 * 29 }).map((_, i) => {
              const x = i % 29, y = Math.floor(i / 29);
              const inFinder = (x < 7 && y < 7) || (x > 21 && y < 7) || (x < 7 && y > 21);
              const dark = inFinder ? !((x === 0 || x === 6 || y === 0 || y === 6) && !(x === 0 || x === 6 || y === 0 || y === 6)) : ((x * 7 + y * 13 + x * y) % 9 < 4);
              return dark ? <rect key={i} x={x} y={y} width={1} height={1} fill="#000" /> : null;
            })}
          </svg>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--txt-2)' }}>{addr}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={copy}>Copy address</button>
              <button className="btn btn-ghost btn-sm" onClick={copy}>Share link</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toast('New address generated')}>New address</button>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--line-1)', marginTop: 16, paddingTop: 14 }}>
          {!awaiting && !paid && (
            <button className="btn btn-block btn-ghost gold" onClick={startPoll}>🔔 Await payment — watch this address</button>
          )}
          {awaiting && (
            <div style={{ textAlign: 'center', padding: 8 }}>
              <span className="stream-pulse" style={{ display: 'inline-block', marginRight: 8 }} />
              <span className="muted">Polling the network for an incoming transaction…</span>
            </div>
          )}
          {paid && <div style={{ textAlign: 'center', color: 'var(--green-2)', fontWeight: 800 }}>✓ Payment received — balance updated</div>}
        </div>
        <div className="tiny" style={{ marginTop: 12 }}>Address format: bech32, prefixed "mall1". QR payload: <span className="mono">mallchain:pay?to={addr.slice(0, 8)}…</span></div>
      </div>
    </div>
  );
}
