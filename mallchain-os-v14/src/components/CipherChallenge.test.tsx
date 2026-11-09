/**
 * What the wallet gate does with the key it is guarding.
 *
 * Three behaviours that used to be wrong in different directions:
 *
 *  1. A pre-secret-gating account — phrase still plaintext in the store, no
 *     ciphertext — reached the "no wallet keys on this device" card, i.e. the
 *     app told people to re-type a phrase the browser was holding, and the only
 *     working migration was a forced redirect out of whatever page they were on.
 *  2. The third wrong cipher answered `locked: true` from the real backend, and
 *     that flag short-circuited into a 5-minute countdown — so the strike
 *     counter never reached zero and the ciphertext stayed on the device.
 *  3. Any non-OK response was treated as "wrong cipher", including the 401
 *     middleware/requireAuth.js returns for an expired session, which spent a
 *     user's strikes for a failure that was never their secret.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CipherChallengeHost } from './CipherChallenge';
import { requestMnemonic } from '../services/mnemonicAccess';
import { store, WALLET_VAULT_STORAGE_KEY } from '../store/store';
import { decryptMnemonic, encryptMnemonic } from '../services/security';
import { notificationFeed } from '../services/notificationFeed';
import { notificationsApi } from '../services/notificationsApi';

const PHRASE = 'scheme menu ridge verify spoon insane unable crouch craft danger file myth yoke browse van obvious purse ridge fog cruise zebra rhythm hat crouch';
const OS_KEY = 'mallchain_os_v1_v14';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function carve(cipher: string) {
  const input = screen.getByLabelText(/Prefer typing/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: cipher } });
  fireEvent.click(screen.getByRole('button', { name: /Load typed cipher/i }));
}

/** The state a signing surface is called with on a legacy, unmigrated account. */
function seedLegacyWallet() {
  const w = store.state.wallet;
  w.address = 'mallchain1qlegacylegacylegacylegacylegxk3';
  w.mnemonic = PHRASE;
  w.pinHash = '';
  w.pinEncryptedMnemonic = '';
  w.secretMode = '';
  w.linkedOnServer = false;
  store.commit();
}

/** A device-raised feed entry by title, newest first, or undefined. */
function deviceEvent(title: RegExp) {
  return notificationFeed.getSnapshot().devices.find((d) => title.test(d.title));
}

