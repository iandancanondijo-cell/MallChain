#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * One-command treasury top-up: sends `stake` to whichever address
 * TREASURY_MNEMONIC actually derives to — you never type or paste the
 * treasury's address by hand, removing the one real way this could go
 * wrong (sending to a mistyped address). Wraps the same send-and-verify
 * logic as fund-stake.js (scripts/lib/stakeTransfer.js): broadcasts, then
 * independently re-queries the chain to confirm the balance actually rose
 * by the expected amount before declaring success.
 *
 * Usage (all flags optional):
 *   node scripts/fund-treasury.js
 *   node scripts/fund-treasury.js --amount=1000000
 *   node scripts/fund-treasury.js --from-mnemonic-env=SOME_OTHER_FUNDED_WALLET
 *
 * --from-mnemonic-env defaults to FAUCET_MNEMONIC, which only exists as a
 * funded wallet on THIS devnet (the faucet is hard-disabled in production —
 * see services/faucetService.js). In a real deployment there is no faucet
 * to default to: pass --from-mnemonic-env explicitly, naming an env var
 * that holds a mnemonic for whatever your real funding source is.
 *
 * See docs/runbooks/11-operator-stake-depleted.md for when/why you'd run
 * this — normally only in response to a TreasuryWalletStakeLow alert.
 */
require('dotenv').config();
const { sendStakeAndVerify, deriveAddress } = require('./lib/stakeTransfer');

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const { 'from-mnemonic-env': fromEnvVar = 'FAUCET_MNEMONIC', amount = '5000000' } = parseArgs();

  const treasuryMnemonic = process.env.TREASURY_MNEMONIC;
  if (!treasuryMnemonic) {
    console.error('TREASURY_MNEMONIC is not set in .env — nothing to derive the treasury address from.');
    process.exit(1);
  }

  const fromMnemonic = process.env[fromEnvVar];
  if (!fromMnemonic) {
    console.error(`Env var ${fromEnvVar} is not set. Pass --from-mnemonic-env=SOME_ENV_VAR naming a funded wallet's mnemonic.`);
    process.exit(1);
  }

  if (fromEnvVar === 'FAUCET_MNEMONIC') {
    console.log('(Using the devnet faucet wallet as the funding source — this default only makes sense in local/dev. In a real deployment, pass --from-mnemonic-env explicitly.)');
  }

  const { address: treasuryAddress } = await deriveAddress(treasuryMnemonic);
  console.log(`Treasury address (derived from TREASURY_MNEMONIC): ${treasuryAddress}`);

  await sendStakeAndVerify({
    fromMnemonic,
    toAddress: treasuryAddress,
    amount,
    memo: 'fund-treasury.js top-up',
  });
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
