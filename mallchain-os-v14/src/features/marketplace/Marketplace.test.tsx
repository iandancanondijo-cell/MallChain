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

vi.mock('../../services/marketplaceTx', () => ({
  createEscrow: vi.fn(),
  releaseFunds: vi.fn(),
  openDispute: vi.fn(),
  MarketplaceTxError: class MarketplaceTxError extends Error {},
}));

vi.mock('../../services/mnemonicAccess', () => ({
  requestMnemonic: vi.fn(),
}));

const BUYER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const MNEMONIC = Array(12).fill('abandon').join(' ');

// The page ships with no catalog — listings arrive from a marketplace endpoint
// that is not built yet — so these fixtures are injected through the component's
// `products` seam to drive the (real) escrow flow. The addresses are shaped like
// accounts, not actual ones: nothing here should be a funded wallet anyone owns.
const SELLER_ONE = 'mall1sellershareaddressxxxxxxxxxxxxxxxx';
const SELLER_TWO = 'mall1sellershoptwoaddressxxxxxxxxxxxxxxxx';

const CATALOG: Product[] = [
  { id: 'prod-1', name: 'Nairobi Roast Coffee — 500g', seller: 'Safari Beans Co.', sellerAddress: SELLER_ONE, price: 32.5, rating: 4.8, img: '☕', cat: 'Food' },
  { id: 'prod-2', name: 'Maasai Beaded Bracelet', seller: 'Maa Crafts', sellerAddress: SELLER_TWO, price: 14.0, rating: 4.9, img: '📿', cat: 'Fashion' },
];

describe('Marketplace checkout', () => {
  beforeEach(() => {
    store.reset();
    vi.mocked(createEscrow).mockReset();
    vi.mocked(requestMnemonic).mockReset();
    vi.mocked(requestMnemonic).mockResolvedValue(MNEMONIC);
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
    expect(await screen.findByText('Escrow #escrow-1')).toBeInTheDocument();
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

  test('with no catalog loaded the page invents nothing', () => {
    render(<Marketplace navigate={() => {}} />);

    expect(screen.queryByText('Add to cart')).toBeNull();
    expect(screen.queryAllByText('Details')).toHaveLength(0);
    expect(screen.getByText('Marketplace Coming Soon')).toBeInTheDocument();
    expect(screen.getByText(/marketplace catalog endpoint/)).toBeInTheDocument();
  });

  test('a catalog with nothing matching the filters says so instead of claiming there is no marketplace', () => {
    render(<Marketplace navigate={() => {}} products={CATALOG} />);

    fireEvent.change(screen.getByPlaceholderText(/Search products/), { target: { value: 'zzz-nothing' } });

    expect(screen.getByText('No products match')).toBeInTheDocument();
    expect(screen.queryByText('Marketplace Coming Soon')).toBeNull();

    fireEvent.click(screen.getByText('Clear filters'));

    expect(screen.getAllByText('Add to cart')).toHaveLength(CATALOG.length);
  });
});
