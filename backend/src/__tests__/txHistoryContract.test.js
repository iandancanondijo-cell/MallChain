/**
 * /api/tx/history and /api/tx/:id response contract (handoff §3).
 *
 * Two guarantees these cases exist to keep:
 *
 * 1. A row's time arrives as epoch milliseconds as well as the chain's own
 *    RFC3339 string. `Number(iso)` is NaN, and a client that sorts or exports
 *    on the raw field rendered every chain transaction as "the current time".
 * 2. A row's category arrives as a published enum (`txType`) plus the raw
 *    protobuf URL (`msgType`), instead of leaving each consumer to match on
 *    `@type` fragments and file everything unfamiliar under "Other".
 *
 * Everything is faked at the HTTP edge: axios is mocked, so the router's own
 * RPC/REST discovery order, bank-message skip, de-duplication and
 * filter-before-pagination behaviour are exercised exactly as they run against
 * a node. The controller behind /:id is mocked to prove that only a 64-hex
 * hash takes the chain path and an ObjectId still reaches Mongo.
 */
const express = require('express');
const request = require('supertest');

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../middleware/auth', () => (req, _res, next) => next());
jest.mock('../config', () => ({ config: { chain: { rpc: 'http://127.0.0.1:26657' } } }));
jest.mock('../controllers/txController', () => ({
  list: jest.fn((_req, res) => res.json({ via: 'controller.list' })),
  // The Mongo-record path: /:id must still hand a non-hash id to this.
  get: jest.fn((req, res) => res.json({ via: 'controller.get', id: req.params.id })),
  relay: jest.fn(),
  create: jest.fn(),
}));

const axios = require('axios');
const txRouter = require('../routes/tx');

const ADDRESS = `mall1${'a'.repeat(42)}`;
const OTHER = `mall1${'b'.repeat(42)}`;
const HASH_A = 'A'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_BANK = 'd'.repeat(64);

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/tx', txRouter);
  return server;
}

/**
 * Fake the node: tx_search answers all three discovery queries with the same
 * set (the router de-duplicates by hash), and the REST tx-by-hash endpoint
 * decodes each hash into the given first message.
 */
function nodeRows(rows) {
  const byHash = new Map(rows.map((row) => [row.hash, row]));
  axios.get.mockImplementation(async (url, options) => {
    if (url.includes('/tx_search')) {
      return {
        data: {
          result: {
            txs: rows.map((row) => ({
              hash: row.hash,
              height: String(row.height ?? 100),
              timestamp: row.searchTimestamp ?? '2026-11-01T00:00:00Z',
            })),
          },
        },
      };
    }
    const hash = url.split('/txs/')[1];
    const row = byHash.get(hash);
    if (!row) return Promise.reject(new Error('unknown hash'));
    return {
      data: {
        tx_response: {
          txhash: hash.toUpperCase(),
          code: row.code ?? 0,
          codespace: row.codespace,
          raw_log: row.raw_log,
          height: String(row.height ?? 100),
          timestamp: row.timestamp,
          gas_used: row.gasUsed,
        },
        tx: { body: { messages: [row.message] } },
      },
    };
  });
}

const iso = (day) => `2026-11-0${day}T12:00:00Z`;

