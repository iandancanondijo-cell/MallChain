// Regression coverage for the faucet controller (previously 0% covered):
// it's a thin pass-through to services/faucetService, but the error-mapping
// logic (err.status -> res.status, err.rawLog -> res.body.log) and the
// "address is required" 400 guards were never exercised by any test.
const request = require('supertest');
const express = require('express');

// Factory mock (not auto-mock) so Jest never has to load the real
// faucetService module tree — it pulls in @cosmjs/proto-signing ->
// @cosmjs/crypto's argon2 support, which drags in an ESM-only transitive
// dependency (@noble/hashes) that Jest's default CJS resolution can't parse.
jest.mock('../services/faucetService', () => ({
  creditMlcns: jest.fn(),
  getFaucetStatus: jest.fn(),
  fundGas: jest.fn(),
}));

const { creditMlcns, getFaucetStatus, fundGas } = require('../services/faucetService');
const faucetRoutes = require('../routes/faucet');

describe('faucet routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/faucet', faucetRoutes);
  });

  // Note: /mlcns and /fund-gas share one rate limiter (10 req/min per IP —
  // see routes/faucet.js). This suite issues 7 POSTs total across all
  // tests, comfortably under the limit, so it's safe to reuse one app/router
  // for the whole file rather than rebuild it (and complicate the service
  // mock wiring) per test.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /status', () => {
    test('returns the faucet status on success', async () => {
      getFaucetStatus.mockResolvedValue({ enabled: true, fundingAddress: 'mall1operator' });

      const res = await request(app).get('/api/faucet/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ enabled: true, fundingAddress: 'mall1operator' });
    });

    test('returns 500 when the status check throws', async () => {
      getFaucetStatus.mockRejectedValue(new Error('redis unavailable'));

      const res = await request(app).get('/api/faucet/status');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'redis unavailable' });
    });
  });

  describe('POST /mlcns', () => {
    test('rejects a request missing address', async () => {
      const res = await request(app).post('/api/faucet/mlcns').send({ amountMlcns: 100 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'address is required' });
      expect(creditMlcns).not.toHaveBeenCalled();
    });

    test('credits MLCNS for a valid address and forwards the amount', async () => {
      creditMlcns.mockResolvedValue({
        success: true,
        transfer: { txHash: 'ABC' },
        balance: { mlcns: 1000 },
      });

      const res = await request(app)
        .post('/api/faucet/mlcns')
        .send({ address: 'mall1recipient', amountMlcns: 500 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(creditMlcns).toHaveBeenCalledWith('mall1recipient', 500);
    });

    test('maps a service error status (e.g. cooldown) onto the HTTP response instead of defaulting to 500', async () => {
      const err = new Error('Please wait before requesting again');
      err.status = 429;
      creditMlcns.mockRejectedValue(err);

      const res = await request(app)
        .post('/api/faucet/mlcns')
        .send({ address: 'mall1recipient' });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Please wait before requesting again');
    });

    test('falls back to 500 and includes rawLog when the chain rejects the tx', async () => {
      const err = new Error('out of gas');
      err.rawLog = 'execute wasm contract failed: out of gas';
      creditMlcns.mockRejectedValue(err);

      const res = await request(app)
        .post('/api/faucet/mlcns')
        .send({ address: 'mall1recipient' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'out of gas', log: 'execute wasm contract failed: out of gas' });
    });
  });

  describe('POST /fund-gas', () => {
    test('rejects a request missing address', async () => {
      const res = await request(app).post('/api/faucet/fund-gas').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'address is required' });
      expect(fundGas).not.toHaveBeenCalled();
    });

    test('funds gas for a valid address', async () => {
      fundGas.mockResolvedValue({ success: true, txHash: 'DEF' });

      const res = await request(app)
        .post('/api/faucet/fund-gas')
        .send({ address: 'mall1recipient' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, txHash: 'DEF' });
      expect(fundGas).toHaveBeenCalledWith('mall1recipient');
    });

    test('maps a service error status onto the HTTP response', async () => {
      const err = new Error('faucet disabled');
      err.status = 403;
      fundGas.mockRejectedValue(err);

      const res = await request(app)
        .post('/api/faucet/fund-gas')
        .send({ address: 'mall1recipient' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'faucet disabled' });
    });
  });
});
