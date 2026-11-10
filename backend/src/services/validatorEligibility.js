const MinesReviewer = require('../models/MinesReviewer');
const ValidatorApplication = require('../models/ValidatorApplication');
const User = require('../models/user');
const { blindIndex } = require('../utils/fieldEncryption');

/**
 * One definition of "is this account a validator here", because the rule has
 * two independent halves that were previously checked in isolation:
 *
 *   allowed  — an admin approved their ValidatorApplication (status: 'approved';
 *              see models/ValidatorApplication.js for why that flag is off-chain
 *              review bookkeeping and NOT evidence of on-chain bonding).
 *   staked   — they hold an active MinesReviewer bond (stakedAmount at or above
 *              minRequiredStake; see models/MinesReviewer.js).
 *
 * Before this file, /validators/active granted the first half from a user's
 * admin role alone, while /reviewer/stake and the auto-assignment pool looked
 * only at the second — and nothing anywhere joined them, so a staked account
 * with no approval could be assigned proof-review duties and paid for them.
 *
 * Neither half alone makes anyone a validator.
 *
 * Account key note: MinesReviewer.validator_id is the JWT user id (a hex
 * string), while ValidatorApplication is written against a chain address.
 * userId has been recorded on the application since the apply route got its
 * auth middleware; older rows predate that, so those are resolved through the
 * encrypted walletAddress blind index (the only address→account lookup this
 * codebase has).
 */

/** Latest approved application per account, keyed by String(user _id). */
async function allowedValidatorMap() {
  const applications = await ValidatorApplication.find({ status: 'approved' })
    .select('userId applicantAddress validatorAddress moniker selfDelegationAmount denom reviewedAt submittedAt')
    .sort({ reviewedAt: -1, submittedAt: -1 })
    .lean();

  const unresolvedAddresses = applications
    .filter((app) => !app.userId && app.applicantAddress)
    .map((app) => app.applicantAddress);

  // One query for every pre-userId row: the blind index is deterministic, so
  // blinding each address is what makes it matchable at all.
  const addressToKey = new Map();
  if (unresolvedAddresses.length > 0) {
    const users = await User.find({
      walletAddress_blind: { $in: [...new Set(unresolvedAddresses)].map((address) => blindIndex(address)) },
    }).select('_id walletAddress_blind').lean();
    for (const user of users) {
      addressToKey.set(user.walletAddress_blind, String(user._id));
    }
  }

  const byKey = new Map();
  let unlinked = 0;
  for (const app of applications) {
    const key = app.userId
      ? String(app.userId)
      : addressToKey.get(blindIndex(app.applicantAddress || ''));
    // An approved application whose address no longer matches any account
    // grants review rights to nobody — there is no account to attach it to.
    if (!key) { unlinked += 1; continue; }
    if (!byKey.has(key)) byKey.set(key, app);
  }

  return { byKey, unlinked };
}

/** Every account key (String(user _id)) with an approved validator application. */
async function allowedAccountKeys() {
  const { byKey } = await allowedValidatorMap();
  return new Set(byKey.keys());
}

/**
 * Both halves for one account. Missing records read as false rather than
 * throwing — "no application on file" is an answer, not an error, and callers
 * use these two booleans to explain *why* someone cannot review yet.
 */
async function getValidatorEligibility(userId) {
  const [allowed, reviewer] = await Promise.all([
    allowedAccountKeys(),
    MinesReviewer.findOne({ validator_id: userId }).lean(),
  ]);
  const isAllowed = allowed.has(String(userId));
  const staked = Boolean(reviewer && reviewer.stakeStatus === 'active');
  return {
    validator_id: String(userId),
    allowed: isAllowed,
    staked,
    staked_amount: reviewer?.stakedAmount ?? 0,
    min_required_stake: reviewer?.minRequiredStake ?? null,
    stake_status: reviewer?.stakeStatus ?? 'unstaked',
    eligible: isAllowed && staked,
  };
}

module.exports = { allowedValidatorMap, allowedAccountKeys, getValidatorEligibility };
