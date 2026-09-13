#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * Bonds (delegates) some of the treasury's stake to a validator. This is
 * the bootstrap step for the treasury's real, ongoing source of stake in
 * production: once delegated, the treasury earns a share of every block's
 * newly-minted stake (see src/utils/staking.js's header comment) as
 * staking rewards, which jobs/treasuryRewardsSweeper.js periodically
 * claims back into the treasury's liquid (spendable) balance.
 *
 * This is a deliberate, one-off action, not automated: how much to lock up
 * is a real financial decision (delegated stake isn't spendable until
 * unbonded, which takes this chain's unbonding period), so it stays
 * something a human runs explicitly, unlike the reward-claiming itself
 * which is safe to fully automate (claiming a reward doesn't lock up
 * anything further).
 *
 * Usage:
 *   node scripts/delegate-treasury.js --amount=500000
 *   node scripts/delegate-treasury.js --amount=500000 --validator=mallvaloper1...
 *
 * If --validator is omitted, the first bonded validator this chain reports
 * is used — fine for a single-validator devnet, but on a real
 * multi-validator production chain you should choose deliberately (by
 * commission rate, uptime history, how decentralized you want the
 * treasury's exposure to be) rather than accept whichever one happens to
 * be returned first.
 */
require('dotenv').config();
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { config } = require('../src/config');
const { pickDefaultValidator, getDelegation } = require('../src/utils/staking');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { amount, validator: validatorArg } = parseArgs();
  if (!amount) {
    console.error('Usage: node scripts/delegate-treasury.js --amount=500000 [--validator=mallvaloper1...]');
    process.exit(1);
  }

  const treasuryMnemonic = process.env.TREASURY_MNEMONIC;
  if (!treasuryMnemonic) {
    console.error('TREASURY_MNEMONIC is not set in .env.');
    process.exit(1);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(treasuryMnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  const treasuryAddress = account.address;

  const validatorAddress = validatorArg || await pickDefaultValidator();
  if (!validatorArg) {
    console.log(`(No --validator given — defaulting to the first bonded validator: ${validatorAddress}. On a real production chain, choose one deliberately instead.)`);
  }

  console.log(`Treasury address: ${treasuryAddress}`);
  console.log(`Delegating ${amount}stake -> ${validatorAddress}`);

  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
  });

  const result = await client.delegateTokens(
    treasuryAddress,
    validatorAddress,
    { denom: 'stake', amount: String(amount) },
    'auto',
    'delegate-treasury.js bootstrap delegation'
  );

  if (result.code && Number(result.code) !== 0) {
    throw new Error(`Delegation failed (code ${result.code}): ${result.rawLog || 'no raw_log'}`);
  }
  console.log(`Delegation broadcast succeeded — txHash: ${result.transactionHash}  height: ${result.height}`);

  const delegation = await getDelegation(treasuryAddress, validatorAddress);
  if (!delegation) {
    throw new Error('Delegation broadcast succeeded but no delegation record was found on re-query — investigate before trusting this.');
  }
  console.log(`Verified independently: treasury now has ${delegation.balance.amount}stake delegated to ${validatorAddress}`);
  console.log('Rewards will start accruing each block. Run jobs/treasuryRewardsSweeper.js (or wait for its schedule) to claim them into the treasury\'s liquid balance.');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
