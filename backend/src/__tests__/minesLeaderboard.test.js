const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  find: jest.fn(),
}));
jest.mock('../models/TaskSubmission', () => ({ find: jest.fn(), findById: jest.fn(), create: jest.fn() }));
jest.mock('../models/Campaign', () => ({ find: jest.fn(), findById: jest.fn(), create: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../models/WalletTransaction', () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock('../services/minesReviewService', () => ({ autoAssignReviewers: jest.fn() }));

const User = require('../models/user');
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

  function selectableFind(rows) {
    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    };
  }

  test('ranks users by mlpts_balance and falls back to email prefix when no username is set', async () => {
    User.find.mockReturnValue(
      selectableFind([
        { _id: 'u1', username: 'kevin', email: 'kevin@x.com', mlpts_balance: 300, tasks_completed: 5, rank_points: 10 },
        { _id: 'u2', username: '', email: 'amina@x.com', mlpts_balance: 200, tasks_completed: 3, rank_points: 7 },
      ])
    );

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: 'u1', name: 'kevin', earned: 300, tasks: 5, rankPoints: 10 },
      { id: 'u2', name: 'amina', earned: 200, tasks: 3, rankPoints: 7 },
    ]);
    expect(User.find).toHaveBeenCalledWith({ banned: false });
  });

  test('returns an empty leaderboard instead of an error when the query fails', async () => {
    User.find.mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await request(app).get('/api/mines/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
