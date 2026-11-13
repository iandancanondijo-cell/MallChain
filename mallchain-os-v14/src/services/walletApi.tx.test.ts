/**
 * walletApi's chain-history mapping — the client half of the /api/tx contract
 * (backend/src/routes/tx.js, API_REFERENCE.md "Backend REST: transaction
 * history").
 *
 * What is pinned here is that the client takes the server's answers instead of
 * making its own:
 *   - time comes from `timestampMs`, and an unreadable one stays 0 ("unknown")
 *     rather than becoming Date.now() or a 1970 date on screen;
 *   - the category comes from `txType`/`txTypeLabel`, while `type` keeps its
 *     original meaning of which side this wallet was on;
 *   - the detail lookup goes to /api/tx/{hash} for a chain transaction, since
 *     /api/transactions/{id} validates its id as a Mongo ObjectId and every
 *     history row's id is a 64-hex hash — the mismatch that made opening a
 *     transaction a guaranteed failure.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const apiStub = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('./api', () => ({ api: apiStub }));

import { walletApi } from './walletApi';

const ADDRESS = `mall1${'a'.repeat(38)}`;
const OTHER = `mall1${'b'.repeat(38)}`;
const HASH = 'A'.repeat(64);
const OBJECT_ID = '654321abcdef654321abcdef65';
const TS_MS = Date.parse('2026-11-03T10:00:00.000Z');

const chainRow = (overrides: Record<string, unknown> = {}) => ({
  id: HASH,
  hash: HASH,
  from: ADDRESS,
  to: OTHER,
  amount: '25000000',
  type: 'send',
  txType: 'send',
  txTypeLabel: 'Sent',
  msgType: '/marketplace.mlcoin.v1.MsgTransferMallcoin',
  status: 'confirmed',
  timestamp: '2026-11-03T10:00:00Z',
  timestampMs: TS_MS,
  block: 1234,
  ...overrides,
});

function historyRows(rows: unknown[]) {
  apiStub.get.mockResolvedValue({ ok: true, data: { success: true, transactions: rows, total: rows.length, page: 1, limit: 20 } });
}

beforeEach(() => {
  apiStub.get.mockReset();
});

describe('getTransactions', () => {
  it('maps the published fields without re-deriving any of them', async () => {
    historyRows([chainRow()]);

    const res = await walletApi.getTransactions({ walletAddress: ADDRESS });

    expect(res.ok).toBe(true);
    const [tx] = res.data!.transactions;
    expect(tx).toMatchObject({
      id: HASH,
      hash: HASH,
      type: 'send',
      txType: 'send',
      txTypeLabel: 'Sent',
      msgType: '/marketplace.mlcoin.v1.MsgTransferMallcoin',
      amount: 25,
      asset: 'MALL',
      status: 'confirmed',
      ts: TS_MS,
      blockNumber: 1234,
    });
    expect(tx.note).toBeUndefined();
  });

  it('keeps the direction and the category as two separate facts', async () => {
    // A stake this wallet signed: direction 'send', category 'stake'. Folding
    // one into the other is what made every non-transfer look like a transfer.
    historyRows([chainRow({ txType: 'stake', txTypeLabel: 'Staked', msgType: '/marketplace.mlcoin.v1.MsgStake', amount: '5000000' })]);

    const [tx] = (await walletApi.getTransactions({ walletAddress: ADDRESS })).data!.transactions;

    expect(tx).toMatchObject({ type: 'send', txType: 'stake', txTypeLabel: 'Staked', amount: 5 });
  });

  it('asks the server to filter, rather than fetching everything and slicing here', async () => {
    historyRows([]);

    await walletApi.getTransactions({ walletAddress: ADDRESS, type: 'stake', status: 'failed', search: 'abc', startDate: '2026-11-01', endDate: '2026-11-05', page: 2, pageSize: 50 });

    const url = apiStub.get.mock.calls[0][0] as string;
    expect(url).toContain('/api/tx/history?');
    for (const part of ['address=', 'type=stake', 'status=failed', 'search=abc', 'startDate=2026-11-01', 'endDate=2026-11-05', 'page=2', 'limit=50']) {
      expect(url).toContain(part);
    }
  });

  it('leaves an unreadable timestamp as 0 with a note, not as "now"', async () => {
    historyRows([chainRow({ timestampMs: 0, timestamp: '' })]);

    const [tx] = (await walletApi.getTransactions({ walletAddress: ADDRESS })).data!.transactions;

    expect(tx.ts).toBe(0);
    expect(tx.note).toBe('Chain returned no usable timestamp for this transaction');
    // The assertion that matters for the CSV export and every row on screen:
    // the value is not today's date dressed up as a chain fact.
    expect(Math.abs(Date.now() - tx.ts)).toBeGreaterThan(86_400_000);
  });

  it('surfaces a failed execution’s own reason as the note', async () => {
    historyRows([chainRow({ status: 'failed', error: 'sdk: out of gas' })]);

    const [tx] = (await walletApi.getTransactions({ walletAddress: ADDRESS })).data!.transactions;

    expect(tx.status).toBe('failed');
    expect(tx.note).toBe('sdk: out of gas');
  });

  it('treats a row with no direction from the server as a send, never as an invented category', async () => {
    historyRows([chainRow({ type: '', txType: '', txTypeLabel: '' })]);

    const [tx] = (await walletApi.getTransactions({ walletAddress: ADDRESS })).data!.transactions;

    expect(tx).toMatchObject({ type: 'send', txType: 'other', txTypeLabel: 'Other on-chain activity' });
  });
});

describe('getTxTypes', () => {
  it('returns the published category table', async () => {
    apiStub.get.mockResolvedValue({
      ok: true,
      data: { success: true, types: [{ value: 'stake', label: 'Staked', description: 'd', msgTypes: ['/x'] }], directions: ['send', 'receive'] },
    });

    const res = await walletApi.getTxTypes();

    expect(apiStub.get).toHaveBeenCalledWith('/api/tx/types');
    expect(res.ok).toBe(true);
    expect(res.data!.types[0].value).toBe('stake');
    expect(res.data!.directions).toEqual(['send', 'receive']);
  });

  it('fails as an error, not as an empty table that would render a direction-only filter', async () => {
    apiStub.get.mockResolvedValue({ ok: false, error: 'HTTP 404' });

    const res = await walletApi.getTxTypes();

    expect(res.ok).toBe(false);
    expect(res.error).toContain('404');
  });
});

describe('getTransactionDetail', () => {
  it('reads a chain hash from /api/tx/{hash}, with the wallet’s address for the point of view', async () => {
    apiStub.get.mockResolvedValue({ ok: true, data: { success: true, transaction: chainRow({ txType: 'receive', txTypeLabel: 'Received', from: OTHER, to: ADDRESS }) } });

    const res = await walletApi.getTransactionDetail(HASH, ADDRESS);

    expect(apiStub.get).toHaveBeenCalledWith(`/api/tx/${HASH}?address=${ADDRESS}`);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ id: HASH, type: 'send', txType: 'receive', txTypeLabel: 'Received', ts: TS_MS });
  });

  it('omits the address when the caller has none, and still decodes the row', async () => {
    apiStub.get.mockResolvedValue({ ok: true, data: { success: true, transaction: chainRow() } });

    const res = await walletApi.getTransactionDetail(HASH);

    expect(apiStub.get).toHaveBeenCalledWith(`/api/tx/${HASH}`);
    expect(res.ok).toBe(true);
  });

  it('sends a Mongo ObjectId to the queued-record route', async () => {
    apiStub.get.mockResolvedValue({ ok: true, data: { id: OBJECT_ID, type: 'send', status: 'pending', amount: 1, asset: 'MALL', ts: TS_MS } });

    const res = await walletApi.getTransactionDetail(OBJECT_ID);

    expect(apiStub.get).toHaveBeenCalledWith(`/api/transactions/${OBJECT_ID}`);
    expect(res.ok).toBe(true);
  });

  it('reports a chain 404 honestly instead of rendering an empty detail', async () => {
    apiStub.get.mockResolvedValue({ ok: false, error: 'HTTP 404' });

    const res = await walletApi.getTransactionDetail(HASH, ADDRESS);

    expect(res.ok).toBe(false);
    expect(res.data).toBeUndefined();
  });
});
