/* eslint-env node */
const User = require('../models/user');
const { blindIndex } = require('../utils/fieldEncryption');
const logger = require('../utils/logger');

/**
 * Wallet-age withdrawal rule (product owner, 2026-11-11).
 *
 * A wallet may not cash out until it has been attached to this platform for
 * MIN_WALLET_AGE_DAYS — "disable withdrawal for wallet below 29 days, no
 * matter how much they have". Balance is deliberately not an input: the rule
 * exists precisely for the large-but-fresh case (funds moved in from
 * elsewhere, then withdrawn before anyone can notice), which is also the
 * shape of a stolen-device cash-out and of a same-day wash-and-run.
 *
 * Which clock: `User.walletLinkedAt`, written by POST /api/auth/link-wallet
 * at the moment an address first becomes associated with an account. It is
 * the earliest instant the platform itself can vouch for, and — unlike the
 * client's `store.wallet.createdAt` — it is not something a browser tab can
 * edit. Wallets that were linked before that field existed fall back to
 * `User.createdAt`, the oldest timestamp the account carries; that fallback
 * is generous to pre-rule accounts (a 2024 wallet is not suddenly frozen) and
 * still cannot be reset by re-registering.
 *
 * Fail-closed: an address with no linked account has no provable age, so it
 * cannot withdraw. Requiring a link on the withdrawal path costs nothing in
 * the real product — KYC already precedes wallet creation, and wallet
 * linkage already precedes a referral code — so nobody legitimate is stopped,
 * only callers who would rather not say whose wallet this is.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WALLET_AGE_DAYS = (() => {
  const raw = Number(process.env.WITHDRAWAL_MIN_WALLET_AGE_DAYS);
  // Only an explicit non-negative number overrides the 29-day default; a
  // typo'd or negative value falls back to the rule rather than silently
  // switching it off. Set it to 0 deliberately to disable.
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 29;
})();

function daysBetween(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

/**
 * @param {string} walletAddress
 * @returns {Promise<{
 *   ok: boolean,
 *   code: (string|null),
 *   minimumDays: number,
 *   ageDays: number|null,
 *   reference: (string|null),
 *   referenceAt: (string|null),
 *   unlockAt: (string|null),
 *   walletLinked: boolean,
 * }>}
 */
async function checkWalletWithdrawalAge(walletAddress) {
  const address = typeof walletAddress === 'string' ? walletAddress.trim() : '';

  if (!address) {
    return {
      ok: false,
      code: 'wallet_not_linked',
      minimumDays: MIN_WALLET_AGE_DAYS,
      ageDays: null,
      reference: null,
      referenceAt: null,
      unlockAt: null,
      walletLinked: false,
    };
  }

  // Plain findOne with no `.select().lean()` chain: the fields read below are
  // all unencrypted, and the projection chain only exists to save a few
  // bytes — at the cost of breaking every test (and caller) that hands back a
  // simple mocked query. Same shape as withdrawalLiquidityQueueService's own
  // User.findOne() lookup.
  //
  // The lookup itself is inside a try/catch because blindIndex() needs
  // FIELD_BLIND_INDEX_KEY: with that key missing or malformed, an uncaught
  // throw would surface as a 500 "Internal server error" on the payout
  // route, which reads to the user like a broken product and to an operator
  // like a bug to retry. Failing closed with an explicit code says the same
  // thing the DB would have said — this wallet's age cannot be proven, so it
  // cannot cash out — and names the reason.
  let user;
  try {
    user = await User.findOne({ walletAddress_blind: blindIndex(address) });
  } catch (error) {
    logger.error('walletAgeService: could not resolve the wallet owner, treating age as unverifiable', {
      error: error.message,
    });
    return {
      ok: false,
      code: 'wallet_age_unverifiable',
      minimumDays: MIN_WALLET_AGE_DAYS,
      ageDays: null,
      reference: null,
      referenceAt: null,
      unlockAt: null,
      walletLinked: false,
    };
  }

  if (!user) {
    return {
      ok: false,
      code: 'wallet_not_linked',
      minimumDays: MIN_WALLET_AGE_DAYS,
      ageDays: null,
      reference: null,
      referenceAt: null,
      unlockAt: null,
      walletLinked: false,
    };
  }

  const linkedAt = user.walletLinkedAt ? new Date(user.walletLinkedAt) : null;
  const accountCreatedAt = user.createdAt ? new Date(user.createdAt) : null;
  const referenceAt = (linkedAt && !Number.isNaN(linkedAt.getTime()))
    ? { at: linkedAt, reference: 'walletLinkedAt' }
    : (accountCreatedAt && !Number.isNaN(accountCreatedAt.getTime()))
      ? { at: accountCreatedAt, reference: 'accountCreatedAt' }
      : null;

  if (!referenceAt) {
    // An account with no timestamps at all cannot evidence a wallet's age —
    // and "unknown" is not "old enough".
    return {
      ok: false,
      code: 'wallet_age_unverifiable',
      minimumDays: MIN_WALLET_AGE_DAYS,
      ageDays: null,
      reference: null,
      referenceAt: null,
      unlockAt: null,
      walletLinked: true,
    };
  }

  const now = Date.now();
  const ageDays = Math.max(0, daysBetween(referenceAt.at.getTime(), now));
  const unlockAt = new Date(referenceAt.at.getTime() + MIN_WALLET_AGE_DAYS * DAY_MS);
  const ok = ageDays >= MIN_WALLET_AGE_DAYS;

  return {
    ok,
    code: ok ? null : 'wallet_age_not_met',
    minimumDays: MIN_WALLET_AGE_DAYS,
    ageDays,
    reference: referenceAt.reference,
    referenceAt: referenceAt.at.toISOString(),
    unlockAt: unlockAt.toISOString(),
    walletLinked: true,
  };
}

/**
 * One honest sentence for every blocked cash-out, shared by the four payout
 * boundaries (POST /api/buy/sell, executeSellSettlement, the liquidity queue
 * release, POST /api/withdraw/mpesa, admin retry) so a wallet can be told a
 * different reason depending on which door it tried.
 *
 * @param {Awaited<ReturnType<typeof checkWalletWithdrawalAge>>} check
 * @returns {string|null} null when the check passed
 */
function describeWalletAgeBlock(check) {
  if (!check || check.ok) return null;
  if (check.code === 'wallet_not_linked') {
    return 'This wallet is not linked to an account on Mallchain, so its age cannot be confirmed and no cash-out can be filed for it.';
  }
  if (check.code === 'wallet_age_unverifiable') {
    return 'Mallchain could not confirm how long this wallet has been on the platform, so cash-outs stay closed for it until that can be verified.';
  }
  // wallet_age_not_met: the only case with a number to quote.
  const age = Number.isFinite(check.ageDays) ? `this one is ${check.ageDays} day(s) old` : 'it has not been dated yet';
  const from = check.unlockAt ? ` Cash-outs open from ${check.unlockAt}.` : '';
  return `Cash-outs open ${check.minimumDays} days after a wallet joins Mallchain; ${age}.${from}`;
}

module.exports = { checkWalletWithdrawalAge, describeWalletAgeBlock, MIN_WALLET_AGE_DAYS };
