const User = require('../models/user');
const KYC = require('../models/kyc');
const UserSettings = require('../models/UserSettings');
const ApiKey = require('../models/ApiKey');
const Contract = require('../models/Contract');
const Notification = require('../models/Notification');
const ValidatorApplication = require('../models/ValidatorApplication');
const WalletTransaction = require('../models/WalletTransaction');
const Transaction = require('../models/transaction');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const BadgeIssuance = require('../models/BadgeIssuance');
const BadgePurchase = require('../models/BadgePurchase');
const MallcoinPurchase = require('../models/MallcoinPurchase');
const MallcoinSale = require('../models/MallcoinSale');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const B2CPayout = require('../models/B2CPayout');
const LiquidityPoolActivity = require('../models/LiquidityPoolActivity');
const LiquidityReconciliation = require('../models/LiquidityReconciliation');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const REDACTED = '[erased]';

/**
 * Gathers every record this codebase links to a given user — by userId
 * where a real foreign key exists, and by walletAddress/phone for the
 * financial-flow models that only ever recorded those (see
 * docs/compliance/gdpr.md for the full model inventory this was built
 * from). Read-only — used for both the self-service export endpoint and as
 * a preview of what an erasure request is about to touch.
 *
 * Known gap: TaskSubmission.miner_id / MinesReviewer.validator_id use a
 * Mixed type that can hold either a Mongo _id or a wallet address
 * inconsistently across call sites — automatically matching those correctly
 * needs more certainty about which is which than the schema itself
 * guarantees, so they're deliberately left out rather than risk silently
 * matching (or erasing) the wrong records. See docs/compliance/gdpr.md.
 */
async function gatherUserData(user) {
  const userId = user._id;
  const walletAddress = user.walletAddress;
  const phone = user.phone;

  const walletOrPhone = (walletField, phoneField) => {
    const or = [];
    if (walletAddress) or.push({ [walletField]: walletAddress });
    if (phone && phoneField) or.push({ [phoneField]: phone });
    return or.length ? { $or: or } : null;
  };

  const [
    kyc,
    settings,
    apiKeys,
    contracts,
    notifications,
    validatorApplications,
    walletTransactions,
    transactions,
    conversations,
    messages,
    badgeIssuances,
  ] = await Promise.all([
    KYC.find({ userId }).lean(),
    UserSettings.findOne({ userId }).lean(),
    ApiKey.find({ userId }).lean(),
    Contract.find({ userId }).lean(),
    Notification.find({ userId }).lean(),
    ValidatorApplication.find({ userId }).lean(),
    WalletTransaction.find({ user_id: userId }).lean(),
    Transaction.find({ userId }).lean(),
    Conversation.find({ participants: userId }).lean(),
    Message.find({ senderId: userId }).lean(),
    walletAddress ? BadgeIssuance.find({ walletAddress }).lean() : [],
  ]);

  const financial = {};
  const bpQuery = walletOrPhone('walletAddress', 'phone');
  const mpQuery = walletOrPhone('walletAddress', 'phone');
  const msQuery = walletOrPhone('sellerAddress', 'phone');
  const wrQuery = walletOrPhone('walletAddress', 'phone');
  const b2cQuery = walletOrPhone('sellerAddress', 'sellerPhone');
  const lpaQuery = walletOrPhone('walletAddress', 'phone');
  const lrQuery = walletAddress ? { walletAddress } : null;

  const [
    badgePurchases,
    mallcoinPurchases,
    mallcoinSales,
    withdrawalRequests,
    b2cPayouts,
    liquidityActivity,
    liquidityReconciliation,
  ] = await Promise.all([
    bpQuery ? BadgePurchase.find(bpQuery).lean() : [],
    mpQuery ? MallcoinPurchase.find(mpQuery).lean() : [],
    msQuery ? MallcoinSale.find(msQuery).lean() : [],
    wrQuery ? WithdrawalRequest.find(wrQuery).lean() : [],
    b2cQuery ? B2CPayout.find(b2cQuery).lean() : [],
    lpaQuery ? LiquidityPoolActivity.find(lpaQuery).lean() : [],
    lrQuery ? LiquidityReconciliation.find(lrQuery).lean() : [],
  ]);

  financial.badgePurchases = badgePurchases;
  financial.mallcoinPurchases = mallcoinPurchases;
  financial.mallcoinSales = mallcoinSales;
  financial.withdrawalRequests = withdrawalRequests;
  financial.b2cPayouts = b2cPayouts;
  financial.liquidityActivity = liquidityActivity;
  financial.liquidityReconciliation = liquidityReconciliation;

  return {
    account: user.toObject ? user.toObject() : user,
    // .lean() above bypasses the model's decryption helper's normal
    // toObject() path — decrypt idNumber/phoneNumber/address/city/
    // postalCode explicitly before this reaches a data-export response.
    kyc: kyc.map((k) => KYC.decryptKycPii(k)),
    settings,
    apiKeys,
    contracts,
    notifications,
    validatorApplications,
    walletTransactions,
    transactions,
    conversations,
    messages,
    badgeIssuances,
    financial,
  };
}

