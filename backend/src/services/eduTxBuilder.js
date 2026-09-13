/**
 * Broadcast MsgRegisterDocument signed by the operator key (OPERATOR_MNEMONIC
 * — the same key badgeTxBuilder.js uses for MsgIssueBadge). Wallets in this
 * app are non-custodial, so the real uploader can't sign a chain tx
 * themselves without a much larger client-side-signing build-out; this
 * anchors their document's hash under an operator-relayed tx instead, and
 * records who it's really from in the (unsigned, informational) `uploader`
 * field — see proto/marketplace/edu/v1/tx.proto's MsgRegisterDocument
 * comment. Mirrors badgeTxBuilder.js's transferFromMnemonic/
 * broadcastSignedTx/pollTxConfirmation pattern (duplicated rather than
 * imported, same self-contained-tx-builder convention as that file).
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice, calculateFee } = require('@cosmjs/stargate');
const { TxRaw } = require('cosmjs-types/cosmos/tx/v1beta1/tx');
const { config } = require('../config');
const { MSG_REGISTER_DOCUMENT, createEduRegistry } = require('./eduProto');

const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const CHAIN_RPC = config.chain.rpc.replace(/\/$/, '');

async function connectClientWithSigner(wallet) {
  return SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
    registry: createEduRegistry(),
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
 * Anchors one version of a document's hash on-chain using the operator
 * mnemonic. Throws (does not swallow) on failure — callers decide how to
 * handle that (edu.js treats it as best-effort and keeps the upload either
 * way, since the off-chain resource is still real and usable without a
 * chain anchor).
 */
async function registerDocumentFromMnemonic({ mnemonic, uploader, docId, sha256Hash, parentRecordId = '' }) {
  if (!mnemonic) throw new Error('Missing mnemonic for edu operator');
  if (!uploader) throw new Error('Missing uploader identity');
  if (!docId) throw new Error('Missing docId');
  if (!sha256Hash) throw new Error('Missing sha256Hash');

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: config.chain.prefix,
  });
  const [account] = await wallet.getAccounts();

  const client = await connectClientWithSigner(wallet);

  const msg = {
    typeUrl: MSG_REGISTER_DOCUMENT,
    value: {
      creator: account.address,
      uploader,
      docId,
      sha256Hash,
      parentRecordId,
    },
  };

  const gasEst = await client.simulate(account.address, [msg], '').catch(() => 200000);
  const gas = Math.min(Math.ceil(gasEst * 1.5), 400000);
  const fee = calculateFee(gas, GasPrice.fromString(config.chain.gasPrice));

  const signed = await client.sign(account.address, [msg], fee, '');
  const result = await broadcastSignedTx(signed);

  return {
    txHash: result.txHash,
    height: result.height,
    creator: account.address,
    uploader,
    docId,
    sha256Hash,
    parentRecordId,
  };
}

/**
 * Reads a document's version history straight from the chain's REST
 * gateway (read-only, no signing needed) — used by the /verify endpoint to
 * confirm a record that claims to exist actually does, independent of
 * whatever Mongo currently says.
 */
async function getVersionHistory(docId) {
  const response = await fetch(`${CHAIN_REST}/tmp/marketplace/edu/v1/history/${encodeURIComponent(docId)}`);
  if (!response.ok) {
    throw new Error(`Chain query failed with status ${response.status}`);
  }
  const data = await response.json();
  return data.records || [];
}

module.exports = { registerDocumentFromMnemonic, getVersionHistory, MSG_REGISTER_DOCUMENT };
