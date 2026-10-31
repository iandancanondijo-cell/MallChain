/**
 * Activity event emitter service.
 *
 * High-level functions for emitting specific types of notifications.
 * Uses the unified notification engine for template-driven dispatch.
 * Falls back to the raw dispatcher for untyped events.
 */

const { dispatchEvent } = require('./notificationEngine');
const { dispatchNotification } = require('./notificationDispatcher');
const logger = require('../utils/logger');

/**
 * Resolve the account that owns a wallet address so wallet-activity
 * notifications reach the holder. walletAddress is encrypted PII, so the
 * lookup goes through its blind index. Returns null when the address has no
 * registered holder (e.g. a brand-new recipient wallet) — callers then skip
 * the notification instead of failing the financial flow.
 */
async function userIdForAddress(address) {
  if (!address) return null;
  try {
    const User = require('../models/user');
    const { blindIndex } = require('../utils/fieldEncryption');
    const user = await User.findOne({ walletAddress_blind: blindIndex(address) }).select('_id').lean();
    return user ? user._id.toString() : null;
  } catch (err) {
    logger.warn('activityEvents', 'Wallet address lookup failed', { error: err.message });
    return null;
  }
}

/** Shorten an on-chain address for display in a notification body. */
function displayAddress(address) {
  const s = String(address || '');
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
}

// ─── ACCOUNT & ONBOARDING ────────────────────────────────────────────

async function emitAccountCreated(userId, data = {}) {
  return emit('account.created', userId, data);
}

async function emitEmailVerification(userId, data) {
  return emit('account.email_verification_requested', userId, data);
}

async function emitEmailVerified(userId, data = {}) {
  return emit('account.email_verified', userId, data);
}

async function emitPhoneVerified(userId, data = {}) {
  return emit('account.phone_verified', userId, data);
}

async function emitNewLogin(userId, data) {
  return emit('account.new_login', userId, data);
}

async function emitPasswordChanged(userId, data = {}) {
  return emit('account.password_changed', userId, data);
}

async function emitPasswordResetRequested(userId, data) {
  return emit('account.password_reset_requested', userId, data);
}

async function emitPasswordResetCompleted(userId, data = {}) {
  return emit('account.password_reset_completed', userId, data);
}

async function emitTwoFactorEnabled(userId, data = {}) {
  return emit('account.two_factor_enabled', userId, data);
}

async function emitTwoFactorDisabled(userId, data = {}) {
  return emit('account.two_factor_disabled', userId, data);
}

async function emitNewDevice(userId, data) {
  return emit('account.new_device', userId, data);
}

async function emitAccountRestricted(userId, data) {
  return emit('account.restricted', userId, data);
}

async function emitAccountRestored(userId, data = {}) {
  return emit('account.restored', userId, data);
}

// ─── WALLET ──────────────────────────────────────────────────────────

async function emitWalletCreated(userId, data) {
  return emit('wallet.created', userId, data);
}

async function emitDepositDetected(userId, data) {
  return emit('wallet.deposit_detected', userId, data);
}

async function emitDepositConfirmed(userId, data) {
  return emit('wallet.deposit_confirmed', userId, data);
}

async function emitDepositFailed(userId, data) {
  return emit('wallet.deposit_failed', userId, data);
}

async function emitWithdrawalRequested(userId, data) {
  return emit('wallet.withdrawal_requested', userId, data);
}

async function emitWithdrawalCompleted(userId, data) {
  return emit('wallet.withdrawal_completed', userId, data);
}

async function emitWithdrawalFailed(userId, data) {
  return emit('wallet.withdrawal_failed', userId, data);
}

async function emitTransferReceived(userId, data) {
  return emit('wallet.transfer_received', userId, data);
}

async function emitTransferSent(userId, data) {
  return emit('wallet.transfer_sent', userId, data);
}

async function emitTransferFailed(userId, data) {
  return emit('wallet.transfer_failed', userId, data);
}