/** GDPR Article 15 — right of access. Everything gatherUserData finds, minus the password hash. */
async function exportUserData(user) {
  const data = await gatherUserData(user);
  if (data.account) delete data.account.password;
  return data;
}

/**
 * GDPR Article 17 — right to erasure, balanced against AML/KYC
 * record-retention obligations (Article 17(3)(b)): direct PII is redacted
 * everywhere, but financial/compliance records themselves are kept (see the
 * per-model reasoning in docs/compliance/gdpr.md) rather than deleted, and
 * the User account is anonymized in place rather than removed — deleting it
 * outright would orphan every ref: 'User' elsewhere (KYC.reviewedBy, other
 * users' referredBy, AuditLog history) and break the referral tree.
 */
async function eraseUserData(user) {
  const userId = user._id;
  const walletAddress = user.walletAddress;
  const phone = user.phone;
  const erasedAt = new Date();

  await Promise.all([
    Notification.deleteMany({ userId }),
    UserSettings.deleteMany({ userId }),
    ApiKey.deleteMany({ userId }),
    Contract.deleteMany({ userId }),
  ]);

  await KYC.updateMany(
    { userId },
    {
      $set: {
        firstName: REDACTED,
        lastName: REDACTED,
        address: REDACTED,
        city: REDACTED,
        postalCode: REDACTED,
        phoneNumber: REDACTED,
        idNumber: REDACTED,
        idDocumentUrl: null,
        sourceOfFunds: REDACTED,
        annualIncome: REDACTED,
        notes: REDACTED,
        'amlChecks.raw': null,
        erasedAt,
      },
    }
  );

  await Message.updateMany({ senderId: userId }, { $set: { text: '[message deleted by user]' } });

  const phoneOrWalletFilter = (walletField, phoneField) => {
    const or = [];
    if (walletAddress) or.push({ [walletField]: walletAddress });
    if (phone && phoneField) or.push({ [phoneField]: phone });
    return or.length ? { $or: or } : null;
  };

  const redactPhoneOps = [];
  // Same field names (walletAddress + phone) across all four of these schemas.
  const walletAddressPhoneFilter = phoneOrWalletFilter('walletAddress', 'phone');
  if (walletAddressPhoneFilter) {
    redactPhoneOps.push(BadgePurchase.updateMany(walletAddressPhoneFilter, { $set: { phone: REDACTED } }));
    redactPhoneOps.push(MallcoinPurchase.updateMany(walletAddressPhoneFilter, { $set: { phone: REDACTED } }));
    redactPhoneOps.push(WithdrawalRequest.updateMany(walletAddressPhoneFilter, { $set: { phone: REDACTED } }));
    redactPhoneOps.push(LiquidityPoolActivity.updateMany(walletAddressPhoneFilter, { $set: { phone: REDACTED } }));
  }
  const sellerAddressPhoneFilter = phoneOrWalletFilter('sellerAddress', 'phone');
  if (sellerAddressPhoneFilter) {
    redactPhoneOps.push(MallcoinSale.updateMany(sellerAddressPhoneFilter, { $set: { phone: REDACTED } }));
  }
  const b2cFilter = phoneOrWalletFilter('sellerAddress', 'sellerPhone');
  if (b2cFilter) {
    redactPhoneOps.push(B2CPayout.updateMany(b2cFilter, { $set: { sellerPhone: REDACTED } }));
  }
  await Promise.all(redactPhoneOps);

  // Anonymize the account itself last, once every other record that needed
  // the still-live email/phone/walletAddress to be matched has been handled.
  user.email = `erased-${userId}@erased.mallchain.local`;
  user.password = undefined;
  user.googleId = undefined;
  user.name = undefined;
  user.username = undefined;
  user.phone = undefined;
  user.walletAddress = undefined;
  user.banned = true;
  user.erasedAt = erasedAt;
  await user.save();

  try {
    await AuditLog.create({
      action: 'gdpr_erasure',
      actor: `user:${userId}`,
      details: { userId: String(userId) },
      outcome: 'success',
    });
  } catch (e) {
    logger.error('gdprService', 'failed to write erasure audit log', e);
  }

  return { ok: true, erasedAt };
}

module.exports = { gatherUserData, exportUserData, eraseUserData };
