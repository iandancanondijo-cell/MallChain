// Factory mocks (not auto-mock) so tests never touch a real Mongo connection —
// mirrors the pattern in mallpointsAward.test.js.
jest.mock('mongoose', () => ({
  startSession: jest.fn(),
}));
jest.mock('../models/MinesReviewer', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
}));
jest.mock('../models/user', () => ({
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/WalletTransaction', () => ({
  create: jest.fn(),
}));
jest.mock('../models/Campaign', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../services/notify', () => ({
  notify: jest.fn(),
}));

const mongoose = require('mongoose');
const MinesReviewer = require('../models/MinesReviewer');
const User = require('../models/user');
const WalletTransaction = require('../models/WalletTransaction');
const Campaign = require('../models/Campaign');
const {
  computeWeight,
  autoAssignReviewers,
  checkAndResolve,
  VOTE_REWARD,
  MISSED_VOTE_PENALTY,
  SUSPEND_AFTER_MISSES,
} = require('../services/minesReviewService');

function chainable(resolvedValue) {
  return { session: jest.fn().mockResolvedValue(resolvedValue) };
}

function fakeTask(overrides = {}) {
  return {
    miner_id: 'submitter1',
    campaign_id: null,
    reward_amount: 0,
    reward_currency: 'MLPTS',
    assignment_status: 'voting',
    assigned_validators: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
    validator_votes: {},
    votes_yes_weight: 0,
    votes_no_weight: 0,
    voting_deadline: new Date(Date.now() + 60_000),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mongoose.startSession.mockResolvedValue({
    withTransaction: async (fn) => fn(),
    endSession: jest.fn(),
  });
  Campaign.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  Campaign.findByIdAndUpdate.mockReturnValue(chainable({}));
  WalletTransaction.create.mockResolvedValue([{}]);
  User.findByIdAndUpdate.mockReturnValue(chainable({}));
  MinesReviewer.findOneAndUpdate.mockImplementation(async (query) => ({ validator_id: query.validator_id }));
  MinesReviewer.findOne.mockReturnValue(chainable(null));
  MinesReviewer.updateMany.mockResolvedValue({});
});

describe('computeWeight', () => {
  test('scales reputation 0-100 to a 0.2-1.0 weight', () => {
    expect(computeWeight({ mining_reputation: 100 })).toBe(1);
    expect(computeWeight({ mining_reputation: 50 })).toBe(0.5);
  });

  test('floors low/zero reputation at 0.2 so no reviewer is fully zeroed out', () => {
    expect(computeWeight({ mining_reputation: 0 })).toBe(0.2);
    expect(computeWeight({ mining_reputation: 5 })).toBe(0.2);
  });

  test('defaults to the 50-reputation weight when reviewer data is missing', () => {
    expect(computeWeight(undefined)).toBe(0.5);
  });
});

describe('autoAssignReviewers', () => {
  test('picks up to 6 active reviewers and excludes the submitter from the query', async () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ validator_id: `r${i}` }));
    MinesReviewer.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(pool) });

    const task = fakeTask({ assignment_status: 'none', assigned_validators: [], save: jest.fn().mockResolvedValue() });
    await autoAssignReviewers(task);

    expect(MinesReviewer.find).toHaveBeenCalledWith({
      stakeStatus: 'active',
      validator_id: { $ne: task.miner_id },
    });
    expect(task.assigned_validators).toHaveLength(6);
    expect(task.votes_required).toBe(6);
    expect(task.assignment_status).toBe('assigned');
    expect(task.save).toHaveBeenCalled();
    expect(MinesReviewer.updateMany).toHaveBeenCalled();
  });

  test('assigns fewer than 6 when the eligible pool is smaller', async () => {
    const pool = [{ validator_id: 'r1' }, { validator_id: 'r2' }];
    MinesReviewer.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(pool) });

    const task = fakeTask({ assignment_status: 'none', save: jest.fn().mockResolvedValue() });
    await autoAssignReviewers(task);

    expect(task.assigned_validators).toHaveLength(2);
    expect(task.votes_required).toBe(2);
  });

  test('leaves the task untouched (falls back to admin manual review) when no reviewers are eligible', async () => {
    MinesReviewer.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

    const task = fakeTask({ assignment_status: 'none', save: jest.fn() });
    await autoAssignReviewers(task);

    expect(task.save).not.toHaveBeenCalled();
    expect(task.assignment_status).toBe('none');
  });
});

