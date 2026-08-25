// Coverage for walletCreationController.js — GET /:address (balance).
//
// createWallet/validateMnemonic/generateMnemonic used to live here (and be
// covered here) but were removed: they took a plaintext mnemonic over an
// unauthenticated endpoint just to run a pure local crypto derivation the
// frontend now does itself (mallchain-os-v14/src/services/wallet.ts).

jest.mock('../services/mallcoinService');
jest.mock('../services/mallpointsService');
jest.mock('../models/MallPointAccount');

const express = require('express');
const request = require('supertest');
const mallcoinService = require('../services/mallcoinService');
const { getChainUserPoints, mergePoints } = require('../services/mallpointsService');
const MallPointAccount = require('../models/MallPointAccount');

const walletCreationCtrl = require('../controllers/walletCreationController');

const DERIVED_ADDRESS = 'mall1derivedaddressxxxxxxxxxxxxxxxxxxxxxx';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/:address', walletCreationCtrl.getWalletBalance);
  return app;
}

describe('walletCreationController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
