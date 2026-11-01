/**
 * Wiring coverage: privileged admin routes must call into the hash-chained
 * audit ledger with the correct actor/action/target, and the superadmin
 * read/verify endpoints must expose the chain. Models are mocked
 * adminPanelBadges-style; appendAuditEvent/verifyAuditChain are spied on
 * directly.
 */
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(), create: jest.fn(),
  countDocuments: jest.fn(), decryptUserPii: (u) => u,
}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/AuditChain', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../models/AnchorRegistry', () => ({
  findOne: jest.fn(),
}));
jest.mock('../services/auditChainService', () => ({
  appendAuditEvent: jest.fn().mockResolvedValue({ seq: 0, entryHash: 'h' }),
}));
jest.mock('../services/auditChainVerify', () => ({
  verifyAuditChain: jest.fn(),
}));
jest.mock('../models/ValidatorApplication', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/kyc', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/WithdrawalAmlReview', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/WithdrawalStructuringFlag', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/TaskSubmission', () => ({}));
jest.mock('../models/LiquidityReconciliation', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/WithdrawalRequest', () => ({ find: jest.fn(), countDocuments: jest.fn(), decryptPhone: (w) => w }));
jest.mock('../services/b2cPayoutService', () => ({ initiateB2CPayout: jest.fn() }));
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: (req, res, next) => {
    req.user = { _id: 'admin-9', email: 'admin@x.com', role: global.__TEST_ROLE__ || 'superadmin', adminCategory: 'users' };
    next();
  },
  // Mirrors the real requireAuth('superadmin') contract: non-superadmin
  // roles get 403 — lets the integrity-gating tests exercise both paths.
  requireSuperAdmin: (req, res, next) => {
    if (req.user && req.user.role === 'superadmin') return next();
    return res.status(403).json({ error: 'superadmin only' });
  },
}));
jest.mock('../middleware/categoryAccess', () => ({
  requireCategory: () => (_req, _res, next) => next(),
  requireAnyCategory: () => (_req, _res, next) => next(),
}));
jest.mock('../services/activityEvents', () => ({ emitKycApproved: jest.fn(), emitKycRejected: jest.fn() }));
jest.mock('../middleware/authCache', () => ({ invalidateCachedUser: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/BurnPolicy', () => ({ BurnPolicy: {}, DynamicBurnThreshold: {} }));
jest.mock('../models/TreasuryLedger', () => ({}));
jest.mock('../models/MaintenanceMode', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../middleware/maintenanceMode', () => ({ invalidateCache: jest.fn() }));
jest.mock('../models/Campaign', () => ({}));
jest.mock('../models/WalletTransaction', () => ({}));
jest.mock('../models/BadgePurchase', () => ({}));
jest.mock('../models/BadgeIssuance', () => ({}));
jest.mock('../models/BadgeDesign', () => ({}));
jest.mock('../services/badgeService', () => ({ getUserBadgeInfo: jest.fn() }));
jest.mock('../services/badgeTxBuilder', () => ({ issueBadgeFromMnemonic: jest.fn() }));
jest.mock('../services/notify', () => ({ notify: jest.fn(), notifyUser: jest.fn() }));
jest.mock('../middleware/rateLimiter', () => ({ limiters: { strict: (_req, _res, next) => next() } }));
jest.mock('../models/Report', () => ({ find: jest.fn(), findById: jest.fn(), create: jest.fn() }));

const User = require('../models/user');
const MaintenanceMode = require('../models/MaintenanceMode');
const Report = require('../models/Report');
const AuditChain = require('../models/AuditChain');
const AnchorRegistry = require('../models/AnchorRegistry');
const { appendAuditEvent } = require('../services/auditChainService');
const { verifyAuditChain } = require('../services/auditChainVerify');
const adminPanel = require('../routes/adminPanel');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminPanel);
  return app;
}

// Model.find(...).select(...) is a Query, not a Promise — mocks must mirror
// that chainable shape for the routes' `.select('-password')` calls.
const selectChain = (doc) => ({ select: () => Promise.resolve(doc) });

beforeEach(() => {
  jest.clearAllMocks();
  global.__TEST_ROLE__ = 'superadmin';
  appendAuditEvent.mockResolvedValue({ seq: 0 });
  verifyAuditChain.mockResolvedValue({ valid: true, headSeq: 3, headHash: 'abc', totalEntries: 4, firstDivergence: null, anchorMismatch: false, anchorChain: { broken: false, totalAnchors: 0, unlinked: 0 }, anchors: [] });
  // /integrity/status does AnchorRegistry.findOne().sort().lean() twice
  // (last anchor + last confirmed) — default to "nothing anchored yet".
  AnchorRegistry.findOne.mockReturnValue({ sort: () => ({ lean: async () => null }) });
});

afterEach(() => {
  delete global.__TEST_ROLE__;
});

describe('adminPanel chain-audit wiring', () => {
  test('user role change appends admin_user_role_change with actor+target', async () => {
    User.findById.mockImplementation(() => selectChain({ _id: 'u5', role: 'user' }));
    User.findByIdAndUpdate.mockImplementation(() => selectChain({ _id: 'u5', role: 'admin' }));

    const res = await request(buildApp()).put('/api/admin/users/u5/role').send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      { id: 'admin-9', role: 'superadmin' },
      'admin_user_role_change',
      'user:u5',
      { newRole: 'admin' }
    );
  });

  test('maintenance toggle appends admin_maintenance_change', async () => {
    MaintenanceMode.findById.mockReturnValue({ lean: async () => ({ reason: '' }) });
    MaintenanceMode.findByIdAndUpdate.mockReturnValue({ lean: async () => ({ global: true, scopes: {}, reason: 'incident' }) });

    const res = await request(buildApp()).post('/api/admin/maintenance').send({ global: true, reason: 'incident' });

    expect(res.status).toBe(200);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      { id: 'admin-9', role: 'superadmin' },
      'admin_maintenance_change',
      'maintenance:singleton',
      { global: true, scope: null, paused: null, reason: 'incident' }
    );
  });

  test('report action (no legacy AuditLog there) still appends to the chain', async () => {
    Report.findById.mockResolvedValue({ _id: 'r1', status: 'sent', save: async () => {} });

    const res = await request(buildApp()).patch('/api/admin/reports/r1/action').send({ reply: 'done' });

    expect(res.status).toBe(200);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      { id: 'admin-9', role: 'superadmin' },
      'admin_report_actioned',
      'report:r1',
      { replied: true }
    );
  });

  test('GET /audit-chain lists entries (superadmin)', async () => {
    AuditChain.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [{ seq: 1 }] }) }) }) });
    AuditChain.countDocuments.mockResolvedValue(1);

    const res = await request(buildApp()).get('/api/admin/audit-chain?limit=10');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('GET /audit-chain/verify returns the integrity report', async () => {
    const res = await request(buildApp()).get('/api/admin/audit-chain/verify?from=0&to=9');

    expect(res.status).toBe(200);
    expect(verifyAuditChain).toHaveBeenCalledWith({ from: '0', to: '9' });
    expect(res.body.valid).toBe(true);
    expect(res.body.headHash).toBe('abc');
  });

  test('chain append failure does not break the admin flow (service is non-fatal by contract)', async () => {
    appendAuditEvent.mockResolvedValue(null); // simulated append failure
    User.findById.mockImplementation(() => selectChain({ _id: 'u6', role: 'user' }));
    User.findByIdAndUpdate.mockImplementation(() => selectChain({ _id: 'u6', role: 'admin' }));

    const res = await request(buildApp()).put('/api/admin/users/u6/role').send({ role: 'admin' });
    expect(res.status).toBe(200);
  });
});

