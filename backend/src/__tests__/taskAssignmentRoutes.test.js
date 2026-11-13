const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  // taskAssign routes name the audit actor as
  // User.decryptUserPii(req.user).email — email is encrypted at rest, so the
  // static has to exist even in a suite whose fixtures are plaintext.
  decryptUserPii: jest.fn((user) => user ?? {}),
}));

jest.mock('../models/TaskSubmission', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../models/MinesReviewer', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../models/ValidatorApplication', () => ({
  find: jest.fn(),
}));

// /my-assigned hydrates each task's campaign so a reviewer can see the link
// and rate they are voting against. Unmocked, that read buffers against an
// unconnected mongoose instance and the route only answers after its 10s
// timeout — past Jest's 5s test limit.
jest.mock('../models/Campaign', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

// Mimics the Mongoose query chain these routes build:
// ValidatorApplication.find().select().sort().lean() and
// Campaign.find().select().lean().catch(). Awaitable at every step.
function chainable(resolvedValue) {
  const node = {
    select: jest.fn(() => node),
    sort: jest.fn(() => node),
    limit: jest.fn(() => node),
    lean: jest.fn().mockResolvedValue(resolvedValue),
    then: (onFulfilled, onRejected) => Promise.resolve(resolvedValue).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve(resolvedValue).catch(onRejected),
  };
  return node;
}

jest.mock('../models/AuditLog', () => ({
  create: jest.fn(),
}));

jest.mock('../services/minesReviewService', () => ({
  checkAndResolve: jest.fn(),
  computeWeight: jest.fn().mockReturnValue(1),
  refreshReviewerStats: jest.fn(),
}));

jest.mock('../services/notify', () => ({
  notify: jest.fn(),
}));

const User = require('../models/user');
const TaskSubmission = require('../models/TaskSubmission');
const MinesReviewer = require('../models/MinesReviewer');
const ValidatorApplication = require('../models/ValidatorApplication');
const Campaign = require('../models/Campaign');
const taskAssignmentRouter = require('../routes/taskAssignment');

function authHeader(userId = 'admin-1', role = 'admin') {
  const token = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

function userAuthHeader(userId = 'user-1') {
  const token = jwt.sign({ userId, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

describe('Task Assignment Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/task-assignment', taskAssignmentRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'admin-1', email: 'admin@example.com', role: 'admin' }),
    });
    Campaign.find.mockReturnValue(chainable([]));
  });

  describe('GET /tasks/pending-assignment', () => {
    test('requires admin authentication', async () => {
      const res = await request(app).get('/api/task-assignment/tasks/pending-assignment');

      expect(res.status).toBe(401);
    });

    test('rejects non-admin users', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'user@example.com', role: 'user' }),
      });

      const res = await request(app)
        .get('/api/task-assignment/tasks/pending-assignment')
        .set(userAuthHeader());

      expect(res.status).toBe(403);
    });

    test('returns pending tasks for admin', async () => {
      TaskSubmission.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await request(app)
        .get('/api/task-assignment/tasks/pending-assignment')
        .set(authHeader());

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /tasks/:id/assign', () => {
    test('requires exactly 6 validators', async () => {
      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/assign')
        .set(authHeader())
        .send({ validator_ids: ['v1', 'v2'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/6 validators/);
    });

    test('assigns validators successfully', async () => {
      const mockTask = {
        _id: 'task-1',
        assignment_status: 'none',
        save: jest.fn().mockResolvedValue(true),
      };
      TaskSubmission.findById.mockResolvedValue(mockTask);
      MinesReviewer.findOneAndUpdate.mockResolvedValue({});

      const validatorIds = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
      // POST /tasks/:id/assign gates on both halves of the validator rule:
      // an approved ValidatorApplication (services/validatorEligibility.js,
      // keyed by userId) and an active MinesReviewer stake for the same id.
      ValidatorApplication.find.mockReturnValue(chainable(
        validatorIds.map((id) => ({ userId: id, validatorAddress: `mall1${id}` }))
      ));
      MinesReviewer.find.mockReturnValue(chainable(
        validatorIds.map((id) => ({ validator_id: id, stakeStatus: 'active' }))
      ));

      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/assign')
        .set(authHeader())
        .send({ validator_ids: validatorIds });

      expect(res.status).toBe(200);
      expect(mockTask.assignment_status).toBe('assigned');
      expect(mockTask.assigned_validators).toEqual(validatorIds);
    });

    test('refuses to assign someone with no approved validator application', async () => {
      const mockTask = { _id: 'task-1', assignment_status: 'none', save: jest.fn().mockResolvedValue(true) };
      TaskSubmission.findById.mockResolvedValue(mockTask);
      const validatorIds = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'];
      // Only v1..v5 have approved applications; v6 is a plain account.
      ValidatorApplication.find.mockReturnValue(chainable(
        validatorIds.slice(0, 5).map((id) => ({ userId: id, validatorAddress: `mall1${id}` }))
      ));
      MinesReviewer.find.mockReturnValue(chainable(
        validatorIds.map((id) => ({ validator_id: id, stakeStatus: 'active' }))
      ));

      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/assign')
        .set(authHeader())
        .send({ validator_ids: validatorIds });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no approved validator application: v6/);
      expect(mockTask.save).not.toHaveBeenCalled();
    });
  });

  describe('GET /my-assigned', () => {
    test('requires authentication', async () => {
      const res = await request(app).get('/api/task-assignment/my-assigned');

      expect(res.status).toBe(401);
    });

    test('returns assigned tasks for authenticated validator', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'user@example.com', role: 'user' }),
      });

      TaskSubmission.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      });

      const res = await request(app)
        .get('/api/task-assignment/my-assigned')
        .set(userAuthHeader());

      expect(res.status).toBe(200);
    });
  });

  describe('POST /tasks/:id/vote', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/vote')
        .send({ vote: 'yes' });

      expect(res.status).toBe(401);
    });

    test('validates vote value', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'user@example.com', role: 'user' }),
      });

      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/vote')
        .set(userAuthHeader())
        .send({ vote: 'maybe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/yes.*no/);
    });
  });
});
