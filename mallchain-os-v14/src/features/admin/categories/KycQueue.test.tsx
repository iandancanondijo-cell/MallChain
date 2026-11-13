/**
 * KYC queue rendering contract — the AML provenance line.
 *
 * A reviewer deciding on "risk: high" has to be able to tell *the lists found
 * nothing* apart from *nobody consulted the lists*, and the only place that
 * difference can surface is this row. The backend records it
 * (`amlChecks.screened` + `amlChecks.provider`); these tests pin what the
 * admin actually sees for each of the three states a record can be in:
 * un-screened because no vendor is configured, genuinely screened, and the
 * legacy records written before provenance was tracked.
 *
 * Mounted through CategoryPage rather than tested as a pure function
 * (adminShared.test.ts already covers the wording) so a row that computes the
 * label but fails to render it still counts as a failure.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CategoryPage from './CategoryPage';
import { adminApi, type AdminKycSubmission } from '../../../services/adminApi';
import { store } from '../../../store/store';

vi.mock('../../../services/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/adminApi')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listPendingKyc: vi.fn(),
      listPendingAmlReviews: vi.fn(),
      listReviewedKyc: vi.fn(),
      listReviewedAml: vi.fn(),
      listStructuringFlags: vi.fn(),
    },
  };
});

function submission(over: Partial<AdminKycSubmission> = {}): AdminKycSubmission {
  return {
    _id: 'kyc1',
    userId: { _id: 'u1', email: 'applicant@example.com', username: null },
    firstName: 'Amara',
    lastName: 'Njoroge',
    idType: 'national_id',
    idNumber: '12345678',
    // Every un-screened path in amlProvider holds for manual review, so the
    // shape under test is always the high-risk row.
    riskLevel: 'high',
    status: 'pending',
    submittedAt: '2026-11-11T00:00:00.000Z',
    ...over,
  };
}

async function renderQueue(...submissions: AdminKycSubmission[]) {
  vi.mocked(adminApi.listPendingKyc).mockResolvedValue({
    ok: true,
    data: { submissions, total: submissions.length },
  });
  vi.mocked(adminApi.listPendingAmlReviews).mockResolvedValue({ ok: true, data: { reviews: [], total: 0 } });
  vi.mocked(adminApi.listReviewedKyc).mockResolvedValue({
    ok: true,
    data: { submissions: [], total: 0, page: 0, limit: 25 },
  });
  vi.mocked(adminApi.listReviewedAml).mockResolvedValue({
    ok: true,
    data: { reviews: [], total: 0, page: 0, limit: 25 },
  });
  vi.mocked(adminApi.listStructuringFlags).mockResolvedValue({ ok: true, data: { flags: [], total: 0 } });

  render(<CategoryPage category="kyc" />);
  await screen.findByText('Amara Njoroge');
}

beforeEach(() => {
  store.state.user.role = 'superadmin';
  store.state.user.adminCategory = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  store.state.user.role = 'user';
});

describe('KYC queue AML provenance', () => {
  test('says no vendor is configured when nothing was screened', async () => {
    await renderQueue(submission({ amlChecks: { screened: false, provider: 'none' } }));

    const line = await screen.findByText('AML: no AML vendor is configured');
    expect(line.getAttribute('title')).toMatch(/Nothing was checked against a sanctions/);
    // The risk chip stays: the row must read "unvetted — hold", not silently
    // lose the signal that put it in the queue.
    expect(screen.getByText('risk: high')).toBeTruthy();
  });

  test('reads a record saved before provenance existed as un-screened, not clean', async () => {
    await renderQueue(submission({ amlChecks: { provider: 'mock' } }));

    expect(
      await screen.findByText('AML: no AML vendor is configured (record predates provenance tracking)'),
    ).toBeTruthy();
  });

  test('drops the "AML:" prefix once a real vendor actually screened the name', async () => {
    await renderQueue(
      submission({
        riskLevel: 'low',
        amlChecks: { screened: true, provider: 'chainalysis' },
      }),
    );

    const line = await screen.findByText('screened by Chainalysis — no matches');
    expect(line.getAttribute('title')).toMatch(/was consulted/);
    expect(screen.getByText('risk: low')).toBeTruthy();
  });

  test('names the lists a screened submission matched', async () => {
    await renderQueue(
      submission({
        amlChecks: { screened: true, provider: 'trm', sanctions: true, pep: true },
      }),
    );

    expect(await screen.findByText('screened by TRM Labs — sanctions, PEP matched')).toBeTruthy();
  });

  test('shows erased screening as erased rather than as a clean check', async () => {
    await renderQueue(
      submission({ amlChecks: { screened: false, provider: '[erased]' } }),
    );

    expect(await screen.findByText('AML: screening record erased by request')).toBeTruthy();
  });
});