async function emitSuspiciousTransfer(userId, data) {
  return emit('wallet.suspicious_transfer_alert', userId, data);
}

async function emitLargeTransfer(userId, data) {
  return emit('wallet.large_transfer_alert', userId, data);
}

// ─── MALLCOIN (MLCNS) ───────────────────────────────────────────────

async function emitMlcnsPurchaseInitiated(userId, data) {
  return emit('mlcns.purchase_initiated', userId, data);
}

async function emitMlcnsPurchaseSuccessful(userId, data) {
  return emit('mlcns.purchase_confirmed', userId, data);
}

async function emitMlcnsPurchaseFailed(userId, data) {
  return emit('mlcns.purchase_failed', userId, data);
}

async function emitMlcnsTransferReceived(userId, data) {
  return emit('mlcns.transfer_received', userId, data);
}

async function emitMlcnsTransferSent(userId, data) {
  return emit('mlcns.transfer_sent', userId, data);
}

async function emitMlcnsConversionCompleted(userId, data) {
  return emit('mlcns.conversion_completed', userId, data);
}

// ─── MALLPOINTS (MLPTS) ─────────────────────────────────────────────

async function emitMlptsEarned(userId, data) {
  return emit('mlpts.reward_earned', userId, data);
}

async function emitMlptsPending(userId, data) {
  return emit('mlpts.reward_pending', userId, data);
}

async function emitMlptsApproved(userId, data) {
  return emit('mlpts.reward_approved', userId, data);
}

async function emitMlptsRejected(userId, data) {
  return emit('mlpts.reward_rejected', userId, data);
}

async function emitMlptsUsed(userId, data) {
  return emit('mlpts.used', userId, data);
}

async function emitMlptsConversionEligible(userId, data) {
  return emit('mlpts.conversion_eligible', userId, data);
}

async function emitMlptsConversionCompleted(userId, data) {
  return emit('mlpts.conversion_completed', userId, data);
}

async function emitMlptsCycleOpened(userId, data) {
  return emit('mlpts.emission_cycle_opened', userId, data);
}

async function emitMlptsPoolDepleted(userId, data) {
  return emit('mlpts.pool_depleted', userId, data);
}

// ─── MINING ──────────────────────────────────────────────────────────

async function emitCampaignCreated(userId, data) {
  return emit('mining.campaign_created', userId, data);
}

async function emitCampaignApproved(userId, data) {
  return emit('mining.campaign_approved', userId, data);
}

async function emitCampaignRejected(userId, data) {
  return emit('mining.campaign_rejected', userId, data);
}

async function emitCampaignBudgetLow(userId, data) {
  return emit('mining.campaign_budget_low', userId, data);
}

async function emitCampaignCompleted(userId, data) {
  return emit('mining.campaign_completed', userId, data);
}

async function emitProofSubmitted(userId, data) {
  return emit('mining.proof_submitted', userId, data);
}

async function emitProofApproved(userId, data) {
  return emit('mining.proof_approved', userId, data);
}

async function emitProofRejected(userId, data) {
  return emit('mining.proof_rejected', userId, data);
}

async function emitDuplicateDetected(userId, data) {
  return emit('mining.duplicate_detected', userId, data);
}

async function emitValidationAssigned(userId, data) {
  return emit('mining.validation_assigned', userId, data);
}

async function emitValidatorReward(userId, data) {
  return emit('mining.validator_reward', userId, data);
}

async function emitValidatorSuspended(userId, data) {
  return emit('mining.validator_suspended', userId, data);
}

// ─── MARKETPLACE ─────────────────────────────────────────────────────

async function emitOrderPlaced(userId, data) {
  return emit('marketplace.order_placed', userId, data);
}

async function emitNewOrder(userId, data) {
  return emit('marketplace.new_order', userId, data);
}

async function emitPaymentReceived(userId, data) {
  return emit('marketplace.payment_received', userId, data);
}

async function emitOrderDispatched(userId, data) {
  return emit('marketplace.order_dispatched', userId, data);
}

