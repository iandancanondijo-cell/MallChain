// Regression coverage for GDPR export/erasure (services/gdprService.js).
// Erasure specifically has to balance the erasure right against AML/KYC
// record-retention obligations — this locks in that direct PII is redacted
// everywhere (KYC identity fields, phone numbers on financial records, the
// account itself) while financial/compliance records are kept rather than
// deleted (see docs/compliance/gdpr.md).
function mockModel(overrides = {}) {
  return {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    create: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

jest.mock('../models/user', () => mockModel());
jest.mock('../models/kyc', () => mockModel());
jest.mock('../models/UserSettings', () => mockModel());
jest.mock('../models/ApiKey', () => mockModel());
jest.mock('../models/Contract', () => mockModel());
jest.mock('../models/Notification', () => mockModel());
jest.mock('../models/ValidatorApplication', () => mockModel());
jest.mock('../models/WalletTransaction', () => mockModel());
jest.mock('../models/transaction', () => mockModel());
jest.mock('../models/Conversation', () => mockModel());
jest.mock('../models/Message', () => mockModel());
jest.mock('../models/BadgeIssuance', () => mockModel());
jest.mock('../models/BadgePurchase', () => mockModel());
jest.mock('../models/MallcoinPurchase', () => mockModel());
jest.mock('../models/MallcoinSale', () => mockModel());
jest.mock('../models/WithdrawalRequest', () => mockModel());
jest.mock('../models/B2CPayout', () => mockModel());
jest.mock('../models/LiquidityPoolActivity', () => mockModel());
jest.mock('../models/LiquidityReconciliation', () => mockModel());
jest.mock('../models/AuditLog', () => mockModel());

const KYC = require('../models/kyc');
const Message = require('../models/Message');
const BadgePurchase = require('../models/BadgePurchase');
const MallcoinPurchase = require('../models/MallcoinPurchase');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const B2CPayout = require('../models/B2CPayout');
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');
const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');
const ApiKey = require('../models/ApiKey');
const Contract = require('../models/Contract');
const AuditLog = require('../models/AuditLog');

const { exportUserData, eraseUserData } = require('../services/gdprService');

function buildUser(overrides = {}) {
  return {
    _id: 'user-1',
    email: 'real@example.com',
    password: 'hashed',
    phone: '+254700000000',
    walletAddress: 'mall1realaddress',
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      const { save, toObject, ...rest } = this;
      return rest;
    },
    ...overrides,
  };
}

describe('gdprService.exportUserData', () => {
  beforeEach(() => jest.clearAllMocks());

  test('strips the password hash from the exported account data', async () => {
    const user = buildUser();
    const data = await exportUserData(user);

    expect(data.account.password).toBeUndefined();
    expect(data.account.email).toBe('real@example.com');
  });
});

describe('gdprService.eraseUserData', () => {
  beforeEach(() => jest.clearAllMocks());

  test('hard-deletes non-financial per-user records', async () => {
    const user = buildUser();
    await eraseUserData(user);

    expect(Notification.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(UserSettings.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(ApiKey.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(Contract.deleteMany).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  test('redacts KYC identity fields but does not delete the KYC record', async () => {
    const user = buildUser();
    await eraseUserData(user);

    expect(KYC.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          firstName: '[erased]',
          idNumber: '[erased]',
          idDocumentUrl: null,
          'amlChecks.raw': null,
          erasedAt: expect.any(Date),
        }),
      })
    );
    expect(KYC.deleteMany).not.toHaveBeenCalled(); // retained for AML/KYC compliance, never deleted outright
  });

  test('tombstones message content instead of deleting the message', async () => {
    const user = buildUser();
    await eraseUserData(user);

    expect(Message.updateMany).toHaveBeenCalledWith(
      { senderId: 'user-1' },
      { $set: { text: '[message deleted by user]' } }
    );
  });

  test('redacts phone numbers on financial records while leaving them otherwise intact', async () => {
    const user = buildUser();
    await eraseUserData(user);

    const expectedFilter = { $or: [{ walletAddress: 'mall1realaddress' }, { phone: '+254700000000' }] };
    expect(BadgePurchase.updateMany).toHaveBeenCalledWith(expectedFilter, { $set: { phone: '[erased]' } });
    expect(MallcoinPurchase.updateMany).toHaveBeenCalledWith(expectedFilter, { $set: { phone: '[erased]' } });
    expect(WithdrawalRequest.updateMany).toHaveBeenCalledWith(expectedFilter, { $set: { phone: '[erased]' } });
    expect(LiquidityPoolActivity.updateMany).toHaveBeenCalledWith(expectedFilter, { $set: { phone: '[erased]' } });
    expect(B2CPayout.updateMany).toHaveBeenCalledWith(
      { $or: [{ sellerAddress: 'mall1realaddress' }, { sellerPhone: '+254700000000' }] },
      { $set: { sellerPhone: '[erased]' } }
    );
  });

  test('anonymizes the account itself and force-bans it', async () => {
    const user = buildUser();
    await eraseUserData(user);

    expect(user.email).toBe('erased-user-1@erased.mallchain.local');
    expect(user.password).toBeUndefined();
    expect(user.phone).toBeUndefined();
    expect(user.walletAddress).toBeUndefined();
    expect(user.banned).toBe(true);
    expect(user.erasedAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test('writes a compliance audit log entry for the erasure itself', async () => {
    const user = buildUser();
    await eraseUserData(user);

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'gdpr_erasure', outcome: 'success' })
    );
  });

  test('does not throw if the user has no walletAddress or phone at all', async () => {
    const user = buildUser({ phone: undefined, walletAddress: undefined });

    await expect(eraseUserData(user)).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(BadgePurchase.updateMany).not.toHaveBeenCalled();
  });
});
