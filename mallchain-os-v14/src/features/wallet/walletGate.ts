/**
 * The wallet gate: whether this account may create or link a wallet right now.
 *
 * Product rule (owner, 2026-11-09): identity verification comes before a wallet,
 * never after. The server enforces it — `backend/src/middleware/requireKyc.js`
 * answers 403 `kyc_verification_required` on POST /api/auth/link-wallet (the only
 * writer of User.walletAddress) and on POST /api/wallet/pin/set-pin. What lives
 * here is the same rule told to the person before they waste a signing prompt, in
 * the same words in every door of the app, so the client never promises a wallet
 * the server will refuse.
 *
 * Two things this deliberately is not:
 * - A second source of truth. The verdict comes from GET /api/kyc/status — the
 *   admin's own record — with `kycLevel >= 2` as the approved shortcut the server
 *   also honours, and the account's existing address from GET /api/auth/me, the
 *   same field the link route writes. Nothing here re-derives compliance from
 *   local flags.
 * - A lock on an existing wallet. The rule stops a wallet being *attached* to an
 *   unverified account. An account that already holds a linked address keeps using
 *   it: refusing send or purchase would punish people who joined before the rule,
 *   and would not make their wallet any more verified. It also keeps being able to
 *   re-attach *that* address after the cipher wall disconnects it — see
 *   `restoreOnly`, because a rule that locks someone out of their own keys has
 *   only ever hurt the wrong party.
 */
import { useCallback, useEffect, useState } from 'react';
import { kycApi, type KycStatusResponse } from '../../services/kycApi';
import { KYC_VERDICT, resolveKycVerdict, type ResolvedKycVerdict } from '../../services/kycVerdict';
import { authService } from '../../services/auth';
import { toast, toastAction } from '../../components/ui';
import { store } from '../../store/store';

/** Every verdict the KYC endpoint can return, plus 'unknown' for a failed lookup. */
export type KycVerdict = KycStatusResponse['status'] | 'unknown';

/**
 * The server's published verdict → the vocabulary the decision matrix below is
 * written in. One direction, one place: {@link resolveKycVerdict} is the only
 * thing in this file that reads a KYC response, and it is the same derivation
 * the gate on the server applies.
 *
 * 'draft' and 'review' can no longer arrive this way — the server folds them
 * into 'not_submitted' and 'pending' — so the matrix's cases for them only ever
 * run for a caller that hands it a raw record status.
 */
function toGateVerdict(verdict: ResolvedKycVerdict): KycVerdict {
  if (verdict === KYC_VERDICT.VERIFIED) return 'approved';
  if (verdict === 'unknown') return 'unknown';
  return verdict;
}

export type WalletGateState =
  | 'checking'
  | 'allowed'
  | 'signed_out'
  | 'kyc_required'
  | 'kyc_pending'
  | 'kyc_rejected'
  | 'kyc_unreachable';

export interface WalletGate {
  state: WalletGateState;
  /** True only when a wallet may be created or linked by this account now. */
  allowed: boolean;
  /** Whether the gate should replace the action it is guarding. */
  blocked: boolean;
  /** What to tell the person. Says who decides and what happens next. */
  message: string;
  /** The one thing they can do about it, or null when there is nothing to do. */
  action: { label: string; href: string } | null;
  /**
   * True when the account is *not* verified but already holds a wallet on the
   * server, and is allowed through only to get that wallet back.
   *
   * The verification rule exists to stop a brand-new wallet relationship, not
   * to be the reason someone loses access to keys they already own — and the
   * cipher wall deliberately disconnects the local copy after three wrong
   * attempts. Without this, a pre-rule account would mistype its cipher, be
   * signed out of its own wallet, and then be told it cannot reconnect because
   * it is unverified. So that account may re-attach exactly one address:
   * `restoreAddress`. Creating a different wallet stays refused.
   */
  restoreOnly: boolean;
  /** The address an unverified-but-already-walleted account may re-attach. */
  restoreAddress: string | null;
}

const ALLOWED: WalletGate = {
  state: 'allowed',
  allowed: true,
  blocked: false,
  message: '',
  action: null,
  restoreOnly: false,
  restoreAddress: null,
};

const SIGNED_OUT: WalletGate = {
  state: 'signed_out',
  allowed: false,
  blocked: true,
  message: 'A wallet belongs to an account. Sign in, verify your identity, then connect it.',
  action: { label: 'Sign in', href: '#/auth?mode=login' },
  restoreOnly: false,
  restoreAddress: null,
};

