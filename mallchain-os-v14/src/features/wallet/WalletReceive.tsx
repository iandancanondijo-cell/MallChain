import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { useWalletData } from '../../hooks/useWalletData';

/** Receive — real address + real QR + copy + live "awaiting payment" via socket balance updates. */
export default function WalletReceive() {
  useStoreVersion();
  const st = store.state;
  const addr = st.wallet.address;
  const [awaiting, setAwaiting] = useState(false);
  const [paid, setPaid] = useState(false);
  const [startBalance, setStartBalance] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Keeps st.balances live via real-time socket push updates while this page is open —
  // the same mechanism WalletHub already relies on (hooks/useWalletData.ts).
  useWalletData(addr || null);

  useEffect(() => {
    if (!addr) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(addr, { width: 132, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('[WalletReceive] Failed to generate QR code:', err));
    return () => { cancelled = true; };
  }, [addr]);

  // A push-driven balance increase while awaiting counts as "paid" — no fake timer.
  useEffect(() => {
    if (awaiting && startBalance !== null && st.balances.MALL > startBalance) {
      const received = st.balances.MALL - startBalance;
      setPaid(true);
      setAwaiting(false);
      toast(`Payment received: +${received.toFixed(2)} MALL`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, startBalance, st.balances.MALL]);

  const copy = async () => {
    if (!addr) return;
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

  const share = async () => {
    if (!addr) return;
    // Distinct from "Copy address": use the native share sheet when
    // available (mobile browsers, most desktop browsers over HTTPS) so the
    // address can go straight into a messaging app, not just the clipboard.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Mallchain address', text: addr });
        return;
      } catch (err) {
        // AbortError = user dismissed the share sheet, not a failure.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copy();
  };

  const startPoll = () => {
    if (!addr) return;
    setStartBalance(st.balances.MALL);
    setAwaiting(true);
    setPaid(false);
  };

  if (!addr) {
    return (
      <div>
        <div className="view-head"><h1>Receive MALL</h1><span className="sub">Share your address to receive Mallcoins</span></div>
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="empty-state"><div className="es-ico">📥</div><div className="es-t">No wallet connected</div><div className="es-m">Connect a wallet to see your receive address.</div></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="view-head"><h1>Receive MALL</h1><span className="sub">Share your address to receive Mallcoins</span></div>
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="sec-title"><h2>Your address</h2></div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Wallet address QR code" width={132} height={132} style={{ background: '#fff', padding: 6, borderRadius: 10, flex: 'none' }} />
          ) : (
            <div style={{ width: 132, height: 132, background: '#fff', borderRadius: 10, flex: 'none' }} />
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--txt-2)' }}>{addr}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={copy}>Copy address</button>
              <button className="btn btn-ghost btn-sm" onClick={share}>Share</button>
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
              <span className="muted">Watching for an incoming transaction…</span>
            </div>
          )}
          {paid && <div style={{ textAlign: 'center', color: 'var(--green-2)', fontWeight: 800 }}>✓ Payment received — balance updated</div>}
        </div>
        <div className="tiny" style={{ marginTop: 12 }}>Address format: bech32, prefixed "mall1". The QR code above encodes this address directly.</div>
      </div>
    </div>
  );
}
