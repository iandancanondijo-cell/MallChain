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
import { decryptMnemonic, verifyPin } from '../services/security';
import { api } from '../services/api';
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
    const encrypted = store.state.wallet.pinEncryptedMnemonic;
    // Distinguish "no wallet data on this device" from "wrong PIN".
    // Before the store fix that persisted pinEncryptedMnemonic, every
    // attempt after a browser refresh failed with a generic
    // "Failed to decrypt mnemonic. Verify PIN is correct." — and the
    // modal then escalated it to "wrong PIN — N attempts remaining",
    // eventually locking the user out for 60s. The actual problem was
    // never their PIN; it was that the ciphertext wasn't there to
    // decrypt. Surface that case as a recovery instruction instead,
    // and DON'T count it against the PIN-attempt budget.
    if (!encrypted) {
      setError(
        'No encrypted wallet on this device. Use "Restore from 24-word phrase" in the wallet menu to re-import your wallet, then set a new PIN.'
      );
      return;
    }
    setBusy(true);
    
    try {
      // Verify PIN on server first (rate limiting, lockout protection)
      const verifyResponse = await fetch('/api/wallet/pin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'include',
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        // Server-side lockout or too many attempts
        if (verifyData.locked) {
          const lockUntil = Date.now() + (verifyData.remainingTime || 300) * 1000;
          setLockedUntil(lockUntil);
          setError(`Account locked for ${verifyData.remainingTime || 300} seconds. Too many failed attempts.`);
          setPin('');
          setBusy(false);
          return;
        }

        // Accounts created before PIN-hash syncing existed have no
        // server-side copy — the backend answers "No PIN set" (400), which
        // used to be shown as "Incorrect PIN" and blocked every send even
        // with the right PIN. Fall back to local bcrypt verification against
        // st.wallet.pinHash, and backfill the hash to the server on success
        // so future checks get rate limiting (self-heals per device).
        if (verifyData.code === 'no_pin_set') {
          const localHash = store.state.wallet.pinHash;
          if (!localHash) {
            setBusy(false);
            setPin('');
            setError('No PIN record found on this device. Restore your wallet or set a new PIN in Security settings.');
            return;
          }
          const localOk = await verifyPin(pin, localHash);
          if (!localOk.success || !localOk.valid) {
            const nextAttempts = attempts + 1;
            setAttempts(nextAttempts);
            setPin('');
            setBusy(false);
            const left = MAX_ATTEMPTS - nextAttempts;
            if (left <= 0) {
              setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
              setError(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS}s.`);
            } else {
              setError(`Incorrect PIN — ${left} attempt${left === 1 ? '' : 's'} remaining`);
            }
            return;
          }
          api.post('/api/wallet/pin/set-pin', { pinHash: localHash }).then((r) => {
            if (!r.ok) console.warn('[PinChallenge] PIN hash backfill failed:', r.error);
          });
          const fallbackResult = await decryptMnemonic(encrypted, pin);
          setBusy(false);
          if (fallbackResult.success && fallbackResult.decrypted) {
            pending.resolve(fallbackResult.decrypted);
            setPending(null);
            return;
          }
          setError('Failed to decrypt wallet. Please try again.');
          setPin('');
          return;
        }

        // PIN verification failed
        const attemptsLeft = verifyData.attemptsRemaining || (MAX_ATTEMPTS - attempts - 1);
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setPin('');
        
        if (attemptsLeft <= 0) {
          const lockUntil = Date.now() + (verifyData.remainingTime || 300) * 1000;
          setLockedUntil(lockUntil);
          setError(`Too many failed attempts. Try again in ${verifyData.remainingTime || 300}s.`);
        } else {
          setError(
            `Incorrect PIN — ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining`
          );
        }
        setBusy(false);
        return;
      }

      // PIN verified on server, now decrypt locally with verified PIN
      const result = await decryptMnemonic(encrypted, pin);
      setBusy(false);
      
      if (result.success && result.decrypted) {
        pending.resolve(result.decrypted);
        setPending(null);
        return;
      }

      // Decryption failed (shouldn't happen if PIN is correct)
      setError('Failed to decrypt wallet. Please try again.');
      setPin('');
    } catch (err) {
      setBusy(false);
      console.error('PIN verification error:', err);
      setError('PIN verification error. Please check your connection and try again.');
    }
  };

  return (
    <Modal title="Enter your PIN to authorize" onClose={cancel}>
      <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--txt-3)', margin: 0 }}>
          This transaction needs your wallet PIN to sign.
        </p>
        <PINInput value={pin} onChange={setPin} error={!!error} autoFocus={true} />
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
