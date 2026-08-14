const request = require('supertest');
const express = require('express');
const axios = require('axios');

jest.mock('axios');
jest.mock('../services/stakingService');

const { getStakingSummary } = require('../services/stakingService');
const stakingRouter = require('../routes/staking');

describe('staking routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/staking', stakingRouter);
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /summary/:address', () => {
    test('returns the aggregated summary for a valid address', async () => {
      getStakingSummary.mockResolvedValue({
        address: 'mall1abc',
        displayDenom: 'MLCNS',
        totalStaked: 5,
        totalRewardsClaimed: 0,
        active: [],
        history: [],
      });

      const res = await request(app).get('/api/staking/summary/mall1abc');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.address).toBe('mall1abc');
      expect(getStakingSummary).toHaveBeenCalledWith('mall1abc');
    });

    test('returns 500 when the service throws', async () => {
      getStakingSummary.mockRejectedValue(new Error('chain unreachable'));

      const res = await request(app).get('/api/staking/summary/mall1abc');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'chain unreachable' });
    });

    test('passes a MongoDB-operator-shaped address straight through as a plain string', async () => {
      // preventNoSQLInjection only inspects req.body, not req.params — the address
      // here is just forwarded as an opaque string to the chain REST lookup, so this
      // documents that route params are not a NoSQL injection vector on this endpoint.
      getStakingSummary.mockResolvedValue({ address: '{"$ne":null}', active: [], history: [] });

      const res = await request(app).get('/api/staking/summary/%7B%22%24ne%22%3Anull%7D');

      expect(res.status).toBe(200);
      expect(getStakingSummary).toHaveBeenCalledWith('{"$ne":null}');
    });
  });

  describe('POST /broadcast', () => {
    test('rejects a request missing tx_bytes', async () => {
      const res = await request(app).post('/api/staking/broadcast').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ success: false, error: 'tx_bytes_required' });
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('broadcasts a signed tx and returns the tx hash on success', async () => {
      axios.post.mockResolvedValue({
        data: { tx_response: { code: 0, txhash: 'ABC123' } },
      });

      const res = await request(app)
        .post('/api/staking/broadcast')
        .send({ txBytes: 'deadbeef' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.txHash).toBe('ABC123');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/tx/v1beta1/txs'),
        { tx_bytes: 'deadbeef', mode: 'BROADCAST_MODE_SYNC' },
        expect.any(Object)
      );
    });

    test('surfaces a non-zero chain response code as a 400', async () => {
      axios.post.mockResolvedValue({
        data: { tx_response: { code: 5, raw_log: 'insufficient funds' } },
      });

      const res = await request(app)
        .post('/api/staking/broadcast')
        .send({ txBytes: 'deadbeef' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: 'insufficient funds' });
    });

    test('returns 500 when the broadcast request itself fails', async () => {
      axios.post.mockRejectedValue(new Error('network error'));

      const res = await request(app)
        .post('/api/staking/broadcast')
        .send({ txBytes: 'deadbeef' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ success: false, error: 'network error' });
    });

    test('rejects a payload over the size limit', async () => {
      const res = await request(app)
        .post('/api/staking/broadcast')
        .send({ txBytes: 'x'.repeat(600 * 1024) });

      expect(res.status).toBe(413);
    });
  });

  describe('POST /stake and /unstake legacy aliases', () => {
    test('both route to the same broadcast handler', async () => {
      axios.post.mockResolvedValue({
        data: { tx_response: { code: 0, txhash: 'STAKE1' } },
      });

      const stakeRes = await request(app).post('/api/staking/stake').send({ txBytes: 'aa' });
      const unstakeRes = await request(app).post('/api/staking/unstake').send({ txBytes: 'bb' });

      expect(stakeRes.status).toBe(200);
      expect(unstakeRes.status).toBe(200);
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });
});
