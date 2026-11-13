/**
 * The one place the client turns a KYC read into "where does this account
 * stand with identity verification".
 *
 * The server publishes `verdict` for exactly this (docs/backend-handoff-
 * 2026-11-09.md §6): it is derived in `backend/src/middleware/requireKyc.js`
 * from the account's `kycLevel` plus its latest submitted KYC document — the
 * same function that decides whether a wallet may be linked. Before that field
 * existed, the dashboard card, the dashboard banner and the wallet gate each
 * re-assembled the answer from `status` (five values), `kycLevel` (a number)
 * and `reviewedAt`, and could disagree about one account.
 *
 * So: branch on the returned `verdict` and nothing else.
 *
 * The `status` fallback below is a *version* fallback, not a re-derivation: a
 * bundle built before the field landed can talk to an API that predates it, and
 * the wrong answer there is a blocked account, not a wrong banner. It maps the
 * record's own vocabulary with the same table the server uses, and it is never
 * consulted when `verdict` is present — even when the two disagree.
 */

/** The four values the server publishes, verbatim. */
export const KYC_VERDICT = {
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  PENDING: 'pending',
  NOT_SUBMITTED: 'not_submitted',
} as const;

export type KycServerVerdict = (typeof KYC_VERDICT)[keyof typeof KYC_VERDICT];

/** Plus 'unknown': the read failed, which is not the same as unverified. */
export type ResolvedKycVerdict = KycServerVerdict | 'unknown';

/** The minimum a read has to carry for this to say anything about it. */
export interface KycVerdictFields {
  verdict?: string;
  status?: string;
}

const SERVER_VERDICTS: readonly string[] = Object.values(KYC_VERDICT);

/**
 * `models/kyc.js` status → the verdict it amounts to, mirroring
 * `verdictFromRecordStatus` on the server. 'draft' is saved wizard progress,
 * not a submission, so it is 'not_submitted' and never 'pending'.
 */
function verdictFromRecordStatus(status: string): KycServerVerdict {
  if (status === 'approved') return KYC_VERDICT.VERIFIED;
  if (status === 'rejected') return KYC_VERDICT.REJECTED;
  // '' , 'not_submitted' and 'unverified' are how these endpoints describe
  // having no submitted record to speak of ('unverified' is
  // /api/auth/compliance-status's word for it); 'draft' is wizard progress.
  // None of them is a submission.
  if (!status || status === 'draft' || status === 'not_submitted' || status === 'unverified') {
    return KYC_VERDICT.NOT_SUBMITTED;
  }
  return KYC_VERDICT.PENDING;
}

/**
 * The verdict for a status payload. `undefined`/`null` — no read, or a read
 * that returned nothing usable — resolves to 'unknown', which every caller
 * must treat as "we could not tell", never as "not verified": the gate refuses
 * a wallet on it, and the banners say they could not look rather than claiming
 * the account has work to do.
 */
export function resolveKycVerdict(data?: KycVerdictFields | null): ResolvedKycVerdict {
  if (!data) return 'unknown';
  const published = typeof data.verdict === 'string' ? data.verdict : '';
  // An unrecognised value is treated as no value: a server that renames the
  // enum should degrade to the fallback, not silently land in a caller's
  // default branch.
  if (SERVER_VERDICTS.includes(published)) return published as KycServerVerdict;
  if (typeof data.status === 'string') return verdictFromRecordStatus(data.status);
  return 'unknown';
}
