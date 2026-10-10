const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');

const MNEMONIC = 'skull actress price stamp awkward shoe chief plunge parrot devote siren beyond chalk lawsuit penalty mystery level alert picnic crawl coast miss nephew warrior';
const RPC = 'http://localhost:26657';

(async () => {
  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: 'mall' });
    const [account] = await wallet.getAccounts();
    console.log('Sender:', account.address);
    
    const client = await SigningStargateClient.connectWithSigner(RPC, wallet, {
      gasPrice: GasPrice.fromString('0.01stake'),
    });
    
    // Send real transaction
    const to = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';
    const amount = [{ denom: 'stake', amount: '100000' }]; // 0.1 stake
    
    console.log('Sending 0.1 STAKE to', to);
    const result = await client.sendTokens(account.address, to, amount, 'auto', 'Real P2P transfer');
    
    console.log('\n✅ REAL TRANSACTION CREATED!');
    console.log('TX Hash:', result.transactionHash);
    console.log('Block Height:', result.height);
    console.log('Gas Used:', result.gasUsed);
    console.log('Status:', result.code === 0 ? 'SUCCESS' : 'FAILED');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