async function emitOrderCompleted(userId, data) {
  return emit('marketplace.order_completed', userId, data);
}

async function emitOrderCancelled(userId, data) {
  return emit('marketplace.order_cancelled', userId, data);
}

async function emitListingPublished(userId, data) {
  return emit('marketplace.product_published', userId, data);
}

async function emitListingRejected(userId, data) {
  return emit('marketplace.listing_rejected', userId, data);
}

async function emitPayoutRequested(userId, data) {
  return emit('marketplace.payout_requested', userId, data);
}

async function emitPayoutCompleted(userId, data) {
  return emit('marketplace.payout_completed', userId, data);
}

async function emitDisputeOpened(userId, data) {
  return emit('marketplace.dispute_opened', userId, data);
}

async function emitDisputeResolved(userId, data) {
  return emit('marketplace.dispute_resolved', userId, data);
}

async function emitReferralReward(userId, data) {
  return emit('marketplace.referral_reward_confirmed', userId, data);
}

async function emitReviewReceived(userId, data) {
  return emit('marketplace.review_received', userId, data);
}

async function emitSupportTicketCreated(userId, data) {
  return emit('support.ticket_created', userId, data);
}

async function emitSupportTicketResolved(userId, data) {
  return emit('support.ticket_resolved', userId, data);
}

// ─── BADGES ──────────────────────────────────────────────────────────

async function emitBadgeAwarded(userId, data) {
  return emit('badge.awarded', userId, data);
}

async function emitBadgeExpiring(userId, data) {
  return emit('badge.expiring', userId, data);
}

async function emitEligibilityChanged(userId, data) {
  return emit('badge.eligibility_changed', userId, data);
}

// ─── SECURITY ────────────────────────────────────────────────────────

async function emitLoginDetected(userId, data) {
  return emit('security.login_detected', userId, data);
}

async function emitFailedLogin(userId, data) {
  return emit('security.failed_login', userId, data);
}

async function emitSuspiciousActivity(userId, data) {
  return emit('security.suspicious_activity', userId, data);
}

async function emitAccountLocked(userId, data) {
  return emit('security.account_locked', userId, data);
}

async function emitKycSubmitted(userId, data = {}) {
  return emit('security.kyc_submitted', userId, data);
}

async function emitKycApproved(userId, data) {
  return emit('security.kyc_approved', userId, data);
}

async function emitKycRejected(userId, data) {
  return emit('security.kyc_rejected', userId, data);
}

async function emitTransferHeld(userId, data) {
  return emit('security.transfer_held', userId, data);
}

// ─── GOVERNANCE ──────────────────────────────────────────────────────

async function emitProposalCreated(userId, data) {
  return emit('governance.proposal_created', userId, data);
}

async function emitVotingStarted(userId, data) {
  return emit('governance.voting_started', userId, data);
}

async function emitVotingEnded(userId, data) {
  return emit('governance.voting_ended', userId, data);
}

async function emitVoteSubmitted(userId, data) {
  return emit('governance.vote_submitted', userId, data);
}

// ─── NETWORK ─────────────────────────────────────────────────────────

async function emitNetworkRpcUnavailable(data) {
  return emitSystem('network.rpc_unavailable', data);
}

async function emitNetworkRpcRestored(data) {
  return emitSystem('network.rpc_restored', data);
}

async function emitMaintenanceScheduled(data) {
  return emitSystem('network.maintenance_scheduled', data);
}

// ─── INTERNAL HELPERS ────────────────────────────────────────────────

async function emit(eventType, userId, data) {
  const result = await dispatchEvent(userId, eventType, data);

  if (!result.success) {
    logger.info('activityEvents', 'Event dispatch returned non-success', {
      eventType,
      userId,
      error: result.error,
    });
  } else {
    logger.info('activityEvents', 'Event dispatched', {
      eventType,
      userId,
      notificationId: result.notificationId,
      channels: result.channels,
    });
  }

  return result;
}

