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
import { api, getPinChallengeLock } from '../services/api';
import { config } from '../services/config';
import { authService } from '../services/auth';
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
      // Rate-limit gate (see services/api.ts markPinChallengeLocked): while a
      // recent 429 cool-down is running, the PIN UI must NOT open — the
      // request is rejected without touching this component's local state.
      // (WalletSend also short-circuits before calling requestMnemonic; this
      // is the belt-and-braces half of "the PIN UI must not accept input".)
      if (getPinChallengeLock().locked) {
        req.resolve(null);
        return;
      }
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
    // Rate-limit cool-down that started while this modal was already open:
    // refuse the input without burning a PIN attempt or hitting the verify
    // endpoint — the request cannot do anything useful while limited anyway.
    const rateLock = getPinChallengeLock();
    if (rateLock.locked) {
      setError(
        `PIN entry locked — ${rateLock.reason || 'too many recent operations'} (retry in ${rateLock.retryAfterSeconds}s)`
      );
      return;
    }
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
      // Verify PIN on server first (rate limiting, lockout protection).
      // Deliberately NOT the shared `api` service: its 401 interceptor
      // force-logs-out the whole session on a mistyped PIN (the endpoint
      // answers 401 for wrong PINs), which is worse than showing the error.
      // But it must still match api.ts's URL/CSRF handling: a cookie-authed
      // POST without X-CSRF-Token is rejected 403 by the backend, and the
      // relative '/api/...' path only works behind the Vite dev proxy —
      // against the production static host it 404'd and every attempt,
      // correct PIN included, was reported as "Incorrect PIN".
      const base = config.apiBaseUrl.replace(/\/$/, '');
      const postVerify = async (csrf: string | null) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (csrf) headers['X-CSRF-Token'] = csrf;
        return fetch(`${base}/api/wallet/pin/verify-pin`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ pin }),
          credentials: 'include',
        });
      };
      let verifyResponse = await postVerify(await authService.getCsrfToken());
      if (verifyResponse.status === 403) {
        // The CSRF secret cookie may have rotated mid-session — refresh the
        // token and retry once (same recovery api.ts's performRequest does),
        // otherwise this device would report every PIN as wrong.
        authService.invalidateCsrfToken();
        verifyResponse = await postVerify(await authService.getCsrfToken());
        if (verifyResponse.status === 403) {
          setBusy(false);
          setError('Security check failed — please reload the page and try again.');
          return;
        }
      }

      let verifyData: {
        ok?: boolean; code?: string; valid?: boolean; locked?: boolean;
        remainingTime?: number; attemptsRemaining?: number; error?: string;
      } = {};
      try { verifyData = await verifyResponse.json(); } catch { /* non-JSON body — handled below */ }

      if (!verifyResponse.ok && ![400, 401, 429].includes(verifyResponse.status)) {
        // 404/5xx/HTML error page etc — the service is unreachable, which is
        // NOT the user's PIN being wrong, so don't burn an attempt over it.
        setBusy(false);
        setError('PIN verification service is unreachable — please try again.');
        return;
      }

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
