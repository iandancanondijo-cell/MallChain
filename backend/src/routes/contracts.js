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

const CHAIN_REST = config.chain.rest;
const txLimiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

// A cosmos bech32 account address: prefix, separator, then the data part in
// the charset bech32 allows (which excludes 1, b, i and o). Checked rather
// than decoded because the only thing this route needs the string for is an
// exact-match lookup against a linked wallet.
const ADDRESS_RE = /^[a-z][a-z0-9]{1,78}1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{6,90}$/;

function ok(data) { return { ok: true, data }; }
function fail(err) {
  logger.error('API error', { error: err.message || err, stack: err.stack });
  return { ok: false, error: typeof err === 'string' ? err : 'Invalid request' };
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
      res.status(500).json(fail(e));
    }
  }
);

// GET /api/contracts - List user's contracts
router.get('/', auth, async (req, res) => {
  try {
    const contracts = await Contract.find({ userId: req.user._id }).sort({ deployedAt: -1 }).lean();
    res.json(ok(contracts));
  } catch (e) {
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/deploy - Record a deployed contract. When called with a
// real txHash + on-chain address the record reflects an actual wasm deploy;
// without them a placeholder is generated (legacy simulated path).
router.post('/deploy', auth, preventNoSQLInjection, async (req, res) => {
  try {
    const { name, type, code, description, txHash, address: onChainAddress } = req.body;
    if (!name || !type || !code) {
      return res.status(400).json(fail('name, type, and code are required'));
    }

    const contract = await Contract.create({
      userId: req.user._id,
      name,
      type,
      code,
      description: description || '',
      address: onChainAddress || '0x' + require('crypto').randomBytes(20).toString('hex'),
      txHash: txHash || null,
      txs: 0,
      status: 'active',
    });

    res.json(ok(contract));
  } catch (e) {
    res.status(500).json(fail(e));
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
    res.status(500).json(fail(e));
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
    res.status(500).json(fail(e));
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
      body: `An account shared the contract ${contract.address} with you. Open Smart Contracts to accept or decline it.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'owner' }));
  } catch (e) {
    res.status(500).json(fail(e));
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
      body: `The account you shared ${contract.address} with accepted the offer.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'counterparty' }));
  } catch (e) {
    res.status(500).json(fail(e));
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
      body: `The account you shared ${contract.address} with declined the offer. You can share it with someone else.`,
      data: { contractId: String(contract._id), address: contract.address },
    });

    res.json(ok({ ...contract.toObject(), party: 'counterparty' }));
  } catch (e) {
    res.status(500).json(fail(e));
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
    res.status(500).json(fail(e));
  }
});

// POST /api/contracts/:id/interact - Execute contract function. When called
// with a real txHash the record reflects an actual on-chain execution; without
// it a placeholder hash is generated (legacy simulated path).
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

    const { method, params, txHash: realTxHash } = req.body;
    if (!method) {
      return res.status(400).json(fail('method is required'));
    }

    contract.txs += 1;
    await contract.save();
    const txHash = realTxHash || '0x' + require('crypto').randomBytes(32).toString('hex');

    res.json(ok({
      txHash,
      status: 'success',
      result: { method, params, executed: true, timestamp: new Date().toISOString() }
    }));
  } catch (e) {
    res.status(500).json(fail(e));
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
    res.status(500).json(fail(e));
  }
});

module.exports = router;
