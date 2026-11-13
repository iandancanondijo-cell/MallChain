/**
 * The marketplace catalog's contract, tested at the route.
 *
 * What this pins down, in order of how it would hurt to get wrong:
 *
 *  1. The seller address on a listing comes from the ACCOUNT, never from the
 *     request body — checkout pays escrow to that address, so a body-supplied
 *     one is a payment-routing hole.
 *  2. PATCH only changes what was sent. The create schema has Joi defaults on
 *     five keys; reusing it for updates silently reset description, category,
 *     quantity and status on a price-only edit. The suite asserts the
 *     untouched fields survive.
 *  3. A malformed id is a 400 that names the field, not a 500 — the class of
 *     bug the rest of this session removed from ~140 handlers.
 *  4. Browsing is public and reports an honest empty catalog rather than a
 *     fabricated shelf: zero rows in Mongo is zero listings in the response,
 *     and no rating field is ever emitted, because nothing in the platform
 *     produces one.
 *
 * Models are mocked (no mongod needed); the router, its Joi schemas, the real
 * auth middleware's req.user contract and the shared errorHandler are all the
 * production code paths.
 */
const express = require('express');
const request = require('supertest');

const ADDRESS = 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f';
const OTHER = 'mall1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqslg7xq';

jest.mock('../models/MarketplaceListing', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));

// The routes read the linked wallet off the (encrypted-at-rest) user document
// through decryptUserPii, exactly like withdrawalAml.js does.
// A plain function rather than jest.fn(): each describe's beforeEach calls
// jest.resetAllMocks(), which strips implementations off mock fns — and a
// decryptUserPii that returns undefined reads as "this account has no linked
// wallet", so every POST came back 403.
jest.mock('../models/user', () => ({
  decryptUserPii: (u) => u || {},
}));

jest.mock('../middleware/rateLimiter', () => ({
  limiters: {
    lenient: (_req, _res, next) => next(),
    standard: (_req, _res, next) => next(),
  },
}));

// The suite tests the catalog's own authorization rules (owner vs everyone
// else vs superadmin), so the JWT layer is stubbed the way settings.test.js
// and contracts.test.js stub it: whoever this returns is req.user.
const mockState = { user: null };
jest.mock('../middleware/auth', () =>
  jest.fn((req, _res, next) => {
    req.user = mockState.user;
    next();
  })
);

// Only the JWT layer is stubbed — requireAdmin's role check reads the req.user
// the mock above just set. `middleware/categoryAccess` is NOT mocked: it is
// pure req.user inspection with no I/O, so the /manage and moderation tests
// exercise the real category gatekeeper, which is the thing that decides
// whether a mining admin can read the marketplace queue.
jest.mock('../middleware/adminAuth', () => ({
  requireAdmin: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth required' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'admin access required' });
    }
    return next();
  },
  requireSuperAdmin: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth required' });
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'superadmin access required' });
    return next();
  },
}));

const MarketplaceListing = require('../models/MarketplaceListing');
const { errorHandler } = require('../utils/errorHandler');

function castError(path) {
  const err = new Error(`Cast to ObjectId failed for value "abc123" (type string) at path "${path}" for model "MarketplaceListing"`);
  err.name = 'CastError';
  err.path = path;
  err.stringValue = 'abc123';
  return err;
}

// Mongoose query chain: find().sort().skip().limit().lean(), findOne().lean(),
// each awaitable at every step.
function chain(value) {
  const node = {
    sort: jest.fn(() => node),
    skip: jest.fn(() => node),
    limit: jest.fn(() => node),
    lean: jest.fn().mockResolvedValue(value),
    then: (onF, onR) => Promise.resolve(value).then(onF, onR),
  };
  return node;
}

const SAVED = {
  _id: '6520f0000000000000000001',
  sellerUserId: 'user-1',
  sellerName: 'Safari Beans Co.',
  sellerAddress: ADDRESS,
  title: 'Nairobi Roast Coffee — 500g',
  description: 'Single origin, whole bean.',
  category: 'food',
  price: 32.5,
  quantity: 12,
  image: '☕',
  status: 'active',
  createdAt: new Date('2026-10-02T08:00:00.000Z'),
  updatedAt: new Date('2026-10-02T08:00:00.000Z'),
};

