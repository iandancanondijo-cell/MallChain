const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/ValidatorApplication', () => ({}));
jest.mock('../models/kyc', () => ({}));
jest.mock('../models/TaskSubmission', () => ({}));
jest.mock('../models/LiquidityReconciliation', () => ({}));
jest.mock('../models/WithdrawalRequest', () => ({}));
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: (req, res, next) => { req.user = { _id: 'admin1', email: 'admin@x.com', role: 'admin' }; next(); },
  requireSuperAdmin: (req, res, next) => next(),
}));
jest.mock('../models/BurnPolicy', () => ({ BurnPolicy: {}, DynamicBurnThreshold: {} }));
jest.mock('../models/TreasuryLedger', () => ({}));
jest.mock('../models/MaintenanceMode', () => ({}));
jest.mock('../middleware/maintenanceMode', () => ({ invalidateCache: jest.fn() }));
jest.mock('../models/Campaign', () => ({}));
jest.mock('../models/WalletTransaction', () => ({}));
jest.mock('../models/BadgePurchase', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../models/BadgeIssuance', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../services/badgeService', () => ({ getUserBadgeInfo: jest.fn() }));
jest.mock('../services/badgeTxBuilder', () => ({ issueBadgeFromMnemonic: jest.fn() }));
jest.mock('../services/notify', () => ({ notify: jest.fn(), notifyUser: jest.fn() }));

const User = require('../models/user');
const BadgePurchase = require('../models/BadgePurchase');
const BadgeIssuance = require('../models/BadgeIssuance');
const { getUserBadgeInfo } = require('../services/badgeService');
const { issueBadgeFromMnemonic } = require('../services/badgeTxBuilder');
const { notifyUser } = require('../services/notify');
const adminPanel = require('../routes/adminPanel');

const VALID_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminPanel);
  return app;
}

function chainable(result) {
  return { sort: () => ({ skip: () => ({ limit: () => ({ lean: jest.fn().mockResolvedValue(result) }) }) }) };
}

describe('GET /api/admin/badges/purchases', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('lists purchases with pagination', async () => {
    BadgePurchase.find.mockReturnValue(chainable([{ quoteId: 'q1', status: 'issued' }]));
    BadgePurchase.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/badges/purchases');

    expect(res.status).toBe(200);
    expect(res.body.purchases).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/admin/badges/issuances', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('lists issuances filtered by method', async () => {
    BadgeIssuance.find.mockReturnValue(chainable([{ walletAddress: VALID_ADDRESS, method: 'streak' }]));
    BadgeIssuance.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/admin/badges/issuances?method=streak');

    expect(res.status).toBe(200);
    expect(BadgeIssuance.find).toHaveBeenCalledWith({ method: 'streak' });
    expect(res.body.issuances).toHaveLength(1);
  });
});

describe('POST /api/admin/badges/grant', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    process.env.OPERATOR_MNEMONIC = 'operator test mnemonic';
  });
  afterEach(() => { delete process.env.OPERATOR_MNEMONIC; });

  test('rejects a missing walletAddress', async () => {
    const res = await request(app).post('/api/admin/badges/grant').send({});
    expect(res.status).toBe(400);
  });

  test('409s when the wallet already has a badge', async () => {
    getUserBadgeInfo.mockResolvedValue({ exists: true });

    const res = await request(app).post('/api/admin/badges/grant').send({ walletAddress: VALID_ADDRESS });

    expect(res.status).toBe(409);
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('503s when OPERATOR_MNEMONIC is not configured', async () => {
    delete process.env.OPERATOR_MNEMONIC;
    getUserBadgeInfo.mockResolvedValue({ exists: false });

    const res = await request(app).post('/api/admin/badges/grant').send({ walletAddress: VALID_ADDRESS });

    expect(res.status).toBe(503);
    expect(issueBadgeFromMnemonic).not.toHaveBeenCalled();
  });

  test('issues the badge, records the issuance, and notifies the linked user', async () => {
    getUserBadgeInfo.mockResolvedValue({ exists: false });
    issueBadgeFromMnemonic.mockResolvedValue({ txHash: 'HASH1' });
    User.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'user1', email: 'a@b.com' }) });

    const res = await request(app).post('/api/admin/badges/grant').send({ walletAddress: VALID_ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.txHash).toBe('HASH1');
    expect(BadgeIssuance.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', walletAddress: VALID_ADDRESS, method: 'admin_manual', txHash: 'HASH1' })
    );
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'user1' }),
      expect.objectContaining({ title: expect.stringContaining('granted') })
    );
  });
});

describe('POST /api/admin/badges/purchases/:quoteId/void', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('404s for an unknown quote', async () => {
    BadgePurchase.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/badges/purchases/unknown/void').send({ reason: 'test' });
    expect(res.status).toBe(404);
  });

  test('rejects voiding an already-issued purchase', async () => {
    BadgePurchase.findOne.mockResolvedValue({ quoteId: 'q1', status: 'issued', save: jest.fn() });

    const res = await request(app).post('/api/admin/badges/purchases/q1/void').send({ reason: 'test' });

    expect(res.status).toBe(400);
  });

  test('voids a purchase that has not yet issued', async () => {
    const purchase = {
      quoteId: 'q1',
      status: 'confirmed',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: function () { return { quoteId: this.quoteId, status: this.status, reason: this.reason }; },
    };
    BadgePurchase.findOne.mockResolvedValue(purchase);

    const res = await request(app).post('/api/admin/badges/purchases/q1/void').send({ reason: 'refund requested' });

    expect(res.status).toBe(200);
    expect(purchase.status).toBe('failed');
    expect(purchase.reason).toBe('refund requested');
  });
});
