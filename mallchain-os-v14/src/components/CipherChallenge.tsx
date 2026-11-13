/**
 * Global Cipher-Wall challenge modal — the UI half of services/mnemonicAccess.ts,
 * and the successor of the old PinChallenge. Mount once (App.tsx).
 *
 * Listens for requestMnemonic() calls and answers them with the Crypt Cipher
 * Wall instead of a numeric keypad: the user taps the glyph sequence they
 * engraved for this wallet, the server bcrypt-verifies it (same rate-limited
 * /api/wallet/pin/verify-pin endpoint and PinAttempt lockout as before —
 * digits-only legacy PINs still verify, so nothing breaks mid-migration),
 * and the moment it passes the mnemonic is decrypted locally and resolved
 * back to the caller, which proceeds instantly (a Send, stake, vote… fires
 * the moment the cipher is right).
 *
 * Three states beyond the wall itself:
 *  - No key material on this device (fresh browser / post-logout) → an
 *    actionable "connect wallet" card instead of the old misleading
 *    "Incorrect PIN" cascade. This is the "no wallet connected even though
 *    I connected it" fix: the /me boot seed sets st.wallet.address only, so
 *    every signing surface used to hit a vague toast. Now the ONE place that
 *    knows whether the secrets exist explains what to do about it.
 *  - Legacy numeric-PIN wallet that wants to switch: "unlock with your old
 *    PIN and engrave a cipher" migration (verify PIN → decrypt → CipherSetup
 *    → re-encrypt under the cipher → mirror hash to server).
 *  - Pre-secret-gating wallet whose phrase is still plaintext on this device:
 *    straight to CipherSetup — there is no old secret to verify — and the
 *    plaintext is destroyed only once the new cipher provably opens the copy
 *    on disk. This is the whole migration surface; the app does not interrupt
 *    navigation over it, because the cipher guards the wallet, not the UI.
 *  - Server says "no PIN hash stored" for an account whose local secret
 *    exists → local bcrypt fallback + one-time backfill (self-heals per
 *    device, same as PinChallenge did).
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Wallet } from 'lucide-react';
import { store } from '../store/store';
import { decryptMnemonic, verifyPin } from '../services/security';
import { api, getPinChallengeLock } from '../services/api';
import { config } from '../services/config';
import { authService } from '../services/auth';
import { mnemonicRequestBus, type MnemonicRequest } from '../services/mnemonicAccess';
import { Modal, toast } from './ui';
import PINInput from './PINInput';
import { CipherWall, CipherSetup } from './CipherWall';
import { saveWalletCredential } from '../features/wallet/credentialSave';

/** Verifications a session may mis-type before the wallet comes off this device. */
const MAX_ATTEMPTS = 3;

type Phase = 'wall' | 'legacy' | 'setup' | 'no_wallet';

