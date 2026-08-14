const request = require('supertest');
const express = require('express');

jest.mock('../models/Contract', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const Contract = require('../models/Contract');
const contractsRoutes = require('../routes/contracts');

describe('contracts routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', contractsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET / lists only the caller\'s contracts, persisted (not lost on restart)', async () => {
    Contract.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'c1', name: 'Escrow' }]),
    });

    const res = await request(app).get('/api/contracts');

    expect(res.status).toBe(200);
    expect(Contract.find).toHaveBeenCalledWith({ userId: 'user1' });
    expect(res.body.data).toEqual([{ _id: 'c1', name: 'Escrow' }]);
  });

  test('POST /deploy creates a real Contract document scoped to the caller', async () => {
    Contract.create.mockResolvedValue({ _id: 'c1', userId: 'user1', name: 'Escrow', type: 'wasm', code: '(module)', address: '0xabc', txs: 0, status: 'active' });

    const res = await request(app).post('/api/contracts/deploy').send({ name: 'Escrow', type: 'wasm', code: '(module)' });

    expect(res.status).toBe(200);
    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user1', name: 'Escrow' }));
  });

  test('GET /:id 403s when the contract belongs to someone else', async () => {
    Contract.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'c1', userId: 'someoneElse' }) });

    const res = await request(app).get('/api/contracts/c1');

    expect(res.status).toBe(403);
  });

  test('DELETE /:id only deletes contracts owned by the caller', async () => {
    Contract.findOneAndDelete.mockResolvedValue({ _id: 'c1' });

    const res = await request(app).delete('/api/contracts/c1');

    expect(res.status).toBe(200);
    expect(Contract.findOneAndDelete).toHaveBeenCalledWith({ _id: 'c1', userId: 'user1' });
  });
});
