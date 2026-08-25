/**
 * Orchestrates the on-chain encrypted key-recovery vault: set up a
 * password+TOTP-protected backup of a freshly generated ed25519 key, verify
 * it works, or disable it. Ties together vaultCrypto.ts (all sensitive
 * material, browser-only), vaultApi.ts (reads the stored ciphertext), and
 * vaultTx.ts (signs/broadcasts with the account's own key, which is what
 * authorizes writing to that account's vault record — see msg_signer.go).
 */
import * as vc from './vaultCrypto';
import { getVaultBlob, type VaultBlobInfo } from './vaultApi';
import { setupVault, confirmVault, disableVault } from './vaultTx';

export class VaultRecoveryError extends Error {}

export async function getStatus(address: string): Promise<VaultBlobInfo> {
  return getVaultBlob(address);
}

/** Step 1: registers KDF params and an encrypted TOTP secret. Returns the otpauth:// URI to render as a QR code. */
export async function setupKeyRecovery(opts: {
  mnemonic: string;
  address: string;
  password: string;
  accountName: string;
  issuer?: string;
}): Promise<{ uri: string; secret: string }> {
  if (!opts.password || opts.password.length < 8) {
    throw new VaultRecoveryError('Choose a password of at least 8 characters — it protects your on-chain recovery backup.');
  }

  const salt = vc.generateSalt(16);
  const params = vc.DEFAULT_ARGON2_PARAMS;
  const key = await vc.deriveKey(opts.password, salt, params);

  const { secret, uri } = vc.generateTotpSecret(opts.accountName, opts.issuer || 'Mallchain');
  const { nonce, ciphertext } = await vc.encrypt(new TextEncoder().encode(secret), key);

  await setupVault({
    mnemonic: opts.mnemonic,
    fromAddress: opts.address,
    salt: vc.toBase64(salt),
    kdfTime: params.time,
    kdfMemory: params.memory,
    kdfThreads: params.threads,
    kdfKeyLen: params.keyLen,
    nonceTotp: vc.toBase64(nonce),
    encryptedTotpSecret: vc.toBase64(ciphertext),
  });

  return { uri, secret };
}

/**
 * Step 2: verifies the user actually saved their authenticator entry (by
 * decrypting the just-submitted secret locally and checking a live code),
 * then generates the recovery key and stores it encrypted. The password
 * and TOTP secret never leave this function.
 */
export async function confirmKeyRecovery(opts: { mnemonic: string; address: string; password: string; code: string }): Promise<void> {
  const blob = await getVaultBlob(opts.address);
  if (!blob.found) {
    throw new VaultRecoveryError('No vault setup found for this address yet — start setup first.');
  }
  if (blob.ciphertext) {
    throw new VaultRecoveryError('This vault is already confirmed.');
  }

  const salt = vc.fromBase64(blob.salt);
  const params = { time: blob.kdfTime, memory: blob.kdfMemory, threads: blob.kdfThreads, keyLen: blob.kdfKeyLen };
  const key = await vc.deriveKey(opts.password, salt, params);

  let secretBytes: Uint8Array;
  try {
    secretBytes = await vc.decrypt(vc.fromBase64(blob.nonceTotp), vc.fromBase64(blob.encryptedTotpSecret), key);
  } catch {
    throw new VaultRecoveryError('Incorrect password.');
  }
  const secret = new TextDecoder().decode(secretBytes);
  if (!vc.verifyTotpCode(secret, opts.code)) {
    throw new VaultRecoveryError('Incorrect authenticator code.');
  }

  const keypair = await vc.generateEd25519Keypair();
  const { nonce, ciphertext } = await vc.encrypt(keypair.privateKey, key);

  await confirmVault({
    mnemonic: opts.mnemonic,
    fromAddress: opts.address,
    noncePriv: vc.toBase64(nonce),
    ciphertext: vc.toBase64(ciphertext),
    publicKey: vc.toBase64(keypair.publicKey),
  });
}

/**
 * Self-check: proves the password+TOTP combination actually recovers the
 * stored key, without needing the account's mnemonic at all (this is a
 * read-only chain query plus local decryption — no tx involved). This is
 * exactly what a recovery on a brand-new device would do.
 */
export async function testRecovery(opts: { address: string; password: string; code: string }): Promise<{ ok: true; publicKey: string } | { ok: false; reason: string }> {
  const blob = await getVaultBlob(opts.address);
  if (!blob.found || !blob.ciphertext) {
    return { ok: false, reason: 'No confirmed vault for this address.' };
  }

  const salt = vc.fromBase64(blob.salt);
  const params = { time: blob.kdfTime, memory: blob.kdfMemory, threads: blob.kdfThreads, keyLen: blob.kdfKeyLen };
  const key = await vc.deriveKey(opts.password, salt, params);

  try {
    const secretBytes = await vc.decrypt(vc.fromBase64(blob.nonceTotp), vc.fromBase64(blob.encryptedTotpSecret), key);
    const secret = new TextDecoder().decode(secretBytes);
    if (!vc.verifyTotpCode(secret, opts.code)) {
      return { ok: false, reason: 'Incorrect authenticator code.' };
    }
    const privateKey = await vc.decrypt(vc.fromBase64(blob.noncePriv), vc.fromBase64(blob.ciphertext), key);
    const message = new TextEncoder().encode('vault-recovery-self-test');
    const signature = await vc.signEd25519(message, privateKey);
    const verified = await vc.verifyEd25519(signature, message, vc.fromBase64(blob.publicKey));
    if (!verified) return { ok: false, reason: 'Recovered key does not match the stored public key.' };
    return { ok: true, publicKey: blob.publicKey };
  } catch {
    return { ok: false, reason: 'Incorrect password.' };
  }
}

export async function disableKeyRecovery(opts: { mnemonic: string; address: string }): Promise<void> {
  await disableVault({ mnemonic: opts.mnemonic, fromAddress: opts.address });
}
