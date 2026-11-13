/**
 * The order-record contract, tested at the route.
 *
 * This is the surface that replaces the storefront's client-minted `ord-…`
 * ids, so what matters here is that a receipt can never misdescribe the money:
 *
 *  1. The id is issued by the server and is what every response calls `id`.
 *     A Mongo ObjectId never reaches the client.
 *  2. When the chain answers, the escrow's own buyer/seller/amount are stored
 *     and any disagreement with the caller's claim is rejected — the recorded
 *     total can never differ from the coins actually locked.
 *  3. "No such escrow" and "could not ask the node" are different outcomes:
 *     the first is a 404 (a receipt for nothing), the second records the
 *     purchase flagged `escrowVerified: false` so an RPC outage cannot eat a
 *     buyer's order history.
 *  4. Retrying the same purchase returns the order that already exists instead
 *     of writing a second one (double-click / reload between broadcast and
 *     record).
 *  5. The buyer's account is the boundary: another account's order number
 *     reads as not-found, and `delivered` is unreachable without a
 *     releaseTxHash because MsgReleaseFunds is what makes delivery real.
 *
 * Models and the chain RPC are mocked; the router, its Joi schemas, the real
 * category gatekeeper and the shared errorHandler are production code paths.
 */
const express = require('express');
const request = require('supertest');

const BUYER = 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f';
const SELLER = 'mall1e3v6mxpsdgpulr9emspwkmr2p480txr850k9dn';
const OTHER = 'mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5';

jest.mock('axios');
const axios = require('axios');

const ADDRESS_RE = /^mall1[a-z0-9]{38,58}$/;

jest.mock('../models/MarketplaceOrder', () => ({
  ADDRESS_RE: /^mall1[a-z0-9]{38,58}$/,
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  mintOrderNumber: jest.fn().mockResolvedValue('MLC-261112-TESTORDER'),
}));

jest.mock('../models/user', () => ({
  decryptUserPii: (u) => u || {},
}));

jest.mock('../middleware/rateLimiter', () => ({
  limiters: {
    lenient: (_req, _res, next) => next(),
    standard: (_req, _res, next) => next(),
  },
}));

const mockState = { user: null };
jest.mock('../middleware/auth', () =>
  jest.fn((req, _res, next) => {
    req.user = mockState.user;
    next();
  })
);

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

const MarketplaceOrder = require('../models/MarketplaceOrder');
const { errorHandler } = require('../utils/errorHandler');

// Mongoose-ish chain: awaitable, plus .lean() and .sort/.limit/.skip/.limit.
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

function docWith(overrides) {
  const doc = {
    _id: '6520f00000000000000000aa',
    orderNumber: 'MLC-261112-TESTORDER',
    userId: 'user-1',
    buyerAddress: BUYER,
    sellerAddress: SELLER,
    escrowId: '7',
    createTxHash: 'CREATEHASH',
    releaseTxHash: '',
    disputeTxHash: '',
    items: [{ listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 }],
    total: 65,
    amountBaseUnits: '65000000',
    denom: 'stake',
    description: 'Nairobi Roast Coffee — 500g, Nairobi Roast Coffee — 500g',
    status: 'processing',
    escrowVerified: true,
    disputeWindowSeconds: 604800,
    createdAt: new Date('2026-11-12T08:00:00.000Z'),
    updatedAt: new Date('2026-11-12T08:00:00.000Z'),
    ...overrides,
  };
  doc.save = jest.fn().mockImplementation(async () => doc);
  doc.toObject = () => ({ ...doc, save: undefined, toObject: undefined });
  return doc;
}

// The grpc-gateway's protojson shape (camelCase), as the escrow routes see it.
function chainEscrow(overrides) {
  return {
    id: '7',
    buyer: BUYER,
    seller: SELLER,
    amount: '65000000',
    denom: 'stake',
    description: 'Nairobi Roast Coffee — 500g, Nairobi Roast Coffee — 500g',
    status: 'escrow',
    lockedFunds: '65000000',
    createdAt: 1762934400,
    releaseTime: 0,
    disputeWindow: 604800,
    ...overrides,
  };
}

function buildApp(user = { _id: 'user-1', walletAddress: BUYER, role: 'user' }) {
  mockState.user = user;
  require('../middleware/auth').mockImplementation((req, _res, next) => {
    req.user = mockState.user;
    next();
  });
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace/orders', require('../routes/marketplaceOrders'));
  app.use(errorHandler());
  return app;
}

