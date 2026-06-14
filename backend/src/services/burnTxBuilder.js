/* eslint-env node */
/* global require, module, process */
const { SigningStargateClient } = require('@cosmjs/stargate');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);

const CHAIN_RPC = process.env.CHAIN_RPC_URL || process.env.VITE_CHAIN_RPC || 'http://localhost:26657';
const GAS_PRICE = process.env.GAS_PRICE || '0.025';
const DENOM = process.env.DENOM || 'umlcn';

async function getAddressFromMnemonic(mnemonic) {
  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'marketplace',
    });
    const accounts = await wallet.getAccounts();
    return accounts[0]?.address;
  } catch (err) {
    console.error('[BurnTx] Failed to get address from mnemonic:', err.message);
    throw err;
  }
}

// Execute on-chain burn via MsgBurn
async function burnCoinsOnChain({ mnemonic, burnAmount, memo = '' }) {
  if (!mnemonic) {
    throw new Error('Mnemonic required for burn transaction');
  }

  if (burnAmount <= 0) {
    throw new Error('Burn amount must be positive');
  }

  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'marketplace',
    });
    const accounts = await wallet.getAccounts();
    const signerAddress = accounts[0].address;

    const client = await SigningStargateClient.connectWithSigner(CHAIN_RPC, wallet);

    // Prepare MsgBurn
    const burnMsg = {
      typeUrl: '/marketplace.mlcoin.v1.MsgBurn',
      value: {
        from: signerAddress,
        amount: {
          denom: DENOM,
          amount: burnAmount.toString(),
        },
      },
    };

    console.log(`[BurnTx] Burning ${burnAmount} ${DENOM} from ${signerAddress}`);

    // Estimate gas
    const gasEstimate = 100000; // conservative estimate for burn

    const txResult = await client.signAndBroadcast(
      signerAddress,
      [burnMsg],
      {
        amount: [{ denom: DENOM, amount: Math.ceil(gasEstimate * Number(GAS_PRICE)).toString() }],
        gas: gasEstimate.toString(),
      },
      memo || 'mallcoin burn transaction'
    );

    if (txResult.code !== 0) {
      throw new Error(`Burn failed: code ${txResult.code} - ${txResult.rawLog}`);
    }

    console.log(`[BurnTx] Burn successful: ${txResult.transactionHash}`);

    return {
      success: true,
      txHash: txResult.transactionHash,
      height: txResult.height,
      gasUsed: txResult.gasUsed,
      gasWanted: txResult.gasWanted,
    };
  } catch (err) {
    console.error('[BurnTx] Burn transaction failed:', err.message || err);
    throw err;
  }
}

module.exports = {
  burnCoinsOnChain,
  getAddressFromMnemonic,
};