describe('GET /api/tx/history — published row shape', () => {
  test('every row carries id, epoch-milliseconds and the taxonomy next to the legacy fields', async () => {
    nodeRows([
      {
        hash: HASH_A,
        height: 10,
        timestamp: iso(1),
        message: { '@type': '/marketplace.mlcoin.v1.MsgTransferMallcoin', from_address: ADDRESS, to_address: OTHER, amount: '25000000' },
      },
      {
        hash: HASH_B,
        height: 9,
        timestamp: iso(2),
        message: { '@type': '/marketplace.mlcoin.v1.MsgStake', from_address: ADDRESS, amount: '5000000' },
      },
    ]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(2);

    const transfer = res.body.transactions.find((t) => t.hash === HASH_A.toUpperCase());
    expect(transfer).toMatchObject({
      id: HASH_A.toUpperCase(),
      from: ADDRESS,
      to: OTHER,
      amount: '25000000',
      type: 'send',
      status: 'confirmed',
      txType: 'send',
      txTypeLabel: 'Sent',
      msgType: '/marketplace.mlcoin.v1.MsgTransferMallcoin',
      block: 10,
    });
    // The point of timestampMs: a plain number the client can sort and bucket.
    expect(transfer.timestampMs).toBe(Date.parse(iso(1)));
    expect(Number.isFinite(transfer.timestampMs)).toBe(true);
    expect(transfer.timestamp).toBe(iso(1));

    const stake = res.body.transactions.find((t) => t.hash === HASH_B.toUpperCase());
    // Signed by this wallet, so the direction says 'send' — but the category
    // says what it is, which is what a stake filter can now match on.
    expect(stake).toMatchObject({ type: 'send', txType: 'stake', txTypeLabel: 'Staked' });
  });

  test('a chain timestamp that cannot be read is 0, never "now"', async () => {
    nodeRows([{ hash: HASH_A, height: 1, timestamp: 'not-a-date', searchTimestamp: undefined, message: { '@type': '/marketplace.mlcoin.v1.MsgStake', from_address: ADDRESS } }]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.body.transactions[0].timestampMs).toBe(0);
  });

  test('a transfer is receive for the wallet that got it, in both the direction and the taxonomy', async () => {
    nodeRows([
      {
        hash: HASH_A,
        timestamp: iso(1),
        message: { '@type': '/marketplace.mlcoin.v1.MsgTransferMallcoin', from_address: OTHER, to_address: ADDRESS, amount: '1000' },
      },
    ]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.body.transactions[0]).toMatchObject({ type: 'receive', txType: 'receive', txTypeLabel: 'Received' });
  });

  test('a bank-module message is skipped rather than shown as a phantom Mallcoin receive', async () => {
    nodeRows([
      { hash: HASH_A, timestamp: iso(1), message: { '@type': '/marketplace.mlcoin.v1.MsgBuyMallcoin', to: ADDRESS, amount: '1000000' } },
      { hash: HASH_BANK, timestamp: iso(1), message: { '@type': '/cosmos.bank.v1beta1.MsgSend', from_address: OTHER, to_address: ADDRESS, amount: [{ amount: '100000', denom: 'stake' }] } },
    ]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.body.transactions.map((t) => t.hash)).toEqual([HASH_A.toUpperCase()]);
    expect(res.body.total).toBe(1);
  });

  test('a failed execution reports failed with the chain’s own reason', async () => {
    nodeRows([
      {
        hash: HASH_A,
        timestamp: iso(1),
        code: 5,
        codespace: 'sdk',
        raw_log: 'insufficient funds',
        message: { '@type': '/marketplace.mlcoin.v1.MsgTransferMallcoin', from_address: ADDRESS, amount: '1' },
      },
    ]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.body.transactions[0]).toMatchObject({ status: 'failed', error: 'sdk: insufficient funds' });
  });

  test('an unclassified message still says what it was', async () => {
    nodeRows([
      { hash: HASH_A, timestamp: iso(1), message: { '@type': '/marketplace.brandnew.v1.MsgSurprise', creator: ADDRESS } },
    ]);

    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS });

    expect(res.body.transactions[0]).toMatchObject({ txType: 'other', txTypeLabel: 'Other on-chain activity', msgType: '/marketplace.brandnew.v1.MsgSurprise' });
  });
});

