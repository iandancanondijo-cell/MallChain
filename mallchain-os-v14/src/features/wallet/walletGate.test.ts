/**
 * The wallet gate is the product rule "no wallet before verification" expressed
 * once. These tests pin the whole verdict → outcome matrix, because every door in
 * the app now renders whatever this table says: a wrong row here is a wallet
 * button appearing on an unverified account, or a verified account being told to
 * go verify again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { kycApi } from '../../services/kycApi';
import { authService } from '../../services/auth';
import { store } from '../../store/store';
import { toast, toastAction } from '../../components/ui';
import {
  __resetWalletGateCache,
  canAttachAddress,
  decideWalletGate,
  invalidateWalletGate,
  linkAttemptGuard,
  reportLinkFailure,
  useWalletGate,
} from './walletGate';

vi.mock('../../services/kycApi', () => ({
  kycApi: { getStatus: vi.fn() },
}));

// The gate reads two things: the reviewer's verdict and the address the account
// already holds. The second is what makes restore mode testable at all.
vi.mock('../../services/auth', () => ({
  authService: { getServerWalletLink: vi.fn() },
}));

// reportLinkFailure speaks through the toast system, and the rest of that module
// must keep working for everything else this file pulls in.
vi.mock('../../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/ui')>();
  return { ...actual, toast: vi.fn(), toastAction: vi.fn() };
});

const getStatus = vi.mocked(kycApi.getStatus);
const getServerWalletLink = vi.mocked(authService.getServerWalletLink);

const ADDRESS = 'mall1qysz7p0restoreme0000000000000000000000';
const OTHER = 'mall1otheraddress000000000000000000000000000';

function signInAs(userId: string, kycLevel = 1) {
  store.state.user.authed = true;
  store.state.user.id = userId;
  store.state.user.kycLevel = kycLevel;
}

/**
 * The pair of reads every hook test needs. An account holding no wallet is the
 * common case, so the link read defaults to that and only restore tests override.
 */
function mockReads(verdict: 'ok' | 'down', status?: string, accountWallet: string | null = null) {
  getStatus.mockResolvedValue(verdict === 'down'
    ? { ok: false, error: 'offline' } as never
    : { ok: true, data: { status } } as never);
  getServerWalletLink.mockResolvedValue({ ok: true, address: accountWallet } as never);
}

describe('decideWalletGate — the matrix', () => {
  it('refuses before anyone has signed in', () => {
    const gate = decideWalletGate({ signedIn: false, verdict: 'approved', kycLevel: 2 });
    expect(gate.allowed).toBe(false);
    expect(gate.state).toBe('signed_out');
    expect(gate.action?.href).toContain('login');
  });

  it('lets an approved account through', () => {
    expect(decideWalletGate({ signedIn: true, verdict: 'approved', kycLevel: 1 }).allowed).toBe(true);
  });

  it('honours kycLevel >= 2 even while a newer submission is still with a reviewer', () => {
    // Same shortcut the server takes in routes/auth.js's compliance-status and in
    // middleware/requireKyc.js: kycLevel is what an admin approval writes, and a
    // re-submission must not revoke a wallet that is already in use.
    expect(decideWalletGate({ signedIn: true, verdict: 'pending', kycLevel: 2 }).allowed).toBe(true);
  });

  it('sends an account that never submitted to the KYC flow', () => {
    for (const verdict of ['not_submitted', 'draft'] as const) {
      const gate = decideWalletGate({ signedIn: true, verdict, kycLevel: 1 });
      expect(gate.state).toBe('kyc_required');
      expect(gate.blocked).toBe(true);
      expect(gate.action).toEqual({ label: 'Start verification', href: '#/kyc' });
    }
  });

  it('names the reviewer as the decider while a submission is in flight', () => {
    for (const verdict of ['pending', 'review'] as const) {
      const gate = decideWalletGate({ signedIn: true, verdict, kycLevel: 1 });
      expect(gate.state).toBe('kyc_pending');
      expect(gate.message).toMatch(/reviewer/i);
      expect(gate.message).not.toMatch(/error|failed/i);
    }
  });

  it('points a rejected account at re-submission, not at a wallet', () => {
    const gate = decideWalletGate({ signedIn: true, verdict: 'rejected', kycLevel: 1 });
    expect(gate.state).toBe('kyc_rejected');
    expect(gate.action?.href).toBe('#/kyc');
    expect(gate.message).toMatch(/re-?submit/i);
  });

  it('fails closed when the verdict cannot be read, and offers a retry', () => {
    const gate = decideWalletGate({ signedIn: true, verdict: 'unknown', kycLevel: 1 });
    expect(gate.allowed).toBe(false);
    expect(gate.state).toBe('kyc_unreachable');
    // The retry is a callback, not a route — an href would take the user
    // somewhere that cannot re-read the status.
    expect(gate.action).toEqual({ label: 'Try again', href: '' });
    expect(gate.message).toMatch(/could not read/i);
  });

  it('says nothing is wrong with the account when only the lookup failed', () => {
    const gate = decideWalletGate({ signedIn: true, verdict: 'unknown', kycLevel: 1 });
    expect(gate.message).toMatch(/nothing has been changed/i);
  });
});

