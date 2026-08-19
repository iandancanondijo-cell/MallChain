const axios = require('axios');
const { config } = require('../config');
const { getValidatorLeaderboard, getValidatorDetail } = require('../services/validatorCenterService');
const ValidatorApplication = require('../models/ValidatorApplication');

const CHAIN_REST = config.chain.rest;

/** List active validators from chain REST (for staking UI). */
exports.listValidators = async (_req, res) => {
  try {
    const base = CHAIN_REST.replace(/\/$/, '');
    const response = await axios.get(
      `${base}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`,
      { timeout: 8000 }
    );
    const validators = (response.data?.validators || []).map((v, index) => {
      const commission = v.commission?.commission_rates?.rate || '0';
      const tokens = Number(v.tokens || 0);
      return {
        id: v.operator_address,
        operatorAddress: v.operator_address,
        name: v.description?.moniker || `Validator ${index + 1}`,
        description: v.description?.details || v.description?.website || '',
        commission: Math.round(parseFloat(commission) * 10000) / 100,
        apr: 12,
        totalStaked: tokens / 1e6,
        uptime: 99.5,
        logo: '🛡️',
        status: v.status,
      };
    });
    return res.json({ success: true, validators });
  } catch (e) {
    console.error('list validators error:', e.message);
    return res.status(503).json({
      success: false,
      error: 'validators_unavailable',
      message: e.message,
    });
  }
};

exports.listLeaderboard = async (_req, res) => {
  try {
    const validators = await getValidatorLeaderboard();
    return res.json({ success: true, validators });
  } catch (e) {
    console.error('validator leaderboard error:', e.message);
    return res.status(503).json({ success: false, error: 'leaderboard_unavailable', message: e.message });
  }
};

exports.getValidator = async (req, res) => {
  try {
    const { operatorAddress } = req.params;
    if (!operatorAddress) return res.status(400).json({ success: false, error: 'operator_address_required' });
    const validator = await getValidatorDetail(operatorAddress);
    if (!validator) return res.status(404).json({ success: false, error: 'validator_not_found' });
    return res.json({ success: true, validator });
  } catch (e) {
    console.error('validator detail error:', e.message);
    return res.status(503).json({ success: false, error: 'validator_unavailable', message: e.message });
  }
};

exports.applyValidator = async (req, res) => {
  try {
    const { applicantAddress, validatorAddress, moniker, website, details, selfDelegationAmount, denom } = req.body || {};
    if (!applicantAddress || !moniker) {
      return res.status(400).json({ success: false, error: 'applicant_address_and_moniker_required' });
    }

    const application = await ValidatorApplication.create({
      userId: req.user?._id,
      applicantAddress,
      validatorAddress,
      moniker,
      website,
      details,
      selfDelegationAmount: String(selfDelegationAmount || '0'),
      denom: denom || config.chain.baseDenom,
      status: 'pending',
    });

    return res.json({ success: true, application });
  } catch (e) {
    console.error('validator application error:', e.message);
    return res.status(500).json({ success: false, error: 'application_failed', message: e.message });
  }
};

// Application listing/review now lives solely at /api/admin/validators/*
// (adminPanel.js, requireAdmin + audit logging) — this pair used to
// duplicate it behind a shared static API key with no audit trail; removed
// as dead, insecure code (confirmed no frontend caller).

// Checks the chain directly for whether validatorAddress is a real bonded
// validator — independent of (and not implied by) the application's own
// status/isActiveValidator, which are admin-review bookkeeping only.
async function checkOnChainBonded(validatorAddress) {
  if (!validatorAddress) return false;
  try {
    const base = CHAIN_REST.replace(/\/$/, '');
    const { data } = await axios.get(
      `${base}/cosmos/staking/v1beta1/validators/${encodeURIComponent(validatorAddress)}`,
      { timeout: 5000 }
    );
    return data?.validator?.status === 'BOND_STATUS_BONDED';
  } catch {
    return false;
  }
}

exports.getMyApplication = async (req, res) => {
  try {
    const address = req.query.address?.trim();
    if (!address) {
      return res.status(400).json({ success: false, error: 'address_required' });
    }
    const application = await ValidatorApplication.findOne({ applicantAddress: address }).sort({ submittedAt: -1 });
    if (!application) {
      return res.json({ success: true, application: null });
    }
    const onChainBonded = await checkOnChainBonded(application.validatorAddress);
    return res.json({ success: true, application, onChainBonded });
  } catch (e) {
    console.error('get my application error:', e.message);
    return res.status(500).json({ success: false, error: 'lookup_failed', message: e.message });
  }
};

// Real validator creation is now a client-signed MsgCreateValidator self-bond
// (see mallchain-os-v14/src/services/validatorCreateTx.ts) broadcast through
// the generic /api/staking/broadcast relay, the same pattern used by
// governance/delegate txs. This endpoint used to sign with the treasury key
// while claiming an arbitrary caller-supplied delegator/validator address —
// broken (signature wouldn't match the claimed delegator) and insecure (any
// authed user could invoke it for any address). Removed rather than fixed
// in place, since this platform holds no custodial keys for regular users —
// only the applicant's own wallet can legitimately sign their self-bond.
