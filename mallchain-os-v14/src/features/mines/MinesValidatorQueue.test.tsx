/**
 * Proof Reviewer queue gating.
 *
 * POST /api/task-assignment/tasks/:id/vote refuses a vote unless the account
 * holds both halves of the validator rule (routes/taskAssignment.js checks the
 * reviewer bond AND services/validatorEligibility.js's approved-application
 * list), so a button that only looks at the stake would invite a refusal. The
 * profile payload carries the pair as review_eligible, and "the server could
 * not read the list" (null) is deliberately NOT treated as a refusal.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import MinesValidatorQueue from './MinesValidatorQueue';
import { minesApi, type AssignedTask, type ReviewerProfile, type ReviewerQueueSummary } from '../../services/minesApi';

vi.mock('../../services/minesApi', () => ({
  minesApi: {
    getReviewerProfile: vi.fn(),
    getQueue: vi.fn(),
    reviewerQueueSummary: vi.fn(),
    vote: vi.fn(),
  },
}));

const TASK = (over: Partial<AssignedTask> = {}): AssignedTask => ({
  _id: 'sub-1',
  miner_id: 'someone-else',
  title: 'Screenshot the followed button',
  description: 'Follow @mallchain and attach the screenshot.',
  assignment_status: 'voting',
  votes_required: 6,
  votes_yes: 1,
  votes_no: 0,
  my_vote: null,
  has_voted: false,
  proof_url: 'https://instagram.com/p/abc',
  campaign_title: 'Instagram — follow',
  campaign_rate_per_task: 15,
  ...over,
});

const QUEUE = (over: Partial<ReviewerQueueSummary> = {}): ReviewerQueueSummary => ({
  awaiting_verification: 9,
  awaiting_assignment: 4,
  assigned_to_me: 1,
  waiting_for_my_vote: 1,
  settled_last_24h: 12,
  oldest_waiting_since: '2026-11-01T00:00:00.000Z',
  source: 'task_submissions',
  ...over,
});

async function mount(profile: ReviewerProfile, tasks: AssignedTask[] = [TASK()], queue = QUEUE()) {
  vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({ ok: true, data: profile } as never);
  vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: tasks } as never);
  vi.mocked(minesApi.reviewerQueueSummary).mockResolvedValue({ ok: true, data: queue } as never);
  vi.mocked(minesApi.vote).mockResolvedValue({ ok: true, data: { vote_recorded: true, status: 'voting' } } as never);
  render(<MinesValidatorQueue />);
  await waitFor(() => expect(screen.getByText('Screenshot the followed button')).toBeTruthy());
}

const PROFILE = (over: Partial<ReviewerProfile> = {}): ReviewerProfile => ({
  validator_id: 'reviewer-1',
  stakedAmount: 80,
  minRequiredStake: 50,
  stakeStatus: 'active',
  mining_reputation: 55,
  tasks_assigned: 1,
  tasks_voted: 0,
  tasks_approved: 0,
  tasks_rejected: 0,
  total_earnings: 0,
  validator_allowed: true,
  review_eligible: true,
  ...over,
});

const approve = () => screen.getByText('✓ Approve').closest('button') as HTMLButtonElement;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('voting requires both halves', () => {
  test('approved and staked can cast a vote', async () => {
    await mount(PROFILE());
    expect(approve().disabled).toBe(false);
    fireEvent.click(approve());
    await waitFor(() => expect(minesApi.vote).toHaveBeenCalledWith('sub-1', 'yes'));
  });

  test('staked but not approved is blocked and points at the application, not the stake', async () => {
    await mount(PROFILE({ validator_allowed: false, review_eligible: false }));
    expect(approve().disabled).toBe(true);
    expect(screen.getByText(/Validator approval required/)).toBeTruthy();
    expect(document.querySelector('a[href="#/validators/apply"]')).toBeTruthy();
    expect(screen.queryByText(/Stake required/)).toBeNull();
  });

  test('approved but not staked still points at the stake', async () => {
    await mount(PROFILE({ stakeStatus: 'unstaked', stakedAmount: 0, review_eligible: false }));
    expect(approve().disabled).toBe(true);
    expect(screen.getByText(/Stake required/)).toBeTruthy();
    expect(screen.queryByText(/Validator approval required/)).toBeNull();
  });

  test('an unread approval list does not become a refusal', async () => {
    await mount(PROFILE({ validator_allowed: null, review_eligible: null }));
    expect(approve().disabled).toBe(false);
    expect(screen.getByText(/Whether an admin has approved a validator application for this account was not reported/)).toBeTruthy();
    expect(screen.queryByText(/no approved validator application covers this account/)).toBeNull();
  });
});

describe('what the queue cards are allowed to claim', () => {
  test('the awaiting-verification card counts submissions, not my assignments', async () => {
    await mount(PROFILE());
    expect(screen.getByText('Tasks awaiting verification')).toBeTruthy();
    expect(screen.getByText(/4 of them no reviewer has claimed yet/)).toBeTruthy();
    expect(screen.getByText(/task_submissions · oldest waiting since/)).toBeTruthy();
  });

  test('a server that does not report the queue says so instead of showing zero', async () => {
    vi.mocked(minesApi.reviewerQueueSummary).mockResolvedValue({ ok: false, error: 'not supported' } as never);
    vi.mocked(minesApi.getReviewerProfile).mockResolvedValue({ ok: true, data: PROFILE() } as never);
    vi.mocked(minesApi.getQueue).mockResolvedValue({ ok: true, data: [TASK()] } as never);
    render(<MinesValidatorQueue />);
    await waitFor(() => expect(screen.getByText('Screenshot the followed button')).toBeTruthy());
    expect(screen.getByText('This server does not report the queue behind your assignments.')).toBeTruthy();
  });

  test('the stake card names both sources it reads', async () => {
    await mount(PROFILE({ validator_allowed: false, review_eligible: false }));
    expect(screen.getByText('mines_reviewers · stakeStatus + validator_applications · status')).toBeTruthy();
  });
});
