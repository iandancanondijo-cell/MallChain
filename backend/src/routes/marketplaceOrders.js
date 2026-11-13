/**
 * Buyer order records — the account-side receipt for a purchase that settled
 * through x/marketplace escrow.
 *
 * This closes the last piece of the storefront that only existed inside one
 * browser. Escrow settlement was always real and on-chain
 * (routes/marketplace.js + controllers/marketplaceEscrowController.js), but the
 * order list itself was `st.marketplace.orders` in localStorage with a
 * client-minted `ord-…` id, so a buyer's purchase history did not survive
 * switching devices. Here the id is issued by the server, one document per
 * settled purchase, tied to the session's account.
 *
 * The escrow is the source of truth for the money. When
 * `POST /` is given an `escrowId` and the node answers, the record stores the
 * escrow's own buyer, seller, amount and description and rejects the request
 * if any of those disagree with what the client claimed — an order can never
 * state a different amount than the coins actually locked. If the node is
 * unreachable the claim is still recorded (a buyer should not lose the
 * receipt because of an RPC outage) but flagged `escrowVerified: false`.
 *
 * Shipping `status` is an off-chain workflow label. Moving funds is only ever
 * done by MsgReleaseFunds / MsgOpenDispute signed by the buyer, which the
 * storefront submits through /api/marketplace/escrow/broadcast; this route
 * records the tx hash those broadcasts return. There is no path here that
 * moves coins, and 'cancelled' is moderation-only because the chain's refund
 * half (MsgRefundBuyer) must be signed by the seller's key.
 */
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const Joi = require('joi');

const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { requireCategory } = require('../middleware/categoryAccess');
const { limiters } = require('../middleware/rateLimiter');
const MarketplaceOrder = require('../models/MarketplaceOrder');
const User = require('../models/user');
const { config } = require('../config');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');

const router = express.Router();
const CHAIN_REST = config.chain.rest.replace(/\/$/, '');
const ADDRESS_RE = MarketplaceOrder.ADDRESS_RE;

// The chain's native denom has 6 decimals; a listing price is a MAL amount.
// Every comparison below is done in integer micro-units so float drift can
// never turn a correct order into a rejected one (or vice versa).
const MICRO = 1_000_000;
const toMicro = (amount) => Math.round(Number(amount) * MICRO);
const MAX_PAGE_SIZE = 50;

/**
 * How long an identical receipt from the same account counts as the *same*
 * purchase rather than a second one. Needed because a checkout whose escrow
 * broadcast failed — or whose escrow id we were never given — has no chain
 * reference to be deduped by, and a double-clicked "Place order" used to write
 * two orders for one purchase. Past the window, buying the same thing twice is
 * a genuine repeat purchase and gets its own row.
 */
const RECEIPT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Canonical fingerprint of what was bought: buyer, seller, sorted lines,
 * total and description. Order of the lines does not matter — the same basket
 * enumerated differently is still the same receipt.
 */
function receiptFingerprint({ buyerAddress, sellerAddress, items, total, description }) {
  const lines = [...items]
    .map((i) => `${i.listingId || ''}|${i.name}|${i.qty}|${i.price}`)
    .sort()
    .join(';');
  return crypto
    .createHash('sha256')
    .update([buyerAddress, sellerAddress, lines, total, description || ''].join('|'))
    .digest('hex');
}

const itemSchema = Joi.object({
  listingId: Joi.string().trim().allow('').max(64).default(''),
  name: Joi.string().trim().min(1).max(120).required(),
  qty: Joi.number().integer().min(1).max(999).default(1),
  price: Joi.number().min(0).max(1e9).required(),
});

