/**
 * Build and sign Mallcoin (MLCNS) transfers via MsgTransferMallcoin on the chain.
 */
const { DirectSecp256k1Wallet, DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { config } = require('../config');
const { toBaseUnits } = require('./mallcoinService');
const { MSG_TRANSFER_MALLCOIN, createMlcoinRegistry } = require('./mlcoinProto');
const CHAIN_REST = config.chain.rest.replace(/\/$/, '');

async function walletFromPrivateKey(privateKeyHex, prefix) {
  const key = Uint8Array.from(Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex'));
  return DirectSecp256k1Wallet.fromKey(key, prefix || config.chain.prefix);
}

async function connectClientWithSigner(wallet) {
  return SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createMlcoinRegistry(),
  });
}

async function broadcastSignedTx(txRaw) {
  const txBytes = TxRaw.encode(txRaw).finish();
  const response = await fetch(`${CHAIN_REST}/cosmos/tx/v1beta1/txs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_bytes: Buffer.from(txBytes).toString('base64'),
      mode: 'BROADCAST_MODE_SYNC',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Broadcast failed');
  }
  const txResponse = data.tx_response || {};
  if (txResponse.code && Number(txResponse.code) !== 0) {
    const err = new Error(txResponse.raw_log || `Transaction failed with code ${txResponse.code}`);
    err.code = txResponse.code;
    err.rawLog = txResponse.raw_log;
    throw err;
  }
  return {
    txHash: txResponse.txhash,
    height: Number(txResponse.height || 0),
    raw: txResponse,
  };
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

  const client = await connectClientWithSigner(wallet);

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
  // Reduce gas buffer from 1.3 to 1.15 to minimize overpayment while maintaining safety margin
  const gas = Math.min(Math.ceil(gasEst * 1.15), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const signed = await client.sign(account.address, [msg], fee, memo);
  const result = await broadcastSignedTx(signed);

  return {
    txHash: result.txHash,
    height: result.height,
    gasUsed: result.gasUsed,
    chainId,
    events: result.raw?.events || [],
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

  const client = await connectClientWithSigner(wallet);

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
  // Reduce gas buffer from 1.3 to 1.15 to minimize overpayment while maintaining safety margin
  const gas = Math.min(Math.ceil(gasEst * 1.15), 500000);
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

  const client = await connectClientWithSigner(wallet);

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
  // Reduce gas buffer from 1.3 to 1.15 to minimize overpayment while maintaining safety margin
  const gas = Math.min(Math.ceil(gasEst * 1.15), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const signed = await client.sign(account.address, [msg], fee, memo);
  const result = await broadcastSignedTx(signed);

  return {
    txHash: result.txHash,
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
  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createMlcoinRegistry(),
  });

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
  const signed = await client.sign(account.address, [msg], fee, 'faucet gas');
  const result = await broadcastSignedTx(signed);
  return { txHash: result.txHash, amount: amountStake, denom };
}

async function transferFromPrivateKey({ privateKeyHex, toAddress, amountMlcns, memo = '' }) {
  const wallet = await walletFromPrivateKey(privateKeyHex);
  const [account] = await wallet.getAccounts();
  const client = await connectClientWithSigner(wallet);

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
  // Reduce gas buffer from 1.3 to 1.15 to minimize overpayment while maintaining safety margin
  const gas = Math.min(Math.ceil(gasEst * 1.15), 500000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));
  const signed = await client.sign(account.address, [msg], fee, memo);
  const result = await broadcastSignedTx(signed);

  return {
    txHash: result.txHash,
    height: result.height,
    from: account.address,
    to: toAddress,
    amountMlcns: Number(amountMlcns),
  };
}

async function fundStakeFromPrivateKey({ privateKeyHex, toAddress, amountStake = '10' }) {
  const wallet = await walletFromPrivateKey(privateKeyHex);
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createMlcoinRegistry(),
  });

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
  const signed = await client.sign(account.address, [msg], fee, 'faucet gas');
  const result = await broadcastSignedTx(signed);
  return { txHash: result.txHash, amount: amountStake, denom };
}

module.exports = {
  MSG_TRANSFER_MALLCOIN,
  signAndBroadcastTransfer,
  buildUnsignedTransferBase64,
  transferFromMnemonic,
  transferFromPrivateKey,
  fundStakeFromMnemonic,
  fundStakeFromPrivateKey,
};