describe('CipherChallengeHost', () => {
  beforeEach(() => {
    localStorage.clear();
    notificationFeed.reset();
    // Producers only raise feed events for a signed-in account, and the store
    // is a module singleton — so the previous test's "wallet disconnected"
    // trail would otherwise still be sitting in the feed here.
    store.state.user.authed = true;
    store.state.user.id = 'cipher-test-user';
    // The feed's POST is the server's business, not the wall's. Left unstubbed
    // it would race the shared fetch mock below for an unrelated reason.
    vi.spyOn(notificationsApi, 'send').mockResolvedValue({
      ok: false,
      error: 'feed sync is out of scope here',
      data: { ok: false, skipped: true, reason: 'not sent in this test' },
    });
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false, media: '', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(),
    })));
    seedLegacyWallet();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    notificationFeed.reset();
    store.state.user.authed = false;
    store.state.user.id = '';
    localStorage.clear();
  });

  it('migrates a plaintext phrase to a cipher at the wallet gate, not by moving the user', async () => {
    render(<CipherChallengeHost />);
    const granted = requestMnemonic();

    // The enrollment wall, not the misleading "no keys here" card.
    await screen.findByText(/still sitting unencrypted/i);
    expect(screen.queryByText(/No wallet keys on this device/i)).toBeNull();

    carve('riverstone');
    fireEvent.click(screen.getByRole('button', { name: 'Engrave cipher' }));
    carve('riverstone');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cipher' }));

    // The action that asked for the key goes through with the right phrase.
    await expect(granted).resolves.toBe(PHRASE);

    // And the plaintext is gone — from state, and from what a refresh reads.
    expect(store.state.wallet.mnemonic).toBe('');
    const onDisk = store.readPersistedWalletSecrets();
    expect(onDisk?.secretMode).toBe('cipher');
    const unlocked = await decryptMnemonic(onDisk!.pinEncryptedMnemonic, 'riverstone');
    expect(unlocked.decrypted).toBe(PHRASE);
    expect(JSON.parse(localStorage.getItem(OS_KEY)!).wallet.mnemonic).toBe('');
  }, 30000);

  it('takes the wallet off the device on the third wrong cipher, as the real backend answers', async () => {
    // 401 + attemptsRemaining 2, then 1, then the third failure carries
    // `locked: true` AND `attemptsRemaining: 0`.
    let seen = 0;
    const { granted } = await driveWall(() => {
      seen += 1;
      return seen < 3
        ? jsonResponse(401, { ok: false, error: 'Incorrect PIN', valid: false, locked: false, attemptsRemaining: 3 - seen })
        : jsonResponse(401, { ok: false, error: 'Too many failed attempts. Account locked for 5 minutes.', valid: false, locked: true, remainingTime: 300, attemptsRemaining: 0 });
    }, (n) => screen.findByText(new RegExp(`${3 - n} attempt`)));

    await expectDisconnected(granted);
  }, 30000);

  it('disconnects even when the server reports attempts it does not own', async () => {
    // An unhardened (or differently configured) /verify-pin that keeps saying
    // "plenty left" must not become permission to keep guessing here.
    const { granted } = await driveWall(
      () => jsonResponse(401, { ok: false, valid: false, code: 'invalid_pin', attemptsRemaining: 99 }),
      (n) => screen.findByText(new RegExp(`${3 - n} attempt`)),
    );

    await expectDisconnected(granted);
  }, 30000);

  it('does not spend a strike on a session that ran out mid-unlock', async () => {
    let seen = 0;
    const { granted } = await driveWall(() => {
      seen += 1;
      // middleware/requireAuth.js: bare 401, no `valid`, no attempt count.
      return seen === 2
        ? jsonResponse(401, { error: 'invalid token' })
        : jsonResponse(401, { ok: false, valid: false, attemptsRemaining: 99 });
    }, undefined, 2);

    expect(await screen.findByText(/session ran out/i)).toBeTruthy();
    // One wrong cipher counted; the session failure did not, so the wallet is
    // still here with two strikes in reserve.
    expect(store.state.wallet.pinEncryptedMnemonic).not.toBe('');
    expect(store.state.wallet.address).not.toBe('');
    expect(deviceEvent(/disconnected/i)).toBeUndefined();

    // Closing the wall is a cancel, not a verdict — nothing was ever burned.
    fireEvent.click(screen.getByRole('button', { name: /×|close/i }));
    await expect(granted).resolves.toBeNull();
  }, 30000);

  /** Type wrong ciphers at the wall, awaiting `afterStrike` between them. */
  async function driveWall(onVerify: () => Response, afterStrike?: (n: number) => Promise<unknown>, strikes = 3) {
    const encrypted = await encryptMnemonic(PHRASE, 'riverstone');
    const w = store.state.wallet;
    w.mnemonic = '';
    w.pinEncryptedMnemonic = encrypted.encrypted!;
    w.pinHash = '$2b$10$localhashplaceholderlocalhashplaceholderlocalhashplac';
    w.secretMode = 'cipher';
    w.address = 'mallchain1qlegacylegacylegacylegacylegxk3';
    w.linkedOnServer = true;
    store.commit();

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes('/verify-pin')
        ? onVerify()
        : jsonResponse(200, { ok: true, csrfToken: 'test-csrf' })
    )));

    render(<CipherChallengeHost />);
    const granted = requestMnemonic();
    await screen.findByText(/Tap the glyphs of the cipher/i);

    for (let i = 1; i <= strikes; i += 1) {
      carve(`zzzz${i}`);
      fireEvent.click(screen.getByRole('button', { name: /Unlock/i }));
      if (i < strikes && afterStrike) await afterStrike(i);
      // Give an unsettled strike (no follow-up text to wait on) its chance to
      // render before the next carve, the way a real finger does.
      else if (i < strikes) await new Promise((r) => setTimeout(r, 0));
    }
    // Wrapped, so `await driveWall(...)` cannot resolve the wallet promise for
    // the caller — the test has to decide when to look at it.
    return { granted };
  }

  async function expectDisconnected(granted: Promise<string | null>) {
    await expect(granted).resolves.toBeNull();
    await waitFor(() => expect(store.state.wallet.pinEncryptedMnemonic).toBe(''));
    expect(store.state.wallet.pinHash).toBe('');
    expect(store.state.wallet.address).toBe('');
    expect(store.state.wallet.secretMode).toBe('');
    expect(store.state.wallet.linkedOnServer).toBe(false);
    // Nothing is left behind to unlock a second time, and no countdown to sit
    // out waiting for another guess.
    expect(store.readPersistedWalletSecrets()).toBeNull();
    expect(localStorage.getItem(WALLET_VAULT_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText(/Account locked for/i)).toBeNull();
    // The disconnect is announced on the live feed, not to a private array in
    // the store. Deferred for the circular-import reason in store.ts, so wait
    // for the feed module to arrive rather than assert on a tick.
    await waitFor(() => expect(deviceEvent(/disconnected after 3 failed verifications/i)).toBeTruthy());
    expect(deviceEvent(/disconnected/i)!.kind).toBe('system');
  }
});
