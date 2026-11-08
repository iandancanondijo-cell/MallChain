/**
 * Receive sessions — a receiver stating the amount they expect to receive.
 *
 * POST   /api/receive/intent            create/replace an active stated-amount
 *                                       intent for a wallet address (auth)
 * GET    /api/receive/intent/active/:address
 *                                       public lookup used by SENDERS before
 *                                       they confirm an amount
 * GET    /api/receive/session/:address  receiver-session view: the active
 *                                       intent plus the latest finished one
 *                                       (satisfied/failed), so the receiving
 *                                       side can see the session outcome
 * POST   /api/receive/intent/cancel     cancel the active intent (auth)
 *
 * Enforcement lives in middleware/receiveIntent.js, wired into the
 * /api/send broadcast relays — this router only manages the declarations.
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validation');
const { createUserLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../utils/errorHandler');
const { decryptField } = require('../utils/fieldEncryption');
const ReceiveIntent = require('../models/receiveIntent');

const ADDRESS_RE = /^mall1[a-z0-9]{38,58}$/;

const writeLimiter = createUserLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: { error: 'rate_limit_exceeded', message: 'Too many receive sessions. Please try again later.' },
});
const readLimiter = createUserLimiter({ windowMs: 5 * 60 * 1000, max: 120, message: { error: 'rate_limit_exceeded' } });

const createIntentSchema = Joi.object({
  // Defaults to the authenticated account's linked wallet when omitted.
  walletAddress: Joi.string().pattern(ADDRESS_RE).optional(),
  amountMlcns: Joi.number().positive().max(1_000_000_000).required()
    .messages({ 'number.positive': 'amountMlcns must be greater than zero' }),
  note: Joi.string().allow('').max(200).optional(),
  ttlMinutes: Joi.number().integer().min(5).max(7 * 24 * 60).default(1440),
});

const cancelSchema = Joi.object({
  walletAddress: Joi.string().pattern(ADDRESS_RE).optional(),
});

/** The account's linked wallet, decrypted (walletAddress is AES at rest). */
function accountWallet(user) {
  const raw = user && user.walletAddress;
  if (!raw) return null;
  try { return decryptField(raw) || null; } catch { return null; }
}

const publicView = (doc) => doc && {
  id: String(doc._id),
  walletAddress: doc.walletAddress,
  amountMlcns: doc.amountMlcns,
  note: doc.note || null,
  status: doc.status,
  expiresAt: doc.expiresAt,
  createdAt: doc.createdAt,
  failure: doc.failure || null,
  attempts: Array.isArray(doc.attempts) ? doc.attempts.slice(-5) : [],
};

router.post('/intent',
  requireAuth(),
  writeLimiter,
  validate(createIntentSchema),
  asyncHandler(async (req, res) => {
    const body = req.validatedBody || req.body;
    const walletAddress = body.walletAddress || accountWallet(req.user);
    if (!walletAddress || !ADDRESS_RE.test(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'no_wallet_address',
        message: 'Provide walletAddress explicitly or link a wallet to this account first.',
      });
    }

    // Replacing an active session: the old one is cancelled, never left
    // ambiguously live (one stated amount per address at a time).
    await ReceiveIntent.updateOne(
      { walletAddress, status: 'active' },
      { $set: { status: 'cancelled' } },
    ).catch(() => {});

    const expiresAt = new Date(Date.now() + (body.ttlMinutes || 1440) * 60 * 1000);
    const intent = await ReceiveIntent.create({
      walletAddress,
      createdBy: req.user._id,
      amountMlcns: body.amountMlcns,
      microAmount: ReceiveIntent.toMicro(body.amountMlcns),
      note: body.note || undefined,
      expiresAt,
    });

    return res.status(201).json({ success: true, intent: publicView(intent) });
  })
);

/** Path params aren't run through validate() (that's body-only) — check the
 *  bech32 shape inline and fail 400 otherwise. */
function validAddressParam(req, res, next) {
  if (!ADDRESS_RE.test(req.params.address || '')) {
    return res.status(400).json({ success: false, error: 'invalid_address', message: 'Invalid Mallchain address format' });
  }
  next();
}

router.get('/intent/active/:address',
  readLimiter,
  validAddressParam,
  asyncHandler(async (req, res) => {
    const intent = await ReceiveIntent.findActive(req.params.address);
    return res.json({ success: true, active: intent ? publicView(intent) : null });
  })
);

router.get('/session/:address',
  readLimiter,
  validAddressParam,
  asyncHandler(async (req, res) => {
    const address = req.params.address;
    const active = await ReceiveIntent.findActive(address);
    // Latest settled session for this address — what the receiver's watch
    // screen shows after a send matched (satisfied) or betrayed (failed)
    // the stated amount. Only meaningful within the last 24h.
    let latest = null;
    if (!active) {
      latest = await ReceiveIntent.findOne({
        walletAddress: address,
        status: { $in: ['satisfied', 'failed'] },
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).sort({ updatedAt: -1 }).lean();
    }
    return res.json({ success: true, active: active ? publicView(active) : null, latest: publicView(latest) });
  })
);

router.post('/intent/cancel',
  requireAuth(),
  writeLimiter,
  validate(cancelSchema),
  asyncHandler(async (req, res) => {
    const body = req.validatedBody || req.body;
    const walletAddress = body.walletAddress || accountWallet(req.user);
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'no_wallet_address' });
    }
    const r = await ReceiveIntent.updateOne(
      { walletAddress, status: 'active' },
      { $set: { status: 'cancelled' } },
    );
    return res.json({ success: true, cancelled: r.modifiedCount > 0 });
  })
);

module.exports = router;
