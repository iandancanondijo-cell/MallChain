/**
 * Global PIN-challenge modal — the UI half of services/mnemonicAccess.ts.
 * Mount once (App.tsx). Listens for requestMnemonic() calls, prompts the
 * PIN, decrypts store.state.wallet.pinEncryptedMnemonic, and resolves the
 * caller's promise. 3-attempt soft lockout, same pattern as
 * PrivateKeyExport.tsx's own PIN entry.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { store } from '../store/store';
import { decryptMnemonic } from '../services/security';
import { mnemonicRequestBus, type MnemonicRequest } from '../services/mnemonicAccess';
import { Modal } from './ui';
import PINInput from './PINInput';

const MAX_ATTEMPTS = 3;

export function PinChallengeHost() {
  const [pending, setPending] = useState<MnemonicRequest | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fn = (req: MnemonicRequest) => {
      setPending(req);
      setPin('');
      setError(null);
      setAttempts(0);
    };
    mnemonicRequestBus.listeners.add(fn);
    return () => { mnemonicRequestBus.listeners.delete(fn); };
  }, []);

  if (!pending) return null;

  const cancel = () => {
    pending.resolve(null);
    setPending(null);
  };

  const submit = async () => {
    if (attempts >= MAX_ATTEMPTS) {
      setError('Too many failed attempts. Try again in a moment.');
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
    setError(
      nextAttempts >= MAX_ATTEMPTS
        ? 'Too many failed attempts. Try again in a moment.'
        : `Incorrect PIN — ${MAX_ATTEMPTS - nextAttempts} attempt${MAX_ATTEMPTS - nextAttempts === 1 ? '' : 's'} remaining`
    );
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
            disabled={busy || attempts >= MAX_ATTEMPTS || pin.length < 4}
          >
            {busy ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