export function CipherChallengeHost() {
  const [pending, setPending] = useState<MnemonicRequest | null>(null);
  const [phase, setPhase] = useState<Phase>('wall');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);
  // Held only between the legacy-PIN unlock and the cipher enrollment;
  // dropped the moment the request resolves.
  const migrationMnemonicRef = useRef<string | null>(null);
  // Snapshot of what this device holds, taken when the modal opens.
  const deviceStateRef = useRef({ hasCiphertext: false, isCipher: false });

  useEffect(() => {
    const fn = (req: MnemonicRequest) => {
      // Rate-limit gate (see services/api.ts markPinChallengeLocked): while a
      // recent 429 cool-down is running, the cipher UI must NOT open — the
      // request is rejected without touching this component's local state.
      if (getPinChallengeLock().locked) {
        req.resolve(null);
        return;
      }
      const st = store.state.wallet;
      deviceStateRef.current = {
        hasCiphertext: !!st.pinEncryptedMnemonic,
        isCipher: st.secretMode === 'cipher',
      };
      // Accounts predating secret-gating hold the phrase in plaintext with
      // nothing to unlock. Rather than send them through the connect flow to
      // re-type a phrase this browser already has, go straight to cipher
      // enrollment: `saveWalletCredential` encrypts under the new cipher,
      // proves the copy on disk opens with it, and only then wipes the
      // plaintext field.
      const legacyPlaintext = !deviceStateRef.current.hasCiphertext && st.mnemonic
        ? st.mnemonic
        : null;
      setPhase(legacyPlaintext ? 'setup' : deviceStateRef.current.hasCiphertext ? 'wall' : 'no_wallet');
      setPending(req);
      setPin('');
      setError(null);
      setAttempts(0);
      setBusy(false);
      setLockedUntil(null);
      setRemainingSeconds(0);
      migrationMnemonicRef.current = legacyPlaintext;
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
          // Attempts are NOT reset here. This timer is the server's
          // brute-force cool-down, not a fresh set of guesses: a session that
          // has already mis-typed the secret still has only the strikes it has
          // left, so a slow verification service cannot buy an attacker more
          // tries. The counter resets when the modal opens for a new request.
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
    migrationMnemonicRef.current = null;
  };

  /**
   * One failed verification. A wrong secret is the only thing that can burn a
   * strike — unreachable services and CSRF rotations return before this.
   *
   * On the third one the wallet comes off this device instead of waiting out a
   * timer: see store.disconnectWalletAfterFailedVerifications(). No countdown
   * here means nobody can sit at a locked screen and trickle guesses in, and
   * nobody inherits your key material.
   */
  const burnAttempt = (serverRemaining?: number) => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    // The server's count and this device's bound different things: /verify-pin
    // rate-limits the account, while these strikes decide how long this browser
    // keeps offering someone's key material to guesses. The stricter number
    // wins, so a lenient (or default-configured) server can never buy extra
    // attempts on this device, and an earlier server lockout is still honoured.
    const localLeft = MAX_ATTEMPTS - nextAttempts;
    const left = typeof serverRemaining === 'number' ? Math.min(serverRemaining, localLeft) : localLeft;
    if (left > 0) {
      setError(`Wrong cipher — ${left} attempt${left === 1 ? '' : 's'} left before this device disconnects the wallet`);
      return;
    }
    setBusy(false);
    pending.resolve(null);
    setPending(null);
    migrationMnemonicRef.current = null;
    store.disconnectWalletAfterFailedVerifications();
    toast('Wallet disconnected after 3 failed verifications — reconnect with your recovery phrase', false);
    window.location.hash = '#/wallet/connect';
  };

  /**
   * Verify a secret (cipher glyph-string or legacy digit PIN — the backend
   * now accepts both) against the server, then decrypt locally. Shared by
   * the wall submit, the legacy PIN path and the no_pin_set fallback.
   */
  const verifyAndUnlock = async (secret: string): Promise<boolean> => {
    const encrypted = store.state.wallet.pinEncryptedMnemonic;
    const base = config.apiBaseUrl.replace(/\/$/, '');
    const postVerify = async (csrf: string | null) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrf) headers['X-CSRF-Token'] = csrf;
      return fetch(`${base}/api/wallet/pin/verify-pin`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pin: secret }),
        credentials: 'include',
      });
    };
    let verifyResponse = await postVerify(await authService.getCsrfToken());
    if (verifyResponse.status === 403) {
      // The CSRF secret cookie may have rotated mid-session — refresh the
      // token and retry once (same recovery api.ts's performRequest does),
      // otherwise this device would report every cipher as wrong.
      authService.invalidateCsrfToken();
      verifyResponse = await postVerify(await authService.getCsrfToken());
      if (verifyResponse.status === 403) {
        setBusy(false);
        setError('Security check failed — please reload the page and try again.');
        return false;
      }
    }

    let verifyData: {
      ok?: boolean; code?: string; valid?: boolean; locked?: boolean;
      remainingTime?: number; attemptsRemaining?: number; error?: string;
    } = {};
    try { verifyData = await verifyResponse.json(); } catch { /* non-JSON body — handled below */ }

    if (!verifyResponse.ok && ![400, 401, 429].includes(verifyResponse.status)) {
      // 404/5xx/HTML error page etc — the service is unreachable, which is
      // NOT the user's cipher being wrong, so don't burn an attempt over it.
      setBusy(false);
      setError('Verification service is unreachable — please try again.');
      return false;
    }

    if (!verifyResponse.ok) {
      // Branch on the server's `code`, which is the contract: routes/walletPin.js
      // advertises invalid_secret / no_pin_set / secret_locked / invalid_secret_format
      // and middleware/requireAuth.js answers an expired session with
      // session_expired. This used to be inferred from which fields happened
      // to be present (`valid === false || typeof attemptsRemaining === 'number'`),
      // and inference is why a session that ran out mid-unlock could be
      // charged as a wrong cipher: the two 401s were only distinguishable by
      // what was *not* in the body. Only 'invalid_secret' — "this secret was
      // compared and rejected" — may burn a strike.
      const code = verifyData.code;

      if (code === 'session_expired') {
        setBusy(false);
        setError('Your session ran out before the wallet could be checked — sign in again, then unlock. This was not counted against your cipher.');
        return false;
      }

      // The cool-down is checked before anything else, because in it nothing
      // was compared: 429 + `secret_locked` is a previous streak's timer, so
      // it neither burns a strike nor belongs in the generic "the service did
      // not check your cipher" reply — that one drops the countdown, which is
      // the only thing telling the person how long to wait. A `locked` flag
      // arriving with 429 means the same thing on a server that predates the
      // code.
      //
      // The opposite case — 401 carrying BOTH `locked: true` and
      // `code: 'invalid_secret'` (the backend's third failure) — is a strike,
      // because that secret *was* evaluated; it reaches the tail of this block.
      if (code === 'secret_locked' || (verifyData.locked && verifyResponse.status === 429)) {
        setLockedUntil(Date.now() + (verifyData.remainingTime || 300) * 1000);
        setError(`Account locked for ${verifyData.remainingTime || 300} seconds. Too many failed attempts.`);
        setBusy(false);
        return false;
      }

      const wasCompared = code === 'invalid_secret' || code === 'no_pin_set';
      if (!wasCompared) {
        setBusy(false);
        setError(`The wallet service did not check your cipher (${verifyData.error || verifyData.code || `HTTP ${verifyResponse.status}`}) — this was not counted against it.`);
        return false;
      }

      if (verifyData.code === 'no_pin_set') {
        // Accounts created before server-hash syncing existed have no
        // server-side copy — fall back to local bcrypt verification against
        // st.wallet.pinHash and backfill on success (self-heals per device).
        const localHash = store.state.wallet.pinHash;
        if (!localHash) {
          setBusy(false);
          setError('No wallet secret record found on this device. Restore your wallet or set a new cipher in Security settings.');
          return false;
        }
        const localOk = await verifyPin(secret, localHash);
        if (!localOk.success || !localOk.valid) {
          setBusy(false);
          burnAttempt();
          return false;
        }
        api.post('/api/wallet/pin/set-pin', { pinHash: localHash }).then((r) => {
          if (!r.ok) console.warn('[CipherChallenge] secret-hash backfill failed:', r.error);
        });
        const fallbackResult = await decryptMnemonic(encrypted, secret);
        setBusy(false);
        if (fallbackResult.success && fallbackResult.decrypted) {
          migrationMnemonicRef.current = fallbackResult.decrypted;
          return true;
        }
        setError('Failed to decrypt wallet. Please try again.');
        return false;
      }

      // Wrong secret (401) — server tells us how many attempts are left.
      setBusy(false);
      burnAttempt(typeof verifyData.attemptsRemaining === 'number' ? verifyData.attemptsRemaining : undefined);
      return false;
    }

    // Verified server-side; decrypt locally with the same secret.
    const result = await decryptMnemonic(encrypted, secret);
    setBusy(false);
    if (result.success && result.decrypted) {
      migrationMnemonicRef.current = result.decrypted;
      return true;
    }
    // The server's hash matches this secret but the local ciphertext was
    // made with a different one (e.g. hash synced from another device).
    setError("This device's wallet data doesn't match your account's secret. Use \"Connect existing wallet\" to re-import your recovery phrase here.");
    return false;
  };

  const onWallSubmit = async (cipher: string) => {
    const rateLock = getPinChallengeLock();
    if (rateLock.locked) {
      setError(`Wallet unlock locked — ${rateLock.reason || 'too many recent operations'} (retry in ${rateLock.retryAfterSeconds}s)`);
      return;
    }
    if (lockedUntil) {
      setError(`Too many failed attempts. Try again in ${remainingSeconds}s.`);
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await verifyAndUnlock(cipher);
    if (!ok) return;
    // Straight unlock — hand the mnemonic back and let the caller proceed
    // instantly (this is what makes "tap the right glyphs → MALLCNS fly").
    // A legacy PIN keyed in as digits on the wall unlocks the same way;
    // migrating it to a cipher is the optional "Unlock with your old PIN"
    // path below the wall, never forced mid-action.
    const mnemonic = migrationMnemonicRef.current;
    migrationMnemonicRef.current = null;
    pending.resolve(mnemonic);
    setPending(null);
  };

  const onLegacyPinSubmit = async () => {
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4-8 digits');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await verifyAndUnlock(pin);
    if (!ok) return;
    setPhase('setup');
  };

  const onCipherEnrolled = async (cipher: string) => {
    const mnemonic = migrationMnemonicRef.current;
    if (!mnemonic) {
      setError('Migration session expired — try again.');
      setPhase('wall');
      return;
    }
    setBusy(true);
    try {
      // Save-and-prove (features/wallet/credentialSave.ts): the cipher is only
      // accepted once the copy on disk unlocks with it, so this modal can no
      // longer report success for a secret that would fail on the next visit.
      const saved = await saveWalletCredential(mnemonic, cipher);
      if (!saved.ok) {
        setError(saved.error);
        setBusy(false);
        return;
      }
      migrationMnemonicRef.current = null;
      pending.resolve(mnemonic);
      setPending(null);
    } catch (error) {
      setError(`Could not secure the wallet with the new cipher: ${error instanceof Error ? error.message : 'unexpected error'}`);
      setBusy(false);
    }
  };

  const gotoConnect = () => {
    pending.resolve(null);
    setPending(null);
    window.location.hash = '#/wallet/connect';
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (phase === 'no_wallet') {
    return (
      <Modal title="No wallet keys on this device" onClose={cancel}>
        <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--txt-2)', fontSize: 13 }}>
            <Wallet size={18} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <p style={{ margin: 0 }}>
              You're signed in{store.state.wallet.address ? `, and your address (${store.state.wallet.address.slice(0, 10)}…) is loaded` : ''},
              but a wallet's signing keys live <strong>only on the device that created it</strong> — this browser doesn't hold them
              (a logout, or a fresh device, clears them by design).
            </p>
          </div>
          {/* Was a single "Import your 24-word recovery phrase" line, which
              assumed this account has a phrase to import. An account that has
              not created a wallet yet — possible on any device, since KYC
              gates creation — has nothing to import, and the screen this
              button leads to offers both paths. */}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--txt-3)' }}>
            If this wallet already exists, import its 24-word recovery phrase here — no network call, no risk of
            losing funds — and sending unlocks immediately. If you have not created a wallet yet, you can create
            one on the next screen.
          </p>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
              <AlertTriangle size={15} />{error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={cancel}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={gotoConnect}>Create or connect wallet</button>
          </div>
        </div>
      </Modal>
    );
  }

  if (phase === 'legacy') {
    return (
      <Modal title="Unlock with your old PIN" onClose={cancel}>
        <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--txt-3)', margin: 0 }}>
            Enter the 4-8 digit PIN this wallet was secured with — next you'll choose your cipher glyphs, and the PIN is retired for good.
          </p>
          <PINInput value={pin} onChange={setPin} error={!!error} autoFocus={true} />
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
              <AlertTriangle size={15} />{error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setPhase('wall'); setError(null); }} disabled={busy}>Back to wall</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={onLegacyPinSubmit} disabled={busy || !!lockedUntil || pin.length < 4}>
              {busy ? 'Verifying…' : lockedUntil ? `Locked (${remainingSeconds}s)` : 'Unlock & switch'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (phase === 'setup') {
    // The legacy path reaches this without ever unlocking anything: the
    // phrase was already readable on this device, so there is no secret to
    // verify first — only a cipher to engrave over it.
    const isLegacySweep = !deviceStateRef.current.hasCiphertext;
    return (
      <Modal title="Choose your cipher" onClose={cancel} wide>
        <div style={{ padding: '4px 4px 8px' }}>
          {isLegacySweep && (
            <p style={{ fontSize: 13, color: 'var(--txt-3)', margin: '0 0 12px' }}>
              This wallet's recovery phrase is still sitting unencrypted in this browser. Choose a cipher — the phrase gets sealed under it and the plaintext copy is destroyed. Nothing is saved until a test unlock with the new cipher actually opens it.
            </p>
          )}
          <CipherSetup onSubmit={onCipherEnrolled} busy={busy} error={error} />
        </div>
      </Modal>
    );
  }

  // phase === 'wall'
  return (
    <Modal title="Unlock your wallet at the cipher wall" onClose={cancel} wide>
      <div style={{ padding: '4px 4px 8px' }}>
        <CipherWall
          actionLabel="Unlock"
          subtitle={busy ? undefined : 'Tap the glyphs of the cipher you engraved for this wallet, in order. When it matches, the action goes through instantly.'}
          onSubmit={onWallSubmit}
          busy={busy}
          locked={!!lockedUntil}
          error={error || (lockedUntil ? `Locked — retry in ${remainingSeconds}s` : null)}
          footer={
            !deviceStateRef.current.isCipher ? (
              <div style={{ fontSize: 12, color: 'var(--txt-3)', textAlign: 'center' }}>
                Set up with a numeric PIN before?{' '}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => { setPhase('legacy'); setError(null); }}
                  disabled={busy || !!lockedUntil}
                >
                  Unlock with your old PIN
                </button>
                {' '}and switch to a cipher.
              </div>
            ) : undefined
          }
        />
      </div>
    </Modal>
  );
}

export default CipherChallengeHost;
