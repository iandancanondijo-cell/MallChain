const axios = require('axios');
const { getTreasuryMnemonic } = require('../utils/keyManager');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');
const { config } = require('../config');
const { getValidatorLeaderboard, getValidatorDetail } = require('../services/validatorCenterService');
const ValidatorApplication = require('../models/ValidatorApplication');

const RPC = config.chain.rpc;
const CHAIN_REST = config.chain.rest;
const PREFIX = config.chain.prefix;

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

exports.listApplications = async (_req, res) => {
  try {
    const applications = await ValidatorApplication.find().sort({ submittedAt: -1 }).limit(200);
    return res.json({ success: true, applications });
  } catch (e) {
    console.error('validator applications listing error:', e.message);
    return res.status(500).json({ success: false, error: 'applications_unavailable', message: e.message });
  }
};

exports.reviewApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid_review_status' });
    }

    const application = await ValidatorApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, error: 'application_not_found' });
    }

    application.status = status;
    application.reviewedAt = new Date();
    application.reviewer = req.user?.email || 'admin';
    application.reviewNotes = reviewNotes || '';
    await application.save();

    return res.json({ success: true, application });
  } catch (e) {
    console.error('validator application review error:', e.message);
    return res.status(500).json({ success: false, error: 'review_failed', message: e.message });
  }
};

exports.createValidator = async (req, res) => {
  try {
    const { delegator, pubkey, amount, denom, moniker, website, details } = req.body;
    if (!delegator || !pubkey || !amount || !denom || !moniker) return res.status(400).json({ error: 'Missing required fields' });
    const mnemonic = await getTreasuryMnemonic();
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: PREFIX });
    const [account] = await wallet.getAccounts();
    const client = await SigningStargateClient.connectWithSigner(RPC, wallet);
    const msg = {
      typeUrl: '/cosmos.staking.v1beta1.MsgCreateValidator',
      value: {
        description: { moniker, identity: '', website, details },
        commission: { rate: '0.10', max_rate: '0.20', max_change_rate: '0.01' },
        min_self_delegation: String(amount),
        delegator_address: delegator,
        validator_address: account.address,
        pubkey: { typeUrl: '/cosmos.crypto.ed25519.PubKey', value: Buffer.from(pubkey, 'base64') },
        value: { amount: String(amount), denom }
      }
    };
    const fee = { amount: [{ denom, amount: '5000' }], gas: '300000' };
    const result = await client.signAndBroadcast(account.address, [msg], fee);
    res.json({ ok: true, tx: result });
  } catch (e) {
    res.status(500).json({ error: 'create_validator_failed', details: String(e) });
  }
};
