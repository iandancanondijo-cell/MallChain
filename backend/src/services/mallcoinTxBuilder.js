/**
 * Build and sign Mallcoin (MLCNS) transfers via MsgTransferMallcoin on the chain.
 */
const { DirectSecp256k1Wallet, DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { config } = require('../config');
const { toBaseUnits } = require('./mallcoinService');

const MSG_TRANSFER_MALLCOIN = '/marketplace.mlcoin.v1.MsgTransferMallcoin';

async function walletFromPrivateKey(privateKeyHex, prefix) {
  const key = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex'));
  return DirectSecp256k1Wallet.fromKey(key, prefix || config.chain.prefix);
}

/**
 * Sign and broadcast MLCNS transfer. Amount is human-readable MLCNS (e.g. 10.5).
 */
async function signAndBroadcastTransfer({
  privateKeyHex,
  fromAddress,
  toAddress,
  amountMlcns,
  memo = '',
}) {
  const wallet = await walletFromPrivateKey(privateKeyHex);
  const [account] = await wallet.getAccounts();
  if (account.address !== fromAddress) {
    throw new Error('Private key does not match sender address');
  }

  const client = await SigningStargateClient.connectWithSigner(
    config.chain.rpc,
    wallet,
    {
      gasPrice: GasPrice.fromString(config.chain.gasPrice),
    }
  );

  const chainId = await client.getChainId();
  const amountUnits = toBaseUnits(amountMlcns);

  const msg = {
    typeUrl: MSG_TRANSFER_MALLCOIN,
    value: {
      creator: fromAddress,
      to: toAddress,
      amount: amountUnits,
    },
  };

  const gasEst = await client.simulate(account.address, [msg], memo).catch(() => 250000);
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const result = await client.signAndBroadcast(account.address, [msg], fee, memo);

  if (result.code !== 0) {
    const err = new Error(result.rawLog || `Transaction failed with code ${result.code}`);
    err.code = result.code;
    err.rawLog = result.rawLog;
    throw err;
  }

  return {
    txHash: result.transactionHash,
    height: result.height,
    gasUsed: result.gasUsed,
    chainId,
    events: result.events,
  };
}

/**
 * Build unsigned tx bytes for client-side signing (returns base64 tx to broadcast).
 */
async function buildUnsignedTransferBase64({
  privateKeyHex,
  fromAddress,
  toAddress,
  amountMlcns,
  memo = '',
}) {
  const wallet = await walletFromPrivateKey(privateKeyHex);
  const [account] = await wallet.getAccounts();

  const client = await SigningStargateClient.connectWithSigner(
    config.chain.rpc,
    wallet,
    { gasPrice: GasPrice.fromString(config.chain.gasPrice) }
  );

  const amountUnits = toBaseUnits(amountMlcns);
  const msg = {
    typeUrl: MSG_TRANSFER_MALLCOIN,
    value: {
      creator: fromAddress,
      to: toAddress,
      amount: amountUnits,
    },
  };

  const gasEst = await client.simulate(account.address, [msg], memo).catch(() => 250000);
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const signed = await client.sign(account.address, [msg], fee, memo);
  const txBytes = TxRaw.encode({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: signed.signatures,
  }).finish();

  return Buffer.from(txBytes).toString('base64');
}

/**
 * Transfer MLCNS using a mnemonic (faucet / treasury).
 */
async function transferFromMnemonic({ mnemonic, toAddress, amountMlcns, memo = '' }) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  });
  const [account] = await wallet.getAccounts();

  const client = await SigningStargateClient.connectWithSigner(
    config.chain.rpc,
    wallet,
    { gasPrice: GasPrice.fromString(config.chain.gasPrice) }
  );

  const amountUnits = toBaseUnits(amountMlcns);
  const msg = {
    typeUrl: MSG_TRANSFER_MALLCOIN,
    value: {
      creator: account.address,
      to: toAddress,
      amount: amountUnits,
    },
  };

  const gasEst = await client.simulate(account.address, [msg], memo).catch(() => 250000);
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const result = await client.signAndBroadcast(account.address, [msg], fee, memo);

  if (result.code !== 0) {
    const err = new Error(result.rawLog || `Transfer failed with code ${result.code}`);
    err.code = result.code;
    err.rawLog = result.rawLog;
    throw err;
  }

  return {
    txHash: result.transactionHash,
    height: result.height,
    from: account.address,
    to: toAddress,
    amountMlcns: Number(amountMlcns),
  };
}

/**
 * Optional: fund native stake for gas on a new wallet.
 */
async function fundStakeFromMnemonic({ mnemonic, toAddress, amountStake = '10' }) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  });
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(
    config.chain.rpc,
    wallet,
    { gasPrice: GasPrice.fromString(config.chain.gasPrice) }
  );

  const denom = config.chain.baseDenom || 'stake';
  const amountBase = Math.floor(Number(amountStake) * 1e6).toString();

  const msg = {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: account.address,
      toAddress,
      amount: [{ denom, amount: amountBase }],
    },
  };

  const gasEst = await client.simulate(account.address, [msg], '').catch(() => 120000);
  const fee = calculateFee(Math.ceil(gasEst * 1.3), GasPrice.fromString(config.chain.gasPrice));
  const result = await client.signAndBroadcast(account.address, [msg], fee, 'faucet gas');

  if (result.code !== 0) {
    throw new Error(result.rawLog || 'Stake funding failed');
  }
  return { txHash: result.transactionHash, amount: amountStake, denom };
}

module.exports = {
  MSG_TRANSFER_MALLCOIN,
  signAndBroadcastTransfer,
  buildUnsignedTransferBase64,
  transferFromMnemonic,
  fundStakeFromMnemonic,
};
