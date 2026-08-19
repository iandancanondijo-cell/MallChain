// Coverage for governanceController.js, which proxies x/gov proposal
// listing/voting from the real chain REST API. These tests exercise the
// controller together with the real governanceService (only axios is
// mocked), matching the CHAIN_REST default of http://127.0.0.1:1317.

jest.mock('axios');

const axios = require('axios');
const express = require('express');
const request = require('supertest');

const governanceCtrl = require('../controllers/governanceController');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/proposals', governanceCtrl.listProposals);
  app.get('/proposal/:id', governanceCtrl.getProposal);
  app.get('/proposal/:id/vote/:voter', governanceCtrl.getUserVote);
  app.get('/deposit-params', governanceCtrl.getDepositParams);
  app.get('/voting-power/:address', governanceCtrl.getVotingPower);
  app.post('/vote', governanceCtrl.vote);
  return app;
}

describe('governanceController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('listProposals', () => {
    test('normalizes proposals from the v1 gov endpoint and computes active count', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/tally')) {
          return Promise.resolve({ data: { tally: { yes: '10', no: '0', abstain: '0', no_with_veto: '0' } } });
        }
        if (url.includes('/cosmos/gov/v1/proposals')) {
          return Promise.resolve({
            data: {
              proposals: [
                { id: '1', status: 'PROPOSAL_STATUS_VOTING_PERIOD', title: 'Proposal one' },
                { id: '2', status: 'PROPOSAL_STATUS_PASSED', title: 'Proposal two' },
              ],
              pagination: { next_key: null },
            },
          });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const app = buildApp();
      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.proposals).toHaveLength(2);
      expect(res.body.stats).toEqual({ total: 2, active: 1 });
      expect(res.body.proposals[0].tally.yes).toBe('10');
    });

    test('falls back to v1beta1 when v1 returns no proposals', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/cosmos/gov/v1/proposals')) {
          return Promise.resolve({ data: {} });
        }
        if (url.includes('/cosmos/gov/v1beta1/proposals')) {
          return Promise.resolve({
            data: { proposals: [{ id: '5', status: 'PROPOSAL_STATUS_REJECTED', title: 'Old proposal' }] },
          });
        }
        if (url.includes('/tally')) {
          return Promise.reject(new Error('no tally'));
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const app = buildApp();
      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      expect(res.body.source).toBe('v1beta1');
      expect(res.body.proposals).toHaveLength(1);
    });

    test('returns a safe empty fallback (not a 500) when the chain is entirely unreachable', async () => {
      axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const app = buildApp();
      const res = await request(app).get('/proposals');

      expect(res.status).toBe(200);
      // fetchProposalsAnyVersion catches per-URL errors internally and never
      // throws, so the controller's own try/catch is not hit — the chain
      // being fully unreachable is reported as source "unavailable" with an
      // empty proposal list, not a 500.
      expect(res.body).toEqual({
        success: true,
        proposals: [],
        pagination: {},
        source: 'unavailable',
        stats: { total: 0, active: 0 },
      });
    });

    test('includes userVote per-proposal when a voter query param is supplied', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/votes/')) {
          return Promise.resolve({ data: { vote: { options: [{ option: 'VOTE_OPTION_YES' }] } } });
        }
        if (url.includes('/tally')) return Promise.reject(new Error('no tally'));
        if (url.includes('/cosmos/gov/v1/proposals')) {
          return Promise.resolve({
            data: { proposals: [{ id: '1', status: 'PROPOSAL_STATUS_VOTING_PERIOD', title: 'P1' }] },
          });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const app = buildApp();
      const res = await request(app).get('/proposals').query({ voter: 'mall1voter' });

      expect(res.status).toBe(200);
      expect(res.body.proposals[0].userVote).toEqual({ option: 'VOTE_OPTION_YES', voted: true });
    });
  });

  describe('getProposal', () => {
    test('returns 404 when neither v1 nor v1beta1 has the proposal', async () => {
      axios.get.mockRejectedValue(new Error('not found'));

      const app = buildApp();
      const res = await request(app).get('/proposal/999');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'proposal_not_found' });
    });

    test('returns the normalized proposal with tally and params on success', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/tally')) {
          return Promise.resolve({ data: { tally: { yes: '3', no: '1', abstain: '0', no_with_veto: '0' } } });
        }
        if (url.includes('/params/voting')) {
          return Promise.resolve({ data: { params: { voting_period: '172800s' } } });
        }
        if (url.includes('/proposals/42')) {
          return Promise.resolve({ data: { proposal: { id: '42', status: 'PROPOSAL_STATUS_VOTING_PERIOD', title: 'Test' } } });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const app = buildApp();
      const res = await request(app).get('/proposal/42');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.proposal.id).toBe('42');
      expect(res.body.proposal.tally.yes).toBe('3');
      expect(res.body.params).toEqual({ voting_period: '172800s' });
    });
  });

  describe('getDepositParams', () => {
    test('returns params on success', async () => {
      axios.get.mockResolvedValue({ data: { deposit_params: { min_deposit: [{ denom: 'stake', amount: '10000000' }] } } });

      const app = buildApp();
      const res = await request(app).get('/deposit-params');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, params: { min_deposit: [{ denom: 'stake', amount: '10000000' }] } });
    });
  });

  describe('getVotingPower', () => {
    test('sums bonded delegations for the address (real x/staking power, not the off-chain pool)', async () => {
      axios.get.mockResolvedValue({
        data: {
          delegation_responses: [
            { delegation: { validator_address: 'mallvaloper1a' }, balance: { denom: 'stake', amount: '1000' } },
            { delegation: { validator_address: 'mallvaloper1b' }, balance: { denom: 'stake', amount: '2500' } },
          ],
        },
      });

      const app = buildApp();
      const res = await request(app).get('/voting-power/mall1voter');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalStaked).toBe('3500');
      expect(res.body.delegations).toHaveLength(2);
    });

    test('returns zero voting power (not an error) when the address has no delegations', async () => {
      axios.get.mockRejectedValue(new Error('not found'));

      const app = buildApp();
      const res = await request(app).get('/voting-power/mall1nobody');

      expect(res.status).toBe(200);
      expect(res.body.totalStaked).toBe('0');
    });
  });

  describe('vote (tx broadcast)', () => {
    test('rejects with 400 when txBytes is missing — never signs on the server', async () => {
      const app = buildApp();
      const res = await request(app).post('/vote').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('tx_bytes_required');
      expect(axios.post).not.toHaveBeenCalled();
    });

    test('broadcasts the client-signed tx and returns the tx hash on success', async () => {
      axios.post = jest.fn().mockResolvedValue({
        data: { tx_response: { code: 0, txhash: 'ABC123' } },
      });

      const app = buildApp();
      const res = await request(app).post('/vote').send({ txBytes: 'base64signedtx==' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ success: true, txHash: 'ABC123' })
      );
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/cosmos/tx/v1beta1/txs'),
        expect.objectContaining({ tx_bytes: 'base64signedtx==', mode: 'BROADCAST_MODE_SYNC' }),
        expect.any(Object)
      );
    });

    test('surfaces a non-zero chain result code as a 400, not a false success', async () => {
      axios.post = jest.fn().mockResolvedValue({
        data: { tx_response: { code: 5, raw_log: 'insufficient funds' } },
      });

      const app = buildApp();
      const res = await request(app).post('/vote').send({ txBytes: 'base64signedtx==' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({ success: false, error: 'insufficient funds' })
      );
    });

    test('returns 500 when the broadcast request itself fails', async () => {
      axios.post = jest.fn().mockRejectedValue(new Error('network error'));

      const app = buildApp();
      const res = await request(app).post('/vote').send({ txBytes: 'base64signedtx==' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
