// Coverage for walletCreationController.js — /api/wallet/create,
// /validate, /generate-mnemonic, and GET /:address (balance).
//
// Regression test included: createWallet used to also open a
// SigningStargateClient connection to the chain RPC after deriving the
// address, even though that client was never used for anything (no tx is
// signed/broadcast here). That meant wallet creation — a purely local
// crypto operation — failed with a 500 whenever the chain node was
// unreachable. Fixed by dropping the unused connection; this suite asserts
// createWallet succeeds even when nothing chain-related is reachable.

// @cosmjs/proto-signing drags in @cosmjs/crypto's argon2 support, an
// ESM-only transitive dep Jest's CJS resolver can't parse — factory-mock so
// the real module tree is never loaded (matches sendController.test.js).
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('../services/mallcoinService');
jest.mock('../services/mallpointsService');
jest.mock('../models/MallPointAccount');

const express = require('express');
const request = require('supertest');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const mallcoinService = require('../services/mallcoinService');
const { getChainUserPoints, mergePoints } = require('../services/mallpointsService');
const MallPointAccount = require('../models/MallPointAccount');

const walletCreationCtrl = require('../controllers/walletCreationController');

const VALID_MNEMONIC = 'word '.repeat(12).trim();
const DERIVED_ADDRESS = 'mall1derivedaddressxxxxxxxxxxxxxxxxxxxxxx';

function mockWalletFor(mnemonic) {
  if (mnemonic !== VALID_MNEMONIC) {
    return Promise.reject(new Error('Invalid mnemonic format'));
  }
  return Promise.resolve({
    getAccounts: jest.fn().mockResolvedValue([{ address: DERIVED_ADDRESS }]),
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/create', walletCreationCtrl.createWallet);
  app.post('/validate', walletCreationCtrl.validateMnemonic);
  app.post('/generate-mnemonic', walletCreationCtrl.generateMnemonic);
  app.get('/:address', walletCreationCtrl.getWalletBalance);
  return app;
}

describe('walletCreationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DirectSecp256k1HdWallet.fromMnemonic.mockImplementation((mnemonic) => mockWalletFor(mnemonic));
  });

  describe('createWallet', () => {
    test('rejects when mnemonic is missing', async () => {
      const app = buildApp();
      const res = await request(app).post('/create').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/mnemonic is required/i);
    });

    test('derives and returns the address without needing a live chain connection', async () => {
      const app = buildApp();
      const res = await request(app).post('/create').send({ mnemonic: VALID_MNEMONIC });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ success: true, address: DERIVED_ADDRESS, accountId: DERIVED_ADDRESS })
      );
      expect(DirectSecp256k1HdWallet.fromMnemonic).toHaveBeenCalledWith(
        VALID_MNEMONIC,
        expect.objectContaining({ prefix: 'mall' })
      );
    });

    test('returns 500 with details when the mnemonic cannot be turned into a wallet', async () => {
      const app = buildApp();
      const res = await request(app).post('/create').send({ mnemonic: 'not a real mnemonic' });

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/failed to create wallet/i);
    });
  });

  describe('validateMnemonic', () => {
    test('rejects when mnemonic is missing', async () => {
      const app = buildApp();
      const res = await request(app).post('/validate').send({});

      expect(res.status).toBe(400);
    });

    test('reports valid:true with the derived address for a valid mnemonic', async () => {
      const app = buildApp();
      const res = await request(app).post('/validate').send({ mnemonic: VALID_MNEMONIC });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ valid: true, address: DERIVED_ADDRESS });
    });

    test('reports valid:false (400) for a bogus mnemonic', async () => {
      const app = buildApp();
      const res = await request(app).post('/validate').send({ mnemonic: 'bogus words here' });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('generateMnemonic', () => {
    test('generates a valid 24-word BIP39 mnemonic', async () => {
      const app = buildApp();
      const res = await request(app).post('/generate-mnemonic').send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mnemonic.trim().split(/\s+/)).toHaveLength(24);
    });
  });

  describe('getWalletBalance', () => {
    test('returns MALL from mallcoinService merged with MLPTS from chain+db', async () => {
      mallcoinService.getWalletBalance.mockResolvedValue({ availableDisplay: 42.5 });
      MallPointAccount.findOne.mockResolvedValue({ balance: 10 });
      getChainUserPoints.mockResolvedValue({ exists: true, points: 5 });
      mergePoints.mockReturnValue({ balance: 15 });

      const app = buildApp();
      const res = await request(app).get(`/${DERIVED_ADDRESS}`);

      expect(res.status).toBe(200);
      expect(res.body.address).toBe(DERIVED_ADDRESS);
      expect(res.body.MALL).toBe(42.5);
      expect(res.body.MLPTS).toBe(15);
      expect(mergePoints).toHaveBeenCalledWith({ chain: { exists: true, points: 5 }, dbBalance: 10 });
    });

    test('falls back to zeroed balance with a note when the MLCoin chain module is unavailable', async () => {
      mallcoinService.getWalletBalance.mockRejectedValue(new Error('chain unreachable'));

      const app = buildApp();
      const res = await request(app).get(`/${DERIVED_ADDRESS}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({ MALL: 0, MLPTS: 0, note: 'Blockchain REST API unavailable' })
      );
    });

    test('still returns MALL balance even when the mallpoints lookup fails', async () => {
      mallcoinService.getWalletBalance.mockResolvedValue({ availableDisplay: 7 });
      MallPointAccount.findOne.mockRejectedValue(new Error('db down'));

      const app = buildApp();
      const res = await request(app).get(`/${DERIVED_ADDRESS}`);

      expect(res.status).toBe(200);
      expect(res.body.MALL).toBe(7);
      expect(res.body.MLPTS).toBe(0);
    });
  });
});