function listingWith(overrides) {
  return { ...SAVED, ...overrides };
}

// req.user as requireAuth leaves it: the hydrated user document, PII fields
// still ciphertext (decryptUserPii above returns them as-is for the fixture).
function buildApp({ user = { _id: 'user-1', name: 'Safari Beans Co.', walletAddress: ADDRESS, role: 'user' } } = {}) {
  mockState.user = user;
  // Re-installed on every build because each describe's beforeEach calls
  // jest.resetAllMocks(), which also wipes this module-level mock's
  // implementation — leaving it reset means `auth` silently never calls
  // next() and every authenticated request hangs until Jest's 5s timeout.
  require('../middleware/auth').mockImplementation((req, _res, next) => {
    req.user = mockState.user;
    next();
  });
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace/catalog', require('../routes/marketplaceCatalog'));
  // errorHandler is a factory (index.js mounts `app.use(errorHandler())`);
  // mounting the factory itself registers a 0-arity normal middleware, which
  // Express then SKIPS for errored requests — every 4xx/5xx fell through to
  // finalhandler and came back as bare HTML with no code field.
  app.use(errorHandler());
  return app;
}

describe('GET /api/marketplace/catalog', () => {
  beforeEach(() => jest.resetAllMocks());

  it('maps Mongo rows to the storefront shape and reports the currency the price is in', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED]));
    MarketplaceListing.countDocuments.mockResolvedValue(1);

    const res = await request(buildApp()).get('/api/marketplace/catalog');

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.listings[0]).toMatchObject({
      id: SAVED._id,
      name: SAVED.title,
      seller: SAVED.sellerName,
      sellerAddress: ADDRESS,
      price: 32.5,
      quantity: 12,
      img: '☕',
      cat: 'food',
      status: 'active',
    });
    expect(res.body.currency).toEqual({ denom: 'stake', display: 'MAL', decimals: 6 });
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 24, total: 1, pages: 1 });
  });

  it('never emits a rating field — no review data source exists to compute one from', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED]));
    MarketplaceListing.countDocuments.mockResolvedValue(1);

    const res = await request(buildApp()).get('/api/marketplace/catalog');

    expect(res.body.listings[0]).not.toHaveProperty('rating');
  });

  it('answers an empty catalog with an empty list, not seeded products', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);

    const res = await request(buildApp()).get('/api/marketplace/catalog');

    expect(res.body.listings).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(MarketplaceListing.find).toHaveBeenCalledWith({ status: 'active' });
  });

  it('filters by a known category and ignores an invented one', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);
    const app = buildApp();

    await request(app).get('/api/marketplace/catalog?category=tech');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({ status: 'active', category: 'tech' });

    await request(app).get('/api/marketplace/catalog?category=weapons');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({ status: 'active' });
  });

  it('escapes regex metacharacters in a search term', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);

    await request(buildApp()).get('/api/marketplace/catalog?q=.*%2B?');

    const filter = MarketplaceListing.find.mock.calls.at(-1)[0];
    // %2B, not a bare "+": a query string decodes "+" to a space, which is
    // what the first version of this assertion mistook for broken escaping.
    expect(filter.$or[0].title.$regex).toBe('\\.\\*\\+\\?');
    expect(filter.$or[0].title.$options).toBe('i');
  });

  it('accepts an exact seller address for browse-by-shop and nothing regex-shaped', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);
    const app = buildApp();

    await request(app).get(`/api/marketplace/catalog?seller=${ADDRESS}`);
    expect(MarketplaceListing.find.mock.calls.at(-1)[0].sellerAddress).toBe(ADDRESS);

    await request(app).get('/api/marketplace/catalog?seller=mall1.*');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0].sellerAddress).toBeUndefined();
  });

  it('caps page size so one browse cannot pull the whole collection', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);

    await request(buildApp()).get('/api/marketplace/catalog?limit=5000&page=abc');

    const chainNode = MarketplaceListing.find.mock.results[0].value;
    expect(chainNode.skip.mock.calls.at(-1)[0]).toBe(0);   // page=abc → 1
    expect(chainNode.limit.mock.calls.at(-1)[0]).toBe(50); // capped, not 5000
  });
});

