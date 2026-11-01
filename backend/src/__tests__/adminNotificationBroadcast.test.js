// Regression coverage for P3: POST /api/admin/notifications/broadcast must
// fan out through notificationDispatcher.dispatchNotification (per-user prefs,
// DND, unsubscribes, channel sends) — NOT through a raw Notification.insertMany
// bulk write, which bypassed every preference and ignored the admin's channel
// checkboxes. Also verifies the route responds 202 with a queued count before
// the fan-out finishes (a broadcast to hundreds of users must not block the
// request) and that a per-user dispatch failure never crashes the process.
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  decryptUserPii: (u) => u,
}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/Notification', () => ({ insertMany: jest.fn(), create: jest.fn() }));
jest.mock('../models/ValidatorApplication', () => ({}));
jest.mock('../models/kyc', () => ({}));
jest.mock('../models/WithdrawalAmlReview', () => ({ find: jest.fn(), countDocuments: jest.fn(), findById: jest.fn(), decryptAmlPii: (r) => r }));
jest.mock('../models/WithdrawalStructuringFlag', () => ({}));
jest.mock('../models/TaskSubmission', () => ({}));
jest.mock('../models/LiquidityReconciliation', () => ({ findById: jest.fn() }));
jest.mock('../models/WithdrawalRequest', () => ({ findById: jest.fn(), decryptPhone: (w) => w }));
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: (req, res, next) => { req.user = { _id: 'admin1', email: 'admin@x.com', role: 'superadmin', adminCategory: 'administration' }; next(); },
  requireSuperAdmin: (req, res, next) => next(),
}));
jest.mock('../middleware/authCache', () => ({ invalidateCachedUser: jest.fn() }));
jest.mock('../models/BurnPolicy', () => ({ BurnPolicy: {}, DynamicBurnThreshold: {} }));
jest.mock('../models/TreasuryLedger', () => ({}));
jest.mock('../models/MaintenanceMode', () => ({}));
jest.mock('../middleware/maintenanceMode', () => ({ invalidateCache: jest.fn() }));
jest.mock('../models/Campaign', () => ({}));
jest.mock('../models/WalletTransaction', () => ({}));
jest.mock('../models/BadgePurchase', () => ({}));
jest.mock('../models/BadgeIssuance', () => ({}));
jest.mock('../services/badgeService', () => ({ getUserBadgeInfo: jest.fn() }));
jest.mock('../services/badgeTxBuilder', () => ({ issueBadgeFromMnemonic: jest.fn() }));
jest.mock('../services/notify', () => ({ notify: jest.fn(), notifyUser: jest.fn() }));
jest.mock('../services/b2cPayoutService', () => ({ initiateB2CPayout: jest.fn() }));
jest.mock('../services/activityEvents', () => ({
  userIdForAddress: jest.fn().mockResolvedValue(null),
  userSafeReason: (v, f) => String(v || f || 'reason'),
  emitWithdrawalRequested: jest.fn(),
  emitWithdrawalProcessing: jest.fn(),
  emitWithdrawalCompleted: jest.fn(),
  emitWithdrawalFailed: jest.fn(),
  emitComplianceAlert: jest.fn(),
  emitKycApproved: jest.fn(),
  emitKycRejected: jest.fn(),
}));
// The dispatcher is the whole point of the fix — every recipient must go
// through it, never through a bulk insert.
jest.mock('../services/notificationDispatcher', () => ({
  dispatchNotification: jest.fn().mockResolvedValue({ success: true, notificationId: 'n1' }),
}));
// Shared singleton IP limiter would 429 across this file's requests.
jest.mock('../middleware/rateLimiter', () => ({
  limiters: { strict: (req, res, next) => next() },
}));

const User = require('../models/user');
const Notification = require('../models/Notification');
const { dispatchNotification } = require('../services/notificationDispatcher');
const adminPanel = require('../routes/adminPanel');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminPanel);
  return app;
}