describe('useWalletGate', () => {
  beforeEach(() => {
    __resetWalletGateCache();
    store.reset();
    getStatus.mockReset();
    getServerWalletLink.mockReset();
    vi.mocked(toast).mockReset();
    vi.mocked(toastAction).mockReset();
    // The common case: an account that holds no wallet on the server.
    getServerWalletLink.mockResolvedValue({ ok: true, address: null } as never);
  });

  it('starts in a visible checking state instead of showing a wallet button early', async () => {
    signInAs('gate-user-a');
    getStatus.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWalletGate());
    expect(result.current.gate.state).toBe('checking');
    expect(result.current.gate.allowed).toBe(false);
    expect(result.current.gate.blocked).toBe(false);
    // 'checking' must never be mistaken for restore mode.
    expect(result.current.gate.restoreOnly).toBe(false);
  });

  it('resolves to the verdict the server gave', async () => {
    signInAs('gate-user-b');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'not_submitted' } } as never);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.state).toBe('kyc_required'));
  });

  it('treats a failed lookup as unknown, not as approved', async () => {
    signInAs('gate-user-c');
    getStatus.mockResolvedValue({ ok: false, error: 'offline' } as never);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.state).toBe('kyc_unreachable'));
  });

  it('treats a 200 with no usable status as unknown too', async () => {
    signInAs('gate-user-d');
    getStatus.mockResolvedValue({ ok: true, data: {} } as never);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.state).toBe('kyc_unreachable'));
  });

  it('asks the server once for doors that mount together', async () => {
    signInAs('gate-user-e');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);

    const first = renderHook(() => useWalletGate());
    const second = renderHook(() => useWalletGate());
    await waitFor(() => expect(first.result.current.gate.allowed).toBe(true));
    expect(second.result.current.gate.allowed).toBe(true);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getServerWalletLink).toHaveBeenCalledTimes(1);
  });

  it('does not answer for one account on another account’s verdict', async () => {
    signInAs('gate-user-f');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);
    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.allowed).toBe(true));

    // The next person to sign in is not verified because somebody else was.
    signInAs('gate-user-g');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'not_submitted' } } as never);
    const next = renderHook(() => useWalletGate());
    await waitFor(() => expect(next.result.current.gate.state).toBe('kyc_required'));
    expect(result.current.gate.allowed).toBe(true);
  });

  it('re-reads on request after a KYC submission', async () => {
    signInAs('gate-user-h');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'not_submitted' } } as never);
    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.state).toBe('kyc_required'));

    invalidateWalletGate();
    getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);
    result.current.refresh();
    await waitFor(() => expect(result.current.gate.allowed).toBe(true));
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it('offers restore instead of a refusal to an unverified account that already holds a wallet', async () => {
    signInAs('gate-user-restore');
    mockReads('ok', 'not_submitted', ADDRESS);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.restoreOnly).toBe(true));
    expect(result.current.gate.allowed).toBe(true);
    expect(result.current.gate.restoreAddress).toBe(ADDRESS);
  });

  it('keeps the restore path when only the KYC lookup failed', async () => {
    // The two reads are independent: a KYC outage must not cost an account the
    // one way it has back into its own wallet.
    signInAs('gate-user-partial');
    mockReads('down', undefined, ADDRESS);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.restoreOnly).toBe(true));
  });

  it('refuses restore when the account address read failed', async () => {
    // "Could not read the link" is not "this account holds a wallet" — the safe
    // reading is the rule, and the server still checks for itself.
    signInAs('gate-user-nolink');
    getStatus.mockResolvedValue({ ok: true, data: { status: 'not_submitted' } } as never);
    getServerWalletLink.mockResolvedValue({ ok: false, error: 'offline' } as never);

    const { result } = renderHook(() => useWalletGate());
    await waitFor(() => expect(result.current.gate.state).toBe('kyc_required'));
    expect(result.current.gate.restoreOnly).toBe(false);
  });
});

/**
 * Restore mode is the rule's one exception, and it exists because the cipher
 * wall deliberately disconnects a wallet after three wrong attempts: an account
 * that joined before the verification rule must still be able to get back the
 * keys it already owns. This is the client half of allowSameAddress /
 * allowExistingWallet in backend/src/routes/auth.js and routes/walletPin.js.
 */
