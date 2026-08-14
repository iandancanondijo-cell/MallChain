const { config } = require('../config');
const { isValidAddress, getWalletBalance } = require('./mallcoinService');
const {
  fundStakeFromMnemonic,
  fundStakeFromPrivateKey,
  transferAndFundGas,
} = require('./mallcoinTxBuilder');
const { DirectSecp256k1Wallet, DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const Redis = require('ioredis');

const redis = new Redis({
  host: config.redis.host || '127.0.0.1',
  port: config.redis.port || 6379,
});

redis.on('error', (err) => console.error('Redis client error:', err));

// In production, require Redis for faucet operations
const isProduction = process.env.NODE_ENV === 'production';
let redisConnected = false;

redis.connect()
  .then(() => {
    redisConnected = true;
    console.log('Redis connected for faucet cooldown');
  })
  .catch(() => {
    if (isProduction) {
      console.error('Redis unavailable in production - faucet service disabled');
    } else {
      console.warn('Redis unavailable, faucet cooldown will be in-memory only (development mode)');
    }
  });

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

function getFaucetPrivateKeyHex() {
  return process.env.FAUCET_PRIVATE_KEY_HEX || null;
}

async function getFundingAccount() {
  const privateKeyHex = getFaucetPrivateKeyHex();
  if (privateKeyHex) {
    const wallet = await DirectSecp256k1Wallet.fromKey(
      Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex')),
      config.chain.prefix
    );
    const [account] = await wallet.getAccounts();
    return {
      source: 'private_key',
      privateKeyHex,
      address: account.address,
    };
  }

  const mnemonic = getFaucetMnemonic();
  if (!mnemonic) return null;

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  });
  const [account] = await wallet.getAccounts();
  return {
    source: 'mnemonic',
    mnemonic,
    address: account.address,
  };
}

const DEFAULT_MLCNS = Number(process.env.FAUCET_MLCNS_AMOUNT || 1000);
const DEFAULT_STAKE = process.env.FAUCET_STAKE_AMOUNT || '100';
const MAX_PER_REQUEST = Number(process.env.FAUCET_MAX_MLCNS || 10000);
const COOLDOWN_MS = Number(process.env.FAUCET_COOLDOWN_MS || 60_000);

// Fallback in-memory Map only for development/test mode
const lastRequestByAddress = new Map();

// Pure predicate: has enough time passed since lastRequestTime to allow another request?
function checkCooldown(lastRequestTime, cooldownMs) {
  if (!lastRequestTime) return true;
  return Date.now() - lastRequestTime >= cooldownMs;
}

async function checkAddressCooldown(address) {
  const cooldownKey = `faucet_cooldown:${address}`;

  // In production, require Redis
  if (isProduction && !redisConnected) {
    const err = new Error('Faucet service unavailable: Redis required in production');
    err.status = 503;
    throw err;
  }

  let last = null;
  try {
    const stored = await redis.get(cooldownKey);
    last = stored ? parseInt(stored, 10) : null;
  } catch (redisErr) {
    // In production, fail fast if Redis fails
    if (isProduction) {
      const err = new Error('Faucet service unavailable: Redis connection failed');
      err.status = 503;
      throw err;
    }
    // Development mode: fallback to in-memory
    last = lastRequestByAddress.get(address) || null;
  }

  if (!checkCooldown(last, COOLDOWN_MS)) {
    const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    const err = new Error(`Faucet cooldown: try again in ${waitSec}s`);
    err.status = 429;
    throw err;
  }
}

// Pure validation: is this faucet request well-formed? Does not check cooldown or funding.
function validateFaucetRequest({ walletAddress, amount } = {}) {
  if (!isValidAddress(walletAddress)) {
    return { valid: false, error: 'Invalid address' };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }
  if (numericAmount > MAX_PER_REQUEST) {
    return { valid: false, error: `Amount exceeds maximum of ${MAX_PER_REQUEST} MLCNS per request` };
  }

  return { valid: true };
}

