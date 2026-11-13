/**
 * The KYC window's AML provenance wording.
 *
 * Pinned because "risk: high" means two opposite things depending on whether a
 * list was actually consulted, and an admin who cannot tell them apart either
 * rejects applicants over our missing vendor credentials or approves a real
 * sanctions hit as noise. See backend/src/services/amlProvider.js.
 */
import { describe, expect, test } from 'vitest';
import { amlProvenance } from './adminShared';
import type { AdminKycSubmission } from '../../services/adminApi';

function submission(amlChecks?: AdminKycSubmission['amlChecks']): AdminKycSubmission {
  return {
    _id: 'k1',
    userId: 'u1',
    firstName: 'Jane',
    lastName: 'Doe',
    idType: 'passport',
    idNumber: 'A1234567',
    riskLevel: 'high',
    status: 'pending',
    submittedAt: '2026-11-12T00:00:00.000Z',
    amlChecks,
  };
}

describe('amlProvenance', () => {
  test('says plainly when nothing was screened', () => {
    const view = amlProvenance(submission({ screened: false, provider: 'none', sanctions: false, pep: false, adverseMedia: false, watchlist: false }));

    expect(view.unscreened).toBe(true);
    expect(view.text).toBe('AML: no AML vendor is configured');
    expect(view.title).toMatch(/means "unvetted — hold for manual review", not "the lists found nothing"/);
  });

  test('a record that predates provenance is treated as unscreened, not as clean', () => {
    expect(amlProvenance(submission(undefined)).unscreened).toBe(true);
    expect(amlProvenance(submission({ provider: 'mock' })).unscreened).toBe(true);
    expect(amlProvenance(submission({ provider: '[erased]' })).text).toBe('AML: screening record erased by request');
  });

  test('the production safeguard is named as a configuration gap, not a finding', () => {
    const view = amlProvenance(submission({ screened: false, provider: 'safeguard' }));
    expect(view.unscreened).toBe(true);
    expect(view.text).toBe('AML: production safeguard — no AML vendor is configured');
  });

  test('an unreachable vendor is reported as unreachable', () => {
    expect(amlProvenance(submission({ screened: false, provider: 'unavailable' })).text)
      .toBe('AML: the AML vendor could not be reached');
  });

  test('a screening that ran reports the vendor and what matched', () => {
    const clean = amlProvenance(submission({ screened: true, provider: 'chainalysis' }));
    expect(clean.unscreened).toBe(false);
    expect(clean.text).toBe('screened by Chainalysis — no matches');

    const hit = amlProvenance(submission({ screened: true, provider: 'trm', sanctions: true, watchlist: true }));
    expect(hit.text).toBe('screened by TRM Labs — sanctions, watchlist matched');
  });

  test('an unlisted vendor is named rather than hidden behind a generic label', () => {
    expect(amlProvenance(submission({ screened: true, provider: 'sanction_scanner' })).text)
      .toBe('screened by sanction_scanner — no matches');
  });
});
