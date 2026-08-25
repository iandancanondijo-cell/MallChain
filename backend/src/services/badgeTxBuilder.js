/**
 * Broadcast MsgIssueBadge signed by the operator key configured as this
 * chain's badge_issuer param (see x/badge/keeper/msg_server_issue_badge.go
 * — any other signer is rejected on-chain). Mirrors mallcoinTxBuilder.js's
 * transferFromMnemonic/broadcastSignedTx/pollTxConfirmation pattern
 * (duplicated rather than imported since those helpers aren't exported
 * there either — same self-contained-tx-builder convention dexTxBuilder.js
 * follows).
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { config } = require('../config');
const { MSG_ISSUE_BADGE, createBadgeRegistry } = require('./badgeProto');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const CHAIN_RPC = config.chain.rpc.replace(/\/$/, '');

async function connectClientWithSigner(wallet) {
  return SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createBadgeRegistry(),
  });
}

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

  return { txHash: syncResponse.txhash, height: confirmed.height, raw: confirmed };
}

/**
 * Issues a badge to `recipient` using the operator/badge-issuer mnemonic.
 * Throws (does not swallow) on failure — callers (snapshot job, purchase
 * route, admin manual-grant) each decide how to handle that per their own
 * retry/audit semantics.
 */
async function issueBadgeFromMnemonic({ mnemonic, recipient, badgeType = 'gold' }) {
  if (!mnemonic) throw new Error('Missing mnemonic for badge issuer');
  if (!recipient) throw new Error('Missing recipient address');

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  });
  const [account] = await wallet.getAccounts();

  const client = await connectClientWithSigner(wallet);

  const msg = {
    typeUrl: MSG_ISSUE_BADGE,
    value: {
      creator: account.address,
      recipient,
      badgeType,
    },
  };

  const gasEst = await client.simulate(account.address, [msg], '').catch(() => 200000);
  // 1.3x wasn't enough margin in practice (simulated 52810 -> wanted 68652,
  // but actual usage was 68717) — same underestimate mallcoinTxBuilder.js's
  // comments describe for MsgTransferMallcoin. 1.5x for this message too.
  const gas = Math.min(Math.ceil(gasEst * 1.5), 400000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const signed = await client.sign(account.address, [msg], fee, '');
  const result = await broadcastSignedTx(signed);

  return {
    txHash: result.txHash,
    height: result.height,
    issuer: account.address,
    recipient,
    badgeType,
  };
}

module.exports = { issueBadgeFromMnemonic };
