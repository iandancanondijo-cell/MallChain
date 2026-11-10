const request = require('supertest');
const express = require('express');

// The caller identity has to vary between requests for a two-party flow, so
// middleware/auth is mocked against this object rather than a fixed user id.
const who = { userId: 'user1' };

jest.mock('../models/Contract', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock('../models/user', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../services/notificationEngine', () => ({ notify: jest.fn().mockResolvedValue({}) }));
// A fake blind index keeps the share lookup assertable without the real
// HMAC keys, and a fake decrypt stands in for the stored-encrypted wallet.
jest.mock('../utils/fieldEncryption', () => ({
  blindIndex: (addr) => `blind:${addr}`,
  decryptField: (stored) => (typeof stored === 'string' ? stored.replace(/^enc:/, '') : stored),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: who.userId };
    next();
  })
);
jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const Contract = require('../models/Contract');
const User = require('../models/user');
const { notify } = require('../services/notificationEngine');
const contractsRoutes = require('../routes/contracts');

const PEER_ADDRESS = 'mall1qv8pjfp08fz4qkmxw97g0y5a4zemajw5d9nlcy';
const OWNER_ADDRESS = 'mall1qvdrzjzlw6x6fw7jayqpwtj9t3ec4gdchnnmtc';

/**
 * A Contract document the way mongoose hands one back: mutable fields, a save
 * that records it was called, and toObject for the response.
 */
function doc(over = {}) {
  const d = {
    _id: 'c1',
    userId: 'user1',
    name: 'Escrow',
    type: 'wasm',
    code: '(module)',
    address: 'mall1contractaddr',
    txs: 0,
    status: 'active',
    counterpartyAddress: '',
    counterpartyUserId: null,
    offerStatus: '',
    offerNote: '',
    offeredAt: null,
    respondedAt: null,
    saves: 0,
    save() { d.saves += 1; return Promise.resolve(d); },
    toObject() {
      const { save, saves, toObject, ...rest } = d;
      return rest;
    },
    ...over,
  };
  return d;
}

/** User.findOne(...).select(...).lean() and User.find(...).select(...).lean() */
function chainable(value) {
  const q = { select: jest.fn(() => q), lean: jest.fn(() => Promise.resolve(value)) };
  return q;
}

let app;
beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/contracts', contractsRoutes);
});

beforeEach(() => {
  jest.clearAllMocks();
  who.userId = 'user1';
  notify.mockResolvedValue({});
});

describe('contracts routes', () => {
  test("GET / lists only the caller's contracts, persisted (not lost on restart)", async () => {
    Contract.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: 'c1', name: 'Escrow' }]),
    });

    const res = await request(app).get('/api/contracts');

    expect(res.status).toBe(200);
    expect(Contract.find).toHaveBeenCalledWith({ userId: 'user1' });
    expect(res.body.data).toEqual([{ _id: 'c1', name: 'Escrow' }]);
  });

  test('POST /deploy creates a real Contract document scoped to the caller', async () => {
    Contract.create.mockResolvedValue(doc());

    const res = await request(app).post('/api/contracts/deploy').send({ name: 'Escrow', type: 'wasm', code: '(module)' });

    expect(res.status).toBe(200);
    expect(Contract.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user1', name: 'Escrow' }));
  });

  test('GET /:id 403s when the contract belongs to someone else', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'someoneElse' }));

    const res = await request(app).get('/api/contracts/c1');

    expect(res.status).toBe(403);
  });

  test('GET /:id is readable by the account it was shared with', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' }));

    const res = await request(app).get('/api/contracts/c1');

    expect(res.status).toBe(200);
    expect(res.body.data.party).toBe('counterparty');
  });

  test('DELETE /:id only deletes contracts owned by the caller', async () => {
    Contract.findOneAndDelete.mockResolvedValue({ _id: 'c1' });

    const res = await request(app).delete('/api/contracts/c1');

    expect(res.status).toBe(200);
    expect(Contract.findOneAndDelete).toHaveBeenCalledWith({ _id: 'c1', userId: 'user1' });
  });
});

