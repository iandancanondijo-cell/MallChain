const { config } = require('../config');
const { isValidAddress, getWalletBalance } = require('./mallcoinService');
const {
  fundStakeFromMnemonic,
  fundStakeFromPrivateKey,
  transferAndFundGas,
  isAccountNotFoundError,
} = require('./mallcoinTxBuilder');
const { DirectSecp256k1Wallet, DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const Redis = require('ioredis');
const { redisTlsOptions } = require('../utils/redisTlsOptions');
const logger = require('../utils/logger');

const IS_TEST_ENV = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

let redis = null;
let redisConnected = false;

if (!IS_TEST_ENV) {
  redis = new Redis({
    host: config.redis.host || '127.0.0.1',
    port: config.redis.port || 6379,
    password: config.redis.password || undefined,
    lazyConnect: true,
    retryStrategy: () => null,
    ...redisTlsOptions(),
  });

  redis.on('error', (err) => logger.error('faucet', 'Redis client error', err));

  redis.connect()
    .then(() => {
      redisConnected = true;
      logger.info('faucet', 'Redis connected for faucet cooldown');
    })
    .catch(() => {
      if (isProduction) {
        logger.error('faucet', 'Redis unavailable in production - faucet service disabled', new Error('redis connect failed'));
      } else {
        logger.warn('faucet', 'Redis unavailable, faucet cooldown will be in-memory only (development mode)');
      }
    });
}

function isFaucetEnabled() {
  // Hard-disabled in production, full stop — not an env var toggle. A free
  // MALL/gas faucet requires a real funded hot wallet key sitting in server
  // env vars with no HSM/KMS custody (see amlProvider.js-style decision
  // elsewhere in this codebase: infra not available here, so the feature is
  // simply off rather than shipped with weaker custody than everything
  // else). FAUCET_ENABLED can still turn it off early in dev/staging, but
  // can no longer turn it back on in production.
  if (isProduction) return false;
  if (process.env.FAUCET_ENABLED === 'false') return false;
  if (process.env.FAUCET_ENABLED === 'true') return true;
  return true;
}

async function getFaucetMnemonic() {
  try {
    const { getFaucetMnemonic: km } = require('../utils/keyManager');
    const fromKm = await km();
    if (fromKm) return fromKm;
  } catch (_) {
    /* Vault unreachable or unconfigured — fall through to legacy env selection. */
  }

  if (process.env.FAUCET_MNEMONIC) return process.env.FAUCET_MNEMONIC;
  if (process.env.OPERATOR_MNEMONIC) {
    if (process.env.ALLOW_OPERATOR_MNEMONIC === 'true') {
      logger.warn('faucet', 'Using OPERATOR_MNEMONIC for faucet operations (ALLOW_OPERATOR_MNEMONIC=true)');
      return process.env.OPERATOR_MNEMONIC;
    }
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

  let mnemonic;
  try { mnemonic = await getFaucetMnemonic(); } catch (_) { mnemonic = null; }
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

// C1: Faucet-unfunded not-ready error.
//
// Genesis repair (adding the faucet mnemonic's derived address to
// auth.accounts + bank.balances) might not have been applied yet. Rather
// than bubbling the raw Cosmos "account does not exist on chain" SDK error
// as a 500 INTERNAL_ERROR, surface an HTTP 503 with a structured error
// code so frontends can render "Faucet not ready — contact admin to fund
// faucetAddress in genesis". This aligns with the project preference for
// explicit not-ready states over simulated/mock data.
function faucetUnfundedError(fundingAccount, underlyingMessage) {
  const err = new Error(
    `Faucet account has not been funded in genesis yet. Contact admin to add ${fundingAccount?.address || '(unknown)'} to auth.accounts with a bank.balances allocation for mlc+stake.`
  );
  err.status = 503;
  err.code = 'faucet_unfunded';
  err.faucetAddress = fundingAccount?.address || null;
  if (underlyingMessage) err.underlying = underlyingMessage;
  return err;
}

// Lightweight predicate that gates whether a faucet credit/fund operation
// is safe to attempt. It first resolves the funding account address, then
// asks the chain REST whether the wallet exists — if both resolve and the
// wallet balance record shows `exists: false`, the not-ready error is
// raised before we ever call into the Cosmos RPC (avoiding the ambiguous
// "account not found" text altogether).
async function guardFaucetFundedOrThrow(fundingAccount) {
  if (!fundingAccount) return;
  try {
    const balance = await getWalletBalance(fundingAccount.address);
    if (balance && balance.exists === false) {
      throw faucetUnfundedError(fundingAccount, 'wallet_balance REST returned exists:false');
    }
  } catch (e) {
    // If getWalletBalance already threw our structured error, re-raise it
    // verbatim; otherwise wrap common "account-not-found" style messages.
    if (e && e.code === 'faucet_unfunded') throw e;
    if (isAccountNotFoundError(e)) throw faucetUnfundedError(fundingAccount, e.message);
    // Any other failure (network, circuit open) passes through unchanged:
    // surfacing the real root cause is better than wrongly claiming the
    // faucet is unfunded when the chain is simply offline.
    throw e;
  }
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

  if (isProduction && !redisConnected) {
    const err = new Error('Faucet service unavailable: Redis required in production');
    err.status = 503;
    throw err;
  }

  let last = null;
  try {
    if (redis && typeof redis.get === 'function') {
      const stored = await redis.get(cooldownKey);
      last = stored ? parseInt(stored, 10) : null;
    } else {
      last = lastRequestByAddress.get(address) || null;
    }
  } catch (redisErr) {
    if (isProduction) {
      const err = new Error('Faucet service unavailable: Redis connection failed');
      err.status = 503;
      throw err;
    }
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

  if (isProduction && !redisConnected) {
    logger.error('faucet', 'Cannot set cooldown: Redis unavailable in production', new Error('redis not connected'));
    return;
  }

  try {
    if (redis && typeof redis.setEx === 'function') {
      await redis.setEx(cooldownKey, COOLDOWN_MS / 1000, Date.now().toString());
    } else {
      lastRequestByAddress.set(address, Date.now());
    }
  } catch (redisErr) {
    if (isProduction) {
      logger.error('faucet', 'Cannot set cooldown: Redis connection failed', redisErr);
      return;
    }
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

  // C1: Faucet-account existence gate BEFORE any signature/broadcast.
  // If the faucet mnemonic doesn't resolve to an account that exists on
  // chain, raise the explicit 503 `faucet_unfunded` error instead of
  // bubbling a generic Cosmos SDK "account does not exist on chain" 500.
  await guardFaucetFundedOrThrow(fundingAccount);

  // transferAndFundGas signs both the MLCNS transfer and the stake-gas top-up
  // against one locally-tracked sequence number (see its doc comment) so the
  // second tx can't be rejected for racing the first tx's on-chain sequence
  // bump. Still two separate broadcasts, so a gas-funding failure can't roll
  // back an already-successful MLCNS transfer.
  let transfer, gasFunding;
  try {
    ({ transfer, gasFunding } = await transferAndFundGas({
      mnemonic: fundingAccount.source === 'private_key' ? undefined : fundingAccount.mnemonic,
      privateKeyHex: fundingAccount.source === 'private_key' ? fundingAccount.privateKeyHex : undefined,
      toAddress: address,
      amountMlcns: amount,
      amountStake: DEFAULT_STAKE,
      memo: 'dev faucet MLCNS',
      fundGas: process.env.FAUCET_FUND_GAS !== 'false',
    }));
  } catch (e) {
    // Defense-in-depth: if the guard above races with a new genesis export
    // or an account-reset during development, reclassify the underlying
    // SDK error to `faucet_unfunded` so the controller can still render
    // the explicit not-ready card instead of INTERNAL_ERROR.
    if (isAccountNotFoundError(e)) throw faucetUnfundedError(fundingAccount, e.message);
    throw e;
  }

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
  let mnemonic;
  try { mnemonic = await getFaucetMnemonic(); } catch (_) { mnemonic = null; }
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
    funded: Boolean(faucetBalance && faucetBalance.exists && faucetBalance.balance !== '0'),
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

  // C1: same faucet-unfunded gate used in creditMlcns — fail early with
  // explicit 503 instead of the SDK's raw not-found error.
  await guardFaucetFundedOrThrow(fundingAccount);

  let result;
  try {
    result =
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
  } catch (e) {
    if (isAccountNotFoundError(e)) throw faucetUnfundedError(fundingAccount, e.message);
    throw e;
  }

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