async function emitSystem(eventType, data) {
  const { dispatchEvent: dispatch } = require('./notificationEngine');
  const systemUserId = data.adminUserId || data.userId;
  if (!systemUserId) {
    logger.warn('activityEvents', 'System event requires adminUserId or userId', { eventType });
    return { success: false, error: 'No recipient' };
  }
  return dispatch(systemUserId, eventType, data);
}

// ─── LEGACY COMPATIBILITY ────────────────────────────────────────────
// These functions maintain the old API for callers that haven't migrated.

async function emitTransactionEvent(userId, txData) {
  const { type, amount, denom, counterparty, txHash, status } = txData;

  const eventMap = {
    send: 'wallet.transfer_sent',
    receive: 'wallet.transfer_received',
    stake: 'wallet.transfer_sent',
    unstake: 'wallet.transfer_received',
    convert: 'mlcns.conversion_completed',
  };

  const eventType = eventMap[type];
  if (eventType) {
    return emit(eventType, userId, {
      amount,
      asset: denom,
      sender_display: counterparty || 'Mallchain',
      recipient_display: counterparty || 'Mallchain',
      tx_hash_short: txHash ? txHash.substring(0, 12) + '...' : '',
      transaction_status: status || 'completed',
      reference_id: txHash || '',
      ...txData,
    });
  }

  return dispatchNotification(userId, 'transaction', {
    title: 'Transaction Complete',
    message: `Transaction ${txHash} ${status}`,
    data: { txHash, type, amount, denom, counterparty, status, actionUrl: `/transactions/${txHash}` },
  });
}

async function emitSecurityEvent(userId, eventData) {
  const { type, ip, userAgent, location } = eventData;

  const eventMap = {
    new_login: 'security.login_detected',
    failed_login: 'security.failed_login',
    kyc_submitted: 'security.kyc_submitted',
    kyc_approved: 'security.kyc_approved',
  };

  const eventType = eventMap[type];
  if (eventType) {
    return emit(eventType, userId, {
      event_time: new Date().toISOString(),
      device_name: userAgent || 'Unknown device',
      ip_address: ip || 'unknown',
      location: location || 'unknown location',
      ...eventData,
    });
  }

  return dispatchNotification(userId, 'security', {
    title: 'Security Event',
    message: `${type} from ${ip}`,
    data: { type, ip, userAgent, location, actionUrl: '/settings/security' },
  });
}

async function emitGovernanceEvent(userId, eventData) {
  const { type, proposalId, proposalTitle, status } = eventData;

  const eventMap = {
    new_proposal: 'governance.proposal_created',
    voting_started: 'governance.voting_started',
    voting_ended: 'governance.voting_ended',
    vote_submitted: 'governance.vote_submitted',
  };

  const eventType = eventMap[type];
  if (eventType) {
    return emit(eventType, userId, {
      proposal_id: proposalId,
      proposal_title: proposalTitle,
      outcome: status,
      ...eventData,
    });
  }

  return dispatchNotification(userId, 'governance', {
    title: 'Governance Update',
    message: `${proposalTitle}: ${type}`,
    data: { type, proposalId, proposalTitle, status, actionUrl: `/governance/${proposalId}` },
  });
}

async function emitCampaignEvent(userId, eventData) {
  const { type, campaignId, campaignTitle, metric } = eventData;

  const eventMap = {
    campaign_created: 'mining.campaign_created',
    campaign_milestone: 'mining.campaign_budget_low',
    campaign_ended: 'mining.campaign_completed',
  };

  const eventType = eventMap[type];
  if (eventType) {
    return emit(eventType, userId, {
      campaign_name: campaignTitle,
      ...eventData,
    });
  }

  return dispatchNotification(userId, 'campaign', {
    title: 'Campaign Update',
    message: `${campaignTitle}: ${type}`,
    data: { type, campaignId, campaignTitle, metric, actionUrl: `/creator-space/campaigns/${campaignId}` },
  });
}

