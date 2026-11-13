/**
 * Marketplace catalog — sellers list products, buyers browse them, checkout
 * settles through the on-chain escrow routes in routes/marketplace.js.
 *
 * Why this lives in Mongo and not on the chain: x/marketplace stores escrow
 * records only (EscrowStateKey/EscrowReleasePrefix/EscrowDisputePrefix — see
 * x/marketplace/types/keys.go). There is no product/listing message, no
 * catalog keeper, and no catalog query service in the module, so a buyer
 * browsing Mallchain has nothing to browse against until this exists. It is
 * deliberately off-chain discovery data paired with on-chain settlement: a
 * listing carries the seller's address and price, and the purchase that
 * follows locks real coins in MsgCreateEscrow against exactly those two.
 *
 * Nothing here is invented for display purposes. No seeded listings, no
 * placeholder sellers, no synthetic ratings: an account that has never
 * posted a listing sees its own empty state, and a storefront with no
 * sellers is reported as such (see toPublicListing's absence of a rating
 * field and the empty-state copy in
 * mallchain-os-v14/src/features/marketplace/Marketplace.tsx).
 */
const express = require('express');
const Joi = require('joi');
const router = express.Router();

const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { requireCategory } = require('../middleware/categoryAccess');
const { limiters } = require('../middleware/rateLimiter');
const MarketplaceListing = require('../models/MarketplaceListing');
const User = require('../models/user');
const { AppError, ErrorCodes, asyncHandler } = require('../utils/errorHandler');
const { publishMarketEvent, toListingEvent } = require('../services/marketActivityFeed');

const CATEGORIES = ['food', 'fashion', 'home', 'tech', 'agriculture', 'health', 'services', 'other'];

// A listing's price is a MAL amount (native `stake`, 6 decimals) because that
// is the denom x/marketplace escrow holds — the same constant the storefront
// checks out against (GAS_DENOM in features/marketplace/Marketplace.tsx).
const MAX_PAGE_SIZE = 50;

const listingSchema = Joi.object({
  title: Joi.string().trim().min(3).max(120).required(),
  description: Joi.string().trim().allow('').max(2000).default(''),
  category: Joi.string().valid(...CATEGORIES).default('other'),
  // Two decimals is finer than the chain can actually settle in practice for
  // a retail price, but the underlying denom has 6, so the API accepts down to
  // that and rounds nothing on its own.
  price: Joi.number().min(0.000001).max(1e9).required(),
  quantity: Joi.number().integer().min(1).max(9999).default(1),
  image: Joi.string().trim().allow('').max(16).default('📦'),
  status: Joi.string().valid('active', 'paused').default('active'),
});

// The shape the storefront renders. `sellerAddress` is public by design — it
// is the address a buyer's escrow pays to, and it is already visible in every
// confirmed MsgCreateEscrow on the chain. `_id` is normalised to `id` so the
// client never has to know that Mongo is behind this.
function toPublicListing(doc) {
  const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : null;
  return {
    id: String(doc._id ?? doc.id),
    name: doc.title,
    description: doc.description || '',
    seller: doc.sellerName || '',
    sellerAddress: doc.sellerAddress,
    price: doc.price,
    quantity: doc.quantity,
    img: doc.image || '📦',
    cat: doc.category,
    status: doc.status,
    createdAt,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    // No `rating`: there is no review model, route or on-chain record anywhere
    // in the platform that would produce one, so any number here would be
    // fabricated. The card omits the rating line when it is absent.
  };
}

/**
 * Who may moderate a listing: its seller, or the admin role the platform
 * already grants for this surface. A `marketplace` category admin can do
 * everything a superadmin can do here (the window's whole purpose is to offload
 * listing review from the superadmins); `requireCategory` is what enforces that
 * the role is scoped to this category and not borrowed from, say, mining.
 */
function canModerate(user, listing) {
  if (!user) return false;
  const userId = String(user._id || user.id);
  if (listing?.sellerUserId && String(listing.sellerUserId) === userId) return true;
  if (user.role === 'superadmin') return true;
  return user.role === 'admin' && user.adminCategory === 'marketplace';
}

