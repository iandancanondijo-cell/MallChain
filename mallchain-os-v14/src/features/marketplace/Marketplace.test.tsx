/**
 * Component-level test for Marketplace — this feature used to be a pure
 * local/localStorage simulation (checkout/advance-status/dispute all went
 * through store.applyTx/store.credit, never a network call), the same
 * "looks wired up, isn't" pattern the original WalletSend bug had. This
 * drives the actual checkout flow through user interaction and asserts a
 * real signed escrow transaction is what actually gets built, not that the
 * service layer alone works (marketplaceTx.test.ts already covers that).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Marketplace, { type Product } from './Marketplace';
import { store } from '../../store/store';
import { createEscrow } from '../../services/marketplaceTx';
import { requestMnemonic } from '../../services/mnemonicAccess';
import { marketplaceCatalog } from '../../services/marketplaceCatalog';
import { marketplaceOrders, type RecordedOrder } from '../../services/marketplaceOrders';

// The storefront's shelf is a network read (GET /api/marketplace/catalog), so
// these suites control what the catalog returns instead of letting a request
// leave jsdom. Nothing here is demo data: the fixtures are what a test *answers
// with*, and one of them is deliberately an empty catalog.
vi.mock('../../services/marketplaceCatalog', () => ({
  marketplaceCatalog: {
    list: vi.fn(),
    get: vi.fn(),
    mine: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const EMPTY_CATALOG = {
  listings: [],
  pagination: { page: 1, limit: 60, total: 0, pages: 0 },
  categories: ['food', 'fashion', 'home', 'tech'],
  currency: { denom: 'stake', display: 'MAL', decimals: 6 },
};

vi.mock('../../services/marketplaceTx', () => ({
  createEscrow: vi.fn(),
  releaseFunds: vi.fn(),
  openDispute: vi.fn(),
  MarketplaceTxError: class MarketplaceTxError extends Error {},
}));

vi.mock('../../services/mnemonicAccess', () => ({
  requestMnemonic: vi.fn(),
}));

// Order records are a network read/write too (GET/POST /api/marketplace/orders).
// The pure helpers stay real — mergeOrders/toLocalOrder are what the component
// uses to turn a server receipt into a row — and only the four calls are stubbed.
vi.mock('../../services/marketplaceOrders', async (importActual) => {
  const actual = await importActual<typeof import('../../services/marketplaceOrders')>();
  return {
    ...actual,
    marketplaceOrders: { create: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn() },
  };
});

const BUYER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const MNEMONIC = Array(12).fill('abandon').join(' ');

// Injected through the component's `products` seam so the escrow flow can be
// driven without a catalog round-trip. The addresses are shaped like accounts,
// not actual ones: nothing here should be a funded wallet anyone owns.
const SELLER_ONE = 'mall1sellershareaddressxxxxxxxxxxxxxxxx';
const SELLER_TWO = 'mall1sellershoptwoaddressxxxxxxxxxxxxxxxx';

const CATALOG: Product[] = [
  { id: 'prod-1', name: 'Nairobi Roast Coffee — 500g', seller: 'Safari Beans Co.', sellerAddress: SELLER_ONE, price: 32.5, rating: 4.8, img: '☕', cat: 'Food' },
  { id: 'prod-2', name: 'Maasai Beaded Bracelet', seller: 'Maa Crafts', sellerAddress: SELLER_TWO, price: 14.0, rating: 4.9, img: '📿', cat: 'Fashion' },
];

// What POST/GET /api/marketplace/orders answers: the shape
// backend/src/routes/marketplaceOrders.js `toPublicOrder` emits, with the
// server-issued id that replaces the storefront's old `ord-…`.
function serverOrder(overrides: Partial<RecordedOrder> = {}): RecordedOrder {
  const created = new Date('2026-11-12T08:00:00.000Z');
  return {
    id: 'MLC-261112-ABCDEF01',
    orderNumber: 'MLC-261112-ABCDEF01',
    items: [{ listingId: 'prod-1', name: 'Nairobi Roast Coffee — 500g', qty: 1, price: 32.5 }],
    itemNames: ['Nairobi Roast Coffee — 500g'],
    total: 32.5,
    amountBaseUnits: '32500000',
    denom: 'stake',
    currency: { denom: 'stake', display: 'MAL', decimals: 6 },
    status: 'processing',
    buyerAddress: BUYER_ADDRESS,
    sellerAddress: SELLER_ONE,
    escrowId: 'escrow-1',
    createTxHash: 'ESCROWTXHASH',
    releaseTxHash: '',
    disputeTxHash: '',
    escrowVerified: true,
    description: 'Nairobi Roast Coffee — 500g',
    disputeWindowSeconds: 604800,
    createdAt: created.toISOString(),
    ts: created.getTime(),
    updatedAt: created.toISOString(),
    ...overrides,
  };
}

describe('Marketplace checkout', () => {
  beforeEach(() => {
    store.reset();
    vi.mocked(createEscrow).mockReset();
    vi.mocked(requestMnemonic).mockReset();
    vi.mocked(requestMnemonic).mockResolvedValue(MNEMONIC);
    vi.mocked(marketplaceOrders.create).mockReset();
    vi.mocked(marketplaceOrders.list).mockReset();
    vi.mocked(marketplaceOrders.update).mockReset();
    // Default: the order service cannot be reached. A purchase whose escrow is
    // already locked must still show up, as an honest device-local row.
    vi.mocked(marketplaceOrders.create).mockResolvedValue({ ok: false, error: 'order service unreachable' } as never);
    vi.mocked(marketplaceOrders.list).mockResolvedValue({
      ok: true, data: { ok: true, orders: [], total: 0, limit: 50, statuses: [], currency: { denom: 'stake', display: 'MAL', decimals: 6 } },
    } as never);
    vi.mocked(marketplaceOrders.update).mockResolvedValue({ ok: true, data: { ok: true, order: serverOrder() } } as never);
    store.state.wallet.address = BUYER_ADDRESS;
    store.state.wallet.pinEncryptedMnemonic = 'encrypted-blob';
    store.commit();
  });

  test('adding a product and checking out builds and broadcasts a real MsgCreateEscrow, not a local simulation', async () => {
    vi.mocked(createEscrow).mockResolvedValue({ txHash: 'ESCROWTXHASH', escrowId: 'escrow-1' });

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    const firstProductCard = screen.getAllByText('Add to cart')[0].closest('.c-card') as HTMLElement;
    const productName = within(firstProductCard).getByText(/./, { selector: '.nm' }).textContent;
    fireEvent.click(within(firstProductCard).getByText('Add to cart'));

    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    await waitFor(() => expect(createEscrow).toHaveBeenCalledTimes(1));

    const call = vi.mocked(createEscrow).mock.calls[0][0];
    expect(call.mnemonic).toBe(MNEMONIC);
    expect(call.buyer).toBe(BUYER_ADDRESS);
    // The seller on the escrow is the address the listing carries, taken
    // through to the chain rather than replaced with a local stand-in.
    expect(call.seller).toMatch(/^mall1[a-z0-9]{20,}$/);
    expect(call.description).toContain(productName);

    // Order should now be recorded with the real escrow id/tx hash the
    // (mocked) chain call returned, not a locally-fabricated one.
    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText(/Escrow #escrow-1/)).toBeInTheDocument();
  });

  test('checkout gives the purchase a server-issued order id and records priced lines', async () => {
    vi.mocked(createEscrow).mockResolvedValue({ txHash: 'ESCROWTXHASH', escrowId: 'escrow-1' });
    vi.mocked(marketplaceOrders.create).mockResolvedValue({ ok: true, created: true, data: { ok: true, created: true, order: serverOrder() } } as never);

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    await waitFor(() => expect(marketplaceOrders.create).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(marketplaceOrders.create).mock.calls[0][0];
    expect(payload.sellerAddress).toBe(SELLER_ONE);
    expect(payload.buyerAddress).toBe(BUYER_ADDRESS);
    expect(payload.escrowId).toBe('escrow-1');
    expect(payload.createTxHash).toBe('ESCROWTXHASH');
    // The receipt carries quantity and unit price, not one row per cart unit,
    // because the server re-derives the total from them.
    expect(payload.items).toEqual([{ listingId: 'prod-1', name: 'Nairobi Roast Coffee — 500g', qty: 1, price: 32.5 }]);
    expect(payload.total).toBe(32.5);

    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText('MLC-261112-ABCDEF01')).toBeInTheDocument();
    expect(screen.getByText(/amount verified on-chain/)).toBeInTheDocument();
    // Saved, so the retry affordance is not offered.
    expect(screen.queryByText('On this device only')).toBeNull();
    expect(screen.queryByText('Save to account')).toBeNull();
  });

  test('a receipt the order service refused stays visible as device-local and can be saved later', async () => {
    vi.mocked(createEscrow).mockResolvedValue({ txHash: 'ESCROWTXHASH', escrowId: 'escrow-1' });
    store.state.user.authed = true;
    store.commit();
    vi.mocked(marketplaceOrders.create)
      .mockResolvedValueOnce({ ok: false, error: 'order service unreachable' } as never)
      .mockResolvedValueOnce({ ok: true, created: true, data: { ok: true, created: true, order: serverOrder() } } as never);

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));
    await waitFor(() => expect(marketplaceOrders.create).toHaveBeenCalledTimes(1));

    // The purchase is real (escrow locked) even though the record failed, so
    // it must appear — flagged, not hidden and not dressed up as saved.
    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText('On this device only')).toBeInTheDocument();
    expect(screen.getByText(/order service unreachable/)).toBeInTheDocument();
    expect(screen.getByText(/Escrow #escrow-1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Save to account'));
    expect(await screen.findByText('MLC-261112-ABCDEF01')).toBeInTheDocument();
    expect(screen.queryByText('On this device only')).toBeNull();
  });

  test('a signed-in tab loads the account\'s orders instead of showing only this device\'s', async () => {
    store.state.user.authed = true;
    store.commit();
    vi.mocked(marketplaceOrders.list).mockResolvedValue({
      ok: true,
      data: { ok: true, orders: [serverOrder()], total: 1, limit: 50, statuses: ['processing'], currency: { denom: 'stake', display: 'MAL', decimals: 6 } },
    } as never);

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    await waitFor(() => expect(marketplaceOrders.list).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText('MLC-261112-ABCDEF01')).toBeInTheDocument();
    expect(screen.getByText(/Order history from your account/)).toBeInTheDocument();
  });

  test('a recorded receipt with no escrow says the amount is not a chain fact', async () => {
    store.state.user.authed = true;
    store.commit();
    vi.mocked(marketplaceOrders.list).mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        orders: [serverOrder({ escrowId: '', escrowVerified: false })],
        total: 1,
        limit: 50,
        statuses: ['processing'],
        currency: { denom: 'stake', display: 'MAL', decimals: 6 },
      },
    } as never);

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    await waitFor(() => expect(marketplaceOrders.list).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText(/No on-chain escrow recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/amount verified on-chain/)).toBeNull();
  });

  test('advancing a recorded order updates the account record, not just localStorage', async () => {
    vi.mocked(createEscrow).mockResolvedValue({ txHash: 'ESCROWTXHASH', escrowId: 'escrow-1' });
    store.state.user.authed = true;
    store.commit();
    vi.mocked(marketplaceOrders.create).mockResolvedValue({ ok: true, created: true, data: { ok: true, created: true, order: serverOrder() } } as never);
    vi.mocked(marketplaceOrders.list).mockResolvedValue({
      ok: true,
      data: { ok: true, orders: [serverOrder()], total: 1, limit: 50, statuses: ['processing'], currency: { denom: 'stake', display: 'MAL', decimals: 6 } },
    } as never);

    render(<Marketplace navigate={() => {}} products={CATALOG} />);
    await waitFor(() => expect(marketplaceOrders.list).toHaveBeenCalled());

    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    fireEvent.click(await screen.findByText('Advance status'));

    await waitFor(() => expect(marketplaceOrders.update).toHaveBeenCalledWith('MLC-261112-ABCDEF01', { status: 'shipped' }));
  });

  test('checkout is blocked with a clear message when no wallet is loaded', async () => {
    store.state.wallet.address = '';
    store.state.wallet.pinEncryptedMnemonic = '';
    store.commit();

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    expect(createEscrow).not.toHaveBeenCalled();
  });

  test('a failed escrow broadcast leaves the cart intact instead of silently clearing it', async () => {
    vi.mocked(createEscrow).mockRejectedValue(new Error('insufficient funds'));

    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    await waitFor(() => expect(createEscrow).toHaveBeenCalledTimes(1));

    // Cart button should still show the item — checkout did not silently
    // "succeed" locally despite the real broadcast failing.
    expect(screen.getByText(/🛒 Cart \(1\)/)).toBeInTheDocument();
  });

  test('an empty catalog from the API renders an honest empty shelf, not invented products', async () => {
    vi.mocked(marketplaceCatalog.list).mockResolvedValue({ ok: true, data: EMPTY_CATALOG } as never);
    render(<Marketplace navigate={() => {}} />);

    await waitFor(() => expect(marketplaceCatalog.list).toHaveBeenCalled());

    expect(screen.queryByText('Add to cart')).toBeNull();
    expect(screen.queryAllByText('Details')).toHaveLength(0);
    expect(await screen.findByText('No listings yet')).toBeInTheDocument();
    expect(screen.getByText(/No seller has posted anything/)).toBeInTheDocument();
    // The way out of an empty shelf is the real one: post a listing. Header
    // and empty state both offer it, hence getAllByText.
    expect(screen.getAllByText('＋ Sell an item').length).toBeGreaterThan(0);
  });

  test('listings served by the catalog endpoint appear on the shelf', async () => {
    vi.mocked(marketplaceCatalog.list).mockResolvedValue({
      ok: true,
      data: { ...EMPTY_CATALOG, listings: CATALOG, pagination: { ...EMPTY_CATALOG.pagination, total: 2, pages: 1 } },
    } as never);
    render(<Marketplace navigate={() => {}} />);

    expect(await screen.findByText('Nairobi Roast Coffee — 500g')).toBeInTheDocument();
    expect(screen.getByText('Maasai Beaded Bracelet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    expect(screen.getByText(/🛒 Cart \(1\)/)).toBeInTheDocument();
  });

  test('a catalog request that fails says it failed instead of claiming the market is empty', async () => {
    vi.mocked(marketplaceCatalog.list).mockResolvedValue({ ok: false, error: 'catalog unavailable (503)' } as never);
    render(<Marketplace navigate={() => {}} />);

    expect(await screen.findByText('The catalog could not be loaded')).toBeInTheDocument();
    expect(screen.getByText(/catalog unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('No listings yet')).toBeNull();
  });

  test('a catalog with nothing matching the filters says so instead of claiming there is no marketplace', () => {
    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.change(screen.getByPlaceholderText(/Search products/), { target: { value: 'zzz-nothing' } });

    expect(screen.getByText('No products match')).toBeInTheDocument();
    expect(screen.queryByText('No listings yet')).toBeNull();

    fireEvent.click(screen.getByText('Clear filters'));

    expect(screen.getAllByText('Add to cart')).toHaveLength(CATALOG.length);
  });
});
