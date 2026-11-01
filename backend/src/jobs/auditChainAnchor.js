/**
 * auditChainAnchor — daily on-chain anchoring of the tamper-evident audit
 * ledger's head hash.
 *
 * Why this exists: the AuditChain model proves *internal* consistency, but
 * someone with raw mongosh access (a DBA, the chain's own operator — i.e.
 * exactly the "mallchain owner" this feature is meant to constrain) could
 * rewrite the whole collection into a *different* internally-consistent
 * chain. Anchoring defeats that: once per run we broadcast a real
 * transaction whose memo commits to the current head entryHash. From that
 * moment on, every future block contains public evidence of what the head
 * was; a fabricated chain cannot match the witness, and the witness lives
 * outside anyone's MongoDB.
 *
 * Mechanism (mirrors jobs/operatorStakeWatcher.js — the established
 * backend→chain write path): SigningStargateClient over config.chain.rpc,
 * a minimal self-send (`stake` denom) whose MEMO carries
 * `mallchain-audit-anchor:v1 seq=<n> hash=<hex>`. The signer is
 * AUDIT_ANCHOR_MNEMONIC, falling back to OPERATOR_MNEMONIC then
 * TREASURY_MNEMONIC — the same system keys the backend already signs
 * badge issuance / treasury sweeps with (deliberately NOT a new secret).
 *
 * Graceful degradation: with no signer configured, or if the broadcast
 * fails, the anchor intent is still persisted to AnchorRegistry
 * (status 'intent'/'failed') and logged at error level — the run is
 * retryable on the next tick and verifiable gaps stay visible.
 */
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const cron = require('node-cron');
const { config } = require('../config');
const AuditChain = require('../models/AuditChain');
const AnchorRegistry = require('../models/AnchorRegistry');
const { updateAnchorStatus, computeAnchorHash, GENESIS_ANCHOR_HASH } = AnchorRegistry;
const logger = require('../utils/logger');

const MEMO_PREFIX = 'mallchain-audit-anchor:v1';
// Smallest sensible self-send: the tx exists for its MEMO, not its value.
const ANCHOR_AMOUNT = process.env.AUDIT_ANCHOR_AMOUNT || '1000';
const ANCHOR_DENOM = process.env.AUDIT_ANCHOR_DENOM || config.chain.baseDenom || 'stake';

function utcDateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function anchorMemo(head) {
  // Cosmos default MaxMemoLength is 256 — this stays ~90 bytes.
  return `${MEMO_PREFIX} seq=${head.seq} hash=${head.entryHash}`;
}

async function broadcastAnchorTx(mnemonic, memo) {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config.chain.prefix });
  const [account] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(config.chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(config.chain.gasPrice),
  });
  // sendTokens(..., 'auto', memo) awaits delivery in commit mode —
  // transactionHash + height are final when it resolves (same pattern as
  // operatorStakeWatcher.js's top-up).
  const result = await client.sendTokens(
    account.address,
    account.address,
    [{ denom: ANCHOR_DENOM, amount: ANCHOR_AMOUNT }],
    'auto',
    memo
  );
  if (result.code && Number(result.code) !== 0) {
    throw new Error(result.rawLog || `broadcast failed with code ${result.code}`);
  }
  return { txHash: result.transactionHash, height: result.height, signerAddress: account.address };
}

/**
 * Insert an anchor row that also links to the previous anchor row
 * (anchorPrevHash → anchorHash), so the anchors form their own detectable
 * chain even when nothing reaches the block. Never throws: if the chain
 * bookkeeping itself fails, falls back to inserting without link fields
 * (a missing link is itself surfaced by integrity verification).
 */
async function createAnchorRow(fields) {
  try {
    const prev = await AnchorRegistry.findOne().sort({ _id: -1 }).lean();
    const anchorPrevHash = prev && prev.anchorHash ? prev.anchorHash : GENESIS_ANCHOR_HASH;
    const { anchorHash, signed } = computeAnchorHash({
      anchorPrevHash,
      anchorDate: fields.anchorDate,
      headSeq: fields.headSeq,
      headHash: fields.headHash,
    });
    return await AnchorRegistry.create({ ...fields, anchorPrevHash, anchorHash, anchorSigned: signed });
  } catch (err) {
    logger.error('auditChainAnchor', 'anchor-row chaining failed — inserting unlinked', err, { headSeq: fields.headSeq });
    return AnchorRegistry.create(fields);
  }
}