// GET /api/marketplace/catalog — browse what sellers have actually listed.
// Public, like the storefront it feeds: someone deciding whether Mallchain
// commerce is worth joining should not have to create an account first.
router.get('/', limiters.lenient, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 24));

  const filter = { status: 'active' };
  if (req.query.category && CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }
  // Exact-address browse (a buyer returning to one seller's shop). Pattern is
  // anchored and length-bounded by the model's match rule, so this can only
  // ever be a full address, never a regex.
  if (req.query.seller && /^mall1[a-z0-9]{38,58}$/.test(req.query.seller)) {
    filter.sellerAddress = req.query.seller;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (q) {
    // Quoted for a literal match: an unescaped "." in a product name would
    // otherwise be treated as a regex metacharacter.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
    ];
  }

  const sort = {
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
    oldest: { createdAt: 1 },
  }[req.query.sort] || { createdAt: -1 };

  const [listings, total] = await Promise.all([
    MarketplaceListing.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    MarketplaceListing.countDocuments(filter),
  ]);

  res.json({
    ok: true,
    listings: listings.map(toPublicListing),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    categories: CATEGORIES,
    // What the empty state says out loud rather than showing a fake shelf.
    currency: { denom: 'stake', display: 'MAL', decimals: 6 },
  });
}));

// GET /api/marketplace/catalog/mine — the seller's own listings, including the
// paused ones they need to be able to restart. Must stay above /:id, or
// "mine" is read as an ObjectId and the CastError becomes a 400.
router.get('/mine', auth, limiters.standard, asyncHandler(async (req, res) => {
  const userId = String(req.user?._id || req.user?.id);
  const listings = await MarketplaceListing.find({ sellerUserId: userId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ ok: true, listings: listings.map(toPublicListing) });
}));

// GET /api/marketplace/catalog/manage — what the marketplace admin window
// needs and no other route can give it: every listing regardless of status,
// with the seller's account id attached so a moderator can see whose listing
// this is. The public `GET /` hard-filters to active and `/mine` is
// seller-scoped, so a paused or removed listing is invisible to both
// moderators and the storefront — which means moderation was previously only
// possible by guessing an ObjectId and calling PATCH/DELETE blind.
//
// Like `/mine`, this must stay above `/:id`, or "manage" is read as an
// ObjectId and the CastError becomes a 400.
router.get('/manage', auth, requireAdmin, requireCategory('marketplace'), limiters.standard,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || 24));

    // Default is everything that still exists in the storefront's world, i.e.
    // active + paused; a removed listing stays out of the way unless someone
    // explicitly asks for the tombstones. 'all' overrides the filter entirely.
    const requested = String(req.query.status || 'all').toLowerCase();
    const known = ['active', 'paused', 'removed'];
    const filter = {};
    if (requested !== 'all') {
      filter.status = known.includes(requested) ? requested : 'active';
    }
    if (req.query.category && CATEGORIES.includes(req.query.category)) {
      filter.category = req.query.category;
    }

    const [listings, total] = await Promise.all([
      MarketplaceListing.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      MarketplaceListing.countDocuments(filter),
    ]);

    // A per-status census of the whole catalog, not of this page. The window's
    // stat cards would otherwise report "3 paused" while showing a 50-row page
    // and hiding the rest.
    const [active, paused, removed] = await Promise.all([
      MarketplaceListing.countDocuments({ status: 'active' }),
      MarketplaceListing.countDocuments({ status: 'paused' }),
      MarketplaceListing.countDocuments({ status: 'removed' }),
    ]);

    res.json({
      ok: true,
      listings: listings.map((doc) => ({
        ...toPublicListing(doc),
        // The storefront's buyers never see this; a moderator needs it to
        // contact or look up the seller behind a listing.
        sellerUserId: String(doc.sellerUserId ?? ''),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      counts: { active, paused, removed },
      statuses: ['active', 'paused', 'removed'],
      categories: CATEGORIES,
      currency: { denom: 'stake', display: 'MAL', decimals: 6 },
    });
  }));

// GET /api/marketplace/catalog/:id — one listing. A removed listing 404s even
// for its seller; /mine is how a seller sees their own removals.
router.get('/:id', limiters.lenient, asyncHandler(async (req, res) => {
  const listing = await MarketplaceListing.findOne({ _id: req.params.id, status: 'active' }).lean();
  if (!listing) throw new AppError(ErrorCodes.NOT_FOUND, 'Listing not found', 404);
  res.json({ ok: true, listing: toPublicListing(listing) });
}));

