/**
 * KYC gate for anything that begins a wallet relationship for an account.
 *
 * Product rule (owner, 2026-11-09): no account may create or link a wallet on
 * any device before its identity has been verified, and a referral code — the
 * thing that starts reward accrual — only exists once a wallet is connected.
 * Wallet linkage is the step that turns an identity-less account into one that
 * can hold and move value, so it is the step that carries the requirement.
 *
 * The verdict is read from the same two sources the rest of the product already
 * treats as authoritative — see routes/auth.js's /compliance-status, which
 * derives `kycStatus` from the latest non-draft KYC record plus `User.kycLevel`:
 *   approved  — KYC doc with status 'approved', or kycLevel >= 2 (what the
 *               admin approval path writes, routes/adminPanel.js:509)
 *   rejected  — latest verdict is 'rejected'
 *   pending   — submitted, awaiting a reviewer
 *   unverified— nothing submitted
 *
 * Deliberately NOT gating on `kycLevel >= 1`: that is the schema default
 * (models/user.js:90) and every fresh account has it, so a >=1 check would pass
 * the exact accounts this rule exists to stop.
 *
 * There is no deadlock in this ordering: KYC submission itself
 * (routes/kyc.js, controllers/kycController.js, models/kyc.js) asks only for
 * identity, address, occupation and documents — never a wallet address.
 */
const KYC = require('../models/kyc');
const logger = require('../utils/logger');

/**
 * The four verdicts the account-facing surfaces publish — see
 * docs/backend-handoff-2026-11-09.md §6. A client should branch on this and
 * nothing else, because the fields it was assembled from disagree:
 * `models/kyc.js` has five statuses (draft/pending/approved/rejected/review),
 * `User.kycLevel` is a number whose default of 1 means "nothing verified",
 * and the admin approval path can set kycLevel without touching the KYC
 * document. Deriving those into one enum, in one place, is the point.
 */
const KYC_VERDICT = Object.freeze({
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  PENDING: 'pending',
  NOT_SUBMITTED: 'not_submitted',
});

/**
 * The one derivation of "where does this account stand with identity
 * verification", given its User row and its most recent KYC document (or null
 * when there is none).
 *
 * It exists because three surfaces publish that answer — the wallet gate,
 * GET /api/kyc/status (the dashboard banner) and GET /api/auth/compliance-status
 * — and each used to assemble it from a different combination of `status`,
 * `kycLevel` and `reviewedAt` (handoff §6). Passing the record in, rather than
 * looking it up here, is what lets all three share it without paying for the
 * query twice; the surfaces that do not already hold a record call
 * {@link kycVerdict}, which fetches one and lands here.
 *
 * `record` may be a draft — saved wizard progress is not a submission, which is
 * why it reads as 'not_submitted' and never as 'pending'. `kycLevel >= 2`
 * settles the question whatever the document says, because that is what the
 * admin approve path writes and it can set it without touching the KYC row.
 */
function verdictForAccount(user, record) {
  if (user && (user.kycLevel || 0) >= 2) return KYC_VERDICT.VERIFIED;
  const status = record && record.status;
  if (status === 'approved') return KYC_VERDICT.VERIFIED;
  if (status === 'rejected') return KYC_VERDICT.REJECTED;
  if (!status || status === 'draft') return KYC_VERDICT.NOT_SUBMITTED;
  // 'pending', 'review', and anything a future schema adds that still means
  // "submitted, awaiting a person".
  return KYC_VERDICT.PENDING;
}

/**
 * A KYC document's raw `status` on its own, with no account context. Kept for
 * callers that only have a record (the reviewer queue); an account-facing
 * surface wants {@link verdictForAccount}.
 */
function verdictFromRecordStatus(status) {
  return verdictForAccount(null, status ? { status } : null);
}

/** The published verdict → this file's own `kycStatus` vocabulary. */
function kycStatusFromVerdict(verdict) {
  if (verdict === KYC_VERDICT.VERIFIED) return 'approved';
  if (verdict === KYC_VERDICT.NOT_SUBMITTED) return 'unverified';
  if (verdict === KYC_VERDICT.REJECTED) return 'rejected';
  return 'pending';
}

/**
 * The kycStatus a reviewer would see for this user, plus whether it is
 * sufficient to let a wallet be linked. Reads one KYC record at most; callers
 * that already know `kycLevel >= 2` should not pay for that query.
 *
 * `verdict` comes from the same derivation the account's own KYC read publishes
 * — so the banner and the gate cannot answer the same question twice in two
 * different vocabularies.
 */
async function kycVerdict(user) {
  const answered = (verdict) => ({
    verified: verdict === KYC_VERDICT.VERIFIED,
    kycStatus: kycStatusFromVerdict(verdict),
    verdict,
  });

  if (!user) return answered(KYC_VERDICT.NOT_SUBMITTED);
  if ((user.kycLevel || 0) >= 2) return answered(KYC_VERDICT.VERIFIED);

  const userId = user._id || user.id;
  if (!userId) return answered(KYC_VERDICT.NOT_SUBMITTED);

  const record = await KYC.findOne({ userId, status: { $ne: 'draft' } })
    .select('status')
    .sort({ submittedAt: -1 })
    .lean();

  return answered(verdictForAccount(user, record));
}