/**
 * The one wallet an unverified account is allowed to re-attach — the one the
 * server already has for it. Every door asks this instead of re-deriving the
 * rule, so "restore my wallet" and "give me a new one" can never be confused
 * for each other.
 */
export function canAttachAddress(gate: WalletGate, address: string | null | undefined): boolean {
  if (!gate.allowed) return false;
  if (!gate.restoreOnly) return true;
  return !!address && address === gate.restoreAddress;
}

/**
 * What an explicit "Link wallet" button must answer before it spends the
 * person's signature: `allowed` is not enough on its own, because restore mode
 * still refuses every address except the account's own. Returns the sentence to
 * show the user, or null when the link should go ahead.
 *
 * Background callers (App.tsx's auto-link, the send pre-flight) use
 * {@link canAttachAddress} and stay silent instead — a toast nobody asked for is
 * worse than a link quietly not attempted.
 */
export function linkAttemptGuard(gate: WalletGate, address: string | null | undefined): string | null {
  if (!gate.allowed) {
    return gate.message || 'We could not confirm your verification status, so the wallet was not linked.';
  }
  if (canAttachAddress(gate, address)) return null;
  return 'This account is not verified yet, so it can only re-connect the wallet already attached to it — this one is a different address, so nothing was linked.';
}

/**
 * The verdict → gate table, kept pure so the whole matrix is testable without a
 * DOM and every door in the app says the same sentence.
 */
export function decideWalletGate(input: {
  signedIn: boolean;
  verdict: KycVerdict;
  kycLevel: number;
  /** The address the account already holds on the server, from GET /api/auth/me. */
  accountWallet?: string | null;
}): WalletGate {
  if (!input.signedIn) return SIGNED_OUT;
  if (input.verdict === 'approved' || input.kycLevel >= 2) return ALLOWED;

  if (input.accountWallet) {
    return {
      state: 'allowed',
      allowed: true,
      blocked: false,
      message: '',
      action: null,
      restoreOnly: true,
      restoreAddress: input.accountWallet,
    };
  }

  switch (input.verdict) {
    case 'pending':
    case 'review':
      return blocked('kyc_pending',
        'Your documents are with a reviewer. A wallet can be connected the moment that verification is approved — this page updates itself once it has.',
        { label: 'View my KYC status', href: '#/kyc' });
    case 'rejected':
      return blocked('kyc_rejected',
        'The last verification was rejected, so no wallet can be attached to this account yet. Re-submit your documents — the reviewer’s reason is on the KYC page.',
        { label: 'Re-submit verification', href: '#/kyc' });
    case 'not_submitted':
    case 'draft':
      return blocked('kyc_required',
        'Verify your identity before connecting a wallet. It takes a few minutes, and a reviewer answers on record.',
        { label: 'Start verification', href: '#/kyc' });
    default:
      // Fail closed, and say so: a KYC service that cannot be reached is not a
      // verified account, and the server would refuse the link anyway. The door
      // has to offer a retry, not a silent dead end.
      return blocked('kyc_unreachable',
        'We could not read your verification status just now, so we cannot offer a wallet yet. Nothing has been changed on your account.',
        { label: 'Try again', href: '' });
  }
}

function blocked(
  state: WalletGateState,
  message: string,
  action: { label: string; href: string },
): WalletGate {
  return { state, allowed: false, blocked: true, message, action, restoreOnly: false, restoreAddress: null };
}

/* ------------------------------------------------------------------ verdict cache
 * Several doors ask at once (dashboard, wallet hub, settings, send). One read
 * per account per KYC_CHECK_MS, shared, so opening four panels does not become
 * four pairs of round trips — and so they cannot disagree with each other.
 *
 * The read is two calls, not one: the reviewer's verdict (/api/kyc/status) and
 * the address the account already holds (/api/auth/me → user.walletAddress,
 * the same field the link route writes). The second is what lets an unverified
 * account that already owned a wallet get it back instead of being locked out
 * by the rule meant to protect it.
 */
const KYC_CHECK_MS = 30_000;

interface GateReading {
  verdict: KycVerdict;
  accountWallet: string | null;
}

let cached: { userId: string; reading: GateReading; at: number } | null = null;
let inflight: { userId: string; promise: Promise<GateReading> } | null = null;
/** Listeners are held per account so a verdict read for one user can never
 *  land on a component that is still mounted for another. */
const subscribers = new Map<string, Set<(reading: GateReading) => void>>();

function notify(userId: string, reading: GateReading): void {
  subscribers.get(userId)?.forEach((fn) => fn(reading));
}

