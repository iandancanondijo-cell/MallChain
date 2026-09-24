import { useMemo, useState } from 'react';
import { store } from '../../store/store';
import { useStoreVersion, toast } from '../../components/ui';
import { sendMallcoinTransfer, MallcoinTxError } from '../../services/mallcoinTx';
import { isValidMallAddress } from '../../services/wallet';
import { faucetApi } from '../../services/faucetApi';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { useWizard } from '../../hooks/useWizard';
import { useWalletData } from '../../hooks/useWalletData';
import { loadAddressBook } from '../../services/addressBookStore';
import {
  ArrowUpRight, Send, CheckCircle2, AlertTriangle, Shield,
  ArrowRight, User, Hash, Coins, Zap, ChevronRight, ExternalLink
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
      <div className="wo-page">
        <div className="wo-hero">
          <div className="wo-hero-icon" style={{ background: 'rgba(34, 197, 94, 0.12)' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
          </div>
          <div className="wo-hero-body">
            <h1 className="wo-hero-title">Transaction Broadcast</h1>
            <div className="wo-hero-sub">Your transfer is pending confirmation on-chain</div>
          </div>
        </div>

        <div className="wo-card wo-card--success">
          <div className="wo-status">
            <div className="wo-status-icon wo-status-icon--success">
              <CheckCircle2 size={28} />
            </div>
            <div className="wo-status-title">Sent {amt} MALL</div>
            <div className="wo-status-text">
              Your transaction has been submitted to the network and is awaiting confirmation.
            </div>
            {txHash && (
              <div className="wo-hash" style={{ maxWidth: 360 }}>
                {txHash}
              </div>
            )}
          </div>
          <div className="wo-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => { wizard.reset(); navigate('/explorer'); }}>
              <ExternalLink size={13} style={{ marginRight: 6 }} /> Explorer
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
          <h1 className="wo-hero-title">Send MALL</h1>
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
      <div className="wo-card">
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

            <div className="wo-actions">
              <button className="btn btn-ghost" onClick={() => wizard.back()}>Back</button>
              <button className="btn btn-primary" disabled={busy} onClick={authorize}>
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
