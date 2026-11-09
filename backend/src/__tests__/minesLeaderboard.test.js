/**
 * GET /api/mines/leaderboard.
 *
 * The board was rewritten to rank what Mines actually paid out, not what each
 * account happens to be holding: the previous version summed
 * User.mlpts_balance — so referral bonuses, admin credits and unspent
 * sign-up grants all counted as "mining" results, a top miner who converted
 * their points dropped down the board, and a user with no username had their
 * email local-part published on an unauthenticated endpoint.
 */
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  decryptUserPii: (u) => u,
}));
jest.mock('../models/TaskSubmission', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock('../models/Campaign', () => ({ find: jest.fn(), findById: jest.fn(), create: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/WalletTransaction', () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock('../services/minesReviewService', () => ({ autoAssignReviewers: jest.fn(), checkAndResolve: jest.fn() }));

const TaskSubmission = require('../models/TaskSubmission');
const minesRouter = require('../routes/mines');

describe('GET /api/mines/leaderboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/mines', minesRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ranks by settled submission rewards, not by current balance', async () => {
    TaskSubmission.aggregate.mockResolvedValue([
      { _id: 'u1', earnedMlpts: 240, tasks: 12, user: { username: 'kevin', banned: false, rank_points: 10 } },
      // u2 spent/converted most of their points, so a balance-ranked board
      // put them below u3 — their paid-out history is what belongs here.
      { _id: 'u2', earnedMlpts: 180, tasks: 9, user: { username: 'amina', banned: false, rank_points: 7 } },
      { _id: 'u3', earnedMlpts: 20, tasks: 2, user: { username: 'davis', banned: false, rank_points: 1 } },
    ]);

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 'u1', name: 'kevin', earned: 240, tasks: 12, rankPoints: 10, position: 1 },
      { id: 'u2', name: 'amina', earned: 180, tasks: 9, rankPoints: 7, position: 2 },
      { id: 'u3', name: 'davis', earned: 20, tasks: 2, rankPoints: 1, position: 3 },
    ]);
  });

  test('publishes an anonymous handle instead of an email local-part', async () => {
    TaskSubmission.aggregate.mockResolvedValue([
      { _id: '507f1f77bcf86cd799439011', earnedMlpts: 50, tasks: 4, user: { username: '', banned: false, rank_points: 0 } },
    ]);

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.body.data[0].name).toBe('participant 439011');
    expect(JSON.stringify(res.body.data)).not.toContain('@');
  });

  test('drops banned accounts and submissions whose user row is gone', async () => {
    TaskSubmission.aggregate.mockResolvedValue([
      { _id: 'u1', earnedMlpts: 100, tasks: 5, user: { username: 'ok', banned: false, rank_points: 2 } },
      { _id: 'u2', earnedMlpts: 90, tasks: 4, user: { username: 'banned', banned: true, rank_points: 2 } },
      { _id: 'u3', earnedMlpts: 80, tasks: 3, user: null },
    ]);

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.body.data.map((r) => r.id)).toEqual(['u1']);
  });

  test('returns an empty leaderboard instead of an error when the query fails', async () => {
    TaskSubmission.aggregate.mockRejectedValue(new Error('db down'));

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
