import type { KycStatusResponse } from '../../../services/kycApi';

/** One place for what a KYC verdict is called and what colour it is, because
 *  the status card and the identity card must not describe the same verdict in
 *  two different words. */
export const KYC_LABEL: Record<KycStatusResponse['status'], string> = {
  not_submitted: 'Not submitted',
  draft: 'Draft — not submitted',
  pending: 'Under review',
  review: 'Under review',
  approved: 'Verified',
  rejected: 'Rejected',
};

export const KYC_TONE: Record<KycStatusResponse['status'], 'ok' | 'warn' | 'bad' | 'muted'> = {
  not_submitted: 'muted',
  draft: 'warn',
  pending: 'warn',
  review: 'warn',
  approved: 'ok',
  rejected: 'bad',
};

export const TONE_COLOR: Record<'ok' | 'warn' | 'bad' | 'muted', string> = {
  ok: 'var(--green)',
  warn: 'var(--warning)',
  bad: 'var(--red)',
  muted: 'var(--txt-3)',
};

export function kycChip(status: KycStatusResponse['status'] | undefined) {
  const key = status || 'not_submitted';
  const color = TONE_COLOR[KYC_TONE[key]];
  return { label: `${KYC_TONE[key] === 'ok' ? '✓ ' : ''}${KYC_LABEL[key]}`, color };
}