function mockRecipients(ids) {
  User.find.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(ids.map((id) => ({ _id: id }))) }),
  });
}

// The fan-out is fire-and-forget (setImmediate + a sequential await loop);
// give it room to walk every recipient before asserting.
async function flushFanOut() {
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe('POST /api/admin/notifications/broadcast', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    // dispatchNotification's mockResolvedValue survives clearAllMocks (mockClear
    // only resets call records), but re-assert per test for clarity.
    dispatchNotification.mockResolvedValue({ success: true, notificationId: 'n1' });
    mockRecipients(['u1', 'u2']);
  });

  test('400s without title/message and dispatches nothing', async () => {
    const res = await request(app).post('/api/admin/notifications/broadcast').send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(User.find).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  test('responds 202 with the queued count and fans out via dispatchNotification, never insertMany', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/broadcast')
      .send({ title: 'Maintenance tonight', message: 'The site will be briefly down.', type: 'system' });

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.queuedCount).toBe(2);
    expect(res.body.recipientCount).toBe(2);
    // Queued-count-only fields: the response must not wait for the fan-out.
    expect(res.body.dispatchedCount).toBe(2);
    expect(res.body.skippedCount).toBe(0);

    expect(User.find).toHaveBeenCalledWith({ banned: { $ne: true } });
    expect(Notification.insertMany).not.toHaveBeenCalled();

    await flushFanOut();
    expect(Notification.insertMany).not.toHaveBeenCalled();
    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(dispatchNotification).toHaveBeenCalledWith(
      'u1',
      'system',
      { title: 'Maintenance tonight', message: 'The site will be briefly down.' },
      { channels: { email: false, sms: false, whatsapp: false, inApp: true } }
    );
    expect(dispatchNotification).toHaveBeenCalledWith(
      'u2',
      'system',
      { title: 'Maintenance tonight', message: 'The site will be briefly down.' },
      { channels: { email: false, sms: false, whatsapp: false, inApp: true } }
    );
  });

  test('admin-requested email/sms flags pass through the channel gate; unrequested channels are closed', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/broadcast')
      .send({
        title: 'Campaign',
        message: 'Big sale this weekend.',
        type: 'marketing',
        channels: { email: true, sms: true },
      });

    expect(res.status).toBe(202);
    await flushFanOut();

    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(dispatchNotification).toHaveBeenCalledWith(
      'u1',
      'marketing',
      { title: 'Campaign', message: 'Big sale this weekend.' },
      { channels: { email: true, sms: true, whatsapp: false, inApp: true } }
    );
  });

  test('inApp: false from the admin turns the in-app push off; invalid type falls back to system', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/broadcast')
      .send({
        title: 'Heads up',
        message: 'Something happened.',
        type: 'not-a-real-type',
        channels: { inApp: false, whatsapp: true },
      });

    expect(res.status).toBe(202);
    await flushFanOut();

    expect(dispatchNotification).toHaveBeenCalledWith(
      'u1',
      'system',
      expect.any(Object),
      { channels: { email: false, sms: false, whatsapp: true, inApp: false } }
    );
  });

  test('a per-user dispatch rejection is contained — the loop continues and nothing throws', async () => {
    dispatchNotification
      .mockRejectedValueOnce(new Error('mongo connection lost'))
      .mockResolvedValueOnce({ success: true, notificationId: 'n2' });

    const res = await request(app)
      .post('/api/admin/notifications/broadcast')
      .send({ title: 'T', message: 'M' });

    expect(res.status).toBe(202);
    await flushFanOut();

    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });

  test('zero non-banned users still returns 202 with queuedCount 0 and dispatches nothing', async () => {
    mockRecipients([]);
    const res = await request(app)
      .post('/api/admin/notifications/broadcast')
      .send({ title: 'T', message: 'M' });

    expect(res.status).toBe(202);
    expect(res.body.queuedCount).toBe(0);
    await flushFanOut();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});
