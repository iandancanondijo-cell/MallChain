const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  find: jest.fn(),
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
      const res = await request(app)
        .post('/api/task-assignment/tasks/task-1/assign')
        .set(authHeader())
        .send({ validator_ids: validatorIds });

      expect(res.status).toBe(200);
      expect(mockTask.assignment_status).toBe('assigned');
      expect(mockTask.assigned_validators).toEqual(validatorIds);
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
