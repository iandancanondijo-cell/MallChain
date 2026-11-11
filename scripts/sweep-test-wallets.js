#!/usr/bin/env node
/**
 * Sweep recoverable test-fixture wallets.
 *
 * The wallets in test/test-wallets.json were created by our own test runs and
 * their mnemonics are committed to that dev-only file, so unlike user wallets
 * (whose mnemonics are encrypted client-side with a cipher only the owner
 * knows) we can actually sign transfers out of them. This moves their entire
 * MLCNS balance to one destination wallet — by default FOUNDER — so the funds
 * are consolidated before the clearance rather than simply vanishing.
 *
 * Mnemonics are read from disk and passed straight to the signer. They are
 * never printed, logged, or written anywhere. Only addresses, amounts and
 * tx hashes appear in the output.
 *
 * Usage:
 *   node scripts/sweep-test-wallets.js                     # dry run (default)
 *   node scripts/sweep-test-wallets.js --execute           # really broadcast
 *   node scripts/sweep-test-wallets.js --to=mall1...       # other destination
 *   node scripts/sweep-test-wallets.js --wallet=TEST_ADMIN # one wallet only
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { stringToPath } = require('@cosmjs/crypto');
const {
  MSG_TRANSFER_MALLCOIN,
  createMlcoinRegistry,
} = require('../backend/src/services/mlcoinProto');

const RPC = process.env.RPC || 'http://127.0.0.1:26657';
const REST = process.env.REST || 'http://127.0.0.1:1317';
// MsgTransferMallcoin charges fee = amount*97/10_000_000 (0.0097%) ON TOP of
// the amount, so sending `balance` fails with insufficient balance. Solve for
// the largest amount whose amount+fee still fits, then correct with the exact
// module formula so we drain to the last base unit.
const maxSendable = (balance) => {
  let amount = (balance * 10000000n) / 10000097n;
  const fits = (a) => {
    const fee = a * 97n / 10000000n || (a > 0n ? 1n : 0n);
    return a + fee <= balance;
  };
  while (!fits(amount)) amount -= 1n;
  while (fits(amount + 1n)) amount += 1n;
  return amount;
};

const UNITS = 1_000_000n;

// The four keeper wallets; sweep consolidates test funds into FOUNDER.
const KEEPERS = {
  FOUNDER: 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg',
  TEAM: 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5',
  ORTOPHARM: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f',
  AFA: 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6',
};

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const EXECUTE = args.includes('--execute');
const DEST = getArg('to', KEEPERS.FOUNDER);
const ONLY = getArg('wallet', null);

if (!Object.values(KEEPERS).includes(DEST)) {
  console.error(`Refusing: --to must be one of the keeper wallets (${Object.keys(KEEPERS).join(', ')}).`);
  process.exit(1);
}

const mlcnsBalance = async (address) => {
  const res = await fetch(`${REST}/tmp/marketplace/mlcoin/v1/wallet_balance/${address}`);
  // A wallet with no mlcoin record is empty, not an error: the keeper only
  // creates the record on first credit. Treating 404 as a hard failure made
  // the whole sweep abort on the first already-drained fixture.
  if (res.status === 404) return 0n;
  if (!res.ok) throw new Error(`wallet_balance HTTP ${res.status} for ${address}`);
  const body = await res.json();
  const w = body.wallet_balance || body.balance || body;
  const units = Array.isArray(w) ? null : (w.balance !== undefined ? w.balance : w);
  if (units === null) throw new Error(`unexpected wallet_balance shape for ${address}`);
  return BigInt(String(units));
};

const stakingBalance = async (address) => {
  const res = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}`);
  if (!res.ok) throw new Error(`bank balances HTTP ${res.status} for ${address}`);
  const body = await res.json();
  const stake = (body.balances || []).find((b) => b.denom === 'stake');
  return BigInt(stake ? stake.amount : '0');
};

(async () => {
  // Untracked local fixtures; the loader explains how to create them if absent.
  const walletsFile = require('../test/testWallets').loadTestWallets();
  const names = ONLY ? [ONLY] : Object.keys(walletsFile);

  console.log(`=== sweep test wallets → ${DEST} (${EXECUTE ? 'EXECUTE' : 'dry run'}) ===\n`);

  let total = 0n;
  for (const name of names) {
    const w = walletsFile[name];
    if (!w || !w.mnemonic || !w.address) {
      console.log(`  SKIP ${name}: not a wallet record`);
      continue;
    }
    if (w.address === DEST) {
      console.log(`  SKIP ${name}: is the destination`);
      continue;
    }

    const mlcns = await mlcnsBalance(w.address);
    const stake = await stakingBalance(w.address);
    const feeUnits = 5_000n; // calculateFee(200000 gas, 0.025stake)
    console.log(`  ${name.padEnd(12)} ${w.address}`);
    console.log(`  ${''.padEnd(12)} MLCNS ${mlcns / UNITS}  stake(gas) ${stake} ${stake > feeUnits ? '(enough)' : '(NOT enough for gas)'}`);

    if (mlcns <= 0n) { console.log(`  ${''.padEnd(12)} nothing to sweep\n`); continue; }
    if (stake <= feeUnits) { console.log(`  ${''.padEnd(12)} skipped: needs gas first (see ./FUND_TREASURY.sh)\n`); continue; }
    if (!EXECUTE) {
      const send = maxSendable(mlcns);
      total += send;
      const dust = mlcns - send - (send * 97n / 10000000n);
      console.log(`  ${''.padEnd(12)} would send ${send / UNITS} MLCNS (+ the 0.0097% module fee), leaving ${dust} base units of dust\n`);
      continue;
    }

    const signer = await DirectSecp256k1HdWallet.fromMnemonic(w.mnemonic, {
      prefix: 'mall',
      hdPaths: [stringToPath(w.hdPath || "m/44'/118'/0'/0/0")],
    });
    const [acct] = await signer.getAccounts();
    if (acct.address !== w.address) {
      console.log(`  ${''.padEnd(12)} SKIPPED: mnemonic does not derive this address (rotated or replaced)\n`);
      continue;
    }

    const client = await SigningStargateClient.connectWithSigner(RPC, signer, {
      registry: createMlcoinRegistry(),
      gasPrice: GasPrice.fromString('0.025stake'),
    });
    const before = await mlcnsBalance(DEST);
    const result = await client.signAndBroadcast(
      w.address,
      [{ typeUrl: MSG_TRANSFER_MALLCOIN, value: { creator: w.address, to: DEST, amount: maxSendable(mlcns).toString() } }],
      { amount: [{ denom: 'stake', amount: feeUnits.toString() }], gas: '200000' },
      'clearance: consolidating test-fixture funds'
    );
    if (result.code && result.code !== 0) {
      console.log(`  ${''.padEnd(12)} FAILED code=${result.code} ${result.rawLog || ''}\n`);
      continue;
    }
    const after = await mlcnsBalance(DEST);
    const moved = after - before;
    total += moved;
    console.log(`  ${''.padEnd(12)} sent ${moved / UNITS} MLCNS  tx ${result.transactionHash}  height ${result.height}`);
    const leftover = await mlcnsBalance(w.address);
    console.log(`  ${''.padEnd(12)} source now holds ${leftover / UNITS} MLCNS\n`);
  }

  console.log(`=== ${EXECUTE ? 'swept' : 'sweepable'} total: ${total / UNITS} MLCNS ===`);
  if (!EXECUTE) console.log('Re-run with --execute to broadcast.');
})().catch((e) => { console.error('sweep aborted:', e.message); process.exit(1); });
