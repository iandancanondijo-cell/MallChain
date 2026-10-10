/**
 * Phase 4: MLPTS→MLCNS Conversion Test
 * Create ADR-036 signature and call conversion endpoint
 */
const { Secp256k1HdWallet } = require('@cosmjs/amino');
const { makeSignDoc, serializeSignDoc } = require('@cosmjs/amino');
const { Sha256 } = require('@cosmjs/crypto');
const { toBase64, toUtf8 } = require('@cosmjs/encoding');
const testWallets = require('../test/test-wallets.json');

const BACKEND_URL = 'http://localhost:4000';

function convertMessage(address, timestamp) {
  return `Convert Mallpoints to Mallcoin for ${address} at ${timestamp}`;
}

async function main() {
  console.log('=== Phase 4: MLPTS→MLCNS Conversion Test ===\n');

  const wallet = await Secp256k1HdWallet.fromMnemonic(testWallets.TEST_USER_A.mnemonic, {
    prefix: 'mall',
  });
  const [account] = await wallet.getAccounts();
  console.log(`Signer: ${account.address}`);

  // Check current MLPTS balance
  const balResp = await fetch(`${BACKEND_URL}/api/mallpoints/${account.address}`);
  const balData = await balResp.json();
  console.log(`MLPTS balance: ${balData.balance}`);
  console.log(`Can convert: ${balData.conversionStatus?.canConvert}`);

  if (!balData.conversionStatus?.canConvert) {
    console.error('Conversion window is closed');
    process.exit(1);
  }

  // Create ADR-036 signature
  const timestamp = new Date().toISOString();
  const message = convertMessage(account.address, timestamp);

  // Build the sign doc (ADR-036 format)
  const msg = {
    type: 'sign/MsgSignData',
    value: {
      signer: account.address,
      data: toBase64(toUtf8(message)),
    },
  };
  const signDoc = makeSignDoc([msg], { gas: '0', amount: [] }, '', '', 0, 0);

  // Use the wallet's signAmino method
  const signResult = await wallet.signAmino(account.address, signDoc);
  const signatureBytes = Buffer.from(signResult.signature.signature, 'base64');
  const pubKeyBase64 = toBase64(account.pubkey);
  const signatureBase64 = signResult.signature.signature;

  console.log(`\nSignature created:`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log(`  Message: ${message}`);
  console.log(`  PubKey: ${pubKeyBase64.slice(0, 20)}...`);
  console.log(`  Signature: ${signatureBase64.slice(0, 20)}...`);

  // Call conversion endpoint
  console.log('\nCalling conversion endpoint...');
  console.log('Expected MLCNS:', (2000 * 3333333 / 1000000).toFixed(6), '(based on 2000 MLPTS)');
  console.log('Expected MLCNS:', (1000 * 3333333 / 1000000).toFixed(6), '(based on 1000 MLPTS)');
  const convertResp = await fetch(`${BACKEND_URL}/api/mallpoints/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: account.address,
      timestamp,
      pubKey: pubKeyBase64,
      signature: signatureBase64,
    }),
  });

  const convertData = await convertResp.json();

  if (!convertResp.ok) {
    console.error('\nConversion failed:');
    console.error(convertData);
    process.exit(1);
  }

  console.log('\n✓ Conversion successful!');
  console.log(`  Converted points: ${convertData.convertedPoints}`);
  console.log(`  MLCNS received: ${convertData.mallcoins}`);
  console.log(`  Conversion rate: ${convertData.ratio?.proposed_rate}`);
  console.log(`  KES value: ${convertData.ratio?.kes_value_of_points}`);
  console.log(`  TX hash: ${convertData.credit?.txHash}`);

  // Check new balance
  const balRespAfter = await fetch(`${BACKEND_URL}/api/mallpoints/${account.address}`);
  const balDataAfter = await balRespAfter.json();
  console.log(`\nNew MLPTS balance: ${balDataAfter.balance}`);

  // Check on-chain MLCNS balance
  const mlcnsResp = await fetch(`http://localhost:1317/tmp/marketplace/mlcoin/v1/wallet_balance/${account.address}`);
  const mlcnsData = await mlcnsResp.json();
  const mlcnsBalance = BigInt(mlcnsData.wallet_balance?.balance || '0');
  console.log(`On-chain MLCNS balance: ${(Number(mlcnsBalance) / 1e6).toFixed(6)}`);

  console.log('\n=== Phase 4 PASSED ===');
}

main().catch((err) => {
  console.error('\n=== Phase 4 FAILED ===');
  console.error(err);
  process.exit(1);
});