async function emitBadgeEvent(userId, eventData) {
  const { badgeName, badgeLevel, action } = eventData;

  if (action === 'earned') {
    return emit('badge.awarded', userId, {
      badge_name: badgeName,
      award_reason: badgeLevel ? `Level ${badgeLevel}` : 'Achievement',
      ...eventData,
    });
  }

  return dispatchNotification(userId, 'badge', {
    title: action === 'earned' ? 'Badge Earned!' : 'Badge Updated',
    message: action === 'earned'
      ? `You earned the ${badgeName} badge${badgeLevel ? ` (Level ${badgeLevel})` : ''}`
      : `Your ${badgeName} badge has been updated`,
    data: { badgeName, badgeLevel, action, actionUrl: '/profile/badges' },
  });
}

module.exports = {
  // Template-driven event dispatch
  emit,
  userIdForAddress,
  displayAddress,

  // Account
  emitAccountCreated,
  emitEmailVerification,
  emitEmailVerified,
  emitPhoneVerified,
  emitNewLogin,
  emitPasswordChanged,
  emitPasswordResetRequested,
  emitPasswordResetCompleted,
  emitTwoFactorEnabled,
  emitTwoFactorDisabled,
  emitNewDevice,
  emitAccountRestricted,
  emitAccountRestored,

  // Wallet
  emitWalletCreated,
  emitDepositDetected,
  emitDepositConfirmed,
  emitDepositFailed,
  emitWithdrawalRequested,
  emitWithdrawalCompleted,
  emitWithdrawalFailed,
  emitTransferReceived,
  emitTransferSent,
  emitTransferFailed,
  emitSuspiciousTransfer,
  emitLargeTransfer,

  // MLCNS
  emitMlcnsPurchaseInitiated,
  emitMlcnsPurchaseSuccessful,
  emitMlcnsPurchaseFailed,
  emitMlcnsTransferReceived,
  emitMlcnsTransferSent,
  emitMlcnsConversionCompleted,

  // MLPTS
  emitMlptsEarned,
  emitMlptsPending,
  emitMlptsApproved,
  emitMlptsRejected,
  emitMlptsUsed,
  emitMlptsConversionEligible,
  emitMlptsConversionCompleted,
  emitMlptsCycleOpened,
  emitMlptsPoolDepleted,

  // Mining
  emitCampaignCreated,
  emitCampaignApproved,
  emitCampaignRejected,
  emitCampaignBudgetLow,
  emitCampaignCompleted,
  emitProofSubmitted,
  emitProofApproved,
  emitProofRejected,
  emitDuplicateDetected,
  emitValidationAssigned,
  emitValidatorReward,
  emitValidatorSuspended,

  // Marketplace
  emitOrderPlaced,
  emitNewOrder,
  emitPaymentReceived,
  emitOrderDispatched,
  emitOrderCompleted,
  emitOrderCancelled,
  emitListingPublished,
  emitListingRejected,
  emitPayoutRequested,
  emitPayoutCompleted,
  emitDisputeOpened,
  emitDisputeResolved,
  emitReferralReward,
  emitReviewReceived,
  emitSupportTicketCreated,
  emitSupportTicketResolved,

  // Badges
  emitBadgeAwarded,
  emitBadgeExpiring,
  emitEligibilityChanged,

  // Security
  emitLoginDetected,
  emitFailedLogin,
  emitSuspiciousActivity,
  emitAccountLocked,
  emitKycSubmitted,
  emitKycApproved,
  emitKycRejected,
  emitTransferHeld,

  // Governance
  emitProposalCreated,
  emitVotingStarted,
  emitVotingEnded,
  emitVoteSubmitted,

  // Network
  emitNetworkRpcUnavailable,
  emitNetworkRpcRestored,
  emitMaintenanceScheduled,

  // Legacy compatibility
  emitTransactionEvent,
  emitSecurityEvent,
  emitGovernanceEvent,
  emitCampaignEvent,
  emitBadgeEvent,
};
