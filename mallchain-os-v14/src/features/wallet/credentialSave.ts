/**
 * The single path that writes a wallet's key material under a secret.
 *
 * WalletFlow, CipherChallenge and SecuritySettings each hashed, encrypted,
 * mutated `st.wallet` and committed, then reported success on the strength of
 * the in-memory object alone. Two things could — and did — go wrong silently:
 *
 *  1. `store.persistMainStore()` swallows a failed `localStorage.setItem`
 *     (quota, private mode, a policy-locked browser). The write never lands,
 *     so after a refresh the ciphertext is missing or is the previous one,
 *     and every later unlock reports "wrong cipher" about a credential that
 *     was never saved.
 *  2. The bytes that went into the ciphertext are never compared with the
 *     bytes the secret can get back out, so a secret that cannot unlock its
 *     own wallet could be set — and only discovered when it mattered.
 *
 * So the proof here is exactly the round trip the user will perform later:
 * re-read the persisted ciphertext from disk, derive the key from the secret,
 * decrypt, and demand the original phrase back. Cost is one bcrypt hash plus
 * two 250k-iteration PBKDF2 derivations — under a second on a laptop, a few
 * seconds on a phone, which is affordable for the one moment a credential is
 * created and no other.
 */
import { store } from '../../store/store';
import { api } from '../../services/api';
import { decryptMnemonic, encryptMnemonic, hashPin, validateWalletSecret } from '../../services/security';

export type CredentialStage = 'phrase' | 'format' | 'hash' | 'encrypt' | 'persist' | 'unlock';
export type CredentialSaveResult = { ok: true } | { ok: false; stage: CredentialStage; error: string };

export async function saveWalletCredential(
  mnemonic: string,
  secret: string,
): Promise<CredentialSaveResult> {
  if (!mnemonic || mnemonic.trim().length === 0) {
    return { ok: false, stage: 'phrase', error: 'This device is not holding a recovery phrase to secure, so nothing was changed. Reconnect the wallet first.' };
  }
  if (!validateWalletSecret(secret)) {
    return { ok: false, stage: 'format', error: 'That is neither a 4-8 digit PIN nor a 4-12 glyph cipher, so nothing was saved. Pick a secret in one of those shapes.' };
  }

  const hashResult = await hashPin(secret);
  if (!hashResult.success || !hashResult.hash) {
    return { ok: false, stage: 'hash', error: `Could not record the secret: ${hashResult.error || 'the hashing step failed'}. Nothing was changed.` };
  }

  const encryptResult = await encryptMnemonic(mnemonic.trim(), secret);
  if (!encryptResult.success || !encryptResult.encrypted) {
    return { ok: false, stage: 'encrypt', error: `Could not encrypt the phrase: ${encryptResult.error || 'this browser denied the crypto operation'}. Nothing was changed.` };
  }

  const st = store.state.wallet;
  const previous = { pinHash: st.pinHash, pinEncryptedMnemonic: st.pinEncryptedMnemonic, secretMode: st.secretMode };
  st.pinHash = hashResult.hash;
  st.pinEncryptedMnemonic = encryptResult.encrypted;
  // Digits stay the legacy PIN mode; only a glyph sequence is a cipher — the
  // same split services/security.ts validates on.
  st.secretMode = /^\d+$/.test(secret) ? '' : 'cipher';
  store.commit();

  const onDisk = store.readPersistedWalletSecrets();
  if (!onDisk) {
    restoreWalletSecrets(st, previous);
    return { ok: false, stage: 'persist', error: 'This browser refused to store the wallet, so the new secret protects nothing. Export the recovery phrase, free up browser storage (or leave private mode), then set the secret again.' };
  }
  if (onDisk.pinEncryptedMnemonic !== encryptResult.encrypted || onDisk.pinHash !== hashResult.hash) {
    restoreWalletSecrets(st, previous);
    return { ok: false, stage: 'persist', error: 'What the browser saved does not match what was just created — another tab is holding this wallet. Close it and set the secret again.' };
  }

  const roundTrip = await decryptMnemonic(onDisk.pinEncryptedMnemonic, secret);
  if (!roundTrip.success || roundTrip.decrypted !== mnemonic.trim()) {
    restoreWalletSecrets(st, previous);
    return { ok: false, stage: 'unlock', error: roundTrip.error
      ? `The saved copy could not be unlocked: ${roundTrip.error}`
      : 'The saved copy could not be unlocked with the secret you just set, so it was rolled back. Set the secret again.' };
  }

  // Proven on this device — now safe to drop the legacy plaintext field.
  st.mnemonic = '';
  store.commit();

  // Mirror the hash so /api/wallet/pin/verify-pin can rate-limit brute force
  // server-side too. Best-effort: an offline device still holds a working,
  // verified local secret, so this is a warning and never a rollback.
  api.post('/api/wallet/pin/set-pin', { pinHash: hashResult.hash }).then((r) => {
    if (r.ok) return;
    // kyc_verification_required here means the doors let a wallet through on a
    // verdict that has since changed (or a restore the server read differently).
    // The local secret is still real and still unlocks — what is missing is the
    // server-side lockout, so say that instead of one generic line.
    console.warn('[credentialSave] secret-hash sync to server failed:', r.error,
      r.code === 403
        ? '— only this device can now throttle wrong guesses for this wallet'
        : '');
  });

  return { ok: true };
}

function restoreWalletSecrets(
  st: { pinHash: string; pinEncryptedMnemonic: string; secretMode: '' | 'cipher' },
  previous: { pinHash: string; pinEncryptedMnemonic: string; secretMode: '' | 'cipher' },
): void {
  st.pinHash = previous.pinHash;
  st.pinEncryptedMnemonic = previous.pinEncryptedMnemonic;
  st.secretMode = previous.secretMode;
  store.commit();
}
