/**
 * GET /api/network — the contract the SPA's network label now depends on.
 *
 * Pinned here because the alternative was three client surfaces each printing
 * `VITE_NETWORK`, which is how a mainnet dashboard grew a "testnet" chip next
 * to the user's name (backend-handoff-2026-11-09 §5). The rules worth a test:
 *
 *  1. The chain id is the node's, and the name is derived from it — not from
 *     anything the build baked in.
 *  2. When the node does not answer, the configured id is still returned but
 *     flagged `verified: false` / `source: 'config'`, so an unverified label
 *     can never be displayed as a measured one.
 *  3. Denom decimals come from the chain's own metadata when it publishes any,
 *     and the configured 6 is labelled `decimalsSource: 'configured'` when it
 *     does not. A number in this response always says where it came from.
 *  4. The naming convention leaves an unrecognised chain id alone instead of
 *     calling it mainnet.
 *
 * axios is mocked; the router, asyncHandler and the real config module are the
 * production code paths.
 */
const express = require('express');
const request = require('supertest');

jest.mock('axios');
const axios = require('axios');

const ctrl = require('../controllers/networkIdentityController');

function app() {
  const e = express();
  e.use('/api/network', require('../routes/networkIdentity'));
  return e;
}

const NODE_INFO = { default_node_info: { network: 'mallchain-1', moniker: 'mallchain-node-1' } };

function chainAnswers({ network = 'mallchain-1', metadata } = {}) {
  axios.get.mockImplementation((url) => {
    if (url.endsWith('/node_info')) {
      return Promise.resolve({ data: { default_node_info: { network, moniker: 'mallchain-node-1' } } });
    }
    if (url.endsWith('/denoms_metadata')) {
      return Promise.resolve({ data: metadata === undefined ? {} : { metadata } });
    }
    return Promise.reject(new Error(`unexpected chain REST call: ${url}`));
  });
}

beforeEach(() => {
  axios.get.mockReset();
  ctrl._resetDenomCache();
});

describe('GET /api/network', () => {
  test('names the chain the node says it is', async () => {
    chainAnswers({ network: 'mallchain-1' });

    const res = await request(app()).get('/api/network');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      chainId: 'mallchain-1',
      networkName: 'Mallchain Mainnet',
      bech32Prefix: 'mall',
      baseDenom: 'stake',
      verified: true,
      source: 'node',
      moniker: 'mallchain-node-1',
    });
    expect(res.body.explorer.tx).toContain('#/explorer?tx={hash}');
    // The SPA has no per-block URL — heights are typed into the explorer's
    // search box — so the endpoint must not advertise one it cannot honour.
    expect(res.body.explorer.block).toBeUndefined();
  });

  test('calls a test chain a test chain', async () => {
    chainAnswers({ network: 'mallchain-test-1' });

    const res = await request(app()).get('/api/network');

    expect(res.body.networkName).toBe('Mallchain Testnet');
  });

  test('leaves a chain id the convention does not recognise unlabelled', async () => {
    chainAnswers({ network: 'mallchain-alpha' });

    const res = await request(app()).get('/api/network');

    expect(res.body.networkName).toBe('mallchain-alpha');
  });

  test('still answers from configuration when the node is quiet, and says so', async () => {
    axios.get.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1317'));

    const res = await request(app()).get('/api/network');

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
    expect(res.body.source).toBe('config');
    expect(res.body.chainId).toBe(process.env.CHAIN_ID || 'mallchain-1');
    expect(res.body.nodeError).toMatch(/ECONNREFUSED/);
  });

  test('reads denom decimals from the chain when the chain publishes them', async () => {
    chainAnswers({
      metadata: [{
        base: 'stake',
        display: 'MALL',
        denom_units: [
          { denom: 'stake', exponent: 0 },
          { denom: 'MALL', exponent: 6 },
        ],
      }],
    });

    const res = await request(app()).get('/api/network');

    expect(res.body).toMatchObject({ decimals: 6, displayDenom: 'MALL', decimalsSource: 'chain' });
  });

  test('labels the configured exponent when the chain has no denom metadata', async () => {
    chainAnswers({ metadata: [] });

    const res = await request(app()).get('/api/network');

    expect(res.body).toMatchObject({ decimals: 6, decimalsSource: 'configured' });
  });

  test('is public: no session and no CSRF needed to read it', async () => {
    chainAnswers();

    const res = await request(app()).get('/api/network').set('Cookie', []);

    expect(res.status).toBe(200);
  });
});
