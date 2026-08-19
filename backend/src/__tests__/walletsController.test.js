// Regression coverage for the wallets controller (previously 0% covered).
// It paginates through /cosmos/auth/v1beta1/accounts, then fetches a bank
// balance per account and filters down to nonzero 'mlcns' holders. The
// pagination loop and the "swallow chain errors -> empty list" fallback
// (rather than a 500) were both untested and easy to silently break.
const request = require('supertest');
const express = require('express');
const axios = require('axios');

jest.mock('axios');

const walletsRoutes = require('../routes/wallets');

describe('GET /api/wallets/wallets', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/wallets', walletsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns only accounts with a nonzero mlcns balance, converted from micro units', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/cosmos/auth/v1beta1/accounts')) {
        return Promise.resolve({
          data: {
            accounts: [{ address: 'mall1rich' }, { address: 'mall1poor' }, { address: 'mall1zero' }],
            pagination: { next_key: null },
          },
        });
      }
      if (url.includes('/cosmos/bank/v1beta1/balances/mall1rich')) {
        return Promise.resolve({ data: { balances: [{ denom: 'mlcns', amount: '5000000' }] } });
      }
      if (url.includes('/cosmos/bank/v1beta1/balances/mall1poor')) {
        return Promise.resolve({ data: { balances: [{ denom: 'umlcn', amount: '100' }] } });
      }
      if (url.includes('/cosmos/bank/v1beta1/balances/mall1zero')) {
        return Promise.resolve({ data: { balances: [{ denom: 'mlcns', amount: '0' }] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const res = await request(app).get('/api/wallets/wallets');

    expect(res.status).toBe(200);
    expect(res.body.wallets).toEqual([{ address: 'mall1rich', amount: 5 }]);
    expect(res.body.total).toBe(5);
  });

  test('follows pagination.next_key across multiple account pages', async () => {
    axios.get.mockImplementation((url) => {
      if (url.includes('/cosmos/auth/v1beta1/accounts') && !url.includes('pagination.key')) {
        return Promise.resolve({
          data: { accounts: [{ address: 'mall1a' }], pagination: { next_key: 'page2' } },
        });
      }
      if (url.includes('pagination.key=page2')) {
        return Promise.resolve({
          data: { accounts: [{ address: 'mall1b' }], pagination: { next_key: null } },
        });
      }
      if (url.includes('/cosmos/bank/v1beta1/balances/mall1a')) {
        return Promise.resolve({ data: { balances: [{ denom: 'mlcns', amount: '1000000' }] } });
      }
      if (url.includes('/cosmos/bank/v1beta1/balances/mall1b')) {
        return Promise.resolve({ data: { balances: [{ denom: 'mlcns', amount: '2000000' }] } });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const res = await request(app).get('/api/wallets/wallets');

    expect(res.status).toBe(200);
    expect(res.body.wallets).toEqual([
      { address: 'mall1a', amount: 1 },
      { address: 'mall1b', amount: 2 },
    ]);
    expect(res.body.total).toBe(3);
  });

  test('returns an empty wallet list (200) instead of a 500 when the chain is unreachable', async () => {
    axios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await request(app).get('/api/wallets/wallets');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ wallets: [], total: 0 });
  });

  test('rejects a NoSQL-injection-shaped request body via preventNoSQLInjection', async () => {
    // preventNoSQLInjection only inspects req.body (see middleware/inputValidation.js),
    // so this is the shape it actually guards against on this route.
    const res = await request(app)
      .get('/api/wallets/wallets')
      .send({ filter: { $ne: null } });

    expect(res.status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
