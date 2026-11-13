/**
 * Order records — the client half of /api/marketplace/orders.
 *
 * The part worth pinning is not the fetch calls, it is what happens to a
 * purchase when the account record and the browser record disagree:
 *
 *  - A server row always wins. It carries the server-issued id, and showing
 *    both would double-count a purchase the buyer only made once.
 *  - The match is escrow id first, then create tx hash, then order id — the
 *    three references that can survive a device change. A local row with none
 *    of them cannot be matched to anything, so it stays visible as an
 *    unrecorded row. Dropping it would hide a purchase someone paid for.
 *  - `recorded` is the flag the UI tells the truth with, so it must never be
 *    inferred from "has an escrow id" (every checkout has one, saved or not).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { api } from './api';
import {
  marketplaceOrders,
  mergeOrders,
  toLocalOrder,
  mintLocalOrderId,
  type LocalOrder,
  type RecordedOrder,
} from './marketplaceOrders';

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

const CREATED = new Date('2026-11-12T08:00:00.000Z');

function serverOrder(overrides: Partial<RecordedOrder> = {}): RecordedOrder {
  return {
    id: 'MLC-261112-ABCDEF01',
    orderNumber: 'MLC-261112-ABCDEF01',
    items: [{ listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 }],
    itemNames: ['Nairobi Roast Coffee — 500g', 'Nairobi Roast Coffee — 500g'],
    total: 65,
    amountBaseUnits: '65000000',
    denom: 'stake',
    currency: { denom: 'stake', display: 'MAL', decimals: 6 },
    status: 'processing',
    buyerAddress: 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f',
    sellerAddress: 'mall1e3v6mxpsdgpulr9emspwkmr2p480txr850k9dn',
    escrowId: '7',
    createTxHash: 'CREATEHASH',
    releaseTxHash: '',
    disputeTxHash: '',
    escrowVerified: true,
    description: 'Nairobi Roast Coffee — 500g, Nairobi Roast Coffee — 500g',
    disputeWindowSeconds: 604800,
    createdAt: CREATED.toISOString(),
    ts: CREATED.getTime(),
    updatedAt: CREATED.toISOString(),
    ...overrides,
  };
}

const localRow = (overrides: Partial<LocalOrder> = {}): LocalOrder => ({
  id: 'ord-123456-789',
  items: ['Nairobi Roast Coffee — 500g', 'Nairobi Roast Coffee — 500g'],
  total: 65,
  status: 'processing',
  ts: CREATED.getTime(),
  escrowId: '7',
  sellerAddress: 'mall1e3v6mxpsdgpulr9emspwkmr2p480txr850k9dn',
  createTxHash: 'CREATEHASH',
  recorded: false,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
});

describe('toLocalOrder', () => {
  test('a server row is recorded by definition and keeps the server id', () => {
    const row = toLocalOrder(serverOrder());

    expect(row.id).toBe('MLC-261112-ABCDEF01');
    expect(row.recorded).toBe(true);
    expect(row.escrowVerified).toBe(true);
    // itemNames is the receipt's wording; items is what a retry POSTs.
    expect(row.items).toEqual(['Nairobi Roast Coffee — 500g', 'Nairobi Roast Coffee — 500g']);
    expect(row.lines).toEqual([{ listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 }]);
    expect(row.ts).toBe(CREATED.getTime());
  });

  test('an unverified record stays unverified instead of reading as chain-checked', () => {
    expect(toLocalOrder(serverOrder({ escrowVerified: false })).escrowVerified).toBe(false);
  });
});

describe('mergeOrders', () => {
  test('the server row replaces the local copy of the same purchase', () => {
    const merged = mergeOrders([localRow()], [serverOrder()]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('MLC-261112-ABCDEF01');
    expect(merged[0].recorded).toBe(true);
  });

  test('matching is by escrow id, then create tx hash, then order id', () => {
    const byTxOnly = mergeOrders(
      [localRow({ escrowId: undefined, createTxHash: 'CREATEHASH' })],
      [serverOrder()]
    );
    expect(byTxOnly).toHaveLength(1);

    const byIdOnly = mergeOrders(
      [localRow({ id: 'MLC-261112-ABCDEF01', escrowId: undefined, createTxHash: undefined })],
      [serverOrder()]
    );
    expect(byIdOnly).toHaveLength(1);
  });

  test('a local purchase with no shared reference stays visible as unrecorded', () => {
    const orphan = localRow({ id: 'ord-999999-1', escrowId: undefined, createTxHash: undefined });
    const merged = mergeOrders([orphan], [serverOrder()]);

    expect(merged).toHaveLength(2);
    const kept = merged.find((o) => o.id === 'ord-999999-1');
    expect(kept?.recorded).toBe(false);
  });

  test('the server row wins even when the local label is further along', () => {
    // Deliberate: two histories cannot both be true. The server's status is
    // what the account says, so a locally-advanced label is re-pushed with
    // PATCH (see the storefront's "Advance status"), not merged in silently.
    const merged = mergeOrders([localRow({ status: 'shipped' })], [serverOrder({ status: 'processing' })]);

    expect(merged[0].status).toBe('processing');
    expect(merged[0].recorded).toBe(true);
  });

  test('newest first, across both sources', () => {
    const older = serverOrder({ id: 'MLC-OLD', escrowId: '1', createTxHash: 'OLD', ts: 1 });
    // A device row that matches nothing on the account keeps its own place in
    // the ordering instead of being pinned to the bottom.
    const orphan = localRow({ ts: 2, escrowId: '99', createTxHash: 'DEVICEONLY' });
    const merged = mergeOrders([orphan], [older, serverOrder({ ts: 3 })]);

    expect(merged.map((o) => o.ts)).toEqual([3, 2, 1]);
  });

  test('an account with no orders leaves the device rows untouched but unrecorded', () => {
    const merged = mergeOrders([localRow()], []);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('ord-123456-789');
    expect(merged[0].recorded).toBe(false);
  });
});

describe('marketplaceOrders', () => {
  test('create posts the priced lines to the orders endpoint', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true, data: { ok: true, created: true, order: serverOrder() } } as never);

    const res = await marketplaceOrders.create({
      sellerAddress: 'mall1e3v6mxpsdgpulr9emspwkmr2p480txr850k9dn',
      escrowId: '7',
      items: [{ listingId: 'L1', name: 'Nairobi Roast Coffee — 500g', qty: 2, price: 32.5 }],
      total: 65,
    });

    expect(res.ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/api/marketplace/orders', expect.objectContaining({ escrowId: '7', total: 65 }));
  });

  test('list passes the status filter through and leaves it off when unset', async () => {
    vi.mocked(api.get).mockResolvedValue({ ok: true, data: { ok: true, orders: [], total: 0, limit: 50, statuses: [] } } as never);

    await marketplaceOrders.list();
    expect(api.get).toHaveBeenLastCalledWith('/api/marketplace/orders');

    await marketplaceOrders.list({ status: 'disputed', limit: 10 });
    expect(api.get).toHaveBeenLastCalledWith('/api/marketplace/orders?status=disputed&limit=10');
  });

  test('update patches by the server-issued id', async () => {
    vi.mocked(api.patch).mockResolvedValue({ ok: true, data: { ok: true, order: serverOrder({ status: 'delivered' }) } } as never);

    await marketplaceOrders.update('MLC-261112-ABCDEF01', { status: 'delivered', releaseTxHash: 'RELEASEHASH' });

    expect(api.patch).toHaveBeenCalledWith(
      '/api/marketplace/orders/MLC-261112-ABCDEF01',
      { status: 'delivered', releaseTxHash: 'RELEASEHASH' }
    );
  });
});

describe('mintLocalOrderId', () => {
  test('the unsaved fallback keeps the historical ord- shape', () => {
    expect(mintLocalOrderId()).toMatch(/^ord-\d{6}-\d{1,3}$/);
  });
});
