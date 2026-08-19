const mongoose = require('mongoose');

// Regression coverage for a real bug: backend/src/routes/adminPanel.js used
// to define its own throwaway `mongoose.model('Campaign', new
// mongoose.Schema({}, { strict: false }))` as a fallback for "if not already
// registered". Since backend/src/index.js requires adminPanel.js BEFORE
// mines.js (whose models/Campaign require is the canonical schema with
// `status: { default: 'active' }`, `rate_per_task: { required: true }`,
// etc.), that schema-less version won mongoose's global model registry —
// every `Campaign.create()` in the app, including the one backing
// models/Campaign.js's own export, silently ran against a schema with no
// defaults and no validation. A campaign created via POST /api/mines/campaigns
// (which relies on the status default) ended up with no `status` field at
// all, which crashed the admin Mining tab's <StatusChip> render.
describe('Campaign model registration', () => {
  beforeEach(() => {
    // Simulate a fresh process: nothing registered yet.
    delete mongoose.models.Campaign;
    delete mongoose.connection.collections.campaigns;
  });

  test('requiring adminPanel.js before models/Campaign.js does not clobber the real schema', () => {
    jest.mock('../models/user', () => ({}));
    jest.mock('../models/AuditLog', () => ({}));
    jest.mock('../models/ValidatorApplication', () => ({}));
    jest.mock('../models/kyc', () => ({}));
    jest.mock('../models/TaskSubmission', () => ({}));
    jest.mock('../models/LiquidityReconciliation', () => ({}));
    jest.mock('../models/WithdrawalRequest', () => ({}));
    jest.mock('../middleware/adminAuth', () => ({ requireAdmin: (req, res, next) => next(), requireSuperAdmin: (req, res, next) => next() }));
    jest.mock('../models/BurnPolicy', () => ({ BurnPolicy: {}, DynamicBurnThreshold: {} }));
    jest.mock('../models/TreasuryLedger', () => ({}));
    jest.mock('../services/notify', () => ({ notify: jest.fn() }));
    jest.mock('../models/MaintenanceMode', () => ({}));
    jest.mock('../middleware/maintenanceMode', () => ({ invalidateCache: jest.fn() }));

    // adminPanel.js first — this is the real require order in index.js.
    require('../routes/adminPanel');
    const Campaign = require('../models/Campaign');

    expect(mongoose.model('Campaign')).toBe(Campaign);
    const statusPath = Campaign.schema.path('status');
    expect(statusPath).toBeDefined();
    expect(statusPath.defaultValue).toBe('active');
    expect(Campaign.schema.path('rate_per_task').isRequired).toBe(true);
  });
});