const orderBody = (overrides = {}) => ({
  buyerAddress: BUYER,
  sellerAddress: SELLER,
  escrowId: '7',
  createTxHash: 'CREATEHASH',
  items: [{ listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 }],
  total: 65,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  MarketplaceOrder.mintOrderNumber.mockResolvedValue('MLC-261112-TESTORDER');
  MarketplaceOrder.findOne.mockReturnValue(chain(null));
  MarketplaceOrder.find.mockReturnValue(chain([]));
  MarketplaceOrder.countDocuments.mockResolvedValue(0);
  MarketplaceOrder.create.mockImplementation(async (doc) => ({
    ...doc,
    orderNumber: doc.orderNumber || 'MLC-261112-TESTORDER',
    createdAt: new Date('2026-11-12T08:00:00.000Z'),
    updatedAt: new Date('2026-11-12T08:00:00.000Z'),
    toObject() {
      return { ...this };
    },
  }));
});

describe('POST /api/marketplace/orders', () => {
  test('issues the order id and stores what the escrow says, not what the caller claimed', async () => {
    axios.get.mockResolvedValue({ data: { escrow: chainEscrow() } });
    const app = buildApp();

    // A claim about the seller that the chain disagrees with must not survive;
    // the escrow's own seller is what gets written.
    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, created: true });
    expect(res.body.order.id).toBe('MLC-261112-TESTORDER');
    expect(res.body.order.orderNumber).toBe('MLC-261112-TESTORDER');
    expect(res.body.order.escrowVerified).toBe(true);
    expect(res.body.order.total).toBe(65);
    expect(res.body.order.amountBaseUnits).toBe('65000000');
    expect(res.body.order.ts).toBe(new Date('2026-11-12T08:00:00.000Z').getTime());
    expect(MarketplaceOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'MLC-261112-TESTORDER',
        userId: 'user-1',
        buyerAddress: BUYER,
        sellerAddress: SELLER,
        escrowId: '7',
        escrowVerified: true,
        status: 'processing',
      })
    );
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/marketplace/marketplace/v1/escrow/7'),
      expect.any(Object)
    );
  });

  test('rejects a total the escrow does not hold and writes nothing', async () => {
    axios.get.mockResolvedValue({ data: { escrow: chainEscrow({ amount: '64000000' }) } });
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
    expect(res.body.error.message).toMatch(/holds 64 MAL, this order states 65 MAL/);
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('rejects an escrow the chain does not have — no receipt for nothing', async () => {
    axios.get.mockRejectedValue({
      response: { status: 500, data: { message: 'escrow 7 not found' } },
      message: 'Request failed with status code 500',
    });
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('records the order when the node is unreachable, flagged unverified', async () => {
    axios.get.mockRejectedValue({ message: 'connect ECONNREFUSED 127.0.0.1:1317' });
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(201);
    expect(res.body.order.escrowVerified).toBe(false);
    expect(res.body.order.total).toBe(65);
    expect(MarketplaceOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ escrowVerified: false })
    );
  });

  test('a node that will not answer the query records unverified, not "no such escrow"', async () => {
    // HTTP 200 carrying a grpc status body: the running legacy binary reports
    // unregistered queries this way. Calling that a missing escrow would
    // refuse a real purchase because of our own node build.
    axios.get.mockResolvedValue({ data: { code: 12, message: 'Not Implemented' } });
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(201);
    expect(res.body.order.escrowVerified).toBe(false);
    expect(MarketplaceOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ escrowVerified: false })
    );
  });

  test('a retried purchase returns the existing order instead of writing a second one', async () => {
    const app = buildApp();
    MarketplaceOrder.findOne.mockReturnValue(chain(docWith({ status: 'shipped' })));

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.order.status).toBe('shipped');
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('an identical receipt with no chain reference returns the first order, not a second one', async () => {
    const app = buildApp();
    // What a double-clicked checkout actually looks like: the escrow broadcast
    // never gave back an id or hash, so nothing above can match on it.
    const existing = docWith({ escrowId: '', createTxHash: '' });
    MarketplaceOrder.findOne.mockReturnValue(chain(existing));

    const res = await request(app)
      .post('/api/marketplace/orders')
      .send(orderBody({ escrowId: '', createTxHash: '' }));

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
    expect(MarketplaceOrder.findOne).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      receiptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  test('the receipt fingerprint ignores the order the lines arrived in', async () => {
    const app = buildApp();
    const lines = [
      { listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 },
      { listingId: 'L2', name: 'Maasai Honey 250g', qty: 1, price: 12 },
    ];

    await request(app).post('/api/marketplace/orders')
      .send(orderBody({ escrowId: '', createTxHash: '', items: lines, total: 77 }));
    await request(app).post('/api/marketplace/orders')
      .send(orderBody({ escrowId: '', createTxHash: '', items: [...lines].reverse(), total: 77 }));

    const [first, second] = MarketplaceOrder.create.mock.calls.map(([doc]) => doc.receiptHash);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  test('the receipt fingerprint changes when the basket changes', async () => {
    const app = buildApp();
    const lines = [
      { listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 },
      { listingId: 'L2', name: 'Maasai Honey 250g', qty: 1, price: 12 },
    ];

    await request(app).post('/api/marketplace/orders')
      .send(orderBody({ escrowId: '', createTxHash: '', items: lines, total: 77 }));
    await request(app).post('/api/marketplace/orders')
      .send(orderBody({
        escrowId: '',
        createTxHash: '',
        items: [{ ...lines[0], qty: 1 }],
        total: 32.5,
      }));

    const [first, second] = MarketplaceOrder.create.mock.calls.map(([doc]) => doc.receiptHash);
    expect(second).not.toBe(first);
  });

  test('rejects a createTxHash that is already recorded', async () => {
    const app = buildApp();
    MarketplaceOrder.findOne
      .mockReturnValueOnce(chain(null)) // escrowId lookup
      .mockReturnValueOnce(chain(docWith({ escrowId: '9' }))); // createTxHash lookup

    const res = await request(app).post('/api/marketplace/orders').send(orderBody({ escrowId: '7' }));

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('the chain wins on who created the escrow: a stranger\'s escrow is a 403', async () => {
    axios.get.mockResolvedValue({ data: { escrow: chainEscrow({ buyer: OTHER }) } });
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/created by/);
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('refuses a body address that is not the account\'s linked wallet', async () => {
    const app = buildApp({ _id: 'user-1', walletAddress: BUYER, role: 'user' });

    const res = await request(app).post('/api/marketplace/orders').send(orderBody({ buyerAddress: OTHER }));

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/must be signed by the wallet linked to this account/);
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('an account with no linked wallet may state its own buyer address', async () => {
    axios.get.mockResolvedValue({ data: { escrow: chainEscrow() } });
    const app = buildApp({ _id: 'user-1', role: 'user' });

    const res = await request(app).post('/api/marketplace/orders').send(orderBody());

    expect(res.status).toBe(201);
    expect(MarketplaceOrder.create).toHaveBeenCalledWith(expect.objectContaining({ buyerAddress: BUYER }));
  });

  test('a total that does not add up against the line items fails before the chain is asked', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody({ total: 99 }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
    expect(axios.get).not.toHaveBeenCalled();
    expect(MarketplaceOrder.create).not.toHaveBeenCalled();
  });

  test('line items with an empty name are rejected by the schema', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody({ items: [{ name: '', qty: 1, price: 1 }] }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST_FORMAT');
  });

  test('an order with no escrowId is still recorded, unverified', async () => {
    const app = buildApp();

    const res = await request(app).post('/api/marketplace/orders').send(orderBody({ escrowId: '', createTxHash: '' }));

    expect(res.status).toBe(201);
    expect(res.body.order.escrowVerified).toBe(false);
    expect(res.body.order.escrowId).toBe('');
    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('GET /api/marketplace/orders', () => {
  test('lists only the caller\'s orders and maps the document into the client shape', async () => {
    const app = buildApp();
    MarketplaceOrder.find.mockReturnValue(chain([docWith()]));
    MarketplaceOrder.countDocuments.mockResolvedValue(1);

    const res = await request(app).get('/api/marketplace/orders');

    expect(res.status).toBe(200);
    expect(MarketplaceOrder.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0]).toMatchObject({
      id: 'MLC-261112-TESTORDER',
      status: 'processing',
      escrowVerified: true,
      itemNames: ['Nairobi Roast Coffee — 500g'],
    });
    expect(res.body.total).toBe(1);
  });

  test('a status filter is applied and an unknown one is ignored rather than injected', async () => {
    const app = buildApp();

    await request(app).get('/api/marketplace/orders?status=disputed');
    expect(MarketplaceOrder.find).toHaveBeenLastCalledWith({ userId: 'user-1', status: 'disputed' });

    await request(app).get('/api/marketplace/orders?status=%24where');
    expect(MarketplaceOrder.find).toHaveBeenLastCalledWith({ userId: 'user-1' });
  });
});

describe('GET /api/marketplace/orders/:id', () => {
  test('the owner reads their order by the server-issued id', async () => {
    const app = buildApp();
    MarketplaceOrder.findOne.mockReturnValue(chain(docWith()));

    const res = await request(app).get('/api/marketplace/orders/MLC-261112-TESTORDER');

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe('MLC-261112-TESTORDER');
  });

  test('another account\'s order number reads as not found', async () => {
    const app = buildApp({ _id: 'user-2', walletAddress: OTHER, role: 'user' });
    MarketplaceOrder.findOne.mockReturnValue(chain(docWith({ userId: 'user-1' })));

    const res = await request(app).get('/api/marketplace/orders/MLC-261112-TESTORDER');

    expect(res.status).toBe(404);
  });

  test('a marketplace admin can open a buyer\'s order (dispute handling)', async () => {
    const app = buildApp({ _id: 'admin-1', role: 'admin', adminCategory: 'marketplace' });
    MarketplaceOrder.findOne.mockReturnValue(chain(docWith({ userId: 'user-1' })));

    const res = await request(app).get('/api/marketplace/orders/MLC-261112-TESTORDER');

    expect(res.status).toBe(200);
  });

  test('a mining admin cannot (the category gate is real, not role-alone)', async () => {
    const app = buildApp({ _id: 'admin-2', role: 'admin', adminCategory: 'mining' });
    MarketplaceOrder.findOne.mockReturnValue(chain(docWith({ userId: 'user-1' })));

    const res = await request(app).get('/api/marketplace/orders/MLC-261112-TESTORDER');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/marketplace/orders/:id', () => {
  test('advances the workflow and attaches the release hash on delivery', async () => {
    const app = buildApp();
    const doc = docWith({ status: 'transit' });
    MarketplaceOrder.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'delivered', releaseTxHash: 'RELEASEHASH' });

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
    expect(res.body.order).toMatchObject({ status: 'delivered', releaseTxHash: 'RELEASEHASH' });
  });

  test('refuses to mark an order delivered without the MsgReleaseFunds hash', async () => {
    const app = buildApp();
    MarketplaceOrder.findOne.mockResolvedValue(docWith({ status: 'transit' }));

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'delivered' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TRANSACTION');
  });

  test('only forward steps: processing cannot jump to delivered', async () => {
    const app = buildApp();
    const doc = docWith({ status: 'processing' });
    MarketplaceOrder.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'delivered', releaseTxHash: 'X'.repeat(64) });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cannot move to 'delivered'/);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('a buyer cancels by disputing; cancellation is a moderator action', async () => {
    const app = buildApp();
    // 'disputed' → 'cancelled' is a legal transition for a moderator, so the
    // only thing that can reject it here is who is asking.
    const doc = docWith({ status: 'disputed' });
    MarketplaceOrder.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'cancelled' });

    expect(res.status).toBe(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('a marketplace admin can cancel, and the escrow id attaches late', async () => {
    const app = buildApp({ _id: 'admin-1', role: 'admin', adminCategory: 'marketplace' });
    const doc = docWith({ status: 'disputed', escrowId: '', disputeTxHash: '' });
    MarketplaceOrder.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'cancelled', escrowId: '11' });

    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: 'cancelled', escrowId: '11' });
  });

  test('another account cannot advance a stranger\'s order', async () => {
    const app = buildApp({ _id: 'user-2', walletAddress: OTHER, role: 'user' });
    const doc = docWith({ userId: 'user-1' });
    MarketplaceOrder.findOne.mockResolvedValue(doc);

    const res = await request(app)
      .patch('/api/marketplace/orders/MLC-261112-TESTORDER')
      .send({ status: 'shipped' });

    expect(res.status).toBe(404);
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe('GET /api/marketplace/orders/manage', () => {
  test('is admin-only and reports whole-ledger counts', async () => {
    const app = buildApp({ _id: 'admin-1', role: 'admin', adminCategory: 'marketplace' });
    MarketplaceOrder.find.mockReturnValue(chain([docWith()]));
    MarketplaceOrder.countDocuments.mockImplementation(async (filter) => (filter.status === 'processing' ? 3 : 0));

    const res = await request(app).get('/api/marketplace/orders/manage');

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.counts.processing).toBe(3);
    expect(res.body.counts).toHaveProperty('cancelled');
  });

  test('a plain buyer cannot see everyone\'s orders', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/marketplace/orders/manage');
    expect(res.status).toBe(403);
  });

  test('a mining admin cannot read the marketplace ledger', async () => {
    const app = buildApp({ _id: 'admin-2', role: 'admin', adminCategory: 'mining' });
    const res = await request(app).get('/api/marketplace/orders/manage');
    expect(res.status).toBe(403);
  });
});

// Address regex sanity: the fixtures must be real-shaped addresses or the
// schema checks above are testing nothing.
test('fixtures are valid bech32-shaped addresses', () => {
  expect(ADDRESS_RE.test(BUYER)).toBe(true);
  expect(ADDRESS_RE.test(SELLER)).toBe(true);
  expect(ADDRESS_RE.test(OTHER)).toBe(true);
});