describe('GET /api/marketplace/catalog/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('404s a listing that does not exist', async () => {
    MarketplaceListing.findOne.mockReturnValue(chain(null));
    const res = await request(buildApp()).get(`/api/marketplace/catalog/${SAVED._id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('hides a removed listing from public browse', async () => {
    MarketplaceListing.findOne.mockReturnValue(chain(null));
    const res = await request(buildApp()).get(`/api/marketplace/catalog/${SAVED._id}`);
    expect(MarketplaceListing.findOne.mock.calls.at(-1)[0]).toEqual({ _id: SAVED._id, status: 'active' });
    expect(res.status).toBe(404);
  });

  it('answers a malformed id with 400 INVALID_RESOURCE_ID, not 500', async () => {
    const app = buildApp();
    // findOne(...).lean() must reject, the way mongoose's own chain does.
    MarketplaceListing.findOne.mockImplementation(() => {
      const node = chain(null);
      node.lean = jest.fn(() => Promise.reject(castError('_id')));
      return node;
    });

    const res = await request(app).get('/api/marketplace/catalog/abc123');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESOURCE_ID');
    // Names the field; never echoes what the client sent.
    expect(res.body.error.message).toMatch(/_id/);
    expect(res.body.error.message).not.toMatch('abc123');
  });

  it('serves "mine" to the seller route instead of reading it as an id', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED]));
    const res = await request(buildApp()).get('/api/marketplace/catalog/mine');
    expect(res.status).toBe(200);
    expect(MarketplaceListing.find).toHaveBeenCalledWith({ sellerUserId: 'user-1' });
  });
});

describe('GET /api/marketplace/catalog/manage', () => {
  beforeEach(() => jest.resetAllMocks());

  const MARKET_ADMIN = { _id: 'mod-1', name: 'Marketplace Ops', walletAddress: OTHER, role: 'admin', adminCategory: 'marketplace' };
  const MINING_ADMIN = { _id: 'mod-2', name: 'Mines Ops', walletAddress: OTHER, role: 'admin', adminCategory: 'mining' };

  it('gives a marketplace admin every status, including the ones browse cannot see', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED, listingWith({ _id: '6520f0000000000000000002', status: 'removed' })]));
    // Counted per status, so a stub that ignores its argument cannot tell a
    // page's rows from the catalog's census.
    MarketplaceListing.countDocuments.mockImplementation(async (f) => ({ active: 7, paused: 2, removed: 1 }[f.status] ?? 10));

    const res = await request(buildApp({ user: MARKET_ADMIN })).get('/api/marketplace/catalog/manage');

    expect(res.status).toBe(200);
    // No status clause: unlike `GET /`, this is not an active-only view.
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({});
    expect(res.body.listings.map((l) => l.status)).toEqual(['active', 'removed']);
    expect(res.body.statuses).toEqual(['active', 'paused', 'removed']);
    expect(res.body.counts).toEqual({ active: 7, paused: 2, removed: 1 });
    expect(res.body.pagination.total).toBe(10);
  });

  it('attaches the seller account id, which the storefront shape deliberately omits', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED]));
    MarketplaceListing.countDocuments.mockResolvedValue(1);

    const res = await request(buildApp({ user: MARKET_ADMIN })).get('/api/marketplace/catalog/manage');

    expect(res.body.listings[0].sellerUserId).toBe('user-1');
  });

  it('filters by a known status and falls back to active for an invented one', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);
    const app = buildApp({ user: MARKET_ADMIN });

    await request(app).get('/api/marketplace/catalog/manage?status=paused');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({ status: 'paused' });

    await request(app).get('/api/marketplace/catalog/manage?status=deleted');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({ status: 'active' });

    await request(app).get('/api/marketplace/catalog/manage?category=tech&status=all');
    expect(MarketplaceListing.find.mock.calls.at(-1)[0]).toEqual({ category: 'tech' });
  });

  it('answers /manage itself, never reading the word as a listing id', async () => {
    MarketplaceListing.find.mockReturnValue(chain([]));
    MarketplaceListing.countDocuments.mockResolvedValue(0);

    const res = await request(buildApp({ user: MARKET_ADMIN })).get('/api/marketplace/catalog/manage');

    expect(res.status).toBe(200);
    expect(MarketplaceListing.findOne).not.toHaveBeenCalled();
  });

  it('refuses a regular user and an admin from another category', async () => {
    MarketplaceListing.find.mockReturnValue(chain([SAVED]));
    const app = buildApp();

    const asUser = await request(app).get('/api/marketplace/catalog/manage');
    expect(asUser.status).toBe(403);

    mockState.user = MINING_ADMIN;
    const asSibling = await request(app).get('/api/marketplace/catalog/manage');
    expect(asSibling.status).toBe(403);
    // requireCategory's deliberate vagueness: it never names the category.
    expect(asSibling.body.error).toBe('category access denied');
    expect(MarketplaceListing.find).not.toHaveBeenCalled();
  });
});

describe('POST /api/marketplace/catalog', () => {
  beforeEach(() => jest.resetAllMocks());

  it('takes the payout address from the account, not the body', async () => {
    MarketplaceListing.create.mockImplementation(async (doc) => ({ ...SAVED, ...doc, toObject: () => ({ ...SAVED, ...doc }) }));

    const res = await request(buildApp())
      .post('/api/marketplace/catalog')
      .send({
        title: 'Maasai Beaded Bracelet',
        category: 'fashion',
        price: 14,
        quantity: 3,
      });

    expect(res.status).toBe(201);
    const created = MarketplaceListing.create.mock.calls.at(-1)[0];
    expect(created.sellerAddress).toBe(ADDRESS);
    expect(created.sellerUserId).toBe('user-1');
    expect(created.sellerName).toBe('Safari Beans Co.');
  });

  it('rejects a body-supplied sellerAddress outright — escrow pays to whatever this says', async () => {
    const res = await request(buildApp())
      .post('/api/marketplace/catalog')
      .send({ title: 'Maasai Beaded Bracelet', price: 14, sellerAddress: OTHER });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sellerAddress/i);
    expect(MarketplaceListing.create).not.toHaveBeenCalled();
  });

  it('refuses a seller with no linked wallet, because escrow would have nowhere to go', async () => {
    const res = await request(buildApp({ user: { _id: 'user-1', name: 'Nobody' } }))
      .post('/api/marketplace/catalog')
      .send({ title: 'Anything at all', price: 1 });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/wallet/i);
    expect(MarketplaceListing.create).not.toHaveBeenCalled();
  });

  it('rejects a price that cannot be paid (zero, negative, non-numeric)', async () => {
    const app = buildApp();
    for (const price of [0, -5, 'thirty-two']) {
      const res = await request(app).post('/api/marketplace/catalog').send({ title: 'Test listing', price });
      expect(res.status).toBe(400);
    }
    expect(MarketplaceListing.create).not.toHaveBeenCalled();
  });

  it('rejects a title shorter than 3 characters and an unknown category', async () => {
    const app = buildApp();
    expect((await request(app).post('/api/marketplace/catalog').send({ title: 'ab', price: 1 })).status).toBe(400);
    expect((await request(app).post('/api/marketplace/catalog').send({ title: 'Good title', price: 1, category: 'firearms' })).status).toBe(400);
    expect(MarketplaceListing.create).not.toHaveBeenCalled();
  });

  it('defaults quantity, image and status instead of failing a valid listing', async () => {
    MarketplaceListing.create.mockImplementation(async (doc) => ({ ...SAVED, ...doc, toObject: () => ({ ...SAVED, ...doc }) }));

    const res = await request(buildApp())
      .post('/api/marketplace/catalog')
      .send({ title: 'Plain listing', price: 2.5 });

    expect(res.status).toBe(201);
    expect(MarketplaceListing.create.mock.calls.at(-1)[0]).toMatchObject({ quantity: 1, status: 'active', image: '📦' });
  });
});

describe('PATCH /api/marketplace/catalog/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  function savedDoc(overrides = {}) {
    const doc = listingWith(overrides);
    doc.save = jest.fn().mockResolvedValue(doc);
    doc.toObject = () => doc;
    return doc;
  }

  it('changes only the fields it was sent', async () => {
    const doc = savedDoc();
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ price: 29.99 });

    expect(res.status).toBe(200);
    expect(doc.price).toBe(29.99);
    // The regression this route was written around: applying the create schema's
    // Joi defaults here would have blanked/overwritten all four.
    expect(doc.description).toBe(SAVED.description);
    expect(doc.category).toBe('food');
    expect(doc.quantity).toBe(12);
    expect(doc.status).toBe('active');
    expect(doc.image).toBe('☕');
    expect(doc.title).toBe(SAVED.title);
  });

  it('pauses a listing without touching anything else', async () => {
    const doc = savedDoc();
    MarketplaceListing.findOne.mockResolvedValue(doc);

    await request(buildApp())
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ status: 'paused' });

    expect(doc.status).toBe('paused');
    expect(doc.price).toBe(32.5);
  });

  it('lets the owner edit and refuses anyone else', async () => {
    const doc = savedDoc({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(buildApp())
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ price: 1 });

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets a superadmin moderate someone else\'s listing', async () => {
    const doc = savedDoc({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(
      buildApp({ user: { _id: 'root', name: 'Ops', walletAddress: OTHER, role: 'superadmin' } })
    )
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ status: 'paused' });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
  });

  it('lets a marketplace category admin pause someone else\'s listing', async () => {
    const doc = savedDoc({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(
      buildApp({ user: { _id: 'mod-1', name: 'Marketplace Ops', role: 'admin', adminCategory: 'marketplace' } })
    )
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ status: 'paused' });

    expect(res.status).toBe(200);
    expect(doc.status).toBe('paused');
  });

  it('refuses an admin whose category is not marketplace', async () => {
    const doc = savedDoc({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(
      buildApp({ user: { _id: 'mod-2', name: 'Mines Ops', role: 'admin', adminCategory: 'mining' } })
    )
      .patch(`/api/marketplace/catalog/${SAVED._id}`)
      .send({ status: 'paused' });

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('rejects an empty patch and an invalid value instead of writing them', async () => {
    const doc = savedDoc();
    MarketplaceListing.findOne.mockResolvedValue(doc);
    const app = buildApp();

    expect((await request(app).patch(`/api/marketplace/catalog/${SAVED._id}`).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/marketplace/catalog/${SAVED._id}`).send({ price: -1 })).status).toBe(400);
    expect((await request(app).patch(`/api/marketplace/catalog/${SAVED._id}`).send({ sellerAddress: OTHER })).status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/marketplace/catalog/:id', () => {
  beforeEach(() => jest.resetAllMocks());

  it('soft-removes the seller\'s own listing', async () => {
    const doc = savedForDelete();
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(buildApp()).delete(`/api/marketplace/catalog/${SAVED._id}`);

    expect(res.status).toBe(200);
    expect(doc.status).toBe('removed');
    expect(doc.save).toHaveBeenCalled();
    expect(res.body.id).toBe(SAVED._id);
  });

  it('lets a marketplace category admin remove anyone\'s listing', async () => {
    const doc = savedForDelete({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(
      buildApp({ user: { _id: 'mod-1', name: 'Marketplace Ops', role: 'admin', adminCategory: 'marketplace' } })
    ).delete(`/api/marketplace/catalog/${SAVED._id}`);

    expect(res.status).toBe(200);
    expect(doc.status).toBe('removed');
  });

  it('refuses to remove another seller\'s listing', async () => {
    const doc = savedForDelete({ sellerUserId: 'someone-else' });
    MarketplaceListing.findOne.mockResolvedValue(doc);

    const res = await request(buildApp()).delete(`/api/marketplace/catalog/${SAVED._id}`);

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
  });
});

function savedForDelete(overrides = {}) {
  const doc = listingWith(overrides);
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.toObject = () => doc;
  return doc;
}