/** Boolean form, for handlers that branch instead of answering. */
async function hasVerifiedKyc(user) {
  return (await kycVerdict(user)).verified;
}

/**
 * Express middleware factory. Run it after auth, so `req.user` is the account
 * being gated. The body is machine-readable first and human-readable second: the
 * client keys behaviour off `error` and shows `message`, and routes the user to
 * the KYC flow on its own when `kycStatus` says nothing is submitted yet.
 *
 * Options — the restore exceptions, see WalletGate.ts's `restoreOnly`:
 *   allowSameAddress   an unverified account may re-link the exact address the
 *                      server already holds for it (POST /api/auth/link-wallet)
 *   allowExistingWallet
 *                      an unverified account that already has any linked address
 *                      may set/rotate its cipher (POST /api/wallet/pin/set-pin),
 *                      which carries no address of its own
 *
 * Both exist for the same hole: the cipher wall disconnects the local wallet
 * after three wrong attempts (store.disconnectWalletAfterFailedVerifications),
 * so the owner has to come back through the create/import flow. Without the
 * exception, the verification rule — written to stop *new* wallet relationships
 * on unverified accounts — would be the reason an existing customer could not
 * reach their own funds. Neither exception lets an address the account did not
 * already hold be attached, so the money rule still holds.
 */
function requireVerifiedKyc(options = {}) {
  return async (req, res, next) => {
    try {
      const { verified, kycStatus, verdict } = await kycVerdict(req.user);
      if (verified) return next();

      if (options.allowSameAddress || options.allowExistingWallet) {
        // Read the address fresh rather than trusting req.user: requireAuth
        // serves it from a Redis-cached copy, and "this address is already
        // yours" is exactly the claim that must not be answered from a stale
        // record.
        const User = require('../models/user');
        const userId = (req.user && (req.user._id || req.user.id)) || req.userId;
        const fresh = userId ? await User.findById(userId).select('walletAddress').lean() : null;
        // Decrypt before comparing. `User.walletAddress` is AES-256-GCM
        // ciphertext at rest (models/user.js ENCRYPTED_FIELDS, and .lean()
        // skips every schema transform), while req.body.address is the
        // plaintext bech32 string the client just signed for — comparing the
        // two raw can never match, which would silently turn this exception
        // back into the lockout it exists to prevent: the owner whose cipher
        // wall disconnected their wallet would be told to verify first and
        // would still not be able to reach their own funds. decryptField
        // passes an un-prefixed legacy plaintext value through unchanged, so
        // pre-encryption rows keep working here too.
        const existing = (fresh && User.decryptUserPii(fresh).walletAddress) || '';
        if (existing && (options.allowExistingWallet || existing === String((req.body && req.body.address) || ''))) {
          logger.info('kyc', 'Wallet action allowed as a restore of the account\'s own address', {
            userId: String(userId || ''),
            path: req.path,
          });
          return next();
        }
      }

      const copy = {
        unverified: 'Verify your identity before connecting a wallet. Upload your documents under KYC — it takes a few minutes, and a reviewer answers on record.',
        pending: 'Your identity documents are with a reviewer. A wallet can be connected as soon as that verification is approved.',
        rejected: 'The last identity verification was rejected. Re-submit your documents, then connect a wallet.',
      }[kycStatus] || 'Verify your identity before connecting a wallet.';

      logger.info('kyc', 'Wallet action blocked pending verification', {
        userId: String((req.user && (req.user._id || req.user.id)) || ''),
        kycStatus,
        path: req.path,
      });

      return res.status(403).json({
        ok: false,
        error: 'kyc_verification_required',
        kycStatus,
        // Same enum GET /api/kyc/status publishes, from the same function —
        // a blocked wallet action and the dashboard banner cannot disagree
        // about where the account stands (handoff §6).
        verdict,
        message: copy,
        // Where the client sends the user next. Hash routing lives in the SPA,
        // so this is a hint, not a redirect the server performs.
        next: '/kyc',
      });
    } catch (error) {
      // Failing open here would let a transient Mongo outage link a wallet on an
      // unverified account; failing closed blocks the whole product during an
      // outage. Neither is great, so the rule is the one that matches the money:
      // an unavailable verdict is not a verified one.
      logger.error('kyc', 'Verification check failed; treating the account as unverified', error, {
        path: req.path,
      });
      return res.status(503).json({
        ok: false,
        error: 'kyc_check_unavailable',
        message: 'We could not read your verification status just now. Try again in a moment.',
      });
    }
  };
}

module.exports = {
  requireVerifiedKyc,
  hasVerifiedKyc,
  kycVerdict,
  KYC_VERDICT,
  verdictForAccount,
  verdictFromRecordStatus,
};
