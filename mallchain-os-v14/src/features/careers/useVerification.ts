import { useEffect, useState } from 'react';
import { store } from '../../store/store';
import { kycApi } from '../../services/kycApi';

export type VerificationState = 'checking' | 'verified' | 'pending' | 'rejected' | 'unverified' | 'unreachable';

export interface Verification {
  state: VerificationState;
  verified: boolean;
  /** What the person is told, in the words of the server's own verdict. */
  message: string;
  /** The one thing they can do about it, or null when there is nothing to do. */
  action: { label: string; href: string } | null;
  refresh: () => void;
}

/**
 * Posting an opening and applying to one both put a verified identity in front
 * of a stranger, so both ask the server rather than reading User.kycLevel —
 * that field only reaches 2 on the admin approve path, while an approved KYC
 * record is equally a verified account (middleware/requireKyc.js kycVerdict).
 *
 * A failed read is 'unreachable', not 'unverified': the board still loads, and
 * the server refuses the write if the account really is not verified.
 */
export function useVerification(): Verification {
  const kycLevel = store.state.user.kycLevel;
  const isAdmin = store.state.user.role === 'admin' || store.state.user.role === 'superadmin';
  const [state, setState] = useState<VerificationState>(kycLevel >= 2 || isAdmin ? 'verified' : 'checking');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (kycLevel >= 2 || isAdmin) {
      setState('verified');
      return;
    }
    let cancelled = false;
    kycApi.getStatus().then((res) => {
      if (cancelled) return;
      if (!res.ok || !res.data?.status) {
        setState('unreachable');
        return;
      }
      const s = res.data.status;
      setState(s === 'approved' ? 'verified' : s === 'pending' || s === 'review' ? 'pending' : s === 'rejected' ? 'rejected' : 'unverified');
    });
    return () => { cancelled = true; };
  }, [kycLevel, isAdmin, tick, store.state.user.id]);

  const copy: Record<VerificationState, { message: string; action: Verification['action'] }> = {
    checking: { message: 'Checking your verification status…', action: null },
    verified: { message: '', action: null },
    pending: {
      message: 'Your identity documents are with a reviewer. You can post and apply as soon as that verification is approved.',
      action: { label: 'View verification status', href: '#/kyc' },
    },
    rejected: {
      message: 'Your last identity verification was rejected. Re-submit your documents, then post or apply.',
      action: { label: 'Review and resubmit', href: '#/kyc' },
    },
    unverified: {
      message: 'Verify your identity to post an opening or apply to one. It takes a few minutes and a reviewer answers on record.',
      action: { label: 'Start verification', href: '#/kyc' },
    },
    unreachable: {
      message: 'We could not read your verification status just now. The board is still readable; try again in a moment before posting or applying.',
      action: null,
    },
  };

  return {
    state,
    verified: state === 'verified',
    message: copy[state].message,
    action: copy[state].action,
    refresh: () => setTick((n) => n + 1),
  };
}