// POST /api/marketplace/catalog — list a product.
//
// The seller address is read from the account, never taken from the body: a
// listing is a promise that escrowed funds will reach the seller, and letting
// the request choose the address would let anyone route a buyer's payment
// elsewhere. An account with no linked wallet cannot sell, because there is
// nowhere for its escrow to go.
router.post('/', auth, limiters.standard, asyncHandler(async (req, res) => {
  const { error, value } = listingSchema.validate(req.body || {});
  if (error) throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, error.details[0].message, 400);

  const plain = User.decryptUserPii(req.user);
  const sellerAddress = plain?.walletAddress;
  if (!sellerAddress || !/^mall1[a-z0-9]{38,58}$/.test(sellerAddress)) {
    throw new AppError(
      ErrorCodes.INSUFFICIENT_PERMISSIONS,
      'Link a wallet to your account before listing a product — escrow pays out to your account address',
      403
    );
  }

  const listing = await MarketplaceListing.create({
    sellerUserId: String(req.user?._id || req.user?.id),
    sellerName: req.user?.name || req.user?.username || '',
    sellerAddress,
    title: value.title,
    description: value.description,
    category: value.category,
    price: value.price,
    quantity: value.quantity,
    image: value.image || '📦',
    status: value.status,
  });

  res.status(201).json({ ok: true, listing: toPublicListing(listing.toObject()) });

  // Live "new listing" row for the `market:feed` room. Fire-and-forget: the
  // listing is already committed and readable through
  // GET /api/marketplace/catalog whether or not a socket delivers it, so a
  // dead websocket can never turn a created listing into a failed request.
  // toListingEvent publishes title/category/price only — no seller.
  const published = listing.toObject();
  setImmediate(() => {
    try {
      publishMarketEvent(toListingEvent(published));
    } catch {
      /* observability only */
    }
  });
}));

// The PATCH shape of the same contract, written out instead of derived from
// listingSchema: Joi applies a key's default() whenever the key is absent, so
// reusing the create schema here would silently reset description, category,
// quantity and status on a request that only meant to change the price.
const updateSchema = Joi.object({
  title: Joi.string().trim().min(3).max(120),
  description: Joi.string().trim().allow('').max(2000),
  category: Joi.string().valid(...CATEGORIES),
  price: Joi.number().min(0.000001).max(1e9),
  quantity: Joi.number().integer().min(1).max(9999),
  image: Joi.string().trim().allow('').max(16),
  status: Joi.string().valid('active', 'paused'),
}).min(1); // Joi 17's object-size constraint (there is no .minKeys)

// PATCH /api/marketplace/catalog/:id — edit or pause a listing. The seller, or
// a marketplace admin / superadmin moderating it.
// Changing price/quantity is allowed: buyers who already escrowed paid against
// the on-chain amount recorded at checkout, which this document does not
// control, so a later edit can never move money that is already held.
router.patch('/:id', auth, limiters.standard, asyncHandler(async (req, res) => {
  const listing = await MarketplaceListing.findOne({ _id: req.params.id });

  if (!listing || listing.status === 'removed') {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Listing not found', 404);
  }
  if (!canModerate(req.user, listing)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Only the seller or a marketplace admin can edit this listing', 403);
  }

  const { error, value } = updateSchema.validate(req.body || {});
  if (error) throw new AppError(ErrorCodes.INVALID_REQUEST_FORMAT, error.details[0].message, 400);

  const patch = { ...value };
  // An explicit empty image means "keep what's there" — the field renders as a
  // glyph on the card, and clearing it would leave the card blank.
  if (patch.image === '') delete patch.image;

  Object.assign(listing, patch);
  await listing.save();

  res.json({ ok: true, listing: toPublicListing(listing.toObject()) });
}));

// DELETE /api/marketplace/catalog/:id — soft removal (status 'removed').
// A seller can remove their own listing; a superadmin can remove anyone's,
// which is what the marketplace category admin's moderation queue needs.
// Soft because orders and escrows already reference these documents, and a
// hard delete would leave a purchase pointing at nothing.
router.delete('/:id', auth, limiters.standard, asyncHandler(async (req, res) => {
  const listing = await MarketplaceListing.findOne({ _id: req.params.id });

  if (!listing || listing.status === 'removed') {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Listing not found', 404);
  }
  if (!canModerate(req.user, listing)) {
    throw new AppError(ErrorCodes.INSUFFICIENT_PERMISSIONS, 'Only the seller or a marketplace admin can remove this listing', 403);
  }

  listing.status = 'removed';
  await listing.save();

  res.json({ ok: true, id: String(listing._id), status: 'removed' });
}));

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
module.exports.toPublicListing = toPublicListing;
