const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { config } = require('../config');
const Contract = require('../models/Contract');
const User = require('../models/user');
const { notify } = require('../services/notificationEngine');
const { blindIndex, decryptField } = require('../utils/fieldEncryption');
const { preventNoSQLInjection, limitPayloadSize } = require('../middleware/inputValidation');
const { createLimiter } = require('../middleware/rateLimiter');
const { respondFailure } = require('../utils/respondFailure');

const CHAIN_REST = config.chain.rest;
// CometBFT's own tx lookup, used when the LCD cannot answer — see verifyOnChainTx.
const CHAIN_RPC = String(config.chain.rpc || 'http://127.0.0.1:26657').replace(/\/$/, '');
const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

// A cosmos bech32 account address: prefix, separator, then the data part in
// the charset bech32 allows (which excludes 1, b, i and o). Checked rather
// than decoded because the only thing this route needs the string for is an
// exact-match lookup against a linked wallet.
const ADDRESS_RE = /^[a-z][a-z0-9]{1,78}1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,90}$/;

// A Cosmos SDK transaction hash: the 64 hex characters the node reports, with
// or without an 0x prefix. Checked so the two record-keeping routes below can
// tell "the client brought a real broadcast result" apart from anything else —
// the point of this file is that nothing that was never on the chain gets
// stored or returned as if it had been.
const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/;

/**
 * Trim a caller-supplied chain value down to either a usable truth or null.
 * Empty strings and absent fields are the same case: nothing was broadcast, so
 * nothing is recorded. Anything else is format-checked rather than trusted —
 * a malformed value is refused instead of quietly persisted and shown to the
 * user as an address or receipt.
 *
 * @param {unknown} raw
 * @param {RegExp} shape
 * @param {string} label
 * @returns {{ ok: boolean, value: string | null, error?: string }}
 */
function chainValue(raw, shape, label) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, value: null, error: `${label} must be a string` };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!shape.test(trimmed)) return { ok: false, value: null, error: `${label} is not a valid ${label} — supply the value the chain returned, or omit it` };
  return { ok: true, value: trimmed };
}

/**
 * Ask the node, in one of the two ways it can answer, whether a transaction
 * really sits on this chain.
 *
 * @returns {{state:'found', height: string, code: number|string, events: Array, hash?: string}
 *          | {state:'not_found'}
 *          | {state:'error', error: string}}
 */