const createSchema = Joi.object({
  // Optional: when the account has a linked wallet that is what must have
  // signed MsgCreateEscrow, so a body address is only trusted if it agrees.
  buyerAddress: Joi.string().trim().pattern(ADDRESS_RE).allow(''),
  sellerAddress: Joi.string().trim().pattern(ADDRESS_RE).required(),
  escrowId: Joi.string().trim().max(64).allow(''),
  createTxHash: Joi.string().trim().max(128).allow(''),
  items: Joi.array().items(itemSchema).min(1).max(60).required(),
  total: Joi.number().min(0).max(1e9).required(),
  description: Joi.string().trim().allow('').max(200).default(''),
});

// Only forward moves, and 'delivered' additionally requires the release hash
// (see updateOrder) — the label may never claim funds reached the seller when
// no MsgReleaseFunds exists.
const TRANSITIONS = {
  processing: ['shipped', 'disputed'],
  shipped: ['transit', 'disputed'],
  transit: ['delivered', 'disputed'],
  disputed: ['cancelled'],
  delivered: [],
  cancelled: [],
};

function toPublicOrder(doc) {
  const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : null;
  return {
    // The storefront's order key. Server-issued and stable across devices —
    // this is the id a buyer quotes, never the Mongo _id.
    id: doc.orderNumber,
    orderNumber: doc.orderNumber,
    items: (doc.items || []).map((i) => ({
      listingId: i.listingId || '',
      name: i.name,
      qty: i.qty,
      price: i.price,
    })),
    // Flat name list, because the receipt rows and the notification copy read
    // this and the client's order shape already carries it.
    itemNames: (doc.items || []).map((i) => i.name),
    total: doc.total,
    amountBaseUnits: doc.amountBaseUnits,
    denom: doc.denom,
    currency: { denom: doc.denom, display: 'MAL', decimals: 6 },
    status: doc.status,
    buyerAddress: doc.buyerAddress,
    sellerAddress: doc.sellerAddress,
    escrowId: doc.escrowId || '',
    createTxHash: doc.createTxHash || '',
    releaseTxHash: doc.releaseTxHash || '',
    disputeTxHash: doc.disputeTxHash || '',
    // Honest provenance: false = the node could not be consulted when this was
    // written, so the amounts are the buyer's claim. The UI says so out loud.
    escrowVerified: Boolean(doc.escrowVerified),
    description: doc.description || '',
    disputeWindowSeconds: doc.disputeWindowSeconds || 0,
    createdAt,
    // Epoch millis as well, so a client can sort/merge against its own local
    // timestamps without parsing an ISO string.
    ts: doc.createdAt ? new Date(doc.createdAt).getTime() : 0,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

function userIdOf(user) {
  return String(user?._id || user?.id || '');
}

/**
 * Ask x/marketplace for the escrow this order claims to settle.
 *
 * A node that cannot answer must never be reported as "that escrow does not
 * exist" — the buyer would be rejected for a fault of ours. Three outcomes,
 * deliberately distinct:
 *   found      → the chain's own record
 *   not_found  → no such escrow (reject: a receipt for nothing)
 *   unreachable→ could not ask, or would not answer (record unverified)
 *
 * The "would not answer" case is not hypothetical: an older `marketplaced`
 * binary serves HTTP 200 with a grpc status body (`{"code":12,"message":"Not
 * Implemented"}`) for queries it never registered, so a 2xx here still has to
 * be checked for the envelope before it is read as data.
 */
function isGrpcStatusBody(payload) {
  return Boolean(payload)
    && typeof payload === 'object'
    && payload.escrow == null
    && payload.escrows == null
    && Number.isFinite(payload.code)
    && typeof payload.message === 'string';
}

async function lookupEscrow(escrowId) {
  try {
    const { data } = await axios.get(
      `${CHAIN_REST}/marketplace/marketplace/v1/escrow/${encodeURIComponent(escrowId)}`,
      { timeout: 8000 }
    );
    if (isGrpcStatusBody(data)) return { state: 'unreachable', message: data.message };
    const escrow = data?.escrow || data;
    if (escrow && (escrow.id || escrow.buyer || escrow.seller)) return { state: 'found', escrow };
    return { state: 'not_found' };
  } catch (e) {
    const message = e.response?.data?.message || e.message || '';
    return { state: /not found/i.test(message) ? 'not_found' : 'unreachable', message };
  }
}

function isAdminModerator(user) {
  return user?.role === 'superadmin'
    || (user?.role === 'admin' && user?.adminCategory === 'marketplace');
}

function canModerate(user, order) {
  if (!user) return false;
  if (isAdminModerator(user)) return true;
  return order.userId === userIdOf(user);
}

// GET /api/marketplace/orders — the signed-in buyer's own orders, newest first.
// Never public: a receipt names an account's purchases and its counterparties.
router.get('/', auth, limiters.standard, asyncHandler(async (req, res) => {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const filter = { userId: userIdOf(req.user) };
  const status = String(req.query.status || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TRANSITIONS, status)) filter.status = status;

  const [orders, total] = await Promise.all([
    MarketplaceOrder.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    MarketplaceOrder.countDocuments(filter),
  ]);

  res.json({
    ok: true,
    orders: orders.map(toPublicOrder),
    total,
    limit,
    statuses: Object.keys(TRANSITIONS),
    currency: { denom: 'stake', display: 'MAL', decimals: 6 },
  });
}));

// GET /api/marketplace/orders/manage — the marketplace admin window's view:
// every buyer's order, regardless of account. Must stay above /:id or
// "manage" is read as an order number and answers 404.
router.get('/manage', auth, requireAdmin, requireCategory('marketplace'), limiters.standard,
  asyncHandler(async (req, res) => {
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = {};
    const status = String(req.query.status || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(TRANSITIONS, status)) filter.status = status;

    const [orders, total] = await Promise.all([
      MarketplaceOrder.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      MarketplaceOrder.countDocuments(filter),
    ]);

    // A census of the whole ledger, not of this page, so the window's stat
    // cards cannot disagree with a filtered view.
    const counts = {};
    await Promise.all(Object.keys(TRANSITIONS).map(async (s) => {
      counts[s] = await MarketplaceOrder.countDocuments({ status: s });
    }));

    res.json({ ok: true, orders: orders.map(toPublicOrder), total, limit, counts });
  }));

// GET /api/marketplace/orders/:id — one order by its server-issued order number.
router.get('/:id', auth, limiters.standard, asyncHandler(async (req, res) => {
  const order = await MarketplaceOrder.findOne({ orderNumber: req.params.id }).lean();
  if (!order) throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found', 404);
  if (order.userId !== userIdOf(req.user) && !isAdminModerator(req.user)) {
    // Same answer as "not found": a stranger's order number must not be
    // confirmable as existing through this route.
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found', 404);
  }
  res.json({ ok: true, order: toPublicOrder(order) });
}));

/**
 * POST /api/marketplace/orders — record a purchase the caller just settled.
 *
 * Called after MsgCreateEscrow confirmed, from the storefront's checkout. Three
 * idempotency layers, because a buyer double-clicking "Checkout" or a reload
 * between the broadcast and this call must not create two receipts:
 *  - an existing order for the same createTxHash (or the same escrowId) is
 *    returned as-is with `created: false`;
 *  - a receipt with neither (the broadcast failed, or returned no references)
 *    is matched by its own fingerprint within RECEIPT_DEDUPE_WINDOW_MS;
 *  - the escrow cross-check below would otherwise be the only guard.
 */
router.post('/', auth, limiters.standard, asyncHandler(async (req, res) => {
  const { error, value } = createSchema.validate(req.body || {});
  if (error) throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, error.details[0].message, 400);

  const plain = User.decryptUserPii(req.user);
  const linkedWallet = plain?.walletAddress || '';
  if (linkedWallet && !ADDRESS_RE.test(linkedWallet)) {
    throw new AppError(ErrorCodes.INVALID_ADDRESS, 'The wallet linked to this account is not a valid address', 400);
  }

  const buyerAddress = String(value.buyerAddress || '').trim() || linkedWallet;
  if (!ADDRESS_RE.test(buyerAddress)) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      'Link a wallet to your account before ordering — escrow is signed by your account address',
      403
    );
  }
  if (linkedWallet && buyerAddress !== linkedWallet) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      `MsgCreateEscrow must be signed by the wallet linked to this account (${linkedWallet})`,
      403
    );
  }

  // Client-side arithmetic, in integers: the receipt must add up before the
  // chain is consulted, so a wrong `total` is reported as the client bug it is.
  const itemsMicro = value.items.reduce((acc, i) => acc + toMicro(i.price) * i.qty, 0);
  const totalMicro = toMicro(value.total);
  if (Math.abs(itemsMicro - totalMicro) > 1) {
    throw new AppError(
      ErrorCodes.INVALID_AMOUNT,
      `total ${value.total} does not match the line items (${itemsMicro / MICRO} MAL for the items sent)`,
      400
    );
  }

  const escrowId = String(value.escrowId || '').trim();
  const receiptHash = receiptFingerprint({
    buyerAddress,
    sellerAddress: value.sellerAddress,
    items: value.items,
    total: value.total,
    description: value.description,
  });
  if (escrowId) {
    const existingByEscrow = await MarketplaceOrder.findOne({ escrowId }).lean();
    if (existingByEscrow) {
      return res.status(200).json({ ok: true, created: false, order: toPublicOrder(existingByEscrow) });
    }
  }
  if (value.createTxHash) {
    const existingByTx = await MarketplaceOrder.findOne({ createTxHash: value.createTxHash }).lean();
    if (existingByTx) {
      return res.status(200).json({ ok: true, created: false, order: toPublicOrder(existingByTx) });
    }
  }
  // No chain reference to match on (the escrow broadcast failed, or never
  // reported an id): fall back to the receipt's own fingerprint, but only
  // inside the dedupe window so a deliberate repeat purchase stays separate.
  const existingByReceipt = await MarketplaceOrder.findOne({
    userId: userIdOf(req.user),
    receiptHash,
    createdAt: { $gte: new Date(Date.now() - RECEIPT_DEDUPE_WINDOW_MS) },
  }).lean();
  if (existingByReceipt) {
    return res.status(200).json({ ok: true, created: false, order: toPublicOrder(existingByReceipt) });
  }

  // Chain half of the contract: what x/marketplace actually holds.
  let escrow = null;
  let escrowState = 'unreachable';
  if (escrowId) {
    const result = await lookupEscrow(escrowId);
    escrowState = result.state;
    escrow = result.escrow || null;
    if (escrowState === 'not_found') {
      throw new AppError(
        ErrorCodes.NOT_FOUND,
        `Escrow ${escrowId} does not exist on-chain — nothing is held for this order`,
        404
      );
    }
  }

  if (escrowState === 'found') {
    if (escrow.buyer && escrow.buyer !== buyerAddress) {
      throw new AppError(
        ErrorCodes.INSUFFICIENT_PERMISSIONS,
        `That escrow was created by ${escrow.buyer}, not by this wallet`,
        403
      );
    }
    if (escrow.seller && escrow.seller !== value.sellerAddress) {
      throw new AppError(
        ErrorCodes.INVALID_REQUEST_FORMAT,
        `Escrow ${escrowId} pays ${escrow.seller}, not the seller in this order`,
        400
      );
    }
    const held = Number(escrow.amount ?? escrow.lockedFunds ?? 0);
    if (Number.isFinite(held) && held !== totalMicro) {
      throw new AppError(
        ErrorCodes.INVALID_AMOUNT,
        `Escrow ${escrowId} holds ${held / MICRO} MAL, this order states ${value.total} MAL`,
        400
      );
    }
  }

  // Amount stored is the chain's when known, the buyer's claim otherwise — and
  // escrowVerified says which, so nothing downstream has to guess.
  const amountBaseUnits = escrowState === 'found'
    ? String(Number(escrow.amount ?? escrow.lockedFunds ?? totalMicro) || totalMicro)
    : String(totalMicro);
  const storedMicro = Number(amountBaseUnits);

  const orderNumber = await MarketplaceOrder.mintOrderNumber();
  const created = await MarketplaceOrder.create({
    orderNumber,
    userId: userIdOf(req.user),
    buyerAddress: escrow?.buyer || buyerAddress,
    sellerAddress: escrow?.seller || value.sellerAddress,
    escrowId,
    createTxHash: escrow?.createTxHash || value.createTxHash || '',
    items: value.items,
    total: storedMicro / MICRO,
    amountBaseUnits,
    denom: escrow?.denom || 'stake',
    description: escrow?.description || value.description || '',
    disputeWindowSeconds: Number(escrow?.disputeWindow || escrow?.dispute_window || 0) || 0,
    escrowCreatedAt: Number(escrow?.createdAt || escrow?.created_at || 0) || 0,
    escrowVerified: escrowState === 'found',
    // Stored so a retry of this same receipt can be recognised even when it
    // carries no escrow id or tx hash to match on.
    receiptHash,
    status: 'processing',
  });

  res.status(201).json({ ok: true, created: true, order: toPublicOrder(created.toObject()) });
}));

