/**
 * Stake-to-Review — the stake half of a two-half rule.
 *
 * backend/src/services/validatorEligibility.js grants review work only to an
 * account with BOTH an approved validator application and an active MLPTS
 * bond, and GET /api/task-assignment/reviewer/profile now reports each half
 * (validator_allowed) plus the pair (review_eligible). This page used to
 * promise that staking alone made the reader assignable. These pin the
 * corrected wording, including the difference between "not approved" and
 * "the server could not read the approval list".
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import MinesReviewerStake from './MinesReviewerStake';
import { minesApi, type ReviewerProfile } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: { getReviewerProfile: vi.fn(), stake: vi.fn(), unstake: vi.fn() },
}));

const PROFILE = (over: Partial<ReviewerProfile> = {}): ReviewerProfile => ({
  validator_id: 'reviewer-1',
  stakedAmount: 80,
  minRequiredStake: 50,
  stakeStatus: 'active',
  mining_reputation: 55,
  tasks_assigned: 3,
  tasks_voted: 2,
  tasks_approved: 1,
  tasks_rejected: 1,
  total_earnings: 20,
  validator_allowed: true,
  review_eligible: true,
  ...over,
});

async function mount(profile: ReviewerProfile) {
  vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({ ok: true, data: profile } as never);
  render(<MinesReviewerStake />);
  await waitFor(() => expect(screen.getByText('Validator approval')).toBeTruthy());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the two halves stated separately', () => {
  test('an active bond with an approved application is the only all-clear state', async () => {
    await mount(PROFILE());
    expect(screen.getByText('approved')).toBeTruthy();
    expect(screen.queryByText(/Assignments need both/)).toBeNull();
    expect(screen.getByText(/one half of what assignment requires/)).toBeTruthy();
  });

  test('a bond without an approval says the approval is what is missing', async () => {
    await mount(PROFILE({ validator_allowed: false, review_eligible: false }));
    expect(screen.getByText('not approved')).toBeTruthy();
    expect(screen.getByText(/The stake half is met, but no admin has approved a validator application/)).toBeTruthy();
  });

  test('an approval without a bond says the bond is what is missing', async () => {
    await mount(PROFILE({ stakedAmount: 0, stakeStatus: 'unstaked', review_eligible: false }));
    expect(screen.getByText(/Your application is approved, but this bond is unstaked/)).toBeTruthy();
  });

  test('neither half in place names both halves', async () => {
    await mount(PROFILE({ stakedAmount: 0, stakeStatus: 'unstaked', validator_allowed: false, review_eligible: false }));
    expect(screen.getByText(/Neither half is in place/)).toBeTruthy();
  });

  test('an unread approval list is reported as unknown, not as a rejection', async () => {
    await mount(PROFILE({ validator_allowed: null, review_eligible: null }));
    expect(screen.getByText('not reported')).toBeTruthy();
    expect(screen.getByText(/The approval list could not be read just now/)).toBeTruthy();
    expect(screen.queryByText(/no admin has approved a validator application/)).toBeNull();
  });
});

describe('the stake form', () => {
  test('the minimum is described as one half of the rule, not as the whole rule', async () => {
    await mount(PROFILE({ stakedAmount: 10 }));
    expect(screen.getByText(/is the stake half of the rule; an approved validator application is the other/)).toBeTruthy();
    expect(screen.getByText('Top up to the minimum')).toBeTruthy();
  });

  test('a suspended bond keeps its own warning and names both missing halves', async () => {
    await mount(PROFILE({ stakeStatus: 'suspended', stakedAmount: 20, validator_allowed: false, review_eligible: false }));
    expect(screen.getByText(/suspended after missed votes/)).toBeTruthy();
    expect(screen.getByText(/Neither half is in place/)).toBeTruthy();
    expect(screen.queryByText(/The stake half is met/)).toBeNull();
  });
});
