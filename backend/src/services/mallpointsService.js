const axios = require('axios');
const { config } = require('../config');
const logger = require('../utils/logger');

// GATE 61: Lazy-require MallPointAccount to avoid circular dependency at
// module load time. The model is registered by the time any route calls
// syncMallPointAccount(), but may not be registered when this file is first
// required during startup.
let _MallPointAccount = null;
function getMallPointAccount() {
  if (!_MallPointAccount) {
    _MallPointAccount = require('../models/MallPointAccount');
  }
  return _MallPointAccount;
}

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

/**
 * On-chain Mallpoints for an address (mallpoints module store).
 */
async function getChainUserPoints(address) {
  const url = `${CHAIN_REST}/tmp/marketplace/mallpoints/v1/user_points/${encodeURIComponent(address)}`;
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const up = data.user_points || data.userPoints || {};
    return {
      exists: true,
      points: Number(up.points || 0),
      tasksCompleted: Number(up.tasks_completed || up.tasksCompleted || 0),
      lastEarned: Number(up.last_earned || up.lastEarned || 0),
      source: 'chain',
    };
  } catch (err) {
    if (err.response?.status === 404) {
      return { exists: false, points: 0, tasksCompleted: 0, lastEarned: 0, source: 'chain' };
    }
    return { exists: false, points: 0, error: err.message, source: 'chain_unavailable' };
  }
}

async function getConversionWindow() {
  try {
    const { data } = await axios.get(
      `${CHAIN_REST}/tmp/marketplace/mallpoints/v1/conversion_window`,
      { timeout: 5000 }
    );
    return data.conversion_window || data.conversionWindow || null;
  } catch {
    return null;
  }
}

/**
 * Merge off-chain (Mongo) and on-chain Mallpoints for display.
 * Off-chain rewards are added until synced on-chain via MsgAwardPoints.
 */
function mergePoints({ chain, dbBalance = 0 }) {
  const chainPoints = chain?.points || 0;
  const dbPoints = Number(dbBalance) || 0;
  const total = chainPoints + dbPoints;

  return {
    balance: total,
    chainPoints,
    dbPoints,
    tasksCompleted: chain?.tasksCompleted || 0,
    lastEarned: chain?.lastEarned || null,
    sources: {
      chain: chain?.exists ? chainPoints : null,
      database: dbPoints,
    },
  };
}

function buildConversionStatus({ hasBadge, lastConversionAt, now = new Date(), allowAnyDay = false }) {
  const current = new Date(now);
  const day = current.getUTCDate();
  const month = current.getUTCMonth();
  const year = current.getUTCFullYear();

  let canConvert = false;
  let reason = null;
  let nextAllowed = null;
  const windowRule = hasBadge
    ? 'Badge holders may convert on the 15th of each month.'
    : 'Non-badge holders may convert only on December 27th each year.';

  if (allowAnyDay) {
    canConvert = true;
    reason = 'Developer override is enabled; conversion may proceed any day.';
  } else if (hasBadge) {
    canConvert = day === 15;
    nextAllowed = new Date(Date.UTC(year, month, 15));
    if (day > 15) {
      nextAllowed = new Date(Date.UTC(year, month + 1, 15));
    }
  } else {
    canConvert = month === 11 && day === 27;
    nextAllowed = new Date(Date.UTC(year, 11, 27));
    if (month > 11 || (month === 11 && day > 27)) {
      nextAllowed = new Date(Date.UTC(year + 1, 11, 27));
    }
  }

  if (lastConversionAt) {
    const last = new Date(lastConversionAt);
    if (hasBadge) {
      if (last.getUTCFullYear() === year && last.getUTCMonth() === month) {
        canConvert = false;
        reason = 'This wallet already converted Mallpoints this month.';
      }
    } else {
      if (last.getUTCFullYear() === year) {
        canConvert = false;
        reason = 'This wallet already converted Mallpoints this year.';
      }
    }
  }

  if (!allowAnyDay && !reason && !canConvert) {
    reason = hasBadge
      ? 'Conversion is only available on the 15th for badge holders.'
      : 'Conversion is only available on December 27th for non-badge holders.';
  }

  return {
    canConvert,
    reason,
    nextAllowedConversionAt: nextAllowed ? nextAllowed.toISOString() : null,
    windowRule,
    allowAnyDay,
  };
}

/**
 * GATE 61: Synchronize a MLPTS balance change to MallPointAccount so the
 * conversion path can see it. Call this within the same MongoDB session
 * transaction that mutates User.mlpts_balance.
 *
 * @param {string|null} walletAddress - The user's linked on-chain address
 * @param {number} amount - Positive for credit, negative for debit
 * @param {import('mongoose').ClientSession} session - Active MongoDB session
 * @param {object} [opts] - Optional context for logging
 * @param {string} [opts.userId] - User ID for log context
 * @param {string} [opts.flow] - Flow name for log context (e.g. 'mining_reward')
 * @returns {Promise<boolean>} true if synced, false if skipped (no walletAddress)
 */
async function syncMallPointAccount(walletAddress, amount, session, opts = {}) {
  if (!walletAddress) {
    logger.warn('gate61-sync', 'user has no walletAddress; MallPointAccount not synchronized', {
      userId: opts.userId || null,
      flow: opts.flow || null,
      amount,
      note: 'User must link wallet for conversion to work',
    });
    return false;
  }

  if (!Number.isFinite(amount) || amount === 0) {
    return true; // nothing to sync
  }

  const MallPointAccount = getMallPointAccount();
  await MallPointAccount.findOneAndUpdate(
    { address: walletAddress },
    { $inc: { balance: amount } },
    { upsert: true, session, new: true }
  );

  logger.info('gate61-sync', 'MallPointAccount synchronized', {
    userId: opts.userId || null,
    flow: opts.flow || null,
    address: walletAddress,
    amount,
  });

  return true;
}

/**
 * GATE 61.1: Enforce wallet-first business rule — throws if the user has no
 * linked walletAddress. Must be called BEFORE any MLPTS credit within the
 * same transaction, so a walletless user can never receive MLPTS that would
 * diverge from MallPointAccount.
 */
function requireWalletAddress(user, context = {}) {
  if (!user || !user.walletAddress) {
    const err = new Error('wallet required: user must link a Mallchain wallet before earning MLPTS');
    err.code = 'WALLET_REQUIRED';
    err.userId = context.userId || user?._id || null;
    err.flow = context.flow || null;
    throw err;
  }
  return user.walletAddress;
}

module.exports = {
  getChainUserPoints,
  getConversionWindow,
  mergePoints,
  buildConversionStatus,
  syncMallPointAccount,
  requireWalletAddress,
};