async function setCooldown(address) {
  const cooldownKey = `faucet_cooldown:${address}`;
  
  // In production, require Redis
  if (isProduction && !redisConnected) {
    console.error('Cannot set cooldown: Redis unavailable in production');
    return;
  }
  
  try {
    await redis.setEx(cooldownKey, COOLDOWN_MS / 1000, Date.now().toString());
  } catch (redisErr) {
    // In production, fail fast if Redis fails
    if (isProduction) {
      console.error('Cannot set cooldown: Redis connection failed');
      return;
    }
    // Development mode: fallback to in-memory
    lastRequestByAddress.set(address, Date.now());
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

  const fundingAccount = await getFundingAccount();
  if (!fundingAccount) {
    const err = new Error(
      'Set FAUCET_PRIVATE_KEY_HEX, FAUCET_MNEMONIC, or OPERATOR_MNEMONIC (wallet must hold MLCNS + stake for gas)'
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

  await checkAddressCooldown(address);

  // transferAndFundGas signs both the MLCNS transfer and the stake-gas top-up
  // against one locally-tracked sequence number (see its doc comment) so the
  // second tx can't be rejected for racing the first tx's on-chain sequence
  // bump. Still two separate broadcasts, so a gas-funding failure can't roll
  // back an already-successful MLCNS transfer.
  const { transfer, gasFunding } = await transferAndFundGas({
    mnemonic: fundingAccount.source === 'private_key' ? undefined : fundingAccount.mnemonic,
    privateKeyHex: fundingAccount.source === 'private_key' ? fundingAccount.privateKeyHex : undefined,
    toAddress: address,
    amountMlcns: amount,
    amountStake: DEFAULT_STAKE,
    memo: 'dev faucet MLCNS',
    fundGas: process.env.FAUCET_FUND_GAS !== 'false',
  });

  await setCooldown(address);

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
  const privateKeyHex = getFaucetPrivateKeyHex();
  const mnemonic = getFaucetMnemonic();
  let faucetBalance = null;
  let faucetAddress = null;
  let source = null;

  try {
    const fundingAccount = await getFundingAccount();
    if (fundingAccount) {
      faucetAddress = fundingAccount.address;
      faucetBalance = await getWalletBalance(fundingAccount.address);
      source = fundingAccount.source;
    }
  } catch {
    /* ignore */
  }

  if (!faucetAddress && mnemonic) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: config.chain.prefix,
      });
      const [account] = await wallet.getAccounts();
      faucetAddress = account.address;
      faucetBalance = await getWalletBalance(account.address);
      source = 'mnemonic';
    } catch {
      /* ignore */
    }
  }

  return {
    enabled: isFaucetEnabled(),
    configured: Boolean(privateKeyHex || mnemonic),
    faucetAddress,
    faucetBalance,
    source,
    defaultMlcns: DEFAULT_MLCNS,
    defaultStake: DEFAULT_STAKE,
    maxMlcns: MAX_PER_REQUEST,
    cooldownMs: COOLDOWN_MS,
  };
}

/**
 * Fund only stake (gas) to a wallet — used when the user already has MLCNS
 * but needs native stake tokens to pay transaction fees.
 */
async function fundGas(address) {
  if (!isFaucetEnabled()) {
    const err = new Error('Faucet is disabled');
    err.status = 403;
    throw err;
  }

  const fundingAccount = await getFundingAccount();
  if (!fundingAccount) {
    const err = new Error('Faucet funding source not configured');
    err.status = 503;
    throw err;
  }

  if (!isValidAddress(address)) {
    const err = new Error('Invalid recipient address');
    err.status = 400;
    throw err;
  }

  await checkAddressCooldown(address);

  const result =
    fundingAccount.source === 'private_key'
      ? await fundStakeFromPrivateKey({
          privateKeyHex: fundingAccount.privateKeyHex,
          toAddress: address,
          amountStake: DEFAULT_STAKE,
        })
      : await fundStakeFromMnemonic({
          mnemonic: fundingAccount.mnemonic,
          toAddress: address,
          amountStake: DEFAULT_STAKE,
        });

  await setCooldown(address);

  return {
    success: true,
    funded: true,
    amount: DEFAULT_STAKE,
    denom: 'stake',
    result,
  };
}

module.exports = {
  isFaucetEnabled,
  creditMlcns,
  fundGas,
  getFaucetStatus,
  getFaucetMnemonic,
  getFaucetPrivateKeyHex,
  checkCooldown,
  validateFaucetRequest,
};
