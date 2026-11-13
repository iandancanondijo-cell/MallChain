/**
 * The single place the client answers "where does this account stand with
 * identity verification". The dashboard card, the dashboard banner and the
 * wallet gate all go through here, so these tests are the contract that keeps
 * them from telling one account three different stories — which is what the
 * server's published `verdict` field exists to make impossible
 * (docs/backend-handoff-2026-11-09.md §6).
 */
import { describe, expect, it } from 'vitest';
import { KYC_VERDICT, resolveKycVerdict } from './kycVerdict';

describe('resolveKycVerdict — the published verdict wins', () => {
  it('passes each server verdict through unchanged', () => {
    expect(resolveKycVerdict({ verdict: 'verified' })).toBe(KYC_VERDICT.VERIFIED);
    expect(resolveKycVerdict({ verdict: 'rejected' })).toBe(KYC_VERDICT.REJECTED);
    expect(resolveKycVerdict({ verdict: 'pending' })).toBe(KYC_VERDICT.PENDING);
    expect(resolveKycVerdict({ verdict: 'not_submitted' })).toBe(KYC_VERDICT.NOT_SUBMITTED);
  });

  it('prefers the verdict over the record status when the two disagree', () => {
    // The realistic disagreement: an admin approved the account by setting
    // kycLevel without the KYC document being moved off 'pending'. The server
    // publishes one answer for both the banner and the wallet gate, and the
    // client takes it instead of choosing between the fields.
    expect(resolveKycVerdict({ verdict: 'verified', status: 'pending' })).toBe(KYC_VERDICT.VERIFIED);
    // ... and the other direction, where a stale document says approved but the
    // account's verdict is what the gate will enforce.
    expect(resolveKycVerdict({ verdict: 'pending', status: 'approved' })).toBe(KYC_VERDICT.PENDING);
  });

  it('ignores a verdict it does not recognise rather than defaulting it away', () => {
    // A server that renames the enum must degrade to the documented status
    // fallback, not land in a caller's "everything else" branch.
    expect(resolveKycVerdict({ verdict: 'verified_by_admin', status: 'approved' })).toBe(KYC_VERDICT.VERIFIED);
  });
});

describe('resolveKycVerdict — the version fallback for a pre-verdict server', () => {
  it.each([
    ['approved', KYC_VERDICT.VERIFIED],
    ['rejected', KYC_VERDICT.REJECTED],
    ['pending', KYC_VERDICT.PENDING],
    ['review', KYC_VERDICT.PENDING],
    // Wizard progress is not a submission: nobody is looking at it yet.
    ['draft', KYC_VERDICT.NOT_SUBMITTED],
    ['not_submitted', KYC_VERDICT.NOT_SUBMITTED],
    // /api/auth/compliance-status's word for "no submitted record".
    ['unverified', KYC_VERDICT.NOT_SUBMITTED],
  ])('maps status %s to %s', (status, verdict) => {
    expect(resolveKycVerdict({ status })).toBe(verdict);
  });
});

describe('resolveKycVerdict — a read that said nothing', () => {
  it.each([
    [undefined],
    [null],
    [{}],
    [{ status: undefined, verdict: undefined }],
    [{ verdict: 42 as unknown as string }],
  ])('resolves %j to unknown', (data) => {
    // 'unknown' is what every caller must render as "we could not tell", never
    // as "not verified": the gate refuses a wallet on it and says why, and no
    // banner claims the account has work to do.
    expect(resolveKycVerdict(data as never)).toBe('unknown');
  });
});
