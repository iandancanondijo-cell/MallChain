/**
 * The save-and-prove contract in credentialSave.ts.
 *
 * These tests exist because the old failure was invisible: three screens
 * assigned `st.wallet.pinEncryptedMnemonic` and reported success while the
 * browser had refused the write underneath, so the user's next unlock said
 * "wrong cipher" about a secret that had never been stored. The only assertion
 * that matters is therefore the one the user performs later — read what is on
 * disk, unlock it with the secret, get the original phrase back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { store } from '../../store/store';
import { decryptMnemonic } from '../../services/security';
import { saveWalletCredential } from './credentialSave';

const PHRASE = 'scheme menu ridge verify spoon insane unable crouch craft danger file myth yoke browse van obvious purse ridge fog cruise zebra rhythm hat crouch';
const OS_KEY = 'mallchain_os_v1_v14';

function walletFields() {
  const w = store.state.wallet;
  return { pinHash: w.pinHash, pinEncryptedMnemonic: w.pinEncryptedMnemonic, secretMode: w.secretMode, mnemonic: w.mnemonic };
}

/** The browser saying no to localStorage is the whole failure mode; happy-dom
 * keeps `setItem` as an own property of its window's storage, so it is mocked
 * there rather than on Storage.prototype. */
function blockWrites() {
  return vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new DOMException('QuotaExceededError');
  });
}

describe('saveWalletCredential', () => {
  beforeEach(() => {
    localStorage.clear();
    store.state.wallet.pinHash = '';
    store.state.wallet.pinEncryptedMnemonic = '';
    store.state.wallet.secretMode = '';
    store.state.wallet.mnemonic = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('persists a ciphertext that the new secret actually unlocks', async () => {
    const saved = await saveWalletCredential(PHRASE, 'riverstone19');
    expect(saved).toEqual({ ok: true });

    const onDisk = store.readPersistedWalletSecrets();
    expect(onDisk?.pinEncryptedMnemonic).toBe(store.state.wallet.pinEncryptedMnemonic);
    expect(onDisk?.secretMode).toBe('cipher');

    const unlocked = await decryptMnemonic(onDisk!.pinEncryptedMnemonic, 'riverstone19');
    expect(unlocked.decrypted).toBe(PHRASE);
  });

  it('rolls back and says so when the browser refuses the write', async () => {
    const before = walletFields();
    const setItem = blockWrites();

    const saved = await saveWalletCredential(PHRASE, '4819');
    setItem.mockRestore();

    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.stage).toBe('persist');
    // The claim "nothing was changed" is checked, not assumed.
    expect(walletFields()).toEqual(before);
    expect(store.readPersistedWalletSecrets()).toBeNull();
  });

  it('rejects a secret no unlock path would accept, before touching anything', async () => {
    const before = walletFields();
    // Two glyphs is under the wall's minimum, and 123456 is a straight run —
    // both are rejected here and by every later unlock, so neither can be
    // saved and then blamed on the user.
    expect((await saveWalletCredential(PHRASE, 'wi')).ok).toBe(false);
    expect((await saveWalletCredential(PHRASE, '123456')).ok).toBe(false);
    expect(walletFields()).toEqual(before);
  });

  it('refuses to report success when a second tab overwrote the copy', async () => {
    const realSet = localStorage.setItem.bind(localStorage);
    let first = true;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === OS_KEY && first) {
        first = false;
        // Another tab's payload wins the race for the same key.
        return realSet(key, JSON.stringify({ version: 14, wallet: { pinEncryptedMnemonic: 'other.salt.iv', pinHash: '$2b$other', secretMode: 'cipher' } }));
      }
      return realSet(key, value);
    });

    const saved = await saveWalletCredential(PHRASE, 'northglass7');
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.stage).toBe('persist');
    expect(store.state.wallet.pinEncryptedMnemonic).toBe('');
  });

  it('keeps a digits-only secret in the legacy PIN mode, not the cipher mode', async () => {
    const saved = await saveWalletCredential(PHRASE, '13579246');
    expect(saved.ok).toBe(true);
    expect(store.state.wallet.secretMode).toBe('');
    expect(store.readPersistedWalletSecrets()?.secretMode).toBe('');
    const unlocked = await decryptMnemonic(store.state.wallet.pinEncryptedMnemonic, '13579246');
    expect(unlocked.decrypted).toBe(PHRASE);
  });

  it('clears the legacy plaintext mnemonic only once the new copy is proven', async () => {
    store.state.wallet.mnemonic = PHRASE;
    const setItem = blockWrites();
    const failed = await saveWalletCredential(PHRASE, '13579246');
    expect(failed.ok).toBe(false);
    expect(store.state.wallet.mnemonic).toBe(PHRASE);
    setItem.mockRestore();

    const ok = await saveWalletCredential(PHRASE, '13579246');
    expect(ok.ok).toBe(true);
    expect(store.state.wallet.mnemonic).toBe('');
  });

  it('will not secure an empty phrase', async () => {
    const saved = await saveWalletCredential('   ', '13579246');
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.stage).toBe('phrase');
  });
});