describe('GET /offers', () => {
  test('reads by counterpartyUserId and names the owner by their linked address', async () => {
    const rows = [doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' }).toObject()];
    Contract.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(rows),
    });
    User.find.mockReturnValue(chainable([{ _id: 'owner2', walletAddress: `enc:${OWNER_ADDRESS}` }]));

    const res = await request(app).get('/api/contracts/offers');

    expect(res.status).toBe(200);
    expect(Contract.find).toHaveBeenCalledWith({ counterpartyUserId: 'user1' });
    expect(res.body.data[0].ownerAddress).toBe(OWNER_ADDRESS);
  });

  test('an owner whose wallet cannot be resolved is an empty address, not a guess', async () => {
    Contract.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([doc({ userId: 'ghost', counterpartyUserId: 'user1' }).toObject()]),
    });
    User.find.mockReturnValue(chainable([]));

    const res = await request(app).get('/api/contracts/offers');

    expect(res.body.data[0].ownerAddress).toBe('');
  });
});

describe('POST /:id/share', () => {
  test('refuses anything that is not an address shape before touching the store', async () => {
    const res = await request(app).post('/api/contracts/c1/share').send({ address: 'not an address at all' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('that is not a valid Mallchain wallet address');
    expect(Contract.findById).not.toHaveBeenCalled();
  });

  test('refuses a missing address', async () => {
    const res = await request(app).post('/api/contracts/c1/share').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('counterparty_address_required');
  });

  test('refuses an address no account has linked, because acceptance is recorded against an account', async () => {
    Contract.findById.mockResolvedValue(doc());
    User.findOne.mockReturnValue(chainable(null));

    const res = await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no Mallchain account has that wallet address linked');
    expect(User.findOne).toHaveBeenCalledWith({ walletAddress_blind: `blind:${PEER_ADDRESS}` });
  });

  test('refuses to share with the caller themself', async () => {
    Contract.findById.mockResolvedValue(doc());
    User.findOne.mockReturnValue(chainable({ _id: 'user1' }));

    const res = await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('cannot share a contract with your own account');
  });

  test('refuses a counterparty trying to widen their own offer', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' }));

    const res = await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the account that deployed this contract can share it');
  });

  test('refuses to overwrite an offer the counterparty already accepted', async () => {
    Contract.findById.mockResolvedValue(doc({ offerStatus: 'accepted', counterpartyUserId: 'peer1', counterpartyAddress: PEER_ADDRESS }));
    User.findOne.mockReturnValue(chainable({ _id: 'peer2' }));

    const res = await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already accepted/);
  });

  test('records the offer against the counterparty and notifies only them', async () => {
    const c = doc();
    Contract.findById.mockResolvedValue(c);
    User.findOne.mockReturnValue(chainable({ _id: 'peer1' }));

    const res = await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS, note: 'takes over the old one' });

    expect(res.status).toBe(200);
    expect(c.counterpartyUserId).toBe('peer1');
    expect(c.counterpartyAddress).toBe(PEER_ADDRESS);
    expect(c.offerStatus).toBe('offered');
    expect(c.offerNote).toBe('takes over the old one');
    expect(c.offeredAt).toBeInstanceOf(Date);
    expect(c.saves).toBe(1);
    expect(res.body.data.party).toBe('owner');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('peer1');
    expect(notify.mock.calls[0][1].title).toBe('Contract offer: Escrow');
  });

  test('offering signs nothing and relays nothing — no chain call is made', async () => {
    Contract.findById.mockResolvedValue(doc());
    User.findOne.mockReturnValue(chainable({ _id: 'peer1' }));

    await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS });

    expect(axios.post).not.toHaveBeenCalled();
  });

  test('a note longer than the field is truncated, not rejected', async () => {
    const c = doc();
    Contract.findById.mockResolvedValue(c);
    User.findOne.mockReturnValue(chainable({ _id: 'peer1' }));

    await request(app).post('/api/contracts/c1/share').send({ address: PEER_ADDRESS, note: 'x'.repeat(600) });

    expect(c.offerNote).toHaveLength(500);
  });
});

