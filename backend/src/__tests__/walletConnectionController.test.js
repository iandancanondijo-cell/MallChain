// Coverage for walletConnectionController.js — the /api/wallet/connect,
// /validate, and /balance/:address endpoints. These are unauthenticated by
// design (address-only, read-only chain queries), but the controller must
// still refuse to accept private keys/seed phrases server-side and must
// validate address format before ever hitting the chain.

jest.mock('axios');
// walletConnectionController requires @cosmjs/proto-signing at module scope
// (for its unused-by-any-route deriveAddressFromSeedPhrase helper) —
// @cosmjs/crypto@0.39's argon2 support drags in an ESM-only transitive dep
// Jest's CJS resolver can't parse. Factory-mock so that module tree is
// never actually loaded, matching sendController.test.js / burnTxBuilder.test.js.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));

const axios = require('axios');
const express = require('express');
const request = require('supertest');

const walletCtrl = require('../controllers/walletConnectionController');

// Real, checksum-valid bech32 addresses (20-byte payload) — isValidCosmosAddress
// now does a real bech32 decode, so fixtures must be real addresses, not
// prefix-shaped strings like 'mall1' + 'q'.repeat(40) (invalid checksum).
const VALID_ADDRESS = 'mall1dw0x8znle5dzmk97k6w4k8075000j9w5wg8fwe';
const VALID_COSMOS_ADDRESS = 'cosmos1pmfsqp8keqc42w794q89hmdnh5727mjk4nupht';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/connect', walletCtrl.connectWallet);
  app.post('/validate', walletCtrl.validateAddress);
  app.get('/balance/:address', walletCtrl.getWalletBalance);
  return app;
}

describe('walletConnectionController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('isValidCosmosAddress', () => {
    test('accepts real cosmos/mall-prefixed addresses with a valid bech32 checksum', () => {
      expect(walletCtrl.isValidCosmosAddress(VALID_ADDRESS)).toBe(true);
      expect(walletCtrl.isValidCosmosAddress(VALID_COSMOS_ADDRESS)).toBe(true);
    });

    test('rejects short, malformed, or wrong-prefix addresses', () => {
      expect(walletCtrl.isValidCosmosAddress('mall1short')).toBe(false);
      expect(walletCtrl.isValidCosmosAddress('bitcoin1' + 'a'.repeat(40))).toBe(false);
      expect(walletCtrl.isValidCosmosAddress('')).toBe(false);
      expect(walletCtrl.isValidCosmosAddress(undefined)).toBe(false);
    });

    test('rejects a well-formed-looking address with an invalid checksum (e.g. a typo)', () => {
      // Same prefix/length shape as VALID_ADDRESS, but not a real checksum —
      // this is exactly the class of error bech32's checksum exists to catch.
      expect(walletCtrl.isValidCosmosAddress('mall1' + 'q'.repeat(40))).toBe(false);
      // A single flipped character from a real valid address must fail too.
      const typoed = VALID_ADDRESS.slice(0, -1) + (VALID_ADDRESS.endsWith('e') ? 'w' : 'e');
      expect(walletCtrl.isValidCosmosAddress(typoed)).toBe(false);
    });
  });

  describe('connectWallet', () => {
    test('refuses seed-phrase-based connection — never accepts secrets server-side', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/connect')
        .send({ method: 'seedPhrase', seedPhrase: 'word '.repeat(12).trim() });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only an address/i);
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('refuses privateKey-based connection', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/connect')
        .send({ method: 'privateKey', address: VALID_ADDRESS });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only an address/i);
    });

    test('rejects when address is missing', async () => {
      const app = buildApp();
      const res = await request(app).post('/connect').send({ method: 'address' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/required/i);
    });

    test('rejects invalid address format before ever querying the chain', async () => {
      const app = buildApp();
      const res = await request(app).post('/connect').send({ address: 'not-a-real-address' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid wallet address/i);
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('connects and parses balances from the chain (umlcn -> mallcoins, umal -> convertedBalance)', async () => {
      axios.get.mockImplementation((url) => {
        if (url.includes('/bank/v1beta1/balances/')) {
          return Promise.resolve({
            data: { balances: [{ denom: 'umlcn', amount: '5000000' }, { denom: 'umal', amount: '250000' }] },
          });
        }
        if (url.includes('/auth/v1beta1/accounts/')) {
          return Promise.resolve({ data: { account: { account_number: '7', sequence: '2' } } });
        }
        return Promise.reject(new Error('unexpected url ' + url));
      });

      const app = buildApp();
      const res = await request(app).post('/connect').send({ address: VALID_ADDRESS });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance.mallcoins).toBe(5); // 5,000,000 / 1e6
      expect(res.body.balance.umal).toBe(250000);
      expect(res.body.balance.convertedBalance).toBe(2); // 250000 / 100000
      expect(res.body.account).toEqual({ accountNumber: '7', sequence: '2' });
    });

    test('still returns success with a zero balance when the chain query fails (address may just be unfunded)', async () => {
      axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const app = buildApp();
      const res = await request(app).post('/connect').send({ address: VALID_ADDRESS });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.balance).toEqual(
        expect.objectContaining({ mallcoins: 0, umal: 0 })
      );
      expect(res.body.warning).toMatch(/no balance yet/i);
    });
  });

  describe('validateAddress', () => {
    test('rejects when address is missing', async () => {
      const app = buildApp();
      const res = await request(app).post('/validate').send({});

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });

    test('reports valid:false for malformed addresses without hitting the chain', async () => {
      const app = buildApp();
      const res = await request(app).post('/validate').send({ address: 'nope' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('reports valid + exists:true when the chain has a balance record', async () => {
      axios.get.mockResolvedValue({ data: { balances: [] } });

      const app = buildApp();
      const res = await request(app).post('/validate').send({ address: VALID_ADDRESS });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ valid: true, exists: true });
    });

    test('reports valid + exists:false when the address is well-formed but unfunded/unknown on-chain', async () => {
      axios.get.mockRejectedValue(new Error('404'));

      const app = buildApp();
      const res = await request(app).post('/validate').send({ address: VALID_ADDRESS });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ valid: true, exists: false });
    });
  });

  describe('getWalletBalance', () => {
    test('rejects invalid address with 400', async () => {
      const app = buildApp();
      const res = await request(app).get('/balance/bad-address');

      expect(res.status).toBe(400);
      expect(axios.get).not.toHaveBeenCalled();
    });

    test('returns parsed balances for a valid address', async () => {
      axios.get.mockResolvedValue({
        data: { balances: [{ denom: 'mlcn', amount: '9000000' }] },
      });

      const app = buildApp();
      const res = await request(app).get(`/balance/${VALID_ADDRESS}`);

      expect(res.status).toBe(200);
      expect(res.body.address).toBe(VALID_ADDRESS);
      expect(res.body.balance.mallcoins).toBe(9);
    });

    test('returns 500 when the chain query fails outright', async () => {
      axios.get.mockRejectedValue(new Error('timeout'));

      const app = buildApp();
      const res = await request(app).get(`/balance/${VALID_ADDRESS}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/failed to fetch balance/i);
    });
  });
});
