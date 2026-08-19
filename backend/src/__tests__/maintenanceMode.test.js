// Regression coverage for the emergency-pause middleware: a global or
// per-scope pause must actually block requests to a money-moving route
// group before the real handler runs, and an unrelated scope must be
// unaffected. Also locks in the fail-open behavior (a broken state lookup
// must not itself take down every money-moving route).
const request = require('supertest');
const express = require('express');

jest.mock('../models/MaintenanceMode', () => ({
  findById: jest.fn(),
}));

const MaintenanceMode = require('../models/MaintenanceMode');
const { maintenanceGuard, invalidateCache } = require('../middleware/maintenanceMode');

function leanResult(doc) {
  return { lean: jest.fn().mockResolvedValue(doc) };
}

function buildApp(scope) {
  const app = express();
  app.get('/op', maintenanceGuard(scope), (req, res) => res.json({ ok: true }));
  return app;
}

describe('maintenanceGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCache();
  });

  test('allows the request through when nothing is paused', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: false, scopes: {} }));

    const res = await request(buildApp('send')).get('/op');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('rejects with 503 when the global pause is on, regardless of scope', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: true, scopes: {}, reason: 'incident' }));

    const res = await request(buildApp('withdraw')).get('/op');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('maintenance_mode');
    expect(res.body.message).toBe('incident');
  });

  test('rejects only the specific scope that is paused', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: false, scopes: { withdraw: true } }));

    const pausedRes = await request(buildApp('withdraw')).get('/op');
    expect(pausedRes.status).toBe(503);

    invalidateCache();
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: false, scopes: { withdraw: true } }));
    const unaffectedRes = await request(buildApp('send')).get('/op');
    expect(unaffectedRes.status).toBe(200);
  });

  test('fails open (allows the request) when the state lookup throws', async () => {
    MaintenanceMode.findById.mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('mongo down')) });

    const res = await request(buildApp('send')).get('/op');

    expect(res.status).toBe(200);
  });
});
