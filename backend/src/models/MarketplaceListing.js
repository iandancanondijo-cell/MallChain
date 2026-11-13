const mongoose = require('mongoose');

/**
 * A seller's product listing — the data behind #/marketplace.
 *
 * This collection is the catalog; the chain is the settlement layer. x/marketplace
 * (see proto/marketplace/marketplace/v1/tx.proto and x/marketplace/types/keys.go)
 * only stores escrow records — there is no on-chain product, listing or catalog
 * concept — so a buyer needs somewhere to discover what a seller is offering
 * before any coins are locked. That "somewhere" is this document, and the
 * escrow created at checkout is the on-chain half of the same purchase:
 * the listing supplies seller address + price, MsgCreateEscrow holds the funds.
 *
 * Deliberately absent, because nothing produces the data:
 *  - ratings/reviews: there is no review model or submission route anywhere in
 *    the platform, so a rating here would be a fabricated number. The UI omits
 *    the star line unless a real aggregate ever exists.
 *  - stock reservations: quantity is the seller's own claim, not a lock. Two
 *    buyers can check out the same listing; the seller refunds the second via
 *    MsgRefundBuyer. True inventory holding needs a chain-side module and is
 *    documented as such rather than faked off-chain.
 */
const MarketplaceListingSchema = new mongoose.Schema({
  sellerUserId: { type: String, required: true, index: true },
  sellerName: { type: String, default: '', trim: true, maxlength: 80 },

  // The bech32 address MsgCreateEscrow pays out to. Copied from the seller's
  // own account at post time (see routes/marketplaceCatalog.js) rather than
  // accepted from the request body, so a listing can never point a buyer's
  // escrow at an address its owner doesn't control.
  sellerAddress: {
    type: String,
    required: true,
    index: true,
    match: /^mall1[a-z0-9]{38,58}$/,
  },

  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  category: {
    type: String,
    enum: ['food', 'fashion', 'home', 'tech', 'agriculture', 'health', 'services', 'other'],
    default: 'other',
    index: true,
  },

  // Price per unit in MAL — the chain's native gas denom ("stake", 6 decimals)
  // that x/marketplace escrow actually holds. Not MLCNS, and not a fiat price:
  // escrow amounts are denominated in bank-module coins (x/marketplace/keeper/
  // escrow.go), so the checkout math has no exchange-rate step in front of it.
  price: { type: Number, required: true, min: 0.000001, max: 1e9 },
  quantity: { type: Number, default: 1, min: 1, max: 9999 },

  // The card glyph. The storefront renders this as text, so it is a short
  // label rather than an asset URL; real product images need an upload route
  // and storage quota (see middleware/upload.js's edu pattern) and are not
  // faked here.
  image: { type: String, default: '📦', trim: true, maxlength: 16 },

  // Soft delete: an order that already paid out against this listing keeps a
  // resolvable reference, and a mistaken removal can be undone.
  status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active', index: true },
}, { timestamps: true });

MarketplaceListingSchema.index({ status: 1, createdAt: -1 });
MarketplaceListingSchema.index({ status: 1, category: 1, createdAt: -1 });
MarketplaceListingSchema.index({ status: 1, sellerAddress: 1 });

module.exports = mongoose.models.MarketplaceListing || mongoose.model('MarketplaceListing', MarketplaceListingSchema);
