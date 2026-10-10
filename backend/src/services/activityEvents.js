/**
 * Activity event emitter service.
 *
 * High-level functions for emitting specific types of notifications.
 * These are called from routes and workers when significant events occur.
 */

const { dispatchNotification } = require('./notificationDispatcher');
const logger = require('../utils/logger');

/**
 * Emit a transaction event (send, receive, staking, etc.).
 *
 * @param {string} userId - User ID
 * @param {Object} txData - { type, amount, denom, counterparty, txHash, status }
 */
async function emitTransactionEvent(userId, txData) {
  const { type, amount, denom, counterparty, txHash, status } = txData;

  let title, message;

  switch (type) {
    case 'send':
      title = 'Transaction Sent';
      message = `You sent ${amount} ${denom} to ${counterparty}`;
      break;
    case 'receive':
      title = 'Payment Received';
      message = `You received ${amount} ${denom} from ${counterparty}`;
      break;
    case 'stake':
      title = 'Staking Transaction';
      message = `You staked ${amount} ${denom}`;
      break;
    case 'unstake':
      title = 'Unstaking Transaction';
      message = `You unstaked ${amount} ${denom}`;
      break;
    case 'convert':
      title = 'Currency Conversion';
      message = `Converted ${amount} ${denom}`;
      break;
    default:
      title = 'Transaction Complete';
      message = `Transaction ${txHash} ${status}`;
  }

  const result = await dispatchNotification(userId, 'transaction', {
    title,
    message,
    data: {
      txHash,
      type,
      amount,
      denom,
      counterparty,
      status,
      actionUrl: `/transactions/${txHash}`,
    },
  });

  logger.info('activityEvents', 'Transaction event emitted', {
    userId,
    type,
    txHash,
    dispatched: result.success,
  });

  return result;
}

/**
 * Emit a security event (login, password change, etc.).
 *
 * @param {string} userId - User ID
 * @param {Object} eventData - { type, ip, userAgent, location }
 */
async function emitSecurityEvent(userId, eventData) {
  const { type, ip, userAgent, location } = eventData;

  let title, message;

  switch (type) {
    case 'new_login':
      title = 'New Login Detected';
      message = `Login from ${location || 'unknown location'} (${ip})`;
      break;
    case 'password_change':
      title = 'Password Changed';
      message = 'Your password was successfully changed';
      break;
    case 'failed_login':
      title = 'Failed Login Attempt';
      message = `Failed login attempt from ${ip}`;
      break;
    case 'kyc_submitted':
      title = 'KYC Submitted';
      message = 'Your KYC verification has been submitted for review';
      break;
    case 'kyc_approved':
      title = 'KYC Approved';
      message = 'Your KYC verification has been approved';
      break;
    default:
      title = 'Security Event';
      message = `${type} from ${ip}`;
  }

  const result = await dispatchNotification(userId, 'security', {
    title,
    message,
    data: {
      type,
      ip,
      userAgent,
      location,
      actionUrl: '/settings/security',
    },
  });

  logger.info('activityEvents', 'Security event emitted', {
    userId,
    type,
    dispatched: result.success,
  });

  return result;
}

/**
 * Emit a governance event (proposal, vote, etc.).
 *
 * @param {string} userId - User ID
 * @param {Object} eventData - { type, proposalId, proposalTitle, status }
 */
async function emitGovernanceEvent(userId, eventData) {
  const { type, proposalId, proposalTitle, status } = eventData;

  let title, message;

  switch (type) {
    case 'new_proposal':
      title = 'New Governance Proposal';
      message = `New proposal: ${proposalTitle}`;
      break;
    case 'voting_started':
      title = 'Voting Started';
      message = `Voting has started for: ${proposalTitle}`;
      break;
    case 'voting_ended':
      title = 'Voting Ended';
      message = `Voting has ended for: ${proposalTitle} (${status})`;
      break;
    case 'vote_submitted':
      title = 'Vote Submitted';
      message = `Your vote on ${proposalTitle} has been recorded`;
      break;
    default:
      title = 'Governance Update';
      message = `${proposalTitle}: ${type}`;
  }

  const result = await dispatchNotification(userId, 'governance', {
    title,
    message,
    data: {
      type,
      proposalId,
      proposalTitle,
      status,
      actionUrl: `/governance/${proposalId}`,
    },
  });

  logger.info('activityEvents', 'Governance event emitted', {
    userId,
    type,
    proposalId,
    dispatched: result.success,
  });

  return result;
}

/**
 * Emit a campaign event (creator space).
 *
 * @param {string} userId - User ID
 * @param {Object} eventData - { type, campaignId, campaignTitle, metric }
 */
async function emitCampaignEvent(userId, eventData) {
  const { type, campaignId, campaignTitle, metric } = eventData;

  let title, message;

  switch (type) {
    case 'campaign_created':
      title = 'Campaign Created';
      message = `Your campaign "${campaignTitle}" is now live`;
      break;
    case 'campaign_milestone':
      title = 'Campaign Milestone';
      message = `Your campaign "${campaignTitle}" reached ${metric} engagements`;
      break;
    case 'campaign_ended':
      title = 'Campaign Ended';
      message = `Your campaign "${campaignTitle}" has ended`;
      break;
    default:
      title = 'Campaign Update';
      message = `${campaignTitle}: ${type}`;
  }

  const result = await dispatchNotification(userId, 'campaign', {
    title,
    message,
    data: {
      type,
      campaignId,
      campaignTitle,
      metric,
      actionUrl: `/creator-space/campaigns/${campaignId}`,
    },
  });

  logger.info('activityEvents', 'Campaign event emitted', {
    userId,
    type,
    campaignId,
    dispatched: result.success,
  });

  return result;
}

/**
 * Emit a badge event.
 *
 * @param {string} userId - User ID
 * @param {Object} eventData - { badgeName, badgeLevel, action }
 */
async function emitBadgeEvent(userId, eventData) {
  const { badgeName, badgeLevel, action } = eventData;

  const title = action === 'earned' ? 'Badge Earned!' : 'Badge Updated';
  const message = action === 'earned'
    ? `You earned the ${badgeName} badge${badgeLevel ? ` (Level ${badgeLevel})` : ''}`
    : `Your ${badgeName} badge has been updated`;

  const result = await dispatchNotification(userId, 'badge', {
    title,
    message,
    data: {
      badgeName,
      badgeLevel,
      action,
      actionUrl: '/profile/badges',
    },
  });

  logger.info('activityEvents', 'Badge event emitted', {
    userId,
    badgeName,
    action,
    dispatched: result.success,
  });

  return result;
}

module.exports = {
  emitTransactionEvent,
  emitSecurityEvent,
  emitGovernanceEvent,
  emitCampaignEvent,
  emitBadgeEvent,
};
