const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A buyer's order — the account-side record of a purchase that settled
 * through x/marketplace escrow.
 *
 * Why this exists at all: until now the storefront minted its own order id
 * (`ord-<timestamp>-<rand>`) and kept the whole order list in one browser's
 * localStorage. The escrow itself was always on-chain and correct, but the
 * human-readable receipt for it lived nowhere else, so signing in on a second
 * device showed "No orders yet" for an account that had bought a dozen things.
 * This collection is that missing receipt: the id is issued here, one document
 * per settled purchase, keyed to the account.
 *
 * What is trusted and what is checked:
 *  - `userId` comes from the session token, never the body.
 *  - `escrowId` is looked up on-chain before the record is written
 *    (routes/marketplaceOrders.js). When the chain answers, the escrow's own
 *    buyer/seller/amount are what get stored, so a document can overstate the
 *    seller or the money locked — `escrowVerified: true` records that this
 *    cross-check happened. When the node is unreachable the claim is still
 *    recorded, but honestly flagged `escrowVerified: false` so a later read can
 *    re-check it instead of inheriting an unverified number forever.
 *  - `items` is buyer-declared line-item detail (the chain only holds an
 *    escrow with a free-text description); it drives the receipt's wording,
 *    never the amount.
 *
 * Deliberately absent, because nothing produces the data: a fulfilment/tracking
 * number (no shipping integration exists) and a seller confirmation step (there
 * is no seller-side client — x/marketplace's MsgRefundBuyer must be signed by
 * the seller's own key, which this app never holds).
 */

const ADDRESS_RE = /^mall1[a-z0-9]{38,58}$/;

/** Crockford-style alphabet: no I/L/O/U so a phone-read order id can't be mis-spelled. */
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function mintOrderNumber(now = new Date()) {
  const y = String(now.getUTCFullYear()).slice(2);
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const bytes = crypto.randomBytes(8);
  let suffix = '';
  for (const b of bytes) suffix += ID_ALPHABET[b % ID_ALPHABET.length];
  return `MLC-${y}${mo}${d}-${suffix}`;
}

const MarketplaceOrderSchema = new mongoose.Schema({
  // The human-facing id, e.g. MLC-261112-8FQKR3TZBA. Unique; this is what the
  // buyer quotes to a seller and what PATCH/GET /:id resolves — a Mongo
  // ObjectId never leaves this document.
  orderNumber: { type: String, unique: true, index: true },

  userId: { type: String, required: true, index: true },

  // On-chain parties. Populated from the escrow record itself whenever the
  // chain could be reached (see escrowVerified), so they describe the funds
  // rather than the buyer's claim about them.
  buyerAddress: { type: String, required: true, match: ADDRESS_RE, index: true },
  sellerAddress: { type: String, required: true, match: ADDRESS_RE, index: true },

  escrowId: { type: String, default: '', index: true },
  createTxHash: { type: String, default: '' },
  releaseTxHash: { type: String, default: '' },
  disputeTxHash: { type: String, default: '' },

  // Did x/marketplace confirm this escrowId at write time? false means the node
  // was unreachable and the amounts below are the client's own claim.
  escrowVerified: { type: Boolean, default: false },

  items: [{
    listingId: { type: String, default: '' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1, max: 999 },
    // Unit price in MAL, copied from the listing at checkout.
    price: { type: Number, required: true, min: 0, max: 1e9 },
  }],

  // Settled amount in MAL (the chain's native `stake`, 6 decimals) — the same
  // unit MsgCreateEscrow holds. `amountBaseUnits` keeps the exact integer the
  // chain reported so no display rounding is ever mistaken for the truth.
  total: { type: Number, required: true, min: 0 },
  amountBaseUnits: { type: String, required: true },
  denom: { type: String, default: 'stake' },

  // The shipping stage is an off-chain UI concern; custody is the escrow.
  // 'cancelled' is admin-only (a buyer's unilateral exit does not exist — the
  // chain's refund path is signed by the seller).
  status: {
    type: String,
    enum: ['processing', 'shipped', 'transit', 'delivered', 'cancelled', 'disputed'],
    default: 'processing',
    index: true,
  },

  description: { type: String, default: '', trim: true, maxlength: 200 },
  disputeWindowSeconds: { type: Number, default: 0, min: 0 },
  escrowCreatedAt: { type: Number, default: 0 },

  // sha256 of buyer + seller + sorted lines + total + description. Written with
  // every order so a retried receipt can be recognised even when it has no
  // escrow id or create hash to be matched on (routes/marketplaceOrders.js).
  // Not unique — the same basket bought next week is a different order.
  receiptHash: { type: String, default: '', index: true },
}, { timestamps: true });

MarketplaceOrderSchema.index({ userId: 1, createdAt: -1 });
MarketplaceOrderSchema.index({ userId: 1, receiptHash: 1, createdAt: -1 });
MarketplaceOrderSchema.index({ escrowVerified: 1, createdAt: -1 });

// Retry-safe mint: the unique index is the authority, a collision (astronomically
// unlikely with 8 characters) just re-draws.
MarketplaceOrderSchema.statics.mintOrderNumber = async function mintOrderNumberWithRetry(attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = mintOrderNumber();
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.findOne({ orderNumber: candidate }).lean();
    if (!exists) return candidate;
  }
  return mintOrderNumber();
};

MarketplaceOrderSchema.statics.ADDRESS_RE = ADDRESS_RE;

module.exports = mongoose.models.MarketplaceOrder
  || mongoose.model('MarketplaceOrder', MarketplaceOrderSchema);
