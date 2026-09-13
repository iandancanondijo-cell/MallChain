#!/usr/bin/env node
/* eslint-env node */
/* global require, module, process */
/**
 * Submits MsgCreateValidator to register a new validator on this chain.
 *
 * `marketplaced comet show-validator` — the standard way to read a node's
 * own consensus pubkey — currently crashes on this binary (nil pointer
 * dereference: main.go's root command never wires up a client codec
 * context, since this is a deliberately node-only binary with no tx/query
 * CLI — see main.go). This script reads the same pubkey directly out of
 * priv_validator_key.json instead, which needs no fix to work.
 *
 * Before running this you need:
 *  1. A synced marketplaced node already running with its own
 *     priv_validator_key.json (created by `marketplaced init`).
 *  2. A funded account (its mnemonic) to self-delegate from — this is the
 *     ACCOUNT that becomes the validator's operator; its address bytes
 *     double as the validator's operator address (mallvaloper1...).
 *
 * Usage:
 *   node scripts/create-validator.js \
 *     --priv-validator-key-file=/path/to/blockchain_working/config/priv_validator_key.json \
 *     --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
 *     --moniker="My Validator" \
 *     --amount=1000000
 *
 * Optional: --commission-rate=0.10 --commission-max-rate=0.20
 *           --commission-max-change-rate=0.01 --min-self-delegation=1
 *           --website=... --identity=... --details=...
 */
require('dotenv').config();
const fs = require('fs');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { toBech32, fromBech32 } = require('@cosmjs/encoding');
const { PubKey } = require('cosmjs-types/cosmos/crypto/ed25519/keys');
const { MsgCreateValidator } = require('cosmjs-types/cosmos/staking/v1beta1/tx');
const { Any } = require('cosmjs-types/google/protobuf/any');
const { config } = require('../src/config');
const { getDelegation } = require('../src/utils/staking');

/**
 * cosmossdk.io/math.LegacyDec's protobuf wire format is NOT its
 * human-readable string ("0.10") — its gogoproto customtype Marshal()
 * writes out the INTERNAL representation: the decimal value scaled by
 * 10^18, as a plain integer (e.g. 0.10 -> "100000000000000000"). cosmjs
 * doesn't know about gogoproto customtypes, so cosmjs-types' generated
 * CommissionRates.encode() just writes whatever string you give it
 * verbatim — pass a human "0.10" and the chain's Unmarshal fails with
 * "math/big: cannot unmarshal '0.10' into a *big.Int", because big.Int
 * (LegacyDec's storage) can't parse a decimal point at all. This
 * (string-safe, no floating-point) helper does the same scaling
 * LegacyDec's own String()/Marshal() pair does internally.
 */
function toLegacyDecString(input) {
  const str = String(input);
  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;
  const [whole, frac = ''] = abs.split('.');
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18);
  const combined = (whole === '' ? '0' : whole) + fracPadded;
  const trimmed = combined.replace(/^0+(?=\d)/, '');
  return (negative ? '-' : '') + trimmed;
}

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function main() {
  const {
    'priv-validator-key-file': keyFile,
    'from-mnemonic-env': fromEnvVar,
    moniker,
    amount,
    'commission-rate': commissionRate = '0.10',
    'commission-max-rate': commissionMaxRate = '0.20',
    'commission-max-change-rate': commissionMaxChangeRate = '0.01',
    'min-self-delegation': minSelfDelegation = '1',
    website = '',
    identity = '',
    details = '',
  } = parseArgs();

  if (!keyFile || !fromEnvVar || !moniker || !amount) {
    console.error(
      'Usage: node scripts/create-validator.js --priv-validator-key-file=... --from-mnemonic-env=ENV_VAR --moniker="..." --amount=1000000'
    );
    process.exit(1);
  }

  const keyJson = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const pubKeyBase64 = keyJson.pub_key && keyJson.pub_key.value;
  if (!pubKeyBase64) {
    console.error(`Could not find pub_key.value in ${keyFile} — is this a real priv_validator_key.json?`);
    process.exit(1);
  }
  const pubKeyBytes = Buffer.from(pubKeyBase64, 'base64');

  const mnemonic = process.env[fromEnvVar];
  if (!mnemonic) {
    console.error(`Env var ${fromEnvVar} is not set.`);
    process.exit(1);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  const { data: accountBytes } = fromBech32(account.address);
  const validatorAddress = toBech32(`${config.chain.prefix}valoper`, accountBytes);

  console.log(`Operator account: ${account.address}`);
  console.log(`Validator address: ${validatorAddress}`);
  console.log(`Consensus pubkey (from ${keyFile}): ${pubKeyBase64}`);

  const existing = await getDelegation(account.address, validatorAddress).catch(() => null);
  if (existing) {
    console.error(`A validator already exists at ${validatorAddress} — MsgCreateValidator only works once per operator address.`);
    process.exit(1);
  }

  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
  });

  const msg = {
    typeUrl: '/cosmos.staking.v1beta1.MsgCreateValidator',
    value: MsgCreateValidator.fromPartial({
      description: { moniker, identity, website, securityContact: '', details },
      commission: {
        rate: toLegacyDecString(commissionRate),
        maxRate: toLegacyDecString(commissionMaxRate),
        maxChangeRate: toLegacyDecString(commissionMaxChangeRate),
      },
      minSelfDelegation,
      delegatorAddress: account.address,
      validatorAddress,
      pubkey: Any.fromPartial({
        typeUrl: '/cosmos.crypto.ed25519.PubKey',
        value: PubKey.encode(PubKey.fromPartial({ key: pubKeyBytes })).finish(),
      }),
      value: { denom: 'stake', amount: String(amount) },
    }),
  };

  console.log(`Submitting MsgCreateValidator: self-delegating ${amount}stake, commission ${commissionRate} (max ${commissionMaxRate})...`);
  const result = await client.signAndBroadcast(account.address, [msg], 'auto', 'create-validator.js');

  if (result.code && Number(result.code) !== 0) {
    throw new Error(`Transaction failed (code ${result.code}): ${result.rawLog || 'no raw_log'}`);
  }
  console.log(`Broadcast succeeded — txHash: ${result.transactionHash}  height: ${result.height}`);

  const delegation = await getDelegation(account.address, validatorAddress);
  if (!delegation) {
    throw new Error('Broadcast succeeded but no delegation record was found on re-query — investigate before trusting this.');
  }
  console.log(`Verified independently: validator ${validatorAddress} now has ${delegation.balance.amount}stake self-delegated.`);
  console.log('It will appear as BOND_STATUS_BONDED once the active set picks it up (immediately, if under the validator-set size cap).');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