/**
 * PATCH /api/marketplace/orders/:id — advance the workflow label and attach the
 * tx hash of the on-chain action that justified it.
 *
 * Owned by the buyer; a marketplace admin or superadmin may also move an order
 * (that is the moderation path to 'cancelled'). Status may only follow
 * TRANSITIONS, and reaching 'delivered' requires a releaseTxHash, because the
 * only thing that makes a delivery real on this platform is MsgReleaseFunds.
 */
router.patch('/:id', auth, limiters.standard, asyncHandler(async (req, res) => {
  const order = await MarketplaceOrder.findOne({ orderNumber: req.params.id });
  if (!order) throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found', 404);
  if (!canModerate(req.user, order)) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Order not found', 404);
  }

  const schema = Joi.object({
    status: Joi.string().trim().lowercase().valid(...Object.keys(TRANSITIONS)).required(),
    releaseTxHash: Joi.string().trim().max(128).allow(''),
    disputeTxHash: Joi.string().trim().max(128).allow(''),
    escrowId: Joi.string().trim().max(64).allow(''),
  });
  const { error, value } = schema.validate(req.body || {});
  if (error) throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, error.details[0].message, 400);

  const from = order.status;
  const allowed = TRANSITIONS[from] || [];
  if (value.status !== from && !allowed.includes(value.status)) {
    throw new AppError(
      ErrorCodes.INVALID_TRANSACTION,
      `An order in status '${from}' cannot move to '${value.status}'`,
      400
    );
  }
  if (value.status === 'cancelled' && !isAdminModerator(req.user)) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      'Only a marketplace moderator can cancel an order — a buyer cancels by opening a dispute',
      403
    );
  }
  if (value.status === 'delivered' && !(value.releaseTxHash || order.releaseTxHash)) {
    throw new AppError(
      ErrorCodes.INVALID_TRANSACTION,
      'releaseTxHash required: delivery is confirmed by MsgReleaseFunds, not by this endpoint',
      400
    );
  }

  order.status = value.status;
  if (value.releaseTxHash) order.releaseTxHash = value.releaseTxHash;
  if (value.disputeTxHash) order.disputeTxHash = value.disputeTxHash;
  // The storefront's broadcast can return the escrow id after the order exists
  // (create-then-attach); letting it through keeps the receipt linked to the
  // funds, and the buyer/seller/amount on the document stay whatever the chain
  // confirmed at create time.
  if (value.escrowId && !order.escrowId) order.escrowId = value.escrowId;
  await order.save();

  res.json({ ok: true, order: toPublicOrder(order.toObject()) });
}));

module.exports = router;
