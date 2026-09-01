// GET /api/maintenance must be reachable WITHOUT auth (that's the entire
// point — regular/anonymous users need this to render a real banner), and
// must fail open (report all-clear) rather than 500 if Mongo is down, since
// this route runs on every page load.
const request = require('supertest');
const express = require('express');

jest.mock('../models/MaintenanceMode', () => ({
  findById: jest.fn(),
}));

const MaintenanceMode = require('../models/MaintenanceMode');
const maintenanceStatusRoutes = require('../routes/maintenanceStatus');

function leanResult(doc) {
  return { lean: jest.fn().mockResolvedValue(doc) };
}

function buildApp() {
  const app = express();
  app.use('/api/maintenance', maintenanceStatusRoutes);
  return app;
}

describe('GET /api/maintenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reports all-clear with no auth required', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: false, scopes: {}, reason: '' }));

    const res = await request(buildApp()).get('/api/maintenance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, global: false, scopes: {}, reason: '' });
  });

  test('reports global pause and reason', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: true, scopes: { withdraw: true }, reason: 'incident' }));

    const res = await request(buildApp()).get('/api/maintenance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, global: true, scopes: { withdraw: true }, reason: 'incident' });
  });

  test('never leaks admin-only fields like updatedBy', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult({ global: false, scopes: {}, reason: '', updatedBy: 'admin@example.com' }));

    const res = await request(buildApp()).get('/api/maintenance');

    expect(res.body.updatedBy).toBeUndefined();
  });

  test('fails open (reports all-clear) when the state lookup throws', async () => {
    MaintenanceMode.findById.mockReturnValue({ lean: jest.fn().mockRejectedValue(new Error('mongo down')) });

    const res = await request(buildApp()).get('/api/maintenance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, global: false, scopes: {}, reason: '' });
  });

  test('handles no document existing yet (fresh install)', async () => {
    MaintenanceMode.findById.mockReturnValue(leanResult(null));

    const res = await request(buildApp()).get('/api/maintenance');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, global: false, scopes: {}, reason: '' });
  });
});
