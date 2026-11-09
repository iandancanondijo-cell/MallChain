/**
 * The referral half of POST /api/auth/link-wallet.
 *
 * The product rule (owner, 2026-11-09) is that an account earns its referral
 * code — and therefore starts earning commissions — at the moment a wallet is
 * successfully connected, not at signup. The server mints the code in that one
 * handler and reports it in that one response, so this service is the only
 * place the frontend can learn it happened. Five different doors link a wallet
 * (dashboard, wallet hub, send, Mallpoints purchase, settings), which is why
 * the announcement lives here rather than in any one of them: a person who just
 * qualified must not still be looking at a "connect a wallet" notice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_KEY } from './auth';

const post = vi.fn();
const toasts: { text: string; action?: { label: string } }[] = [];

vi.mock('./api', () => ({
  api: {
    post: (...args: unknown[]) => post(...(args as Parameters<typeof post>)),
    get: vi.fn(),
  },
}));

vi.mock('./mnemonicAccess', () => ({
  requestMnemonic: vi.fn().mockResolvedValue('abandon '.repeat(23) + 'about'),
}));

// Signing the ADR-036 link message needs @cosmjs/amino; the values are irrelevant
// to what these tests are about, which is what the service does with the answer.
vi.mock('@cosmjs/amino', () => ({
  makeSignDoc: () => ({}),
  Secp256k1HdWallet: {
    fromMnemonic: async () => ({
      signAmino: async () => ({ signature: { pub_key: { value: 'pubkey-b64' }, signature: 'sig-b64' } }),
    }),
  },
}));
vi.mock('@cosmjs/encoding', () => ({ toBase64: () => 'base64', toUtf8: (x: string) => x }));

vi.mock('../components/ui', () => ({
  toastAction: (text: string, action: { label: string }) => toasts.push({ text, action }),
  toast: (text: string) => toasts.push({ text }),
}));

const ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

describe('authService.linkWallet — referral activation', () => {
  beforeEach(() => {
    post.mockReset();
    toasts.length = 0;
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ authedUntil: Math.floor(Date.now() / 1000) + 3600 }));
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function linkWallet() {
    const { authService } = await import('./auth');
    return authService.linkWallet(ADDRESS);
  }

  it('hands the caller the code the server just issued', async () => {
    post.mockResolvedValue({ ok: true, data: { ok: true, walletAddress: ADDRESS, referralCode: 'MALL-99439042', referralActivated: true } });

    expect(await linkWallet()).toEqual({ ok: true, referralCode: 'MALL-99439042', referralActivated: true });
  });

  it('announces the code once, and only when the server says it was just earned', async () => {
    post.mockResolvedValue({ ok: true, data: { ok: true, walletAddress: ADDRESS, referralCode: 'MALL-99439042', referralActivated: true } });
    await linkWallet();
    expect(toasts.map((t) => t.text)).toEqual(['Referral code MALL-99439042 is now active']);

    // A re-link (new device, rotated wallet) returns the same existing code.
    // Saying "is now active" again would be the second announcement of one event.
    post.mockResolvedValue({ ok: true, data: { ok: true, walletAddress: ADDRESS, referralCode: 'MALL-99439042', referralActivated: false } });
    toasts.length = 0;
    await linkWallet();
    expect(toasts).toEqual([]);
  });

  it('still succeeds quietly for a server that answers without referral fields', async () => {
    post.mockResolvedValue({ ok: true, data: { ok: true, walletAddress: ADDRESS } });

    expect(await linkWallet()).toEqual({ ok: true, referralCode: null, referralActivated: false });
    expect(toasts).toEqual([]);
  });

  it('reports the KYC refusal as its own reason and never claims a code', async () => {
    post.mockResolvedValue({ ok: false, code: 403, error: 'kyc_verification_required' });

    expect(await linkWallet()).toEqual({ ok: false, reason: 'kyc_verification_required' });
    expect(toasts).toEqual([]);
  });
});
