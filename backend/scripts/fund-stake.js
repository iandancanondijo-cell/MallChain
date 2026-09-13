#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * Sends `stake` (this chain's gas/fee denom — NOT mlc/mallcoin) from a
 * funded sender wallet to any recipient address. There is no CLI on the
 * `marketplaced` binary itself (`marketplaced --help` only exposes node
 * operation commands — start/export/rollback/etc, no tx/keys/query), so
 * this is the actual mechanism: a signed MsgSend broadcast via cosmjs,
 * exactly what a wallet app or the built-in /api/faucet endpoints do under
 * the hood, made reusable as a standalone tool.
 *
 * A brand-new address holds nothing until an already-funded account sends
 * it something — this script IS that "already-funded account" step, using
 * whichever mnemonic you pass as the sender. For the one recurring case of
 * "top up the treasury", see fund-treasury.js instead — a zero-argument
 * wrapper around this same logic (scripts/lib/stakeTransfer.js) that
 * doesn't require remembering the treasury's address.
 *
 * Usage:
 *   node scripts/fund-stake.js --from-mnemonic-env=FAUCET_MNEMONIC --to=mall1... --amount=2000000
 *   node scripts/fund-stake.js --from-mnemonic-env=OPERATOR_MNEMONIC --to=mall1... --amount=2000000
 *
 * --from-mnemonic-env names an env var (from .env) holding the SENDER's
 * mnemonic — never pass a mnemonic directly on the command line, it'd land
 * in shell history and process listings.
 */
require('dotenv').config();
const { sendStakeAndVerify } = require('./lib/stakeTransfer');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { 'from-mnemonic-env': fromEnvVar, to, amount = '2000000', memo = 'fund-stake.js transfer' } = parseArgs();

  if (!fromEnvVar || !to) {
    console.error('Usage: node scripts/fund-stake.js --from-mnemonic-env=ENV_VAR_NAME --to=mall1... [--amount=2000000] [--memo="..."]');
    process.exit(1);
  }

  const mnemonic = process.env[fromEnvVar];
  if (!mnemonic) {
    console.error(`Env var ${fromEnvVar} is not set (checked .env and the current environment).`);
    process.exit(1);
  }

  await sendStakeAndVerify({ fromMnemonic: mnemonic, toAddress: to, amount, memo });
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
