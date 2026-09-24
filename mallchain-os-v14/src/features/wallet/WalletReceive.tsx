import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowDownLeft, Copy, Share2, Bell, CheckCircle2, Wallet, QrCode, Shield } from 'lucide-react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { useWalletData } from '../../hooks/useWalletData';

/** Receive — QR showcase + copy/share + live "awaiting payment" via socket balance updates. */
export default function WalletReceive() {
  useStoreVersion();
  const st = store.state;
  const addr = st.wallet.address;
  const [awaiting, setAwaiting] = useState(false);
  const [paid, setPaid] = useState(false);
  const [startBalance, setStartBalance] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useWalletData(addr || null);

  useEffect(() => {
    if (!addr) { setQrDataUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(addr, { width: 160, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('[WalletReceive] Failed to generate QR code:', err));
    return () => { cancelled = true; };
  }, [addr]);

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
    setCopied(true);
    toast('Address copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (!addr) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Mallchain address', text: addr });
        return;
      } catch (err) {
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
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
            <ArrowDownLeft size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title">Receive MALL</div>
            <div className="wo-hero-sub">Share your address or QR code to receive Mallcoins</div>
          </div>
        </div>
        <div className="wo-card" style={{ maxWidth: 560 }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Wallet size={24} style={{ color: 'var(--cyan)', opacity: 0.5 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No wallet connected</div>
            <div style={{ fontSize: 13, color: 'var(--txt-3)' }}>Connect a wallet to see your receive address and QR code.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
          <ArrowDownLeft size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title">Receive MALL</div>
          <div className="wo-hero-sub">Share your address or QR code — payments arrive in real time</div>
        </div>
      </div>

      {/* ── QR + address card ── */}
      <div className="wo-qr-section" style={{ maxWidth: 560 }}>
        <div className="wo-qr-frame">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Wallet address QR code" width={160} height={160} style={{ borderRadius: 8 }} />
          ) : (
            <div style={{ width: 160, height: 160, background: '#fff', borderRadius: 8 }} />
          )}
          {awaiting && !paid && (
            <div className="wo-pulse-ring" />
          )}
          {paid && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(34, 197, 94, 0.12)', borderRadius: 12, backdropFilter: 'blur(4px)',
            }}>
              <CheckCircle2 size={40} style={{ color: 'var(--green)' }} />
            </div>
          )}
        </div>

        <div className="wo-address-display">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <QrCode size={12} style={{ color: 'var(--txt-3)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your address</span>
          </div>
          <div className="wo-address-text">{addr}</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={copy} style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={share} style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 size={13} /> Share
          </button>
        </div>
      </div>

      {/* ── await payment ── */}
      <div className="wo-card" style={{ maxWidth: 560 }}>
        {!awaiting && !paid && (
          <button className="btn btn-block btn-ghost" onClick={startPoll} style={{ gap: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(34, 211, 238, 0.25)', color: 'var(--cyan)' }}>
            <Bell size={14} /> Await payment — watch this address
          </button>
        )}

        {awaiting && (
          <div className="wo-status" style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} style={{ color: 'var(--cyan)' }} />
              </div>
              <div className="wo-pulse-ring" style={{ position: 'absolute' }} />
            </div>
            <div className="wo-status-title" style={{ color: 'var(--cyan)' }}>Watching for payment…</div>
            <div className="wo-status-text">A balance increase on this address will be detected in real time</div>
          </div>
        )}

        {paid && (
          <div className="wo-status wo-card--success" style={{ textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--green)', marginBottom: 8 }} />
            <div className="wo-status-title" style={{ color: 'var(--green)' }}>Payment received</div>
            <div className="wo-status-text">Your balance has been updated</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setPaid(false); }} style={{ marginTop: 12 }}>
              Await another payment
            </button>
          </div>
        )}
      </div>

      {/* ── info ── */}
      <div className="wo-card wo-info--tip" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--txt-2)' }}>Address format:</strong> bech32, prefixed <code className="mono" style={{ fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 4 }}>mall1</code>.
          The QR code encodes this address directly — scan it from any Mallchain-compatible wallet to send MALL here.
        </div>
      </div>
    </div>
  );
}