describe('integrity endpoints (superadmin only)', () => {
  test('GET /integrity/status reports chain summary + unanchored-mode when nothing confirmed', async () => {
    const res = await request(buildApp()).get('/api/admin/integrity/status');

    expect(res.status).toBe(200);
    expect(res.body.chain).toMatchObject({ length: 4, headSeq: 3, headHash: 'abc', valid: true });
    expect(res.body.anchors.last).toBeNull();
    expect(res.body.anchors.lastConfirmedAt).toBeNull();
    // no ANCHOR_HMAC_SECRET / no confirmed anchor in this environment →
    // must flag degraded mode rather than pretending to be anchored.
    expect(res.body.mode).toBe('unanchored-mode');
  });

  test('GET /integrity/status reports the last anchor and anchored mode when configured+confirmed', async () => {
    process.env.ANCHOR_HMAC_SECRET = 'int-test-secret';
    try {
      AnchorRegistry.findOne.mockImplementation((filter) => ({
        sort: () => ({
          lean: async () => (filter && filter.status === 'confirmed'
            ? { _id: 'c1', anchorDate: '2026-11-01', headSeq: 3, headHash: 'abc', status: 'confirmed', onChainTxHash: 'TX1', createdAt: new Date('2026-11-01T00:15:00Z') }
            : { _id: 'c1', anchorDate: '2026-11-01', headSeq: 3, headHash: 'abc', status: 'confirmed', onChainTxHash: 'TX1', createdAt: new Date('2026-11-01T00:15:00Z') }),
        }),
      }));
      const res = await request(buildApp()).get('/api/admin/integrity/status');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('anchored');
      expect(res.body.hmacSecretConfigured).toBe(true);
      expect(res.body.anchors.last.onChainTxHash).toBe('TX1');
    } finally {
      delete process.env.ANCHOR_HMAC_SECRET;
    }
  });

  test('POST /integrity/verify runs the full recompute and returns the divergence verdict', async () => {
    verifyAuditChain.mockResolvedValue({
      valid: false, headSeq: 9, headHash: 'zz', totalEntries: 10,
      firstDivergence: { seq: 4, reason: 'entryHash does not match recomputation (a field on this entry was altered)' },
      anchorMismatch: false, anchorChain: { broken: false, totalAnchors: 0, unlinked: 0 }, anchors: [],
    });

    const res = await request(buildApp()).post('/api/admin/integrity/verify');

    expect(res.status).toBe(200);
    expect(verifyAuditChain).toHaveBeenCalledWith();
    expect(res.body.valid).toBe(false);
    expect(res.body.firstDivergence.seq).toBe(4);
  });

  test('plain admin (non-superadmin) gets 403 on both integrity endpoints', async () => {
    global.__TEST_ROLE__ = 'admin';
    const get = await request(buildApp()).get('/api/admin/integrity/status');
    const post = await request(buildApp()).post('/api/admin/integrity/verify');
    expect(get.status).toBe(403);
    expect(post.status).toBe(403);
  });

  test('non-admin roles never reach the integrity endpoints at all', async () => {
    global.__TEST_ROLE__ = 'user';
    const res = await request(buildApp()).get('/api/admin/integrity/status');
    expect(res.status).toBe(403);
  });
});
