const request = require('supertest');
const express = require('express');

jest.mock('axios');
const axios = require('axios');
const marketplaceRoutes = require('../routes/marketplace');

describe('marketplace escrow relay routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/marketplace', marketplaceRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /escrow/broadcast requires txBytes', async () => {
    const res = await request(app).post('/api/marketplace/escrow/broadcast').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('tx_bytes_required');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('POST /escrow/broadcast relays signed bytes and returns the tx hash on success', async () => {
    axios.post.mockResolvedValue({ data: { tx_response: { code: 0, txhash: 'ABC123' } } });

    const res = await request(app).post('/api/marketplace/escrow/broadcast').send({ txBytes: 'base64data' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, txHash: 'ABC123', txResponse: { code: 0, txhash: 'ABC123' } });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/cosmos/tx/v1beta1/txs'),
      { tx_bytes: 'base64data', mode: 'BROADCAST_MODE_SYNC' }
    );
  });

  test('POST /escrow/broadcast surfaces the chain rawLog on a rejected tx', async () => {
    axios.post.mockResolvedValue({ data: { tx_response: { code: 5, raw_log: 'insufficient funds' } } });

    const res = await request(app).post('/api/marketplace/escrow/broadcast').send({ txBytes: 'base64data' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: 'insufficient funds' });
  });

  test('GET /escrow/:id proxies to the chain REST and returns the escrow', async () => {
    axios.get.mockResolvedValue({ data: { escrow: { id: 'e1', status: 'open' } } });

    const res = await request(app).get('/api/marketplace/escrow/e1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, escrow: { id: 'e1', status: 'open' } });
  });

  test('GET /escrow filters the list by buyer when provided', async () => {
    axios.get.mockResolvedValue({ data: { escrows: [{ id: 'e1', buyer: 'mall1a' }, { id: 'e2', buyer: 'mall1b' }] } });

    const res = await request(app).get('/api/marketplace/escrow?buyer=mall1a');

    expect(res.status).toBe(200);
    expect(res.body.escrows).toEqual([{ id: 'e1', buyer: 'mall1a' }]);
  });

  // A marketplaced binary predating the query answers the gateway with HTTP
  // 200 + a grpc status body. Passing that through as data reads to the buyer
  // as "you have no escrows", which is a wrong answer, not an empty one.
  test('GET /escrow reports 503 when the node answers with a status envelope', async () => {
    axios.get.mockResolvedValue({ data: { code: 12, message: 'Not Implemented' } });

    const res = await request(app).get('/api/marketplace/escrow');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, error: 'Not Implemented' });
  });

  test('GET /escrow/:id reports 503 when the node answers with a status envelope', async () => {
    axios.get.mockResolvedValue({ data: { code: 12, message: 'Not Implemented' } });

    const res = await request(app).get('/api/marketplace/escrow/e1');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });

  test('GET /escrow still returns an genuinely empty list as empty', async () => {
    axios.get.mockResolvedValue({ data: { escrows: [] } });

    const res = await request(app).get('/api/marketplace/escrow');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, escrows: [] });
  });
});
