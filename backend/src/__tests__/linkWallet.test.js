// Regression coverage for POST /api/auth/link-wallet and GET /api/auth/me's
// badge enrichment — the only place a login (JWT identity) gets associated
// with an on-chain address, which the badge snapshot job depends on to know
// who to issue a badge to.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../models/user', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../services/badgeService', () => ({
  getUserBadgeInfo: jest.fn(),
}));
// verifyAdr036.js pulls in @cosmjs/amino -> @cosmjs/crypto, whose argon2
// support is an ESM-only transitive dependency Jest's default CJS
// resolution can't parse (same reason mallpointsConvert.test.js mocks it).
// linkWallet requires it lazily inside the handler specifically so this
// mock only has to cover this one test file.
jest.mock('../mallwallet/security/verifyAdr036', () => ({
  verifyLinkWalletSignature: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';

const User = require('../models/user');
const { getUserBadgeInfo } = require('../services/badgeService');
const { verifyLinkWalletSignature } = require('../mallwallet/security/verifyAdr036');
const authController = require('../controllers/authController');

const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

function authHeader(userId = 'user-1') {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

describe('POST /api/auth/link-wallet', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/api/auth/link-wallet', authController.linkWallet);
    app.get('/api/auth/me', authController.me);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a request with no token', async () => {
    const res = await request(app).post('/api/auth/link-wallet').send({ address: VALID_ADDRESS });
    expect(res.status).toBe(401);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a malformed address', async () => {
    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader())
      .send({ address: 'not-a-real-address' });
    expect(res.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a well-formed but wrong-prefix bech32 address', async () => {
    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader())
      .send({ address: 'cosmos1p9f39uylkjv956xeltkdtsel5y6xu36xguz623' });
    expect(res.status).toBe(400);
  });

  test('rejects a request missing any signature field', async () => {
    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader())
      .send({ address: VALID_ADDRESS });
    expect(res.status).toBe(401);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects an expired signature timestamp', async () => {
    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader())
      .send({
        address: VALID_ADDRESS,
        timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        pubKey: 'fake-pubkey-b64',
        signature: 'fake-signature-b64',
      });
    expect(res.status).toBe(401);
    expect(verifyLinkWalletSignature).not.toHaveBeenCalled();
  });

  test('rejects when verifyLinkWalletSignature reports the signature invalid', async () => {
    verifyLinkWalletSignature.mockReturnValue(false);

    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader())
      .send({
        address: VALID_ADDRESS,
        timestamp: new Date().toISOString(),
        pubKey: 'fake-pubkey-b64',
        signature: 'fake-signature-b64',
      });

    expect(res.status).toBe(401);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('links a valid address to the authenticated user once ownership is verified', async () => {
    verifyLinkWalletSignature.mockReturnValue(true);
    User.findByIdAndUpdate.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', walletAddress: VALID_ADDRESS }),
    });

    const res = await request(app)
      .post('/api/auth/link-wallet')
      .set(authHeader('user-1'))
      .send({
        address: VALID_ADDRESS,
        timestamp: new Date().toISOString(),
        pubKey: 'fake-pubkey-b64',
        signature: 'fake-signature-b64',
      });

    expect(res.status).toBe(200);
    expect(res.body.walletAddress).toBe(VALID_ADDRESS);
    expect(verifyLinkWalletSignature).toHaveBeenCalledWith(
      expect.objectContaining({ address: VALID_ADDRESS, pubKeyBase64: 'fake-pubkey-b64', signatureBase64: 'fake-signature-b64' })
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      { walletAddress: VALID_ADDRESS },
      { new: true }
    );
  });
});

describe('GET /api/auth/me — badge enrichment', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.get('/api/auth/me', authController.me);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hasBadge is false and badgeService is never queried when no wallet is linked', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'a@b.com' }) });

    const res = await request(app).get('/api/auth/me').set(authHeader('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.user.hasBadge).toBe(false);
    expect(getUserBadgeInfo).not.toHaveBeenCalled();
  });

  test('hasBadge reflects the on-chain badge status for the linked address', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'a@b.com', walletAddress: VALID_ADDRESS }),
    });
    getUserBadgeInfo.mockResolvedValue({ exists: true });

    const res = await request(app).get('/api/auth/me').set(authHeader('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.user.hasBadge).toBe(true);
    expect(getUserBadgeInfo).toHaveBeenCalledWith(VALID_ADDRESS);
  });

  test('a badgeService failure degrades to hasBadge:false rather than 500ing', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user-1', email: 'a@b.com', walletAddress: VALID_ADDRESS }),
    });
    getUserBadgeInfo.mockRejectedValue(new Error('chain unreachable'));

    const res = await request(app).get('/api/auth/me').set(authHeader('user-1'));

    expect(res.status).toBe(200);
    expect(res.body.user.hasBadge).toBe(false);
  });
});