describe('checkAndResolve — gating', () => {
  test('returns null when the task is not in an assignable/voting state', async () => {
    const task = fakeTask({ assignment_status: 'approved' });
    expect(await checkAndResolve(task)).toBeNull();
    expect(task.save).not.toHaveBeenCalled();
  });

  test('returns null while votes are still incomplete and the deadline has not passed', async () => {
    const task = fakeTask({ validator_votes: { r1: 'yes' } });
    expect(await checkAndResolve(task)).toBeNull();
  });

  test('auto-rejects with an insufficient-quorum reason once the deadline passes without quorum (4 of 6)', async () => {
    const task = fakeTask({
      validator_votes: { r1: 'yes', r2: 'yes', r3: 'yes' }, // 3 of 6 < quorum (4)
      votes_yes_weight: 1.5,
      votes_no_weight: 0,
      voting_deadline: new Date(Date.now() - 1000),
    });

    const resolved = await checkAndResolve(task);

    expect(resolved).toBe(task);
    expect(task.status).toBe('rejected');
    expect(task.assignment_status).toBe('rejected');
    expect(task.rejection_note).toBe('insufficient reviewer quorum');
    expect(task.reward_amount).toBe(0);
  });
});

describe('checkAndResolve — weighted threshold decision', () => {
  test('approves at exactly the 0.60 weighted-yes ratio', async () => {
    const votes = { r1: 'yes', r2: 'yes', r3: 'yes', r4: 'no', r5: 'no', r6: 'no' };
    const task = fakeTask({ validator_votes: votes, votes_yes_weight: 0.6, votes_no_weight: 0.4 });

    const resolved = await checkAndResolve(task);

    expect(resolved.status).toBe('auto_approved');
    expect(resolved.assignment_status).toBe('approved');
  });

  test('rejects just below the 0.60 threshold', async () => {
    const votes = { r1: 'yes', r2: 'yes', r3: 'yes', r4: 'no', r5: 'no', r6: 'no' };
    const task = fakeTask({ validator_votes: votes, votes_yes_weight: 0.59, votes_no_weight: 0.41 });

    const resolved = await checkAndResolve(task);

    expect(resolved.status).toBe('rejected');
    expect(resolved.assignment_status).toBe('rejected');
  });
});

describe('checkAndResolve — reward/penalty payout', () => {
  const APPROVED_VOTES = { r1: 'yes', r2: 'yes', r3: 'yes', r4: 'yes', r5: 'no', r6: 'no' };
  // r1-r4 majority (yes), r5-r6 minority (no) — r6 never actually votes, simulating a no-show instead.

  function approvedTask(overrides = {}) {
    return fakeTask({
      campaign_id: 'camp1',
      validator_votes: { r1: 'yes', r2: 'yes', r3: 'yes', r4: 'yes', r5: 'no' }, // r6 missing = no-show
      votes_yes_weight: 2.0,
      votes_no_weight: 0.5,
      // 5 of 6 voted (>= quorum of 4) — resolution of a no-show only fires
      // once the deadline has passed, per checkAndResolve's gating.
      voting_deadline: new Date(Date.now() - 1000),
      ...overrides,
    });
  }

  test('credits the submitter from the campaign rate_per_task on approval', async () => {
    Campaign.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ rate_per_task: 5 }) });
    const task = approvedTask();

    await checkAndResolve(task);

    expect(WalletTransaction.create).toHaveBeenCalledWith(
      [expect.objectContaining({ user_id: 'submitter1', amount: 5, type: 'credit' })],
      expect.any(Object)
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('submitter1', { $inc: { mlpts_balance: 5 } });
  });

  test('rewards majority-matching reviewers and credits their mlpts_balance', async () => {
    const task = approvedTask();

    await checkAndResolve(task);

    // r1-r4 voted 'yes' and the decision was approved => majority match.
    for (const id of ['r1', 'r2', 'r3', 'r4']) {
      expect(MinesReviewer.findOneAndUpdate).toHaveBeenCalledWith(
        { validator_id: id },
        expect.objectContaining({ $inc: { total_earnings: VOTE_REWARD } }),
        expect.any(Object)
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(id, { $inc: { mlpts_balance: VOTE_REWARD } });
    }
  });

  test('does not reward the minority voter (voted no, task approved)', async () => {
    const task = approvedTask();

    await checkAndResolve(task);

    expect(MinesReviewer.findOneAndUpdate).toHaveBeenCalledWith(
      { validator_id: 'r5' },
      { $set: { missedVoteStreak: 0 } },
      expect.any(Object)
    );
    expect(User.findByIdAndUpdate).not.toHaveBeenCalledWith('r5', expect.anything());
  });

  test('penalizes a no-show reviewer and suspends after 3 consecutive misses', async () => {
    const noShowReviewer = {
      validator_id: 'r6',
      missedVoteStreak: SUSPEND_AFTER_MISSES - 1,
      mining_reputation: 50,
      stakeStatus: 'active',
      save: jest.fn().mockResolvedValue(undefined),
    };
    MinesReviewer.findOne.mockImplementation((query) => {
      if (query.validator_id === 'r6') return chainable(noShowReviewer);
      return chainable(null);
    });

    const task = approvedTask();
    await checkAndResolve(task);

    expect(noShowReviewer.missedVoteStreak).toBe(SUSPEND_AFTER_MISSES);
    expect(noShowReviewer.mining_reputation).toBe(50 - MISSED_VOTE_PENALTY);
    expect(noShowReviewer.stakeStatus).toBe('suspended');
    expect(noShowReviewer.save).toHaveBeenCalled();
  });
});
