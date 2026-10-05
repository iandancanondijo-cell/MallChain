/**
 * Native Transfer Test
 * Tests on-chain MsgSend transaction with test wallets
 */

const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { stringToPath } = require('@cosmjs/crypto');
const { toUtf8 } = require('@cosmjs/encoding');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEST_WALLETS_PATH = path.join(__dirname, 'test-wallets.json');
const RPC_ENDPOINT = 'http://localhost:26657';
const REST_ENDPOINT = 'http://localhost:1317';

async function loadTestWallet(name) {
  const wallets = JSON.parse(fs.readFileSync(TEST_WALLETS_PATH, 'utf8'));
  const walletData = wallets[name];
  if (!walletData) throw new Error(`Wallet ${name} not found`);

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(walletData.mnemonic, {
    prefix: 'mall',
    hdPaths: [stringToPath(walletData.hdPath)]
  });

  return { wallet, walletData };
}

async function getBalance(address) {
  const response = await axios.get(`${REST_ENDPOINT}/cosmos/bank/v1beta1/balances/${address}`);
  return response.data.balances;
}

async function testNativeTransfer() {
  console.log('\n=== NATIVE TRANSFER TEST ===');
  console.log('TEST_USER_A → TEST_USER_B: 1000 stake\n');

  const { wallet: senderWallet, walletData: senderData } = await loadTestWallet('TEST_USER_A');
  const { walletData: recipientData } = await loadTestWallet('TEST_USER_B');

  // Get initial balances
  const senderBalanceBefore = await getBalance(senderData.address);
  const recipientBalanceBefore = await getBalance(recipientData.address);

  console.log('Initial balances:');
  console.log('  TEST_USER_A:', senderBalanceBefore.map(b => `${b.amount} ${b.denom}`).join(', '));
  console.log('  TEST_USER_B:', recipientBalanceBefore.map(b => `${b.amount} ${b.denom}`).join(', '));

  // Create signing client
  const client = await SigningStargateClient.connectWithSigner(RPC_ENDPOINT, senderWallet, {
    gasPrice: GasPrice.fromString('0.025stake')
  });

  // Execute transfer
  const amount = {
    denom: 'stake',
    amount: '1000'
  };

  const fee = {
    amount: [{ denom: 'stake', amount: '2000' }],
    gas: '200000'
  };

  console.log('\nSending transaction...');
  const result = await client.sendTokens(
    senderData.address,
    recipientData.address,
    [amount],
    fee,
    'Test transfer from ADR-036 test suite'
  );

  console.log('✓ Transaction hash:', result.transactionHash);
  console.log('✓ Block height:', result.height);
  console.log('✓ Gas used:', result.gasUsed);

  // Wait for block confirmation
  console.log('\nWaiting for confirmation...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get final balances
  const senderBalanceAfter = await getBalance(senderData.address);
  const recipientBalanceAfter = await getBalance(recipientData.address);

  console.log('\nFinal balances:');
  console.log('  TEST_USER_A:', senderBalanceAfter.map(b => `${b.amount} ${b.denom}`).join(', '));
  console.log('  TEST_USER_B:', recipientBalanceAfter.map(b => `${b.amount} ${b.denom}`).join(', '));

  // Verify balances changed correctly
  const senderBefore = BigInt(senderBalanceBefore.find(b => b.denom === 'stake')?.amount || '0');
  const senderAfter = BigInt(senderBalanceAfter.find(b => b.denom === 'stake')?.amount || '0');
  const recipientBefore = BigInt(recipientBalanceBefore.find(b => b.denom === 'stake')?.amount || '0');
  const recipientAfter = BigInt(recipientBalanceAfter.find(b => b.denom === 'stake')?.amount || '0');

  const senderDelta = senderAfter - senderBefore;
  const recipientDelta = recipientAfter - recipientBefore;

  console.log('\nBalance changes:');
  console.log('  TEST_USER_A:', senderDelta.toString(), 'stake (sent + fee)');
  console.log('  TEST_USER_B:', recipientDelta.toString(), 'stake (received)');

  if (recipientDelta === BigInt(1000)) {
    console.log('\n✓ Transfer successful: recipient received exactly 1000 stake');
  } else {
    throw new Error(`Expected recipient to receive 1000, got ${recipientDelta}`);
  }

  return {
    transactionHash: result.transactionHash,
    height: result.height,
    senderDelta: senderDelta.toString(),
    recipientDelta: recipientDelta.toString()
  };
}

async function main() {
  console.log('===========================================');
  console.log('NATIVE TRANSFER TEST SUITE');
  console.log('===========================================');

  try {
    const result = await testNativeTransfer();

    console.log('\n===========================================');
    console.log('TEST SUMMARY');
    console.log('===========================================');
    console.log('✓ Native transfer executed');
    console.log('✓ Transaction confirmed on-chain');
    console.log('✓ Balances updated correctly');
    console.log('\nAll native transfer tests completed successfully!');

    // Save test results
    const results = {
      timestamp: new Date().toISOString(),
      test: 'Native transfer',
      status: 'PASS',
      data: result
    };

    fs.writeFileSync(
      path.join(__dirname, 'native-transfer-test-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('\nResults saved to: test/native-transfer-test-results.json');

  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
