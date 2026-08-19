// Coverage for vaultController.js (previously 0%) — a generic encrypted-blob
// "vault" resource (backend/src/models/vault.js), unrelated to the chain-level
// x/vault custody module.
//
// While reading routes/vault.js, found a real bug: GET / and GET /:id had no
// `auth` middleware at all, while POST/PUT/DELETE all required it — meaning
// anyone, unauthenticated, could list or fetch every stored vault entry
// (including its `data` blob) even though the controller itself explicitly
// guards against ever storing a plaintext password in that same field. Fixed
// by requiring `auth` uniformly across the resource; the second describe
// block below is the regression test for that route-level fix.
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

jest.mock('../models/vault');

const Vault = require('../models/vault');
const vaultCtrl = require('../controllers/vaultController');

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('vaultController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.ALLOW_PLAINTEXT_VAULT_PASSWORDS;
  });

  describe('list', () => {
    test('returns the 100 most recently created vault entries', async () => {
      const items = [{ _id: 'a' }, { _id: 'b' }];
      const limitMock = jest.fn().mockResolvedValue(items);
      const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
      Vault.find.mockReturnValue({ sort: sortMock });

      const req = {};
      const res = mockRes();
      await vaultCtrl.list(req, res);

      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(limitMock).toHaveBeenCalledWith(100);
      expect(res.json).toHaveBeenCalledWith(items);
    });
  });

  describe('get', () => {
    test('404s when the entry does not exist', async () => {
      Vault.findById.mockResolvedValue(null);
      const req = { params: { id: 'missing' } };
      const res = mockRes();
      await vaultCtrl.get(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('returns the entry when found', async () => {
      const v = { _id: 'x', authority: 'a1' };
      Vault.findById.mockResolvedValue(v);
      const req = { params: { id: 'x' } };
      const res = mockRes();
      await vaultCtrl.get(req, res);
      expect(res.json).toHaveBeenCalledWith(v);
    });
  });

  describe('create', () => {
    test('rejects a missing authority', async () => {
      const req = { body: { data: { note: 'x' } } };
      const res = mockRes();
      await vaultCtrl.create(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Vault.create).not.toHaveBeenCalled();
    });

    test('rejects a plaintext password by default', async () => {
      const req = { body: { authority: 'a1', data: { password: 'hunter2' } } };
      const res = mockRes();
      await vaultCtrl.create(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Vault.create).not.toHaveBeenCalled();
    });

    test('allows a plaintext password only when explicitly opted in (dev only)', async () => {
      process.env.ALLOW_PLAINTEXT_VAULT_PASSWORDS = 'true';
      const created = { _id: '1', authority: 'a1', data: { password: 'hunter2' }, status: 'pending' };
      Vault.create.mockResolvedValue(created);
      const req = { body: { authority: 'a1', data: { password: 'hunter2' } } };
      const res = mockRes();
      await vaultCtrl.create(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    test('creates a new entry with status forced to pending', async () => {
      const created = { _id: '1', authority: 'a1', status: 'pending' };
      Vault.create.mockResolvedValue(created);
      const req = { body: { authority: 'a1', data: { note: 'x' } } };
      const res = mockRes();
      await vaultCtrl.create(req, res);
      expect(Vault.create).toHaveBeenCalledWith({ authority: 'a1', data: { note: 'x' }, status: 'pending' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });
  });

  describe('update', () => {
    test('rejects a plaintext password update by default', async () => {
      const req = { params: { id: 'x' }, body: { data: { password: 'p' } } };
      const res = mockRes();
      await vaultCtrl.update(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(Vault.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('404s when the entry does not exist', async () => {
      Vault.findByIdAndUpdate.mockResolvedValue(null);
      const req = { params: { id: 'x' }, body: { status: 'active' } };
      const res = mockRes();
      await vaultCtrl.update(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('updates and returns the new document', async () => {
      const updated = { _id: 'x', status: 'active' };
      Vault.findByIdAndUpdate.mockResolvedValue(updated);
      const req = { params: { id: 'x' }, body: { status: 'active' } };
      const res = mockRes();
      await vaultCtrl.update(req, res);
      expect(Vault.findByIdAndUpdate).toHaveBeenCalledWith('x', req.body, { new: true });
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('remove', () => {
    test('deletes by id and confirms', async () => {
      Vault.findByIdAndDelete.mockResolvedValue({ _id: 'x' });
      const req = { params: { id: 'x' } };
      const res = mockRes();
      await vaultCtrl.remove(req, res);
      expect(Vault.findByIdAndDelete).toHaveBeenCalledWith('x');
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });
});

describe('vault routes — auth enforcement (regression)', () => {
  const request = require('supertest');
  const express = require('express');
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/vault', require('../routes/vault'));
  });

  test('GET / is rejected without a token', async () => {
    const res = await request(app).get('/api/vault');
    expect(res.status).toBe(401);
  });

  test('GET /:id is rejected without a token', async () => {
    const res = await request(app).get('/api/vault/abc123');
    expect(res.status).toBe(401);
  });

  test('POST / is rejected without a token', async () => {
    const res = await request(app).post('/api/vault').send({ authority: 'a1' });
    expect(res.status).toBe(401);
  });
});
