const request = require('supertest');
const express = require('express');

// countDocuments is the per-user active-key cap check in routes/devhub.js
// (MAX_KEYS_PER_USER). The factory mock has to carry every method the routes
// actually call, or the missing one throws and the request 500s.
jest.mock('../models/devhubApiKey', () => ({
  find: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const ApiKey = require('../models/devhubApiKey');
const devhubRoutes = require('../routes/devhub');

describe('devhub routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/devhub', devhubRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /keys lists only the caller\'s non-revoked keys', async () => {
    ApiKey.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'k1', name: 'prod' }]),
    });

    const res = await request(app).get('/api/devhub/keys');

    expect(res.status).toBe(200);
    expect(ApiKey.find).toHaveBeenCalledWith({ userId: 'user1', revoked: false });
  });

  test('POST /keys persists a real key scoped to the caller', async () => {
    ApiKey.countDocuments.mockResolvedValue(0);
    ApiKey.create.mockResolvedValue({ _id: 'k1', userId: 'user1', name: 'prod', key: 'mk_abc', permissions: ['read'] });

    const res = await request(app).post('/api/devhub/keys').send({ name: 'prod' });

    expect(res.status).toBe(200);
    expect(ApiKey.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user1', name: 'prod' }));
    expect(res.body.data.key).toMatch(/^mk_/);
  });

  test('POST /keys refuses a 21st active key instead of letting keys pile up', async () => {
    // routes/devhub.js caps a user at MAX_KEYS_PER_USER (20) unrevoked keys.
    ApiKey.countDocuments.mockResolvedValue(20);

    const res = await request(app).post('/api/devhub/keys').send({ name: 'one-too-many' });

    expect(res.status).toBe(409);
    expect(ApiKey.countDocuments).toHaveBeenCalledWith({ userId: 'user1', revoked: false });
    expect(ApiKey.create).not.toHaveBeenCalled();
  });

  test('DELETE /keys/:id revokes only the caller\'s own key', async () => {
    ApiKey.findOneAndUpdate.mockResolvedValue({ _id: 'k1', revoked: true });

    const res = await request(app).delete('/api/devhub/keys/k1');

    expect(res.status).toBe(200);
    expect(ApiKey.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'k1', userId: 'user1' },
      { $set: { revoked: true, revokedAt: expect.any(Date) } },
      { new: true }
    );
  });

  test('DELETE /keys/:id 404s for a key that does not belong to the caller (or does not exist)', async () => {
    ApiKey.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app).delete('/api/devhub/keys/not-mine');

    expect(res.status).toBe(404);
  });
});
