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
const CHAIN_RPC = config.chain.rpc.replace(/\/$/, '');

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

/**
 * Poll CometBFT's /tx?hash= until the transaction has actually been included
 * in a block, returning its real execution (DeliverTx) result.
 *
 * Note: this chain's REST GetTx (/cosmos/tx/v1beta1/txs/{hash}) panics with
 * a nil-pointer error for these custom message types, so we go through the
 * CometBFT RPC directly instead, which decodes fine.
 */
async function pollTxConfirmation(txHash, { timeoutMs = 15000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${CHAIN_RPC}/tx?hash=0x${txHash}`);
      const data = await response.json();
      if (data.result?.tx_result) {
        return { height: Number(data.result.height || 0), ...data.result.tx_result };
      }
      lastError = data.error?.data || data.error?.message;
    } catch (e) {
      lastError = e.message;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for tx ${txHash} to be confirmed on-chain${lastError ? `: ${lastError}` : ''}`);
}

/**
 * Broadcast a signed tx and wait for its real on-chain result before
 * resolving. BROADCAST_MODE_SYNC only guarantees the tx passed CheckTx (i.e.
 * it was accepted into the mempool) — a tx can still fail once actually
 * executed (e.g. a balance check that only runs at DeliverTx time), so
 * treating a clean broadcast response as success is not reliable. We
 * broadcast, then poll for the confirmed result and only then decide
 * success/failure.
 */
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
  const syncResponse = data.tx_response || {};
  if (syncResponse.code && Number(syncResponse.code) !== 0) {
    // Rejected before even entering the mempool — fail fast, nothing to poll for.
    const err = new Error(syncResponse.raw_log || `Transaction failed with code ${syncResponse.code}`);
    err.code = syncResponse.code;
    err.rawLog = syncResponse.raw_log;
    throw err;
  }

  const confirmed = await pollTxConfirmation(syncResponse.txhash);
  if (confirmed.code && Number(confirmed.code) !== 0) {
    const err = new Error(confirmed.log || `Transaction failed with code ${confirmed.code}`);
    err.code = confirmed.code;
    err.rawLog = confirmed.log;
    throw err;
  }

  return {
    txHash: syncResponse.txhash,
    height: confirmed.height,
    raw: confirmed,
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
  // 1.15x wasn't always enough margin over the simulated estimate — a real
  // transfer failed with "out of gas" at ~100% of the simulated value
  // (88849 used vs 88509 wanted). Back to 1.3x, matching the gas-funding
  // transfers below, since an underpriced tx here means a real payment
  // doesn't land, not just a slightly-too-generous fee.
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
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
  // 1.15x wasn't always enough margin over the simulated estimate — a real
  // transfer failed with "out of gas" at ~100% of the simulated value
  // (88849 used vs 88509 wanted). Back to 1.3x, matching the gas-funding
  // transfers below, since an underpriced tx here means a real payment
  // doesn't land, not just a slightly-too-generous fee.
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
  // 1.15x wasn't always enough margin over the simulated estimate — a real
  // transfer failed with "out of gas" at ~100% of the simulated value
  // (88849 used vs 88509 wanted). Back to 1.3x, matching the gas-funding
  // transfers below, since an underpriced tx here means a real payment
  // doesn't land, not just a slightly-too-generous fee.
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
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
  // 1.15x wasn't always enough margin over the simulated estimate — a real
  // transfer failed with "out of gas" at ~100% of the simulated value
  // (88849 used vs 88509 wanted). Back to 1.3x, matching the gas-funding
  // transfers below, since an underpriced tx here means a real payment
  // doesn't land, not just a slightly-too-generous fee.
  const gas = Math.min(Math.ceil(gasEst * 1.3), 500000);
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

/**
 * Transfer MLCNS and (optionally) fund native stake for gas in one call,
 * using a single wallet/client and a locally-tracked sequence number for
 * both signatures instead of two independent clients.
 *
 * Why: transferFromMnemonic/fundStakeFromMnemonic (etc.) each open their own
 * SigningStargateClient and fetch "current sequence" from chain state at
 * sign time. Called back-to-back from the same signer, the second call can
 * fetch the sequence before the first tx has been included in a block, sign
 * with the same (now-stale) sequence, and get rejected with "account
 * sequence mismatch" once both land — even though the first transfer
 * succeeded. Signing both messages up front against a sequence number we
 * increment ourselves avoids the race: neither signature depends on the
 * other tx having been committed yet.
 *
 * The two messages are still broadcast as separate transactions (not
 * bundled into one), so a gas-funding failure still cannot roll back an
 * already-successful MLCNS transfer.
 */
async function transferAndFundGas({
  mnemonic,
  privateKeyHex,
  toAddress,
  amountMlcns,
  amountStake = '10',
  memo = '',
  fundGas = true,
}) {
  const wallet = privateKeyHex
    ? await walletFromPrivateKey(privateKeyHex)
    : await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();

  const client = await connectClientWithSigner(wallet);
  const chainId = await client.getChainId();
  const { accountNumber, sequence: startSequence } = await client.getSequence(account.address);
  let sequence = startSequence;

  const amountUnits = toBaseUnits(amountMlcns);
  const transferMsg = {
    typeUrl: MSG_TRANSFER_MALLCOIN,
    value: { creator: account.address, to: toAddress, amount: amountUnits },
  };

  const transferGasEst = await client.simulate(account.address, [transferMsg], memo).catch(() => 250000);
  const transferGas = Math.min(Math.ceil(transferGasEst * 1.3), 500000);
  const transferFee = calculateFee(transferGas, GasPrice.fromString(config.chain.gasPrice));

  const transferSigned = await client.sign(
    account.address,
    [transferMsg],
    transferFee,
    memo,
    { accountNumber, sequence, chainId }
  );
  const transferResult = await broadcastSignedTx(transferSigned);
  sequence += 1;

  const transfer = {
    txHash: transferResult.txHash,
    height: transferResult.height,
    from: account.address,
    to: toAddress,
    amountMlcns: Number(amountMlcns),
  };

  if (!fundGas) {
    return { transfer, gasFunding: null };
  }

  let gasFunding;
  try {
    const denom = config.chain.baseDenom || 'stake';
    const amountBase = Math.floor(Number(amountStake) * 1e6).toString();
    const stakeMsg = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: { fromAddress: account.address, toAddress, amount: [{ denom, amount: amountBase }] },
    };

    const stakeGasEst = await client.simulate(account.address, [stakeMsg], '').catch(() => 120000);
    const stakeFee = calculateFee(Math.ceil(stakeGasEst * 1.3), GasPrice.fromString(config.chain.gasPrice));

    const stakeSigned = await client.sign(
      account.address,
      [stakeMsg],
      stakeFee,
      'faucet gas',
      { accountNumber, sequence, chainId }
    );
    const stakeResult = await broadcastSignedTx(stakeSigned);
    gasFunding = { txHash: stakeResult.txHash, amount: amountStake, denom };
  } catch (e) {
    gasFunding = { error: e.message, note: 'MLCNS sent; fund stake manually if sends fail' };
  }

  return { transfer, gasFunding };
}

module.exports = {
  MSG_TRANSFER_MALLCOIN,
  signAndBroadcastTransfer,
  buildUnsignedTransferBase64,
  transferFromMnemonic,
  transferFromPrivateKey,
  fundStakeFromMnemonic,
  fundStakeFromPrivateKey,
  transferAndFundGas,
};