async function lookupViaRest(hash) {
  const url = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs/${encodeURIComponent(hash)}`;
  try {
    const r = await axios.get(url, { timeout: 10000 });
    const tx = r.data?.tx_response ?? r.data;
    if (!tx || (tx.height === undefined && tx.code === undefined)) return { state: 'not_found' };
    return {
      state: 'found',
      hash: tx.txhash,
      height: String(tx.height ?? ''),
      code: tx.code ?? 0,
      events: Array.isArray(tx.events) ? tx.events : [],
    };
  } catch (e) {
    // 404/400 is the LCD answering "I have no such transaction". Anything else
    // — connection refused, timeout, 5xx, a body it could not decode — is the
    // node not answering, which must never be read as the transaction not
    // existing.
    const status = e?.response?.status;
    if (status === 404 || status === 400) return { state: 'not_found' };
    return { state: 'error', error: e?.message || 'LCD unreachable' };
  }
}

async function lookupViaRpc(hash) {
  const url = `${CHAIN_RPC}/tx?hash=0x${encodeURIComponent(hash)}`;
  try {
    const r = await axios.get(url, { timeout: 10000 });
    const result = r.data?.result;
    if (result) {
      const res = result.tx_result || {};
      return {
        state: 'found',
        height: String(result.height ?? ''),
        code: res.code ?? 0,
        // CometBFT hands event attribute values back base64-encoded, the same
        // shape the LCD uses, so one reader works for both.
        events: Array.isArray(res.events) ? res.events : [],
      };
    }
    const detail = String(r.data?.error?.data || r.data?.error?.message || '');
    // An unindexed or pruned transaction is reported by CometBFT as an RPC
    // error whose text says it is not found — that is an answer, not a fault.
    if (/not found/i.test(detail)) return { state: 'not_found' };
    return { state: 'error', error: detail || 'RPC returned no transaction' };
  } catch (e) {
    return { state: 'error', error: e?.message || 'RPC unreachable' };
  }
}

/**
 * Ask the node whether a transaction hash is really on this chain.
 *
 * Four answers, deliberately not collapsed into a boolean: a hash that is
 * included and succeeded is the only one worth counting; one that is included
 * but failed (code !== 0) is a fact about the chain the caller needs to see;
 * one that is simply not there means the claim was never a transaction; and a
 * node that will not answer is not evidence that a transaction did not happen,
 * so it must not be reported as a rejected claim.
 *
 * Two lookups, tried in order, because this chain's LCD cannot decode every
 * message type (services/mallcoinTxBuilder.js:71 documents the nil-pointer
 * panic, and services/explorerService.js:219 works around it the same way):
 * the LCD's GetTx first, since it gives the transaction's events — which is
 * where an instantiated contract address comes from — then CometBFT's /tx?hash=
 * when the LCD faults rather than answering. A wasm instantiate is a standard
 * x/wasm message the LCD does decode, so the events path normally comes from
 * the first lookup; the second is what stops an unrelated custom-tx panic from
 * refusing a real deployment.
 *
 * @param {string} hash
 * @returns {Promise<{status: 'confirmed', height: string, events: Array} | {status: 'failed', code: number|string} | {status: 'absent'} | {status: 'unreachable', error: string}>}
 */
async function verifyOnChainTx(hash) {
  const wanted = hash.replace(/^0x/i, '').toUpperCase();
  const rest = await lookupViaRest(wanted);
  const rpc = rest.state === 'found' ? null : await lookupViaRpc(wanted);
  const seen = rest.state === 'found' ? rest : (rpc?.state === 'found' ? rpc : null);

  if (!seen) {
    if (rest.state === 'error' || rpc?.state === 'error') {
      const error = rpc?.error || rest.error;
      logger.warn('Contract tx verification unreachable', { hash: wanted, error });
      return { status: 'unreachable', error };
    }
    return { status: 'absent' };
  }

  // Strip an optional 0x before comparing: cosmos-sdk LCDs report upper case
  // without a prefix, but a client that pasted a prefixed hash should still get
  // credit for the transaction it really broadcast.
  if (rest.state === 'found' && seen.hash) {
    const reportedHash = String(seen.hash).replace(/^0x/i, '').toUpperCase();
    if (reportedHash && reportedHash !== wanted) {
      // The node answered with a different transaction than the one asked for —
      // never record against a hash the chain does not associate with this tx.
      logger.warn('Contract tx hash mismatch', { asked: wanted, returned: seen.hash });
      return { status: 'absent' };
    }
  }
  if (Number(seen.code) !== 0) return { status: 'failed', code: seen.code };
  return { status: 'confirmed', height: seen.height, events: seen.events };
}

/**
 * Read an attribute off a confirmed transaction's events, decoding the base64
 * the LCD hands back. x/wasm puts the instantiated contract address on an
 * 'instantiate' (older SDK: 'wasm') event under '_contract_address', so that —
 * not whatever the browser claimed — is where this router learns an address.
 */
function eventAttr(events, eventType, attrKey) {
  for (const ev of events || []) {
    if (ev.type !== eventType) continue;
    for (const attr of ev.attributes || []) {
      if (attr.key !== attrKey) continue;
      try {
        const decoded = Buffer.from(String(attr.value), 'base64').toString('utf8');
        // LCD sometimes hands the value back already decoded; control
        // characters mean the base64 round trip produced garbage, not a bech32
        // address, so fall through to the raw string in that case only.
        // eslint-disable-next-line no-control-regex
        return /[\x00-\x08\x0e-\x1f]/.test(decoded) ? String(attr.value) : decoded;
      } catch {
        return String(attr.value);
      }
    }
  }
  return null;
}

/**
 * How a contract is named in prose a person reads. A record whose deployment was
 * never broadcast has no address, and saying so is the point — these
 * notification bodies used to interpolate the raw field, so they would read
 * "shared the contract null with you".
 */
function addressLabel(contract) {
  return contract.address || `${contract.name} (no on-chain deployment yet)`;
}

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
}

/**
 * Answer a request that this router can tell is wrong before it touches
 * anything: a claim that is not a transaction hash, a deployment the chain
 * rejected, an offer with no hash behind it.
 *
 * These are the caller's mistakes, not the API's, so they log at warn — see
 * utils/respondFailure.js on why naming a client error at error level turns a
 * scraper probing the route into an alert storm and eats the 5xx budget the
 * admin health panels read.
 */
function reject(res, status, message, context) {
  logger.warn('contracts request refused', { statusCode: status, message, ...(context || {}) });
  return res.status(status).json({ ok: false, error: message });
}

/**
 * The contract a caller may act on, plus which side of the share they are on.
 * 'owner' can deploy, share and revoke; 'counterparty' can only respond to an
 * offer, and may record executions once they have accepted it. Anyone else
 * gets null, and the route answers 403 — a shared contract is still not
 * public.
 */
async function partyFor(contractId, userId) {
  const contract = await Contract.findById(contractId);
  if (!contract) return { contract: null, party: null };
  if (String(contract.userId) === String(userId)) return { contract, party: 'owner' };
  if (contract.counterpartyUserId && String(contract.counterpartyUserId) === String(userId)) {
    return { contract, party: 'counterparty' };
  }
  return { contract, party: null };
}

// POST /api/contracts/broadcast - Relay a client-signed wasm tx to the chain
router.post('/broadcast',
  auth,
  txLimiter,
  limitPayloadSize(2),
  preventNoSQLInjection,
  async (req, res) => {
    try {
      const { txBytes, mode } = req.body || {};
      if (!txBytes) {
        return res.status(400).json(fail('tx_bytes_required'));
      }
      const broadcastUrl = `${CHAIN_REST.replace(/\/$/, '')}/cosmos/tx/v1beta1/txs`;
      const r = await axios.post(
        broadcastUrl,
        { tx_bytes: txBytes, mode: mode || 'BROADCAST_MODE_SYNC' },
        { timeout: 10000 }
      );
      const txResp = r.data?.tx_response || r.data;
      const code = txResp?.code ?? 0;
      if (code !== 0) {
        return res.status(400).json({ ok: false, error: txResp?.raw_log || 'tx_failed', txResponse: txResp });
      }
      return res.json(ok({
        txHash: txResp?.txhash || txResp?.txHash,
        txResponse: txResp,
      }));
    } catch (e) {
      respondFailure(res, e, fail);
    }
  }
);

// GET /api/contracts - List user's contracts
router.get('/', auth, async (req, res) => {
  try {
    const contracts = await Contract.find({ userId: req.user._id }).sort({ deployedAt: -1 }).lean();
    res.json(ok(contracts));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/deploy - Record a contract the client deployed.
//
// With a MsgInstantiateContract hash the route asks the node for that
// transaction and takes the contract address from the chain's own
// '_contract_address' event, so neither value is something the caller asserted.
// Without a hash it stores the metadata with a null address and null txHash:
// a real record of a real draft, and nothing that could be mistaken for a
// deployed contract. It used to invent a 0x… address in that case, which was
// indistinguishable from a genuine one wherever it was displayed.
router.post('/deploy', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { name, type, code, description, txHash, address: claimedAddress } = req.body;
    if (!name || !type || !code) {
      return reject(res, 400, 'name, type, and code are required');
    }

    const claimed = chainValue(claimedAddress, ADDRESS_RE, 'contract address');
    if (!claimed.ok) return reject(res, 400, claimed.error);
    const instantiateTx = chainValue(txHash, TX_HASH_RE, 'transaction hash');
    if (!instantiateTx.ok) return reject(res, 400, instantiateTx.error);

    let address = claimed.value;
    if (instantiateTx.value) {
      const seen = await verifyOnChainTx(instantiateTx.value);
      if (seen.status === 'unreachable') {
        return reject(res, 503, 'the node could not be reached to verify that deployment — nothing was recorded, retry once the chain is readable', { reason: 'node_unreachable', txHash: instantiateTx.value });
      }
      if (seen.status === 'absent') {
        return reject(res, 400, 'the node does not have that instantiation transaction — nothing was recorded. A deployment can only be verified while its transaction is still queryable, so record it right after it broadcasts.', { reason: 'tx_absent', txHash: instantiateTx.value });
      }
      if (seen.status === 'failed') {
        return reject(res, 400, `that instantiation failed on-chain (code ${seen.code}) — nothing was recorded`, { reason: 'tx_failed', txHash: instantiateTx.value, code: seen.code });
      }
      const fromChain = eventAttr(seen.events, 'instantiate', '_contract_address')
        || eventAttr(seen.events, 'wasm', '_contract_address');
      if (fromChain && ADDRESS_RE.test(fromChain)) {
        if (claimed.value && claimed.value !== fromChain) {
          logger.warn('Deploy address claim corrected from the chain', { claimed: claimed.value, fromChain });
        }
        address = fromChain;
      }
      // No readable event: keep a shape-valid claim if there was one, otherwise
      // leave the address null rather than guessing.
    }

    const contract = await Contract.create({
      userId: req.user._id,
      name,
      type,
      code,
      description: description || '',
      address,
      txHash: instantiateTx.value,
      txs: 0,
      status: 'active',
    });

    res.json(ok(contract));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/contracts/offers - Contracts other users have shared with the
// wallet this account has linked, newest first. Reads the record only; the
// counterparty still has to accept before anything can be executed.
router.get('/offers', auth, async (req, res) => {
  try {
    const found = await Contract.find({ counterpartyUserId: req.user._id })
      .sort({ offeredAt: -1 })
      .lean();
    // The counterparty needs to know who is asking, and an ObjectId is not
    // something to print for a person. Wallet addresses are stored encrypted,
    // so each owner is read by id and decrypted here.
    const ownerIds = [...new Set(found.map((c) => String(c.userId)))];
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } }).select('_id walletAddress').lean()
      : [];
    const addressByOwner = new Map(owners.map((u) => [String(u._id), decryptField(u.walletAddress) || '']));
    res.json(ok(found.map((c) => ({ ...c, ownerAddress: addressByOwner.get(String(c.userId)) || '' }))));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// GET /api/contracts/:id - Get contract details. The owner and the account a
// contract was shared with can read it; sharing does not make it public.
router.get('/:id', auth, async (req, res) => {
  try {
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    if (!party) {
      return res.status(403).json(fail('Access denied'));
    }
    res.json(ok({ ...contract.toObject(), party }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/:id/share - Offer this contract to one other account,
// named by the wallet address the owner types. The address has to belong to a
// registered account that has it linked, because acceptance is recorded against
// that account, not against a string.
router.post('/:id/share', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { address: counterpartyAddress, note } = req.body || {};
    if (!counterpartyAddress || typeof counterpartyAddress !== 'string') {
      return res.status(400).json(fail('counterparty_address_required'));
    }
    if (!ADDRESS_RE.test(counterpartyAddress)) {
      return res.status(400).json(fail('that is not a valid Mallchain wallet address'));
    }
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) return res.status(404).json(fail('Contract not found'));
    if (party !== 'owner') return res.status(403).json(fail('Only the account that deployed this contract can share it'));

    const counterparty = await User.findOne({ walletAddress_blind: blindIndex(counterpartyAddress) })
      .select('_id')
      .lean();
    if (!counterparty) {
      return res.status(400).json(fail('no Mallchain account has that wallet address linked'));
    }
    if (String(counterparty._id) === String(req.user._id)) {
      return res.status(400).json(fail('cannot share a contract with your own account'));
    }
    if (contract.offerStatus === 'accepted') {
      return res.status(409).json(fail('this contract is already accepted — sharing it again would overwrite that'));
    }

    contract.counterpartyAddress = counterpartyAddress;
    contract.counterpartyUserId = counterparty._id;
    contract.offerStatus = 'offered';
    contract.offerNote = typeof note === 'string' ? note.slice(0, 500) : '';
    contract.offeredAt = new Date();
    contract.respondedAt = null;
    await contract.save();

    await notify(counterparty._id, {
      kind: 'system',
      title: `Contract offer: ${contract.name}`,
      body: `An account shared the contract ${addressLabel(contract)} with you. Open Smart Contracts to accept or decline it.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'owner' }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/:id/accept - The named counterparty agrees to the offer.