describe('decideWalletGate — restore mode', () => {
  for (const verdict of ['not_submitted', 'draft', 'pending', 'review', 'rejected', 'unknown'] as const) {
    it(`lets an unverified (${verdict}) account re-attach only its own wallet`, () => {
      const gate = decideWalletGate({ signedIn: true, verdict, kycLevel: 1, accountWallet: ADDRESS });
      expect(gate.allowed).toBe(true);
      expect(gate.blocked).toBe(false);
      expect(gate.restoreOnly).toBe(true);
      expect(gate.restoreAddress).toBe(ADDRESS);
      expect(canAttachAddress(gate, ADDRESS)).toBe(true);
      expect(canAttachAddress(gate, OTHER)).toBe(false);
      expect(canAttachAddress(gate, '')).toBe(false);
      expect(canAttachAddress(gate, null)).toBe(false);
    });
  }

  it('does not enter restore mode for an account holding no wallet', () => {
    const gate = decideWalletGate({ signedIn: true, verdict: 'not_submitted', kycLevel: 1, accountWallet: null });
    expect(gate.restoreOnly).toBe(false);
    expect(gate.restoreAddress).toBeNull();
    expect(gate.blocked).toBe(true);
  });

  it('gives a verified account full wallet rights even when it holds an address', () => {
    const gate = decideWalletGate({ signedIn: true, verdict: 'approved', kycLevel: 1, accountWallet: ADDRESS });
    expect(gate.restoreOnly).toBe(false);
    expect(canAttachAddress(gate, OTHER)).toBe(true);
  });
});

describe('linkAttemptGuard — what a Link button may attempt', () => {
  const allowed = decideWalletGate({ signedIn: true, verdict: 'approved', kycLevel: 2 });
  const restore = decideWalletGate({ signedIn: true, verdict: 'not_submitted', kycLevel: 1, accountWallet: ADDRESS });
  const blocked = decideWalletGate({ signedIn: true, verdict: 'not_submitted', kycLevel: 1 });

  it('says nothing when the address is attachable', () => {
    expect(linkAttemptGuard(allowed, OTHER)).toBeNull();
    expect(linkAttemptGuard(restore, ADDRESS)).toBeNull();
  });

  it('explains restore mode before the person signs for nothing', () => {
    const message = linkAttemptGuard(restore, OTHER);
    expect(message).toMatch(/only re-connect/i);
    expect(message).toMatch(/nothing was linked/i);
  });

  it('hands a blocked gate its own sentence rather than a generic one', () => {
    expect(linkAttemptGuard(blocked, ADDRESS)).toBe(blocked.message);
  });
});

describe('reportLinkFailure', () => {
  beforeEach(() => {
    __resetWalletGateCache();
    store.reset();
    signInAs('gate-user-report');
    vi.mocked(toast).mockReset();
    vi.mocked(toastAction).mockReset();
  });

  it('says nothing about a cipher the user simply did not finish', () => {
    expect(reportLinkFailure('pin_cancelled')).toBeNull();
    expect(reportLinkFailure(undefined)).toBeNull();
    expect(toast).not.toHaveBeenCalled();
    expect(toastAction).not.toHaveBeenCalled();
  });

  it('turns the server’s verification refusal into the KYC page, not a dead end', () => {
    const reason = reportLinkFailure('kyc_verification_required');
    expect(reason).toBe('kyc_verification_required');
    const [text, action] = vi.mocked(toastAction).mock.calls[0];
    expect(text).toMatch(/nothing was linked/i);
    action.onClick();
    expect(window.location.hash).toBe('#/kyc');
  });

  it('drops the cached verdict when the server contradicts it', async () => {
    // The gate said allowed — that is why a link was attempted — and the 403
    // proves that reading wrong. The next mount must re-read rather than keep
    // offering a button that fails the same way.
    getStatus.mockResolvedValue({ ok: true, data: { status: 'approved' } } as never);
    getServerWalletLink.mockResolvedValue({ ok: true, address: null } as never);
    const first = renderHook(() => useWalletGate());
    await waitFor(() => expect(first.result.current.gate.allowed).toBe(true));

    reportLinkFailure('kyc_verification_required');

    mockReads('ok', 'not_submitted');
    const second = renderHook(() => useWalletGate());
    await waitFor(() => expect(second.result.current.gate.state).toBe('kyc_required'));
  });

  it('offers a re-read for an unreachable verification service', () => {
    const reason = reportLinkFailure('kyc_check_unavailable');
    expect(reason).toBe('kyc_check_unavailable');
    expect(vi.mocked(toastAction).mock.calls[0][0]).toMatch(/could not read your verification status/i);
  });

  it('reports any other refusal in the backend’s own words', () => {
    reportLinkFailure('address_already_linked');
    expect(vi.mocked(toast).mock.calls[0][0]).toBe('address_already_linked');
    expect(toastAction).not.toHaveBeenCalled();
  });
});