describe('POST /:id/accept and /:id/decline', () => {
  test('only the named counterparty can accept', async () => {
    Contract.findById.mockResolvedValue(doc({ offerStatus: 'offered', counterpartyUserId: 'peer1' }));

    const res = await request(app).post('/api/contracts/c1/accept');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the account this contract was shared with can accept it');
  });

  test('the owner cannot accept their own offer', async () => {
    Contract.findById.mockResolvedValue(doc({ offerStatus: 'offered', counterpartyUserId: 'peer1' }));
    who.userId = 'user1';

    const res = await request(app).post('/api/contracts/c1/accept');

    expect(res.status).toBe(403);
  });

  test('accepting a withdrawn offer is refused', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'revoked' }));

    const res = await request(app).post('/api/contracts/c1/accept');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('this offer is revoked, so there is nothing to accept');
  });

  test('accepting records the answer and tells the owner, signing nothing', async () => {
    const c = doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' });
    Contract.findById.mockResolvedValue(c);

    const res = await request(app).post('/api/contracts/c1/accept');

    expect(res.status).toBe(200);
    expect(c.offerStatus).toBe('accepted');
    expect(c.respondedAt).toBeInstanceOf(Date);
    expect(res.body.data.party).toBe('counterparty');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('owner2');
    expect(notify.mock.calls[0][1].title).toBe('Contract accepted: Escrow');
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('declining is a separate answer and invites the owner to offer elsewhere', async () => {
    const c = doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' });
    Contract.findById.mockResolvedValue(c);

    const res = await request(app).post('/api/contracts/c1/decline');

    expect(res.status).toBe(200);
    expect(c.offerStatus).toBe('declined');
    expect(notify.mock.calls[0][1].body).toMatch(/You can share it with someone else/);
  });

  test('the counterparty cannot decline an offer they already accepted', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'accepted' }));

    const res = await request(app).post('/api/contracts/c1/decline');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('this offer is accepted, so there is nothing to decline');
  });
});

describe('POST /:id/revoke', () => {
  test('the owner withdraws an open offer', async () => {
    const c = doc({ offerStatus: 'offered', counterpartyUserId: 'peer1' });
    Contract.findById.mockResolvedValue(c);

    const res = await request(app).post('/api/contracts/c1/revoke');

    expect(res.status).toBe(200);
    expect(c.offerStatus).toBe('revoked');
    expect(notify).not.toHaveBeenCalled();
  });

  test('the counterparty cannot withdraw someone elses offer', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' }));

    const res = await request(app).post('/api/contracts/c1/revoke');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the account that deployed this contract can revoke the offer');
  });

  test('there is nothing to withdraw once it was answered', async () => {
    Contract.findById.mockResolvedValue(doc({ offerStatus: 'accepted' }));

    const res = await request(app).post('/api/contracts/c1/revoke');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('there is no open offer on this contract');
  });
});

describe('POST /:id/interact across the two parties', () => {
  test('an unanswered offer is not permission to spend gas', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'offered' }));

    const res = await request(app).post('/api/contracts/c1/interact').send({ method: 'balance' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });

  test('a declined offer never becomes permission later', async () => {
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'declined' }));

    const res = await request(app).post('/api/contracts/c1/interact').send({ method: 'balance' });

    expect(res.status).toBe(403);
  });

  test('after accepting, the counterparty records executions against the contract', async () => {
    const c = doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'accepted', txs: 4 });
    Contract.findById.mockResolvedValue(c);

    const res = await request(app).post('/api/contracts/c1/interact').send({ method: 'balance', txHash: '0xREAL' });

    expect(res.status).toBe(200);
    expect(c.txs).toBe(5);
    expect(res.body.data.txHash).toBe('0xREAL');
  });

  test('a third account still cannot reach a shared contract', async () => {
    who.userId = 'stranger';
    Contract.findById.mockResolvedValue(doc({ userId: 'owner2', counterpartyUserId: 'user1', offerStatus: 'accepted' }));

    const res = await request(app).post('/api/contracts/c1/interact').send({ method: 'balance' });

    expect(res.status).toBe(403);
  });

  test('the owner keeps executing their own contract', async () => {
    Contract.findById.mockResolvedValue(doc());

    const res = await request(app).post('/api/contracts/c1/interact').send({ method: 'balance' });

    expect(res.status).toBe(200);
  });
});
