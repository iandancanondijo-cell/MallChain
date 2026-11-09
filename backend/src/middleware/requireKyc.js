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
 * The kycStatus a reviewer would see for this user, plus whether it is
 * sufficient to let a wallet be linked. Reads one KYC record at most; callers
 * that already know `kycLevel >= 2` should not pay for that query.
 */
async function kycVerdict(user) {
  if (!user) return { verified: false, kycStatus: 'unverified' };
  if ((user.kycLevel || 0) >= 2) return { verified: true, kycStatus: 'approved' };

  const userId = user._id || user.id;
  if (!userId) return { verified: false, kycStatus: 'unverified' };

  const record = await KYC.findOne({ userId, status: { $ne: 'draft' } })
    .select('status')
    .sort({ submittedAt: -1 })
    .lean();

  if (!record) return { verified: false, kycStatus: 'unverified' };
  if (record.status === 'approved') return { verified: true, kycStatus: 'approved' };
  if (record.status === 'rejected') return { verified: false, kycStatus: 'rejected' };
  return { verified: false, kycStatus: 'pending' };
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
      const { verified, kycStatus } = await kycVerdict(req.user);
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

module.exports = { requireVerifiedKyc, hasVerifiedKyc, kycVerdict };
