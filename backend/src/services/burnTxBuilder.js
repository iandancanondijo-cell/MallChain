/* eslint-env node */
/* global require, module, process */
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { Console } = require('console');
const { stdout, stderr } = require('process');
const console = new Console(stdout, stderr);
const { config } = require('../config');

const CHAIN_RPC = config.chain.rpc;
const GAS_PRICE = config.chain.gasPrice;
const DENOM = config.chain.denom || 'mlcoin';
const PREFIX = config.chain.prefix || 'marketplace';

async function getAddressFromMnemonic(mnemonic) {
  try {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: PREFIX,
    });
    const accounts = await wallet.getAccounts();
    return accounts[0]?.address;
  } catch (err) {
    console.error('[BurnTx] Failed to derive address (invalid mnemonic)');
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
      prefix: PREFIX,
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

    // Simulate to estimate gas, then add 30% margin
    let gasEstimate;
    try {
      const simulated = await client.simulate(signerAddress, [burnMsg], memo || 'mallcoin burn transaction');
      gasEstimate = Math.ceil(simulated * 1.3);
    } catch (_simErr) {
      gasEstimate = 200000; // fallback if simulation fails
    }

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
    console.error('[BurnTx] Burn transaction failed:', txResult?.code != null ? `code ${txResult.code}` : 'unknown error');
    throw err;
  }
}

module.exports = {
  burnCoinsOnChain,
  getAddressFromMnemonic,
};
