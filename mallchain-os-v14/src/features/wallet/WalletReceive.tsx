import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowDownLeft, Copy, Share2, Bell, CheckCircle2, Wallet, QrCode, Shield,
  ExternalLink, XCircle, Coins, Link as LinkIcon,
} from 'lucide-react';
import { store } from '../../store/store';
import { useStoreVersion, toast, fmtMoney } from '../../components/ui';
import { useWalletData } from '../../hooks/useWalletData';
import { useLivePrice } from '../../hooks/useLivePrice';
import { useCurrencyConverter } from '../../services/currency';
import { receiveApi, type ReceiveIntentView } from '../../services/receiveApi';

/**
 * Receive — QR showcase + copy/share + live "awaiting payment".
 *
 * The QR no longer encodes a bare address: it encodes the LIVE-NETWORK
 * session link (`<origin>/#/wallet/send?to=<address>[&amount=<stated>]`)
 * so scanning it opens the Mallchain network send page pre-filled for
 * this wallet. When the receiver STATES an amount for the session, any
 * wallet→wallet transfer to this address must send exactly that figure —
 * the backend rejects deviations and the session fails for both sides.
 */
export default function WalletReceive() {
  useStoreVersion();
  const st = store.state;
  const addr = st.wallet.address;
  const [awaiting, setAwaiting] = useState(false);
  const [paid, setPaid] = useState(false);
  const [startBalance, setStartBalance] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Stated-amount session state.
  const [intent, setIntent] = useState<ReceiveIntentView | null>(null);
  const [sessionOutcome, setSessionOutcome] = useState<ReceiveIntentView | null>(null);
  const [stateAmount, setStateAmount] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const { midKes } = useLivePrice();
  const toDisplay = useCurrencyConverter(st.prefs.currency);

  useWalletData(addr || null);

  // The live-network link the QR points at (works on mallchain.network in
  // production and on the dev origin locally — same app, same route).
  const sessionLink = useMemo(() => {
    if (!addr) return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    const amt = intent && intent.status === 'active' ? intent.amountMlcns : null;
    return `${base}#/wallet/send?to=${addr}${amt ? `&amount=${amt}` : ''}`;
  }, [addr, intent]);

  useEffect(() => {
    if (!addr) { setQrDataUrl(null); return; }
    let cancelled = false;
    // QR encodes the openable live-network link (the address rides along
    // inside it as ?to=…, so address-only scanners still get the wallet).
    QRCode.toDataURL(sessionLink || addr, { width: 220, margin: 1 })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => console.error('[WalletReceive] Failed to generate QR code:', err));
    return () => { cancelled = true; };
  }, [addr, sessionLink]);

  // Restore an already-live session for this address on mount/return.
  useEffect(() => {
    if (!addr) return;
    let cancelled = false;
    receiveApi.getSession(addr)
      .then((r) => {
        if (cancelled || !r.ok || !r.data) return;
        setIntent(r.data.active);
        if (r.data.active) setAwaiting(true);
        setSessionOutcome(r.data.latest);
      })
      .catch(() => { /* offline / no session — classic receive mode */ });
    return () => { cancelled = true; };
  }, [addr]);

  // While a stated-amount session is live, poll its outcome: the sender
  // matching the amount flips it to `satisfied`; a deviating send flips it
  // to `failed` — both parties' session ends, and this side must say so.
  const intentId = intent?.id;
  const intentStatus = intent?.status;
  useEffect(() => {
    if (!addr || !intentId || intentStatus !== 'active') return;
    let cancelled = false;
    const poll = async () => {
      const r = await receiveApi.getSession(addr);
      if (cancelled || !r.ok || !r.data) return;
      if (r.data.active === null) {
        // no longer active — the finished doc (satisfied/failed) appears in latest
        if (r.data.latest && r.data.latest.id === intentId) {
          setIntent(null);
          setSessionOutcome(r.data.latest);
          if (r.data.latest.status === 'failed') {
            setAwaiting(false);
            toast(`Receive session failed — sender attempted ${r.data.latest.failure?.attemptedAmountMlcns ?? '?'} MALL, not the stated amount`, false);
          } else {
            setPaid(true);
            setAwaiting(false);
            toast('Stated amount received — session complete');
          }
        }
      } else {
        setIntent(r.data.active);
      }
    };
    poll();
    const id = window.setInterval(poll, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, intentId, intentStatus]);

  // Classic balance-delta detection (no stated amount, or extra safety net).
  useEffect(() => {
    if (awaiting && startBalance !== null && st.balances.MALL > startBalance) {
      const received = st.balances.MALL - startBalance;
      setPaid(true);
      setAwaiting(false);
      toast(`Payment received: +${received.toFixed(2)} MALL`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaiting, startBalance, st.balances.MALL]);

  const amtNum = parseFloat(stateAmount);
  const stateKes = midKes !== null && Number.isFinite(amtNum) && amtNum > 0 ? amtNum * midKes : null;
  const stateDisplay = toDisplay(stateKes, 'KES');

  const copyAddress = async () => {
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

  const copyLink = async () => {
    if (!sessionLink) return;
    try {
      await navigator.clipboard.writeText(sessionLink);
      toast('Live-network payment link copied');
    } catch {
      toast('Copy failed — long-press the link to copy', false);
    }
  };

  const openLink = () => {
    if (sessionLink) window.open(sessionLink, '_blank', 'noopener');
  };

  const share = async () => {
    if (!addr) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pay my Mallchain wallet',
          text: intent ? `Send exactly ${intent.amountMlcns} MALL to my Mallchain wallet` : 'Send MALL to my Mallchain wallet',
          url: sessionLink || addr,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    await copyLink();
  };

  const startSession = async (withStatedAmount: boolean) => {
    if (!addr) return;
    setSessionError('');
    if (withStatedAmount) {
      if (!Number.isFinite(amtNum) || amtNum <= 0) {
        setSessionError('Enter a valid amount you expect to receive.');
        return;
      }
      setSessionBusy(true);
      const r = await receiveApi.createIntent(amtNum, sessionNote ? { note: sessionNote.slice(0, 200) } : undefined);
      setSessionBusy(false);
      if (!r.ok || !r.data?.intent) {
        setSessionError(r.data && (r.data as { message?: string }).message
          || r.error || 'Could not start the stated-amount session.');
        return;
      }
      setIntent(r.data.intent);
      setSessionOutcome(null);
      setStartBalance(st.balances.MALL);
      setPaid(false);
      setAwaiting(true);
      toast(`Receive session active — exact ${amtNum} MALL requested`);
      return;
    }
    // Plain watch (no stated amount): any incoming amount counts.
    if (intent) {
      const c = await receiveApi.cancelIntent();
      if (c.ok) setIntent(null);
    }
    setSessionOutcome(null);
    setStartBalance(st.balances.MALL);
    setAwaiting(true);
    setPaid(false);
  };

  const endSession = async () => {
    if (intent) {
      setSessionBusy(true);
      await receiveApi.cancelIntent().catch(() => {});
      setSessionBusy(false);
      setIntent(null);
    }
    setAwaiting(false);
    toast('Receive session closed');
  };

  if (!addr) {
    return (
      <div>
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
            <ArrowDownLeft size={22} />
          </div>
          <div className="wo-hero-body">
            <div className="wo-hero-title text-gradient">Receive MALL</div>
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

  const failedOutcome = sessionOutcome?.status === 'failed' ? sessionOutcome : null;
  const satisfiedOutcome = sessionOutcome?.status === 'satisfied' ? sessionOutcome : null;

  return (
    <div>
      {/* ── hero ── */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--cyan)' }}>
          <ArrowDownLeft size={22} />
        </div>
        <div className="wo-hero-body">
          <div className="wo-hero-title text-gradient">Receive MALL</div>
          <div className="wo-hero-sub">Scan-to-pay QR opens the live network — state an amount to lock the price</div>
        </div>
      </div>

      {/* ── QR + address card ── */}
      <div className="wo-qr-section card-glow bg-gradient-card" style={{ maxWidth: 560 }}>
        <div className="wo-qr-frame">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Payment QR code — opens the Mallchain network" width={220} height={220} style={{ borderRadius: 8 }} />
          ) : (
            <div style={{ width: 220, height: 220, background: '#fff', borderRadius: 8 }} />
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

        {intent && intent.status === 'active' && (
          <div style={{ textAlign: 'center', marginBottom: 10, color: 'var(--cyan)', fontSize: 13, fontWeight: 600 }}>
            <Shield size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            Session active — exact {intent.amountMlcns} MALL requested
            {midKes !== null && (
              <> (≈ {fmtMoney(toDisplay(intent.amountMlcns * midKes, 'KES')!, st.prefs.currency)} at live rate)</>
            )}
          </div>
        )}

        <div className="wo-address-display">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <QrCode size={12} style={{ color: 'var(--txt-3)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your address</span>
          </div>
          <div className="wo-address-text">{addr}</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={copyAddress} style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={share} style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Share2 size={13} /> Share
          </button>
        </div>

        {/* Live-network link behind the QR — openable right here. */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LinkIcon size={12} style={{ color: 'var(--txt-3)', flexShrink: 0 }} />
          <a
            href={sessionLink}
            onClick={(e) => { e.preventDefault(); openLink(); }}
            style={{
              flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 11, color: 'var(--cyan)', textDecoration: 'underline dotted',
            }}
            title={sessionLink}
          >
            {sessionLink}
          </a>
          <button className="btn btn-ghost btn-sm" onClick={openLink} style={{ gap: 4, display: 'inline-flex', alignItems: 'center' }}>
            <ExternalLink size={11} /> Open
          </button>
          <button className="btn btn-ghost btn-sm" onClick={copyLink} style={{ gap: 4, display: 'inline-flex', alignItems: 'center' }}>
            <Copy size={11} /> Link
          </button>
        </div>
      </div>

      {/* ── state an amount / activate receive ── */}
      <div className="wo-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Coins size={13} style={{ color: 'var(--gold)' }} />
          <strong style={{ fontSize: 13 }}>Receive session</strong>
          <span className="tiny muted" style={{ marginLeft: 'auto' }}>anti-cheat: exact amount only</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--txt-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
          Optionally state what you expect to receive. While a stated-amount session is live, any
          transfer to this address that is lower <em>or</em> higher than the stated figure is rejected
          on the network — the sender's send fails and this session closes for both sides. Leave it
          unset and the sender may send any amount.
        </p>

        {!intent && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="Amount you expect (MALL) — optional"
                  value={stateAmount}
                  onChange={(e) => setStateAmount(e.target.value)}
                  disabled={awaiting}
                />
                {stateDisplay !== null && stateKes !== null && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    ≈ <b>{fmtMoney(stateDisplay, st.prefs.currency)}</b> at live rate (1 MALL ≈ {midKes !== null ? fmtMoney(toDisplay(midKes, 'KES')!, st.prefs.currency) : '…'})
                  </div>
                )}
              </div>
            </div>
            <input
              className="input mt"
              placeholder="Note for the sender (optional)"
              value={sessionNote}
              maxLength={200}
              onChange={(e) => setSessionNote(e.target.value)}
              disabled={awaiting}
            />
            {sessionError && (
              <div className="wo-info wo-info--error" style={{ marginTop: 10 }}>
                <XCircle size={14} className="wo-info-icon" />
                <span>{sessionError}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                disabled={sessionBusy || awaiting}
                onClick={() => startSession(true)}
              >
                <Shield size={13} /> Activate with stated amount
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flex: 1, gap: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                disabled={awaiting}
                onClick={() => startSession(false)}
              >
                <Bell size={13} /> Await any amount
              </button>
            </div>
          </>
        )}

        {intent && intent.status === 'active' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--cyan)' }}>
              {intent.amountMlcns} MALL
            </div>
            <div className="tiny muted">
              exact amount requested{intent.note ? ` · "${intent.note}"` : ''} · expires {new Date(intent.expiresAt).toLocaleString()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={copyLink}>
                <LinkIcon size={12} style={{ marginRight: 4 }} /> Copy payment link
              </button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} disabled={sessionBusy} onClick={endSession}>
                Close session
              </button>
            </div>
          </div>
        )}

        {!intent && awaiting && (
          <div className="wo-status" style={{ textAlign: 'center', marginTop: 10 }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(34, 211, 238, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={18} style={{ color: 'var(--cyan)' }} />
              </div>
              <div className="wo-pulse-ring" style={{ position: 'absolute' }} />
            </div>
            <div className="wo-status-title" style={{ color: 'var(--cyan)' }}>Watching for payment…</div>
            <div className="wo-status-text">Any incoming amount on this address will be detected in real time</div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={endSession}>Stop watching</button>
          </div>
        )}
      </div>

      {/* ── session outcome ── */}
      {failedOutcome && (
        <div className="wo-card" style={{ maxWidth: 560, borderColor: 'rgba(193, 88, 77, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <XCircle size={16} style={{ color: 'var(--red)' }} />
            <strong style={{ fontSize: 14, color: 'var(--red)' }}>Receive session failed</strong>
          </div>
          <p style={{ fontSize: 12, color: 'var(--txt-2)', margin: 0, lineHeight: 1.6 }}>
            A transfer was attempted with {failedOutcome.failure?.attemptedAmountMlcns ?? '?'} MALL against your stated
            {' '}{failedOutcome.amountMlcns} MALL — the network rejected it, and the session ended for both parties.
            No funds moved. State a new amount (or accept any amount) to start a fresh session.
          </p>
          <button className="btn btn-ghost btn-sm mt" onClick={() => setSessionOutcome(null)}>Dismiss</button>
        </div>
      )}
      {satisfiedOutcome && !paid && (
        <div className="wo-card wo-card--success" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            <strong style={{ fontSize: 14, color: 'var(--green)' }}>Stated amount received</strong>
          </div>
          <p style={{ fontSize: 12, color: 'var(--txt-2)', margin: '6px 0 0' }}>
            {satisfiedOutcome.amountMlcns} MALL arrived — session complete.
          </p>
        </div>
      )}

      {/* ── paid ── */}
      {paid && (
        <div className="wo-card wo-card--success" style={{ maxWidth: 560, textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--green)', marginBottom: 8 }} />
          <div className="wo-status-title" style={{ color: 'var(--green)' }}>Payment received</div>
          <div className="wo-status-text">Your balance has been updated</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPaid(false); }} style={{ marginTop: 12 }}>
            Await another payment
          </button>
        </div>
      )}

      {/* ── info ── */}
      <div className="wo-card wo-info--tip" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--txt-2)' }}>How the QR works:</strong> it encodes a live-network
          payment link — scanning opens Mallchain with your address (and the stated amount, while a
          session is live) pre-filled on the sender's Send page. Address format is bech32, prefixed{' '}
          <code className="mono" style={{ fontSize: 11, background: 'var(--bg-3)', padding: '1px 5px', borderRadius: 4 }}>mall1</code>,
          so any Mallchain-compatible wallet can also pay it directly.
        </div>
      </div>
    </div>
  );
}
