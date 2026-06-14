/* eslint-env node */
/* global require, module */
const { BurnPolicy, DynamicBurnThreshold } = require('../models/BurnPolicy');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

// Get static burn rate for an activity from policy
async function getStaticBurnRate(activity) {
  try {
    const policy = await BurnPolicy.findOne({ activity, enabled: true });
    return policy ? policy.burnPercentage : 0;
  } catch (err) {
    console.error('[BurnCalc] Failed to fetch burn policy:', err.message);
    return 0;
  }
}

// Calculate dynamic burn rate based on circulating supply
async function getDynamicBurnRate(activity, currentSupply) {
  try {
    // Fetch thresholds for this activity, sorted by highest supply first
    const thresholds = await DynamicBurnThreshold.find({
      activity,
      enabled: true,
    }).sort({ supplyThreshold: -1 });

    // Find the first threshold that matches the current supply
    for (const threshold of thresholds) {
      if (currentSupply >= threshold.supplyThreshold) {
        console.log(`[BurnCalc] Dynamic burn for ${activity}: ${threshold.burnPercentage}% (supply: ${currentSupply})`);
        return threshold.burnPercentage;
      }
    }

    // If no thresholds match (supply below all), return 0 or lowest configured
    return 0;
  } catch (err) {
    console.error('[BurnCalc] Failed to calculate dynamic burn rate:', err.message);
    return 0;
  }
}

// Calculate burn amounts: { burnAmount, treasuryAmount }
function calculateBurnSplit(totalAmount, burnPercentage) {
  const burnAmount = Math.floor(totalAmount * (burnPercentage / 100));
  const treasuryAmount = totalAmount - burnAmount;
  return { burnAmount, treasuryAmount, burnPercentage };
}

// Determine if dynamic burn should be used for this activity
function shouldUseDynamic(activity) {
  // Activities with supply-dependent burn rates
  return ['cash_out', 'marketplace_purchase', 'wallet_transfer'].includes(activity);
}

// Get effective burn rate considering both static and dynamic
async function getEffectiveBurnRate(activity, currentSupply) {
  if (shouldUseDynamic(activity)) {
    const dynamic = await getDynamicBurnRate(activity, currentSupply);
    if (dynamic > 0) return dynamic;
  }

  return getStaticBurnRate(activity);
}

// Suggested default burn rates matching user's economic model
async function initializeDefaultBurnPolicies() {
  try {
    const defaults = [
      { activity: 'marketplace_purchase', burnPercentage: 2, description: 'Marketplace purchase fee burn' },
      { activity: 'wallet_transfer', burnPercentage: 1, description: 'Wallet transfer fee burn' },
      { activity: 'cash_out', burnPercentage: 30, description: 'Cash-out/sell fee burn' },
      { activity: 'validator_penalty', burnPercentage: 100, description: 'Validator penalty (full burn)' },
      { activity: 'lost_recovery', burnPercentage: 5, description: 'Lost wallet recovery fee' },
    ];

    for (const policy of defaults) {
      const existing = await BurnPolicy.findOne({ activity: policy.activity });
      if (!existing) {
        await BurnPolicy.create(policy);
        console.log(`[BurnCalc] Created default burn policy: ${policy.activity}`);
      }
    }
  } catch (err) {
    console.error('[BurnCalc] Failed to initialize default burn policies:', err.message);
  }
}

// Suggested default dynamic burn thresholds for cash-out
async function initializeDefaultDynamicThresholds() {
  try {
    const defaults = [
      { activity: 'cash_out', supplyThreshold: 500000000, burnPercentage: 30, order: 1 },
      { activity: 'cash_out', supplyThreshold: 200000000, burnPercentage: 20, order: 2 },
      { activity: 'cash_out', supplyThreshold: 100000000, burnPercentage: 10, order: 3 },
    ];

    for (const threshold of defaults) {
      const existing = await DynamicBurnThreshold.findOne({
        activity: threshold.activity,
        supplyThreshold: threshold.supplyThreshold,
      });
      if (!existing) {
        await DynamicBurnThreshold.create(threshold);
        console.log(`[BurnCalc] Created dynamic threshold: ${threshold.activity} at ${threshold.supplyThreshold}`);
      }
    }
  } catch (err) {
    console.error('[BurnCalc] Failed to initialize dynamic thresholds:', err.message);
  }
}

module.exports = {
  getStaticBurnRate,
  getDynamicBurnRate,
  getEffectiveBurnRate,
  calculateBurnSplit,
  shouldUseDynamic,
  initializeDefaultBurnPolicies,
  initializeDefaultDynamicThresholds,
};
