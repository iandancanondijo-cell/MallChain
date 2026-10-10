const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { MSG_TRANSFER_MALLCOIN, createMlcoinRegistry } = require('./src/services/mlcoinProto');

const MNEMONIC_A = 'genre category scissors width parent equip detect large sheriff jacket success abstract parade wrap arctic gospel nation yellow lazy engine write buzz more rather';
const ADDR_A = 'mall198h9saq46c4243r0zg88ma62a55xvsttnf7z3y';
const ADDR_B = 'mall1ezs4gg35npymrcsje96tm8ctqsjzrca9ap0hfc';
const RPC = 'http://127.0.0.1:26657';
const REST = 'http://127.0.0.1:1317';

(async () => {
  try {
    console.log('Step 1: Creating wallet from mnemonic...');
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC_A, { prefix: 'mall' });
    const [account] = await wallet.getAccounts();
    console.log(`  Signer: ${account.address}`);

    console.log('Step 2: Connecting signing client...');
    const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
      gasPrice: GasPrice.fromString('0.025stake'),
      registry: createMlcoinRegistry(),
    });
    console.log('  Connected');

    const chainId = await client.getChainId();
    console.log(`  Chain ID: ${chainId}`);

    console.log('Step 3: Building MsgTransferMallcoin...');
    const amountUnits = BigInt(100) * 1000000n; // 100 MLCNS in micro units
    const msg = {
      typeUrl: MSG_TRANSFER_MALLCOIN,
      value: {
        creator: ADDR_A,
        to: ADDR_B,
        amount: amountUnits,
      },
    };

    console.log('Step 4: Signing transaction (fixed gas=250000)...');
    const fee = calculateFee(250000, GasPrice.fromString('0.025stake'));
    const signed = await client.sign(ADDR_A, [msg], fee, 'Phase 3 acceptance test');

    console.log('Step 5: Broadcasting transaction...');
    const txBytes = TxRaw.encode(signed).finish();
    const response = await fetch(`${REST}/cosmos/tx/v1beta1/txs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_bytes: Buffer.from(txBytes).toString('base64'),
        mode: 'BROADCAST_MODE_SYNC',
      }),
    });
    const data = await response.json();
    console.log('  Broadcast response:', JSON.stringify(data.tx_response || data, null, 2));

    const txHash = data.tx_response?.txhash || data.txhash;
    if (!txHash) {
      console.error('No txhash in response');
      process.exit(1);
    }

    console.log(`Step 6: Polling for confirmation (hash=${txHash})...`);
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const txResp = await fetch(`${RPC}/tx?hash=0x${txHash}`);
      const txData = await txResp.json();
      if (txData.result?.tx_result) {
        const code = Number(txData.result.tx_result.code || 0);
        console.log(`  Confirmed at height ${txData.result.height}, code=${code}`);
        if (code !== 0) {
          console.log(`  FAILED: ${txData.result.tx_result.log}`);
        } else {
          console.log('  SUCCESS!');
        }
        console.log(JSON.stringify(txData.result.tx_result, null, 2).substring(0, 500));
        process.exit(code === 0 ? 0 : 1);
      }
      process.stdout.write('.');
    }
    console.log('\n  Timed out waiting for confirmation');
    process.exit(1);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
