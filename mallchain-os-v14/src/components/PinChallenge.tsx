/**
 * Global PIN-challenge modal — the UI half of services/mnemonicAccess.ts.
 * Mount once (App.tsx). Listens for requestMnemonic() calls, prompts the
 * PIN, decrypts store.state.wallet.pinEncryptedMnemonic, and resolves the
 * caller's promise. 3-attempt lockout with 60-second cooldown to prevent
 * brute-force, same pattern as PrivateKeyExport.tsx's own PIN entry.
 */
import { useEffect, useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { store } from '../store/store';
import { decryptMnemonic } from '../services/security';
import { mnemonicRequestBus, type MnemonicRequest } from '../services/mnemonicAccess';
import { Modal } from './ui';
import PINInput from './PINInput';

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

export function PinChallengeHost() {
  const [pending, setPending] = useState<MnemonicRequest | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const fn = (req: MnemonicRequest) => {
      setPending(req);
      setPin('');
      setError(null);
      setAttempts(0);
      setLockedUntil(null);
      setRemainingSeconds(0);
    };
    mnemonicRequestBus.listeners.add(fn);
    return () => { mnemonicRequestBus.listeners.delete(fn); };
  }, []);

  useEffect(() => {
    if (lockedUntil) {
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
        setRemainingSeconds(remaining);
        if (remaining === 0) {
          setLockedUntil(null);
          setAttempts(0);
          setError(null);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      };
      tick();
      timerRef.current = window.setInterval(tick, 1000);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
  }, [lockedUntil]);

  if (!pending) return null;

  const cancel = () => {
    pending.resolve(null);
    setPending(null);
  };

  const submit = async () => {
    if (lockedUntil) {
      setError(`Too many failed attempts. Try again in ${remainingSeconds}s.`);
      return;
    }
    if (pin.length < 4 || pin.length > 8) {
      setError('PIN must be 4-8 digits');
      return;
    }
    setBusy(true);
    const result = await decryptMnemonic(store.state.wallet.pinEncryptedMnemonic, pin);
    setBusy(false);
    if (result.success && result.decrypted) {
      pending.resolve(result.decrypted);
      setPending(null);
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setPin('');
    if (nextAttempts >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockedUntil(lockUntil);
      setError(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS}s.`);
    } else {
      setError(
        `Incorrect PIN — ${MAX_ATTEMPTS - nextAttempts} attempt${MAX_ATTEMPTS - nextAttempts === 1 ? '' : 's'} remaining`
      );
    }
  };

  return (
    <Modal title="Enter your PIN to authorize" onClose={cancel}>
      <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--txt-3)', margin: 0 }}>
          This transaction needs your wallet PIN to sign.
        </p>
        <PINInput value={pin} onChange={setPin} error={!!error} />
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
            <AlertTriangle size={15} />
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={cancel} disabled={busy}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={submit}
            disabled={busy || !!lockedUntil || pin.length < 4}
          >
            {busy ? 'Verifying…' : lockedUntil ? `Locked (${remainingSeconds}s)` : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
