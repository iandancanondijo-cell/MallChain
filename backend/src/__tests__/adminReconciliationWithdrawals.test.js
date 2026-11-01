// Regression coverage for the admin reconciliation-resolve and
// withdrawal-retry/resolve endpoints added to close M2/M3 of the UI/UX
// audit (Admin's Reconciliation and Withdrawals tabs previously had no way
// to act on a pending_manual/failed item short of a direct DB edit).
const request = require('supertest');
const express = require('express');

jest.mock('../models/user', () => ({ findOne: jest.fn(), findById: jest.fn(), decryptUserPii: (u) => u }));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../models/ValidatorApplication', () => ({}));
jest.mock('../models/kyc', () => ({}));
jest.mock('../models/TaskSubmission', () => ({}));
jest.mock('../models/LiquidityReconciliation', () => ({ findById: jest.fn() }));
// decryptPhone: the retry route reads the (encrypted-at-rest) seller phone
// via this static; tests store plaintext, so the mock just passes it through.
jest.mock('../models/WithdrawalRequest', () => ({ findById: jest.fn(), decryptPhone: (w) => ({ ...w, phone: w.phone }) }));
jest.mock('../middleware/adminAuth', () => ({
  // adminCategory: 'treasury' — reconciliation + withdrawal admin routes sit
  // behind requireCategory('treasury').
  requireAdmin: (req, res, next) => { req.user = { _id: 'admin1', email: 'admin@x.com', role: 'admin', adminCategory: 'treasury' }; next(); },
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
// Withdrawal transition emits are fire-and-forget through activityEvents; the
// test asserts the emits + template-required fields here instead of reaching
// the real notification engine. userSafeReason is mirrored with a trivial
// passthrough of the real helper's contract (returns a non-empty string).
jest.mock('../services/activityEvents', () => ({
  userIdForAddress: jest.fn().mockResolvedValue('holder-user-1'),
  userSafeReason: (value, fallback) => String(value || fallback || 'safe reason'),
  emitWithdrawalRequested: jest.fn().mockResolvedValue({ success: true }),
  emitWithdrawalProcessing: jest.fn().mockResolvedValue({ success: true }),
  emitWithdrawalCompleted: jest.fn().mockResolvedValue({ success: true }),
  emitWithdrawalFailed: jest.fn().mockResolvedValue({ success: true }),
  emitComplianceAlert: jest.fn().mockResolvedValue({ success: true }),
  emitKycApproved: jest.fn().mockResolvedValue({ success: true }),
  emitKycRejected: jest.fn().mockResolvedValue({ success: true }),
}));
// The real limiter is a shared singleton keyed by IP — across this file's
// ~13 requests to the same limiters.strict-gated routes it would otherwise
// trip a real 429 partway through, unrelated to anything under test here.
jest.mock('../middleware/rateLimiter', () => ({
  limiters: { strict: (req, res, next) => next() },
}));

const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const { initiateB2CPayout } = require('../services/b2cPayoutService');
const activityEvents = require('../services/activityEvents');
const adminPanel = require('../routes/adminPanel');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminPanel);
  return app;
}

function fakeDoc(initial) {
  return { ...initial, save: jest.fn().mockResolvedValue(undefined) };
}

// The transition emits run fire-and-forget behind userIdForAddress().then(...)
// — let the microtask/setImmediate chain settle before asserting.
async function flushAsync() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe('POST /api/admin/reconciliation/:id/resolve', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('400s when no note is given', async () => {
    const res = await request(app).post('/api/admin/reconciliation/r1/resolve').send({});
    expect(res.status).toBe(400);
    expect(LiquidityReconciliation.findById).not.toHaveBeenCalled();
  });

  test('404s when the item does not exist', async () => {
    LiquidityReconciliation.findById.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/reconciliation/r1/resolve').send({ note: 'handled manually' });
    expect(res.status).toBe(404);
  });

  test('409s when the item is already resolved', async () => {
    LiquidityReconciliation.findById.mockResolvedValue(fakeDoc({ _id: 'r1', status: 'resolved' }));
    const res = await request(app).post('/api/admin/reconciliation/r1/resolve').send({ note: 'handled manually' });
    expect(res.status).toBe(409);
  });

  test('marks a pending_manual item resolved and records the note', async () => {
    const doc = fakeDoc({ _id: 'r1', status: 'pending_manual', mlcnsAmount: 10 });
    LiquidityReconciliation.findById.mockResolvedValue(doc);

    const res = await request(app).post('/api/admin/reconciliation/r1/resolve').send({ note: 'Manually re-added liquidity via admin wallet.' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('resolved');
    expect(doc.resolutionNote).toBe('Manually re-added liquidity via admin wallet.');
    expect(doc.resolvedBy).toBe('admin1');
    expect(doc.resolvedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/withdrawals/:id/retry', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('404s when the withdrawal does not exist', async () => {
    WithdrawalRequest.findById.mockResolvedValue(null);
    const res = await request(app).post('/api/admin/withdrawals/w1/retry');
    expect(res.status).toBe(404);
  });

  test('409s when the withdrawal is not currently failed', async () => {
    WithdrawalRequest.findById.mockResolvedValue(fakeDoc({ _id: 'w1', status: 'completed' }));
    const res = await request(app).post('/api/admin/withdrawals/w1/retry');
    expect(res.status).toBe(409);
    expect(initiateB2CPayout).not.toHaveBeenCalled();
  });

  test('re-initiates the payout and marks it initiated on success', async () => {
    const doc = fakeDoc({ _id: 'w1', status: 'failed', phone: '254712345678', amountMlcns: 100, withdrawalId: 'wd1', walletAddress: 'mall1holder' });
    WithdrawalRequest.findById.mockResolvedValue(doc);
    initiateB2CPayout.mockResolvedValue({ ok: true, payoutRef: 'REF123' });

    const res = await request(app).post('/api/admin/withdrawals/w1/retry');

    expect(res.status).toBe(200);
    expect(initiateB2CPayout).toHaveBeenCalledWith({ sellerPhone: '254712345678', mlcnsAmount: 100, saleId: 'withdrawal-wd1' });
    expect(doc.status).toBe('payout_initiated');
    expect(doc.payoutRef).toBe('REF123');

    await flushAsync();
    // wallet.withdrawal_processing template requires amount/asset/reference_id.
    expect(activityEvents.emitWithdrawalProcessing).toHaveBeenCalledWith('holder-user-1', {
      amount: 100,
      asset: 'MLCNS',
      reference_id: 'REF123',
    });
  });

  test('502s and leaves the withdrawal failed when the retry itself fails', async () => {
    const doc = fakeDoc({ _id: 'w1', status: 'failed', phone: '254712345678', amountMlcns: 100, withdrawalId: 'wd1', walletAddress: 'mall1holder' });
    WithdrawalRequest.findById.mockResolvedValue(doc);
    initiateB2CPayout.mockResolvedValue({ ok: false, error: 'Safaricom unreachable' });

    const res = await request(app).post('/api/admin/withdrawals/w1/retry');

    expect(res.status).toBe(502);
    expect(doc.status).toBe('failed');

    await flushAsync();
    // wallet.withdrawal_failed template requires amount/asset/user_safe_reason/
    // reference_id — the sanitized admin note, never nothing (the old bug:
    // dispatchEvent rejected the event with "Missing required fields").
    expect(activityEvents.emitWithdrawalFailed).toHaveBeenCalledWith('holder-user-1', {
      amount: 100,
      asset: 'MLCNS',
      user_safe_reason: 'Safaricom unreachable',
      reference_id: 'wd1',
    });
  });

  test('202s and moves to pending_review when the retry requires manual approval', async () => {
    const doc = fakeDoc({ _id: 'w1', status: 'failed', phone: '254712345678', amountMlcns: 100, withdrawalId: 'wd1', walletAddress: 'mall1holder' });
    WithdrawalRequest.findById.mockResolvedValue(doc);
    initiateB2CPayout.mockResolvedValue({ ok: false, error: 'Daily cap exceeded', requiresApproval: true });

    const res = await request(app).post('/api/admin/withdrawals/w1/retry');

    expect(res.status).toBe(202);
    expect(doc.status).toBe('pending_review');

    await flushAsync();
    // A cap-rejection is "queued for a human", not a failure — the user must
    // NOT get a withdrawal-failed notice here (matches sellExecutionService).
    expect(activityEvents.emitWithdrawalFailed).not.toHaveBeenCalled();
    expect(activityEvents.emitWithdrawalProcessing).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/withdrawals/:id/resolve', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = buildApp(); });

  test('400s for an invalid outcome', async () => {
    const res = await request(app).post('/api/admin/withdrawals/w1/resolve').send({ outcome: 'bogus', note: 'x' });
    expect(res.status).toBe(400);
    expect(WithdrawalRequest.findById).not.toHaveBeenCalled();
  });

  test('400s when no note is given', async () => {
    const res = await request(app).post('/api/admin/withdrawals/w1/resolve').send({ outcome: 'refunded' });
    expect(res.status).toBe(400);
  });

  test('409s when the withdrawal is not currently failed', async () => {
    WithdrawalRequest.findById.mockResolvedValue(fakeDoc({ _id: 'w1', status: 'completed' }));
    const res = await request(app).post('/api/admin/withdrawals/w1/resolve').send({ outcome: 'refunded', note: 'sent manually' });
    expect(res.status).toBe(409);
  });

  test('records a manual refund outcome and raises the settlement alert', async () => {
    const doc = fakeDoc({ _id: 'w1', status: 'failed', withdrawalId: 'wd1', amountMlcns: 42, walletAddress: 'mall1holder' });
    WithdrawalRequest.findById.mockResolvedValue(doc);

    const res = await request(app).post('/api/admin/withdrawals/w1/resolve').send({ outcome: 'refunded', note: 'Refunded via manual M-Pesa send, ref XYZ.' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('refunded');
    expect(doc.notes).toBe('Refunded via manual M-Pesa send, ref XYZ.');

    await flushAsync();
    // 'refunded' = funds went back through another channel, not a completed
    // payout — security.compliance_alert is the matching template (requires
    // alert_type + required_action); there is no withdrawal_refunded template.
    expect(activityEvents.emitComplianceAlert).toHaveBeenCalledWith('holder-user-1', {
      alert_type: 'Withdrawal settlement update',
      required_action: 'Refunded via manual M-Pesa send, ref XYZ.',
      referenceId: 'wd1',
    });
    expect(activityEvents.emitWithdrawalCompleted).not.toHaveBeenCalled();
  });

  test('records a completed outcome and tells the user the withdrawal completed', async () => {
    const doc = fakeDoc({ _id: 'w1', status: 'failed', withdrawalId: 'wd1', amountMlcns: 42, walletAddress: 'mall1holder' });
    WithdrawalRequest.findById.mockResolvedValue(doc);

    const res = await request(app).post('/api/admin/withdrawals/w1/resolve').send({ outcome: 'completed', note: 'Sent manually via M-Pesa, ref ABC.' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('completed');

    await flushAsync();
    // wallet.withdrawal_completed requires amount/asset/tx_status/reference_id.
    expect(activityEvents.emitWithdrawalCompleted).toHaveBeenCalledWith('holder-user-1', {
      amount: 42,
      asset: 'MLCNS',
      tx_status: 'completed',
      reference_id: 'wd1',
    });
    expect(activityEvents.emitComplianceAlert).not.toHaveBeenCalled();
  });
});