describe('GET /api/tx/history — filtering', () => {
  const mixed = () =>
    nodeRows([
      { hash: HASH_A, height: 30, timestamp: iso(1), message: { '@type': '/marketplace.mlcoin.v1.MsgTransferMallcoin', from_address: ADDRESS, to_address: OTHER, amount: '1' } },
      { hash: HASH_B, height: 20, timestamp: iso(2), message: { '@type': '/marketplace.mlcoin.v1.MsgStake', from_address: ADDRESS, amount: '2' } },
      { hash: HASH_C, height: 10, timestamp: iso(3), message: { '@type': '/marketplace.mlcoin.v1.MsgTransferMallcoin', from_address: OTHER, to_address: ADDRESS, amount: '3' } },
    ]);

  test('a taxonomy value filters on txType, not on the send/receive direction', async () => {
    mixed();
    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS, type: 'stake' });

    expect(res.body.total).toBe(1);
    expect(res.body.transactions[0]).toMatchObject({ hash: HASH_B.toUpperCase(), txType: 'stake', type: 'send' });
  });

  test('send and receive still mean the direction they always did', async () => {
    mixed();
    const sent = await request(app()).get('/api/tx/history').query({ address: ADDRESS, type: 'send' });
    const received = await request(app()).get('/api/tx/history').query({ address: ADDRESS, type: 'receive' });

    expect(sent.body.transactions.map((t) => t.hash)).toEqual([HASH_A.toUpperCase(), HASH_B.toUpperCase()]);
    expect(received.body.transactions.map((t) => t.hash)).toEqual([HASH_C.toUpperCase()]);
  });

  test('an unknown category is rejected instead of silently returning an empty page', async () => {
    mixed();
    const res = await request(app()).get('/api/tx/history').query({ address: ADDRESS, type: 'not_a_category' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_failed' });
    expect(res.body.details[0].field).toBe('type');
  });

  test('a date range buckets on the epoch field and counts before paginating', async () => {
    mixed();
    const res = await request(app())
      .get('/api/tx/history')
      .query({ address: ADDRESS, startDate: iso(2), endDate: '2026-11-03T23:59:59Z', limit: '1' });

    // Both iso(2) and iso(3) fall inside the window, so the page reports two
    // results and hands back one — the count reflects the filtered set.
    expect(res.body.total).toBe(2);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].timestampMs).toBeGreaterThanOrEqual(Date.parse(iso(2)));
  });
});

describe('GET /api/tx/types', () => {
  test('publishes the catalogue a client needs to render categories', async () => {
    const res = await request(app()).get('/api/tx/types');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.types)).toBe(true);
    expect(res.body.types.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(['send', 'receive', 'purchase', 'sale', 'stake', 'convert', 'swap', 'other'])
    );
    for (const entry of res.body.types) {
      expect(entry).toEqual(expect.objectContaining({ value: expect.any(String), label: expect.any(String), description: expect.any(String), msgTypes: expect.any(Array) }));
    }
    expect(res.body.directions).toEqual(['send', 'receive']);
  });
});

describe('GET /api/tx/:id', () => {
  test('a 64-hex chain hash is decoded from the chain, with the same fields as a history row', async () => {
    nodeRows([
      { hash: HASH_A, height: 42, timestamp: iso(4), message: { '@type': '/marketplace.dex.v1.MsgSwap', creator: ADDRESS, amount: '7' }, gasUsed: '55000' },
    ]);

    const res = await request(app()).get(`/api/tx/${HASH_A}`).query({ address: ADDRESS });

    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      id: HASH_A.toUpperCase(),
      txType: 'swap',
      txTypeLabel: 'Swap',
      timestamp: iso(4),
      timestampMs: Date.parse(iso(4)),
      gasUsed: 55000,
    });
  });

  test('a non-hash id still goes to the Mongo record controller', async () => {
    const res = await request(app()).get('/api/tx/654321abcdef654321abcdef65');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ via: 'controller.get', id: '654321abcdef654321abcdef65' });
  });

  test('an unparseable address for the point of view is refused', async () => {
    nodeRows([]);
    const res = await request(app()).get(`/api/tx/${HASH_A}`).query({ address: "mall1'; DROP" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_address');
  });

  test('a node that cannot be reached is 502, not a 404 claiming the transaction is absent', async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const res = await request(app()).get(`/api/tx/${HASH_A}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('chain_unreachable');
  });

  test('a hash the node answers for, but has no record of, is a 404', async () => {
    axios.get.mockRejectedValueOnce(Object.assign(new Error('tx not found'), { response: { status: 404 } }));

    const res = await request(app()).get(`/api/tx/${HASH_A}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('transaction_not_found');
  });
});
