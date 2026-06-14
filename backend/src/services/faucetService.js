const { config } = require('../config');
const { isValidAddress, getWalletBalance } = require('./mallcoinService');
const { transferFromMnemonic, fundStakeFromMnemonic } = require('./mallcoinTxBuilder');

function isFaucetEnabled() {
  if (process.env.FAUCET_ENABLED === 'false') return false;
  if (process.env.FAUCET_ENABLED === 'true') return true;
  return process.env.NODE_ENV !== 'production';
}

function getFaucetMnemonic() {
  // Prefer explicit FAUCET_MNEMONIC. Using OPERATOR_MNEMONIC for faucet actions
  // requires explicit opt-in to avoid accidental use of operator keys as faucet.
  if (process.env.FAUCET_MNEMONIC) return process.env.FAUCET_MNEMONIC;
  if (process.env.OPERATOR_MNEMONIC) {
    if (process.env.ALLOW_OPERATOR_MNEMONIC === 'true') {
      console.warn('Using OPERATOR_MNEMONIC for faucet operations (ALLOW_OPERATOR_MNEMONIC=true)');
      return process.env.OPERATOR_MNEMONIC;
    }
    // Not allowed by default; do not return operator mnemonic silently
    return null;
  }
  if (process.env.TEST_MODE === 'true') return process.env.TREASURY_MNEMONIC || null;
  return null;
}

const DEFAULT_MLCNS = Number(process.env.FAUCET_MLCNS_AMOUNT || 1000);
const DEFAULT_STAKE = process.env.FAUCET_STAKE_AMOUNT || '100';
const MAX_PER_REQUEST = Number(process.env.FAUCET_MAX_MLCNS || 10000);
const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS || 60_000);

const lastRequestByAddress = new Map();

function checkCooldown(address) {
  const last = lastRequestByAddress.get(address);
  if (last && Date.now() - last < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    const err = new Error(`Faucet cooldown: try again in ${waitSec}s`);
    err.status = 429;
    throw err;
  }
}

/**
 * Credit MLCNS to a wallet via on-chain MsgTransferMallcoin from the faucet account.
 */
async function creditMlcns(address, amountMlcns = DEFAULT_MLCNS) {
  if (!isFaucetEnabled()) {
    const err = new Error('Faucet is disabled in production');
    err.status = 403;
    throw err;
  }

  const mnemonic = getFaucetMnemonic();
  if (!mnemonic) {
    const err = new Error(
      'Set FAUCET_MNEMONIC or OPERATOR_MNEMONIC (wallet must hold MLCNS + stake for gas)'
    );
    err.status = 503;
    throw err;
  }

  if (!isValidAddress(address)) {
    const err = new Error('Invalid recipient address');
    err.status = 400;
    throw err;
  }

  const amount = Number(amountMlcns);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PER_REQUEST) {
    const err = new Error(`Amount must be between 0 and ${MAX_PER_REQUEST} MLCNS`);
    err.status = 400;
    throw err;
  }

  checkCooldown(address);

  const transfer = await transferFromMnemonic({
    mnemonic,
    toAddress: address,
    amountMlcns: amount,
    memo: 'dev faucet MLCNS',
  });

  let gasFunding = null;
  if (process.env.FAUCET_FUND_GAS !== 'false') {
    try {
      gasFunding = await fundStakeFromMnemonic({
        mnemonic,
        toAddress: address,
        amountStake: DEFAULT_STAKE,
      });
    } catch (e) {
      gasFunding = { error: e.message, note: 'MLCNS sent; fund stake manually if sends fail' };
    }
  }

  lastRequestByAddress.set(address, Date.now());

  const balance = await getWalletBalance(address);

  return {
    success: true,
    transfer,
    gasFunding,
    balance,
    denom: 'MLCNS',
  };
}

async function getFaucetStatus() {
  const mnemonic = getFaucetMnemonic();
  let faucetBalance = null;
  let faucetAddress = null;

  if (mnemonic) {
    try {
      const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: config.chain.prefix,
      });
      const [account] = await wallet.getAccounts();
      faucetAddress = account.address;
      faucetBalance = await getWalletBalance(account.address);
    } catch {
      /* ignore */
    }
  }

  return {
    enabled: isFaucetEnabled(),
    configured: Boolean(mnemonic),
    faucetAddress,
    faucetBalance,
    defaultMlcns: DEFAULT_MLCNS,
    defaultStake: DEFAULT_STAKE,
    maxMlcns: MAX_PER_REQUEST,
    cooldownMs: COOLDOWN_MS,
  };
}

module.exports = {
  isFaucetEnabled,
  creditMlcns,
  getFaucetStatus,
  getFaucetMnemonic,
};