/**
 * One anchor pass. Returns a summary object; never throws — a scheduled
 * job that crashes itself on a transient RPC blip is worse than one that
 * records the failure and retries next tick (same contract as the other
 * jobs in this directory).
 */
async function runAuditChainAnchor(now = new Date()) {
  const head = await AuditChain.findOne().sort({ seq: -1 }).lean();
  if (!head) {
    logger.info('auditChainAnchor', 'audit chain empty — nothing to anchor');
    return { ok: true, anchored: false, reason: 'empty-chain' };
  }

  // Already anchored/pending for this exact head? Skip until the chain
  // actually moves (otherwise a busy system broadcasts one tx per cron
  // tick for the same hash, and a quiet one broadcasts one per day).
  const existing = await AnchorRegistry.findOne({ headSeq: head.seq, status: { $in: ['pending', 'confirmed'] } });
  if (existing) {
    return { ok: true, anchored: false, reason: 'already-anchored', anchorId: String(existing._id) };
  }

  const anchorDate = utcDateStr(now);
  const memo = anchorMemo(head);
  const mnemonic = process.env.AUDIT_ANCHOR_MNEMONIC || process.env.OPERATOR_MNEMONIC || process.env.TREASURY_MNEMONIC;

  if (!process.env.ANCHOR_HMAC_SECRET) {
    // Not fatal — the anchor chain still links, just unsigned. Flag it
    // loudly because integrity status reports this as 'unanchored-mode'.
    logger.error('auditChainAnchor', 'ANCHOR_HMAC_SECRET not set — anchor rows will be unsigned (unanchored-mode)');
  }

  if (!mnemonic) {
    // Degraded mode — persist the intent so verification can distinguish
    // "no anchor yet" from "anchored and contradicted", and scream in the
    // logs: without anchors the chain is only tamper-*evident* internally,
    // not tamper-*proof* against a raw DBA rewrite.
    await createAnchorRow({ anchorDate, headSeq: head.seq, headHash: head.entryHash, memo, status: 'intent' });
    logger.error('auditChainAnchor', 'NO SIGNER CONFIGURED (AUDIT_ANCHOR_MNEMONIC/OPERATOR_MNEMONIC/TREASURY_MNEMONIC) — anchor intent recorded but NOT broadcast; audit chain is not externally anchored', null, {
      headSeq: head.seq,
      headHash: head.entryHash,
    });
    return { ok: false, anchored: false, reason: 'no-signer', headSeq: head.seq };
  }

  let record = null;
  try {
    record = await createAnchorRow({
      anchorDate, headSeq: head.seq, headHash: head.entryHash, memo,
      status: 'pending',
    });
    const result = await broadcastAnchorTx(mnemonic, memo);
    await updateAnchorStatus(record._id, {
      status: 'confirmed', onChainTxHash: result.txHash, blockHeight: Number(result.height), signerAddress: result.signerAddress,
    });
    logger.info('auditChainAnchor', 'anchored audit chain head on-chain', {
      anchorDate, headSeq: head.seq, headHash: head.entryHash, txHash: result.txHash, height: result.height,
    });
    return { ok: true, anchored: true, txHash: result.txHash, headSeq: head.seq, headHash: head.entryHash };
  } catch (err) {
    logger.error('auditChainAnchor', 'anchor broadcast failed — intent kept for retry next run', err, { headSeq: head.seq });
    if (record) {
      await updateAnchorStatus(record._id, { status: 'failed', error: err.message || String(err) }).catch(() => {});
    } else {
      await createAnchorRow({ anchorDate, headSeq: head.seq, headHash: head.entryHash, memo, status: 'failed', error: err.message || String(err) }).catch(() => {});
    }
    return { ok: false, anchored: false, reason: 'broadcast-failed', error: err.message };
  }
}

function start() {
  if (process.env.DISABLE_CRON === '1') {
    logger.info('auditChainAnchor', 'DISABLE_CRON=1 — daily anchoring not scheduled');
    return;
  }
  const schedule = process.env.AUDIT_ANCHOR_CRON || '15 0 * * *'; // daily 00:15 UTC
  cron.schedule(schedule, () => {
    runAuditChainAnchor().catch((err) => logger.error('auditChainAnchor', 'anchor run threw', err));
  }, { timezone: 'UTC' });
  logger.info('auditChainAnchor', 'started', { schedule, denom: ANCHOR_DENOM, amount: ANCHOR_AMOUNT });
}

module.exports = { runAuditChainAnchor, start, anchorMemo, MEMO_PREFIX };
