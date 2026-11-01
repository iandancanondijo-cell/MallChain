import { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { sendMallcoinTransfer, MallcoinTxError } from '../../services/mallcoinTx';
import { RateLimitError, markPinChallengeLocked } from '../../services/api';
import { isValidMallAddress } from '../../services/wallet';
import { faucetApi } from '../../services/faucetApi';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { authService } from '../../services/auth';
import { useWizard } from '../../hooks/useWizard';
import { useWalletData } from '../../hooks/useWalletData';
import { loadAddressBook } from '../../services/addressBookStore';
import {
  ArrowUpRight, Send, CheckCircle2, AlertTriangle, Shield,
  ArrowRight, User, Hash, Coins, Zap, ChevronRight, ExternalLink, Link2
} from 'lucide-react';

const SEND_STEPS = ['recipient', 'review', 'authorize', 'broadcast'] as const;
type SendStep = typeof SEND_STEPS[number];

type SendData = {
  addr: string;
  amount: string;
  fee: number;
};
const INITIAL_SEND_DATA: SendData = { addr: '', amount: '', fee: 0.05 };

const STEP_META = [
  { key: 'recipient', label: 'Recipient', icon: User },
  { key: 'review', label: 'Review', icon: Hash },
  { key: 'authorize', label: 'Sign', icon: Shield },
  { key: 'broadcast', label: 'Sent', icon: CheckCircle2 },
] as const;

/** Send MALL — full flow with glassmorphism step wizard. */
export default function WalletSend() {
  useStoreVersion();
  const st = store.state;
  useWalletData(st.wallet.address || null);

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
  // Confirmation truth for the Sent step: what waitForConfirmation actually
  // resolved with (block height / timestamp), or that the broadcast settled
  // but confirmation timed out (confirmed: false — honest "still pending"
  // copy, never a failure).
  const [confirmation, setConfirmation] = useState<{
    confirmed: boolean;
    height?: string;
    timestamp?: string;
  } | null>(null);
  // Backend 429 (financialLimiter/readLimiter): epoch ms until which the send
  // is throttled. While it runs the Authorize button is disabled with a live
  // countdown and the PIN modal must NOT open or accept input — retrying
  // would re-prompt the PIN and burn attempt budgets for a request that
  // cannot succeed.
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);

  useEffect(() => {
    if (rateLimitedUntil <= Date.now()) {
      setRateLimitRemaining(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
      setRateLimitRemaining(remaining);
      if (remaining === 0) {
        setRateLimitedUntil(0);
        markPinChallengeLocked(0, '');
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [rateLimitedUntil]);

  const rateLimitClock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  // Sign-step state for the server-side wallet-link fix: `needsLink` shows
  // the human "link your wallet" prompt with its own button; linkRetriedRef
  // caps the automatic link-and-retry after a 403 wallet_not_linked at
  // exactly ONE attempt.
  const [needsLink, setNeedsLink] = useState(false);
  const linkRetriedRef = useRef(false);

  const validAddr = isValidMallAddress(addr);
  const max = st.balances.MALL;
  const addressBook = useMemo(() => loadAddressBook(), []);

  const stepIdx = SEND_STEPS.indexOf(step);

  const review = () => {
    setErr('');
    const amt = parseFloat(amount);
    if (!validAddr) { setErr('Invalid address — expected a mall1… bech32 address.'); return; }
    if (!amt || amt <= 0) { setErr('Enter a valid amount.'); return; }
    if (amt + fee > max) { setErr(`Insufficient balance — you have ${max.toFixed(2)} MALL.`); return; }
    wizard.next();
  };

  const LINK_REQUIRED_MESSAGE =
    "Your wallet isn't linked to your account yet. Confirm your PIN to link it, then try again.";

  /** True for the backend's requireWalletOwnership 403 (send.js `wallet_not_linked`). */
  const isWalletNotLinkedError = (e: unknown): boolean =>
    e instanceof MallcoinTxError &&
    (e.code === 'wallet_not_linked' || /wallet_not_linked|not linked/i.test(e.message));

  /** Signs + broadcasts + records the transfer. Throws on failure; caller handles it. */
  const broadcast = async (mnemonic: string) => {
    const result = await sendMallcoinTransfer({
      mnemonic,
      fromAddress: st.wallet.address,
      toAddress: addr,
      amountMlcns: parseFloat(amount),
    });
    store.applyTx({
      type: 'send', amount: parseFloat(amount), asset: 'MALL', kind: 'debit', to: addr, fee,
      note: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
      notifTitle: `Sent ${amount} MALL`, notifKind: 'tx', notifCategory: 'transactions',
      activityText: `Sent ${amount} MALL to ${addr.slice(0, 10)}…`,
    });
    setTxHash(result.txHash);
    setConfirmation({ confirmed: result.confirmed !== false, height: result.height, timestamp: result.timestamp });
    // A send that got this far proves the limiter window has passed — clear any
    // stale rate-limit state so the next authorize isn't gated.
    setRateLimitedUntil(0);
    setRateLimitRemaining(0);
    markPinChallengeLocked(0, '');
    setBusy(false);
    toast(
      result.confirmed === false
        ? 'Broadcast succeeded — confirmation still pending'
        : result.height
          ? `Confirmed on-chain at height ${result.height}`
          : 'Transaction confirmed on-chain'
    );
    wizard.next();
  };

  const authorize = async () => {
    if (!st.wallet.pinEncryptedMnemonic || !st.wallet.address) {
      toast('No wallet loaded — import or create a wallet first', false);
      return;
    }
    // Hard gate: while the backend rate limit runs, the PIN challenge must
    // not even open — no re-prompting, no burned PIN attempts on requests
    // that cannot succeed.
    if (rateLimitedUntil > Date.now()) return;
    const mnemonic = await requestMnemonic();
    if (!mnemonic) return;

    setBusy(true);
    setErr('');
    setGasError(false);
    setNeedsLink(false);
    linkRetriedRef.current = false;

    const address = st.wallet.address;

    // POST /api/send/mallcoins rejects with 403 wallet_not_linked unless the
    // account's server-side link (User.walletAddress, only ever set by
    // POST /api/auth/link-wallet) matches this exact address. The App.tsx
    // background auto-link is fire-and-forget and its failures were silent —
    // so verify against the server here and, if the link is missing, complete
    // it explicitly (reusing the PIN-decrypted mnemonic — no second prompt)
    // before broadcasting.
    if (!st.wallet.linkedOnServer) {
      const me = await authService.getServerWalletLink();
      if (me.ok && me.address === address) {
        store.state.wallet.linkedOnServer = true;
        store.commit();
      } else {
        const link = await authService.linkWallet(address, { mnemonic });
        if (!link.ok) {
          setBusy(false);
          if (link.reason !== 'pin_cancelled') {
            // The needsLink card renders the message itself — don't also set
            // `err` or it would show twice.
            setNeedsLink(true);
          }
          return;
        }
      }
    }

    try {
      await broadcast(mnemonic);
    } catch (e) {
      if (e instanceof RateLimitError) {
        // 429 (broadcast limiter or persistent status-limiter 429s): show the
        // exact cool-down window and gate the PIN UI — this is NOT a failure
        // and must not render like one.
        setBusy(false);
        const until = Date.now() + e.retryAfterSeconds * 1000;
        setRateLimitedUntil(until);
        markPinChallengeLocked(until, e.message);
        return;
      }
      if (e instanceof MallcoinTxError && e.code === 'NO_ON_CHAIN_HISTORY') {
        setBusy(false);
        setGasError(true);
        return;
      }
      if (isWalletNotLinkedError(e)) {
        // The pre-check passed but the server still says unlinked (e.g. the
        // /me read raced a link rotation). Exactly ONE explicit
        // link-and-retry; anything beyond that goes to the user as a clear
        // message with its own link button.
        if (!linkRetriedRef.current) {
          linkRetriedRef.current = true;
          store.state.wallet.linkedOnServer = false;
          store.commit();
          const link = await authService.linkWallet(address, { mnemonic });
          if (link.ok) {
            try {
              await broadcast(mnemonic);
              return;
            } catch {
              // retry's broadcast failed again — fall through to the prompt
            }
          }
        }
        setBusy(false);
        setNeedsLink(true);
        return;
      }
      setBusy(false);
      const message = e instanceof MallcoinTxError || e instanceof Error ? e.message : 'Failed to send';
      setErr(message);
      toast(message, false);
    }
  };

  /** "Link wallet" button in the Sign-step error prompt: awaits linkWallet (raises the PIN challenge itself). */
  const linkNow = async () => {
    if (!st.wallet.address) return;
    setBusy(true);
    const link = await authService.linkWallet(st.wallet.address);
    setBusy(false);
    if (link.ok) {
      setNeedsLink(false);
      setErr('');
      toast('Wallet linked to your account — you can send again');
    } else if (link.reason !== 'pin_cancelled') {
      // needsLink card stays up with its message; just report why it failed.
      toast(link.reason, false);
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
    const confirmed = !!confirmation?.confirmed;
    const height = confirmation?.height;
    const heroTitle = confirmed
      ? height
        ? `Sent — confirmed on-chain at height ${height}`
        : 'Sent — confirmed on-chain'
      : 'Sent — broadcast to network';
    return (
      <div className="wo-page">
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 197, 94, 0.12)' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
          </div>
          <div className="wo-hero-body">
            <h1 className="wo-hero-title text-gradient">{heroTitle}</h1>
            <div className="wo-hero-sub">
              {confirmed
                ? height
                  ? `Block ${height}${confirmation?.timestamp ? ` · ${confirmation.timestamp}` : ''}`
                  : 'Your transfer is included in a block'
                : 'Confirmation is still pending — the last block has not sealed yet'}
            </div>
          </div>
        </div>

        <div className="wo-card wo-card--success">
          <div className="wo-status">
            <div className="wo-status-icon wo-status-icon--success">
              <CheckCircle2 size={28} />
            </div>
            <div className="wo-status-title">Sent {amt} MALL</div>
            {confirmed ? (
              <div className="wo-status-text">
                {height
                  ? `Your transaction was included in block ${height} and is confirmed on-chain.`
                  : 'Your transaction is confirmed on-chain.'}
              </div>
            ) : (
              <div className="wo-info wo-info--tip" role="status" style={{ maxWidth: 460 }}>
                <AlertTriangle size={14} className="wo-info-icon" />
                <span>
                  Broadcast succeeded — confirmation still pending; funds may already have
                  arrived. Check Transactions.
                </span>
              </div>
            )}
            {txHash && (
              <div className="wo-hash" style={{ maxWidth: 360 }}>
                {txHash}
              </div>
            )}
          </div>
          <div className="wo-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => { wizard.reset(); navigate(txHash ? `/explorer?tx=${txHash}` : '/explorer'); }}>
              <ExternalLink size={13} style={{ marginRight: 6 }} />
              {txHash ? `View tx ${txHash.slice(0, 10)}… in Explorer` : 'Explorer'}
            </button>
            <button className="btn btn-ghost" onClick={() => { wizard.reset(); navigate('/transactions'); }}>
              Transactions
            </button>
            <button className="btn btn-primary" onClick={() => { wizard.reset(); navigate('/wallet'); }}>
              Back to Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wo-page">
      {/* Hero */}
      <div className="wo-hero">
        <div className="wo-hero-icon" style={{ background: 'rgba(74, 222, 128, 0.12)' }}>
          <ArrowUpRight size={24} style={{ color: 'var(--green-2)' }} />
        </div>
        <div className="wo-hero-body">
          <h1 className="wo-hero-title text-gradient">Send MALL</h1>
          <div className="wo-hero-sub">Transfer Mallcoins to any bech32 address</div>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="wo-steps">
        {STEP_META.map((s, i) => {
          const isActive = i === stepIdx;
          const isDone = i < stepIdx;
          const cls = isDone ? 'done' : isActive ? 'active' : '';
          return (
            <div key={s.key} style={{ display: 'contents' }}>
              <div className={`wo-step ${cls}`}>
                <div className="wo-step-dot">
                  {isDone ? <CheckCircle2 size={13} /> : <s.icon size={13} />}
                </div>
                <span>{s.label}</span>
              </div>
              {i < STEP_META.length - 1 && (
                <div className={`wo-step-line ${isDone ? 'done' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="wo-card card-glow bg-gradient-card">
        {step === 'recipient' && (
          <>
            <div className="field">
              <label htmlFor="send-recipient">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <User size={13} style={{ color: 'var(--txt-3)' }} />
                  Recipient address
                </span>
              </label>
              <input
                id="send-recipient"
                className={'input mono' + (addr && !validAddr ? ' err' : '')}
                placeholder="mall1… (bech32 address)"
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                list={addressBook.length > 0 ? 'send-address-book' : undefined}
                aria-invalid={addr ? !validAddr : undefined}
                aria-describedby="send-recipient-hint"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {addressBook.length > 0 && (
                <datalist id="send-address-book">
                  {addressBook.map((a) => (
                    <option key={a.id} value={a.address}>{a.label}</option>
                  ))}
                </datalist>
              )}
              <div id="send-recipient-hint">
                {addr && !validAddr && (
                  <div className="hint" style={{ color: 'var(--red-2)', display: 'flex', alignItems: 'center', gap: 4 }} role="alert">
                    <AlertTriangle size={11} /> Invalid address format
                  </div>
                )}
                {validAddr && (
                  <div className="hint" style={{ color: 'var(--green-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={11} /> Valid address
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label htmlFor="send-amount">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Coins size={13} style={{ color: 'var(--txt-3)' }} />
                  Amount (MALL)
                </span>
                <span className="tiny muted" style={{ float: 'right', fontWeight: 400 }}>
                  Balance: {max.toFixed(2)}
                </span>
              </label>
              <input
                id="send-amount"
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm mt"
                onClick={() => setAmount(String(Math.max(0, max - fee)))}
                style={{ alignSelf: 'flex-start' }}
              >
                <Zap size={11} style={{ marginRight: 4 }} /> Max
              </button>
            </div>

            <div className="field">
              <label htmlFor="send-fee">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={13} style={{ color: 'var(--txt-3)' }} />
                  Network fee
                </span>
                <span className="tiny muted" style={{ float: 'right', fontWeight: 400 }}>
                  {fee.toFixed(2)} MALL
                </span>
              </label>
              <input
                id="send-fee"
                type="range"
                min={0.01}
                max={0.5}
                step={0.01}
                value={fee}
                aria-valuetext={`${fee.toFixed(2)} MALL`}
                onChange={(e) => setFee(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--section-accent)' }}
              />
            </div>

            {err && (
              <div className="wo-info wo-info--error" style={{ marginBottom: 12 }}>
                <AlertTriangle size={14} className="wo-info-icon" />
                <span>{err}</span>
              </div>
            )}

            <div className="wo-actions">
              <button className="btn btn-primary btn-block" onClick={review}>
                Review transaction <ChevronRight size={14} style={{ marginLeft: 4 }} />
              </button>
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Hash size={16} style={{ color: 'var(--section-accent)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Transaction Summary</h2>
            </div>

            <div className="wo-summary">
              <div className="wo-summary-row">
                <span className="wo-summary-label">
                  <User size={13} /> To
                </span>
                <span className="wo-summary-value mono" style={{ fontSize: 12 }}>
                  {addr.slice(0, 10)}…{addr.slice(-6)}
                </span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">
                  <Send size={13} /> Amount
                </span>
                <span className="wo-summary-value">{amount} MALL</span>
              </div>
              <div className="wo-summary-row">
                <span className="wo-summary-label">
                  <Zap size={13} /> Network fee
                </span>
                <span className="wo-summary-value">{fee.toFixed(2)} MALL</span>
              </div>
              <div className="wo-summary-row total">
                <span className="wo-summary-label">Total</span>
                <span className="wo-summary-value">
                  {(parseFloat(amount) + fee).toFixed(2)} MALL
                </span>
              </div>
            </div>

            <div className="wo-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => wizard.back()}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => wizard.next()}>
                Continue to sign <ArrowRight size={14} style={{ marginLeft: 4 }} />
              </button>
            </div>
          </>
        )}

        {step === 'authorize' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Shield size={16} style={{ color: 'var(--section-accent)' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Authorize Transaction</h2>
            </div>

            <div className="wo-info wo-info--tip" style={{ marginBottom: 16 }}>
              <Shield size={14} className="wo-info-icon" />
              <span>You'll be asked for your PIN to unlock your recovery phrase and sign this transaction securely.</span>
            </div>

            {rateLimitRemaining > 0 && (
              <div className="wo-info wo-info--error" style={{ marginBottom: 12 }} role="alert">
                <AlertTriangle size={14} className="wo-info-icon" />
                <span>Too many sends — try again in {rateLimitClock(rateLimitRemaining)}</span>
              </div>
            )}

            {busy && (
              <div className="wo-info wo-info--tip" style={{ marginBottom: 12 }} role="status">
                <Zap size={14} className="wo-info-icon" />
                <span>Broadcast — validating in next block (~5s)</span>
              </div>
            )}

            {err && (
              <div className="wo-info wo-info--error" style={{ marginBottom: 12 }}>
                <AlertTriangle size={14} className="wo-info-icon" />
                <span>{err}</span>
              </div>
            )}

            {gasError && (
              <div className="wo-card wo-card--warning" style={{ marginBottom: 12, padding: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--txt-2)', marginBottom: 10 }}>
                  Your wallet needs network fee tokens before it can send — separate from your MALL balance and only needed once.
                </div>
                <button className="btn btn-primary btn-sm" disabled={gettingGas} onClick={getGas}>
                  {gettingGas && <span className="wo-spinner" style={{ width: 14, height: 14, marginRight: 6, display: 'inline-block' }} />}
                  <Zap size={12} style={{ marginRight: 4 }} /> Get fee tokens
                </button>
              </div>
            )}

            {needsLink && (
              <div className="wo-card wo-card--warning" style={{ marginBottom: 12, padding: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--txt-2)', marginBottom: 10 }}>
                  {LINK_REQUIRED_MESSAGE}
                </div>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={linkNow}>
                  {busy && <span className="wo-spinner" style={{ width: 14, height: 14, marginRight: 6, display: 'inline-block' }} />}
                  <Link2 size={12} style={{ marginRight: 4 }} /> Link wallet now
                </button>
              </div>
            )}

            <div className="wo-actions">
              <button className="btn btn-ghost" onClick={() => wizard.back()}>Back</button>
              <button className="btn btn-primary" disabled={busy || rateLimitRemaining > 0} onClick={authorize}>
                {busy && <span className="wo-spinner" style={{ width: 14, height: 14, marginRight: 6, display: 'inline-block' }} />}
                <Shield size={14} style={{ marginRight: 6 }} /> Authorize & broadcast
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