async function fetchReading(userId: string, force = false): Promise<GateReading> {
  if (!force && cached && cached.userId === userId && Date.now() - cached.at < KYC_CHECK_MS) {
    return cached.reading;
  }
  if (inflight && inflight.userId === userId) return inflight.promise;

  const promise = (async (): Promise<GateReading> => {
    const [status, link] = await Promise.all([kycApi.getStatus(), authService.getServerWalletLink()]);
    const reading: GateReading = {
      // A 200 with an unusable body is a failed lookup, not an approval.
      // `verdict` is the field the server publishes for this question, derived
      // by the same function that answers the link route; resolveKycVerdict is
      // the only reader of the response here, so the door and the server cannot
      // fall out of step about the same account.
      verdict: status.ok ? toGateVerdict(resolveKycVerdict(status.data)) : 'unknown',
      // "Could not read" is not "the account holds no wallet" — but the only
      // safe reading of an unknown link is the strict rule: no restore, verify
      // first. The link route still checks server-side.
      accountWallet: link.ok ? link.address : null,
    };
    // Whichever account's read this was is the account it is true for.
    cached = { userId, reading, at: Date.now() };
    return reading;
  })();

  inflight = { userId, promise };
  const settled = await promise.finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  notify(userId, settled);
  return settled;
}

/**
 * Drop the cached verdict. The KYC wizard calls this after a submission so the
 * doors move from "verify first" to "connected" without waiting for the TTL.
 */
export function invalidateWalletGate(): void {
  cached = null;
}

/**
 * The shared tail of every "Link wallet" button (dashboard, wallet hub,
 * settings, Mallpoints, the send pre-flight). One place so no door can invent
 * its own version of what a refusal meant:
 * - a cancelled cipher is not a failure and says nothing;
 * - the server's verification refusal re-reads the verdict — the cached one was
 *   just proved wrong — and offers the KYC page instead of a dead end;
 * - anything else is reported as the backend worded it.
 * Returns the sentence the user saw, or null when they should see nothing.
 */
export function reportLinkFailure(reason?: string): string | null {
  if (!reason || reason === 'pin_cancelled') return null;
  if (reason === 'kyc_verification_required') {
    invalidateWalletGate();
    toastAction('Verify your identity before this account can hold a wallet — nothing was linked.',
      { label: 'Verify now', onClick: () => { window.location.hash = '#/kyc'; } }, false, 9000);
    return 'kyc_verification_required';
  }
  if (reason === 'kyc_check_unavailable') {
    invalidateWalletGate();
    toastAction('We could not read your verification status just now, so the wallet was not linked.',
      { label: 'Try again', onClick: () => { const uid = store.state.user.id; if (uid) void fetchReading(uid, true); } }, false, 9000);
    return 'kyc_check_unavailable';
  }
  toast(reason, false);
  return reason;
}

/** @internal exposed for tests only. */
export function __resetWalletGateCache(): void {
  cached = null;
  inflight = null;
  subscribers.clear();
}

export interface UseWalletGate {
  gate: WalletGate;
  /** Re-read the verdict now (the retry affordance on a failed lookup). */
  refresh: () => void;
}

/**
 * The gate as a hook. `checking` is a real state and callers must render
 * something for it — a wallet button that appears a second later is worse than
 * one that is visibly being decided, because the person cannot tell whether the
 * account is allowed to have a wallet at all.
 */
export function useWalletGate(): UseWalletGate {
  const signedIn = store.state.user.authed;
  const userId = store.state.user.id;
  const kycLevel = store.state.user.kycLevel;
  const [reading, setReading] = useState<GateReading | null>(
    signedIn && cached && cached.userId === userId ? cached.reading : null,
  );

  useEffect(() => {
    if (!signedIn) {
      setReading(null);
      return;
    }
    let cancelled = false;
    const onReading = (next: GateReading) => {
      if (!cancelled) setReading(next);
    };
    let listeners = subscribers.get(userId);
    if (!listeners) subscribers.set(userId, (listeners = new Set()));
    listeners.add(onReading);
    void fetchReading(userId).then(onReading);
    return () => {
      cancelled = true;
      listeners?.delete(onReading);
    };
  }, [signedIn, userId]);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void fetchReading(userId, true);
  }, [signedIn, userId]);

  const gate = !signedIn
    ? SIGNED_OUT
    : reading === null
      ? {
          state: 'checking' as const,
          allowed: false,
          blocked: false,
          message: 'Checking your verification status…',
          action: null,
          restoreOnly: false,
          restoreAddress: null,
        }
      : decideWalletGate({ signedIn, ...reading, kycLevel });

  // The retry in a 'kyc_unreachable' gate has no href on purpose: it is handled
  // by refresh() above, not by a route.
  return { gate, refresh };
}
