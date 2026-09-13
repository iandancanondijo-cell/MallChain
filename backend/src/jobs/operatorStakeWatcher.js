/**
 * Keeps the operator wallet — the one badgeTxBuilder.js/eduTxBuilder.js sign
 * with for badge issuance, Mallpoints awards, and EDU chain anchoring — from
 * silently running out of `stake` (this chain's gas/fee denom, NOT
 * mlc/mallcoin). Every operator-signed transaction spends a little; with
 * nothing watching it, ordinary usage eventually drains it and every one of
 * those features starts failing at once with the same generic
 * "account does not exist" / insufficient-funds error, for a reason that has
 * nothing to do with any of them individually.
 *
 * Runs on a schedule (see start()): checks the operator's on-chain `stake`
 * balance, and if it's below OPERATOR_STAKE_LOW_THRESHOLD, sends a top-up
 * from the treasury wallet (TREASURY_MNEMONIC). Both balances and every
 * top-up attempt's outcome are recorded as Prometheus metrics (see
 * utils/metrics.js's operatorStakeBalance/operatorStakeTopUpTotal) so this
 * is visible on a dashboard and can page a human, not just sit in logs
 * nobody reads — see monitoring/prometheus/alert_rules.yml's
 * OperatorWalletStakeLow/TreasuryWalletStakeLow/OperatorStakeTopUpFailed
 * rules and docs/runbooks/11-operator-stake-depleted.md for what to do when
 * this fires (in particular: the treasury itself running dry is the one
 * failure mode this job cannot fix by itself — a human has to add more).
 *
 * Reads OPERATOR_MNEMONIC/TREASURY_MNEMONIC directly from the environment,
 * matching badgeTxBuilder.js's existing pattern, rather than going through
 * utils/keyManager.js's Vault-first lookup — keyManager.js is the intended
 * production path, but as configured today (VAULT_ADDR + VAULT_ROLE_ID set
 * with no Vault actually reachable at that address) it fails outright rather
 * than falling back, which would make this job non-functional out of the
 * box. Worth reconciling later; not done here so this job actually runs.
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const cron = require('node-cron');
const { config } = require('../config');
const logger = require('../utils/logger');
const { operatorStakeBalance, operatorStakeTopUpTotal } = require('../utils/metrics');

const LOW_THRESHOLD = BigInt(process.env.OPERATOR_STAKE_LOW_THRESHOLD || '2000000');
const TOPUP_AMOUNT = process.env.OPERATOR_STAKE_TOPUP_AMOUNT || '5000000';
const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

async function deriveAddress(mnemonic) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  return { wallet, address: account.address };
}

async function getStakeBalance(address) {
  const response = await fetch(`${CHAIN_REST}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=stake`);
  if (!response.ok) throw new Error(`Balance query failed with status ${response.status}`);
  const data = await response.json();
  return BigInt(data.balance?.amount || '0');
}

/**
 * Checks the operator's stake balance and tops it up from the treasury if
 * below threshold. Returns a summary object on every path rather than
 * throwing — a scheduled watcher that crashes itself on a transient RPC
 * blip is worse than one that logs, reports the failure, and tries again
 * next tick.
 */