// Acceptance is a Mallchain-side record: it says who took on the contract and
// when. It does not send a transaction, so the contract's own on-chain state
// is exactly what it was before the click.
router.post('/:id/accept', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) return res.status(404).json(fail('Contract not found'));
    if (party !== 'counterparty') {
      return res.status(403).json(fail('Only the account this contract was shared with can accept it'));
    }
    if (contract.offerStatus !== 'offered') {
      return res.status(409).json(fail(`this offer is ${contract.offerStatus || 'no longer open'}, so there is nothing to accept`));
    }

    contract.offerStatus = 'accepted';
    contract.respondedAt = new Date();
    await contract.save();

    await notify(contract.userId, {
      kind: 'system',
      title: `Contract accepted: ${contract.name}`,
      body: `The account you shared ${addressLabel(contract)} with accepted the offer.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'counterparty' }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/:id/decline - Same scope as accept; the owner is told
// that the offer was turned down rather than left to sit.
router.post('/:id/decline', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) return res.status(404).json(fail('Contract not found'));
    if (party !== 'counterparty') {
      return res.status(403).json(fail('Only the account this contract was shared with can decline it'));
    }
    if (contract.offerStatus !== 'offered') {
      return res.status(409).json(fail(`this offer is ${contract.offerStatus || 'no longer open'}, so there is nothing to decline`));
    }

    contract.offerStatus = 'declined';
    contract.respondedAt = new Date();
    await contract.save();

    await notify(contract.userId, {
      kind: 'system',
      title: `Contract declined: ${contract.name}`,
      body: `The account you shared ${addressLabel(contract)} with declined the offer. You can share it with someone else.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'counterparty' }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/:id/revoke - The owner withdraws an open offer. Once the
// counterparty has answered there is nothing to withdraw.
router.post('/:id/revoke', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) return res.status(404).json(fail('Contract not found'));
    if (party !== 'owner') return res.status(403).json(fail('Only the account that deployed this contract can revoke the offer'));
    if (contract.offerStatus !== 'offered') {
      return res.status(409).json(fail('there is no open offer on this contract'));
    }

    contract.offerStatus = 'revoked';
    contract.respondedAt = new Date();
    await contract.save();

    res.json(ok({ ...contract.toObject(), party: 'owner' }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// POST /api/contracts/:id/interact - Record an execution the client broadcast.
// The SPA signs and submits the MsgExecuteContract itself (services/wasmTx.ts),
// then reports the hash here. The hash is verified against the node before the
// contract's execution count moves, because this record is what the app shows
// as proof that something happened on-chain — and until this route existed the
// record was written first and the "hash" invented afterwards.
router.post('/:id/interact', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { contract, party } = await partyFor(req.params.id, req.user._id);
    if (!contract) {
      return res.status(404).json(fail('Contract not found'));
    }
    // The counterparty may only execute once they have accepted: an offer they
    // have not answered is not permission to spend gas against it.
    const allowed = party === 'owner' || (party === 'counterparty' && contract.offerStatus === 'accepted');
    if (!allowed) {
      return res.status(403).json(fail('Access denied'));
    }

    const { method, params, txHash: reportedTxHash } = req.body;
    if (!method) {
      return res.status(400).json(fail('method is required'));
    }

    const reported = chainValue(reportedTxHash, TX_HASH_RE, 'transaction hash');
    if (!reported.ok) return reject(res, 400, reported.error);

    // No hash at all: nothing was broadcast, so nothing is counted and nothing
    // is claimed. This is a bookkeeping endpoint, not a simulator — a request
    // that arrives without a transaction is answered with an explicit "no
    // execution happened" instead of a generated receipt.
    if (!reported.value) {
      return res.json(ok({
        txHash: null,
        status: 'not_broadcast',
        result: {
          method,
          params,
          executed: false,
          verified: false,
          timestamp: new Date().toISOString(),
        },
      }));
    }

    const seen = await verifyOnChainTx(reported.value);
    if (seen.status === 'unreachable') {
      return reject(res, 503, 'the node could not be reached to verify that transaction — nothing was recorded, retry once the chain is readable', { reason: 'node_unreachable', txHash: reported.value });
    }
    if (seen.status === 'absent') {
      return reject(res, 400, 'the node does not have that transaction — nothing was recorded. An execution can only be verified while its transaction is still queryable, so record it right after it broadcasts.', { reason: 'tx_absent', txHash: reported.value });
    }
    if (seen.status === 'failed') {
      return reject(res, 400, `that transaction was included but failed on-chain (code ${seen.code}) — nothing was recorded`, { reason: 'tx_failed', txHash: reported.value, code: seen.code });
    }

    contract.txs += 1;
    await contract.save();

    res.json(ok({
      txHash: reported.value,
      status: 'recorded',
      result: {
        method,
        params,
        executed: true,
        verified: true,
        height: seen.height,
        timestamp: new Date().toISOString(),
      },
    }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

// DELETE /api/contracts/:id - Delete contract
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await Contract.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!result) {
      return res.status(404).json(fail('Contract not found'));
    }
    res.json(ok({ deleted: true }));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

module.exports = router;
