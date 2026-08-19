// Regression coverage for the self-serve campaign creation flow (Base Reward
// x Campaign Multiplier, server-computed rate, and MLPTS escrow) and the
// campaign submission anti-abuse limits (max completions/cooldown/daily cap).
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../models/TaskSubmission', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../models/Campaign', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/WalletTransaction', () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock('../services/minesReviewService', () => ({ autoAssignReviewers: jest.fn() }));

// mongoose.startSession()/withTransaction is real transaction machinery that
// needs a live replica set — stub it to just run the callback directly, same
// as this codebase's other session-using route tests do implicitly via mocks.
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (fn) => fn(),
      endSession: jest.fn(),
    }),
  };
});

const User = require('../models/user');
const TaskSubmission = require('../models/TaskSubmission');
const Campaign = require('../models/Campaign');
const minesRouter = require('../routes/mines');

function authHeader(userId = 'user-1') {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

// Mimics Mongoose Query chaining: .session()/.sort()/.lean() can be called
// in any order and the whole thing is awaitable at any point. The
// submission route now wraps the abuse check + create in a transaction, so
// every query it issues gets a `.session(session)` call in the chain.
function chainable(resolvedValue) {
  const node = {
    session: jest.fn(() => node),
    sort: jest.fn(() => node),
    lean: jest.fn().mockResolvedValue(resolvedValue),
    then: (onFulfilled, onRejected) => Promise.resolve(resolvedValue).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(resolvedValue).catch(onRejected),
  };
  return node;
}

describe('POST /api/mines/campaigns/create', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mines', minesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects an unknown platform', async () => {
    const res = await request(app)
      .post('/api/mines/campaigns/create')
      .set(authHeader())
      .send({ platform: 'myspace', activity_type: 'poke', content_link: 'https://x.com', budget_mlpts: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown platform/);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a budget too small to cover one completion', async () => {
    // instagram follow base rate = 3 MLPTS
    const res = await request(app)
      .post('/api/mines/campaigns/create')
      .set(authHeader())
      .send({ platform: 'instagram', activity_type: 'follow', content_link: 'https://instagram.com/x', budget_mlpts: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must cover at least one completion/);
  });

  test('computes rate_per_task as Base x clamped Multiplier and escrows the budget', async () => {
    User.findOneAndUpdate.mockResolvedValue({ _id: 'user-1', mlpts_balance: 90 });
    Campaign.create.mockResolvedValue([{ _id: 'camp-1', rate_per_task: 15, budget_remaining: 100 }]);

    const res = await request(app)
      .post('/api/mines/campaigns/create')
      .set(authHeader())
      .send({
        platform: 'instagram',
        activity_type: 'follow', // base 3 MLPTS
        content_link: 'https://instagram.com/x',
        description: 'Follow our page',
        directive: 'Follow and turn on notifications',
        multiplier: 999, // clamps to 5x -> 3 * 5 = 15
        budget_mlpts: 100,
      });

    expect(res.status).toBe(200);
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'user-1', mlpts_balance: { $gte: 100 } },
      { $inc: { mlpts_balance: -100 } },
      expect.objectContaining({ new: true })
    );
    const createArg = Campaign.create.mock.calls[0][0][0];
    expect(createArg.rate_per_task).toBe(15);
    expect(createArg.multiplier).toBe(5);
    expect(createArg.content_link).toBe('https://instagram.com/x');
    expect(createArg.directive).toBe('Follow and turn on notifications');
  });

  test('rejects with a specific message when the creator has insufficient Mallpoints', async () => {
    User.findOneAndUpdate.mockResolvedValue(null); // atomic balance check failed

    const res = await request(app)
      .post('/api/mines/campaigns/create')
      .set(authHeader())
      .send({ platform: 'instagram', activity_type: 'follow', content_link: 'https://instagram.com/x', budget_mlpts: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient Mallpoints balance/);
    expect(Campaign.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/mines/submissions — campaign anti-abuse limits', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mines', minesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects once the user hits max_completions_per_user for the campaign', async () => {
    Campaign.findById.mockReturnValue(chainable({
      _id: 'camp-1', status: 'active', budget_remaining: 50, max_completions_per_user: 1,
      cooldown_seconds: 3600, rate_per_task: 5, platform: 'instagram',
    }));
    TaskSubmission.find.mockReturnValue(chainable([{ _id: 'sub-1', created_at: new Date(), status: 'approved' }]));

    const res = await request(app)
      .post('/api/mines/submissions')
      .set(authHeader())
      .send({ campaign_id: 'camp-1', proof_url: 'https://proof' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/already reached the limit/);
    expect(TaskSubmission.create).not.toHaveBeenCalled();
  });

  test('rejects a resubmission before the cooldown elapses', async () => {
    Campaign.findById.mockReturnValue(chainable({
      _id: 'camp-1', status: 'active', budget_remaining: 50, max_completions_per_user: 5,
      cooldown_seconds: 3600, rate_per_task: 5, platform: 'instagram',
    }));
    TaskSubmission.find.mockReturnValue(chainable([{ _id: 'sub-1', created_at: new Date(), status: 'approved' }]));

    const res = await request(app)
      .post('/api/mines/submissions')
      .set(authHeader())
      .send({ campaign_id: 'camp-1', proof_url: 'https://proof' });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/wait \d+s/);
  });

  test('allows a fresh submission to a campaign the user has never submitted to', async () => {
    Campaign.findById.mockReturnValue(chainable({
      _id: 'camp-1', status: 'active', budget_remaining: 50, max_completions_per_user: 1,
      cooldown_seconds: 3600, rate_per_task: 5, platform: 'instagram',
    }));
    TaskSubmission.find.mockReturnValue(chainable([]));
    TaskSubmission.aggregate = jest.fn().mockReturnValue(chainable([]));
    TaskSubmission.create.mockResolvedValue([{ _id: 'new-sub', campaign_id: 'camp-1' }]);

    const res = await request(app)
      .post('/api/mines/submissions')
      .set(authHeader())
      .send({ campaign_id: 'camp-1', proof_url: 'https://proof' });

    expect(res.status).toBe(200);
    expect(TaskSubmission.create).toHaveBeenCalledWith(
      [expect.objectContaining({ campaign_id: 'camp-1' })],
      expect.objectContaining({ session: expect.anything() })
    );
  });

  test('non-campaign submissions skip abuse checks entirely', async () => {
    TaskSubmission.create.mockResolvedValue([{ _id: 'new-sub' }]);

    const res = await request(app)
      .post('/api/mines/submissions')
      .set(authHeader())
      .send({ title: 'general mines task', proof_url: 'https://proof' });

    expect(res.status).toBe(200);
    expect(Campaign.findById).not.toHaveBeenCalled();
    expect(TaskSubmission.create).toHaveBeenCalled();
  });
});