async function runOperatorStakeWatch() {
  const operatorMnemonic = process.env.OPERATOR_MNEMONIC;
  if (!operatorMnemonic) {
    logger.warn('operatorStakeWatcher', 'OPERATOR_MNEMONIC not configured — skipping watch run');
    return { ok: false, reason: 'operator-mnemonic-unavailable' };
  }

  const { address: operatorAddress } = await deriveAddress(operatorMnemonic);

  let balance;
  try {
    balance = await getStakeBalance(operatorAddress);
  } catch (err) {
    logger.error('operatorStakeWatcher', 'balance query failed', err, { operatorAddress });
    return { ok: false, reason: 'balance-query-failed' };
  }

  operatorStakeBalance.set({ wallet: 'operator' }, Number(balance));
  logger.info('operatorStakeWatcher', 'checked operator stake balance', {
    operatorAddress,
    balance: balance.toString(),
    threshold: LOW_THRESHOLD.toString(),
  });

  if (balance >= LOW_THRESHOLD) {
    return { ok: true, topUp: false, balance: balance.toString() };
  }

  logger.warn('operatorStakeWatcher', 'operator stake below threshold, attempting top-up', {
    operatorAddress,
    balance: balance.toString(),
    threshold: LOW_THRESHOLD.toString(),
    topUpAmount: TOPUP_AMOUNT,
  });

  const treasuryMnemonic = process.env.TREASURY_MNEMONIC;
  if (!treasuryMnemonic) {
    operatorStakeTopUpTotal.inc({ status: 'treasury_unavailable' });
    logger.error('operatorStakeWatcher', 'TREASURY_MNEMONIC not configured — cannot auto-fund operator', null, { operatorAddress });
    return { ok: false, reason: 'treasury-mnemonic-unavailable', balance: balance.toString() };
  }

  const { wallet: treasuryWallet, address: treasuryAddress } = await deriveAddress(treasuryMnemonic);

  let treasuryBalance;
  try {
    treasuryBalance = await getStakeBalance(treasuryAddress);
  } catch (err) {
    operatorStakeTopUpTotal.inc({ status: 'treasury_balance_query_failed' });
    logger.error('operatorStakeWatcher', 'treasury balance query failed', err, { treasuryAddress });
    return { ok: false, reason: 'treasury-balance-query-failed', balance: balance.toString() };
  }
  operatorStakeBalance.set({ wallet: 'treasury' }, Number(treasuryBalance));

  // The one failure mode this job cannot fix by itself: logged at error
  // level and counted separately so OperatorStakeTopUpFailed can page a
  // human — see docs/runbooks/11-operator-stake-depleted.md.
  if (treasuryBalance <= BigInt(TOPUP_AMOUNT)) {
    operatorStakeTopUpTotal.inc({ status: 'treasury_insufficient' });
    logger.error('operatorStakeWatcher', 'treasury balance too low to fund operator top-up — human intervention required', null, {
      treasuryAddress,
      treasuryBalance: treasuryBalance.toString(),
      topUpAmount: TOPUP_AMOUNT,
    });
    return {
      ok: false,
      reason: 'treasury-insufficient',
      balance: balance.toString(),
      treasuryBalance: treasuryBalance.toString(),
    };
  }

  try {
    const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, treasuryWallet, {
      gasPrice: GasPrice.fromString(config.chain.gasPrice),
    });
    const result = await client.sendTokens(
      treasuryAddress,
      operatorAddress,
      [{ denom: 'stake', amount: TOPUP_AMOUNT }],
      'auto',
      'operatorStakeWatcher auto top-up'
    );
    if (result.code && Number(result.code) !== 0) {
      throw new Error(result.rawLog || `broadcast failed with code ${result.code}`);
    }
    operatorStakeTopUpTotal.inc({ status: 'success' });
    logger.info('operatorStakeWatcher', 'topped up operator stake', {
      operatorAddress,
      treasuryAddress,
      amount: TOPUP_AMOUNT,
      txHash: result.transactionHash,
    });
    return { ok: true, topUp: true, txHash: result.transactionHash, amount: TOPUP_AMOUNT };
  } catch (err) {
    operatorStakeTopUpTotal.inc({ status: 'broadcast_failed' });
    logger.error('operatorStakeWatcher', 'top-up broadcast failed', err, { operatorAddress, treasuryAddress });
    return { ok: false, reason: 'broadcast-failed', balance: balance.toString() };
  }
}

function start() {
  const schedule = process.env.OPERATOR_STAKE_WATCH_CRON || '*/15 * * * *';
  cron.schedule(schedule, () => {
    runOperatorStakeWatch().catch((err) => logger.error('operatorStakeWatcher', 'watch run threw', err));
  });
  logger.info('operatorStakeWatcher', 'started', {
    schedule,
    lowThreshold: LOW_THRESHOLD.toString(),
    topUpAmount: TOPUP_AMOUNT,
  });
}

module.exports = { runOperatorStakeWatch, start };
