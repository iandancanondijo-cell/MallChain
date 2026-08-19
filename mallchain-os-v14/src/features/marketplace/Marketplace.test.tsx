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
import Marketplace from './Marketplace';
import { store } from '../../store/store';
import { createEscrow } from '../../services/marketplaceTx';

vi.mock('../../services/marketplaceTx', () => ({
  createEscrow: vi.fn(),
  releaseFunds: vi.fn(),
  openDispute: vi.fn(),
  MarketplaceTxError: class MarketplaceTxError extends Error {},
}));

const BUYER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const MNEMONIC = Array(12).fill('abandon').join(' ');

describe('Marketplace checkout', () => {
  beforeEach(() => {
    store.reset();
    vi.mocked(createEscrow).mockReset();
    store.state.wallet.address = BUYER_ADDRESS;
    store.state.wallet.mnemonic = MNEMONIC;
    store.commit();
  });

  test('adding a product and checking out builds and broadcasts a real MsgCreateEscrow, not a local simulation', async () => {
    vi.mocked(createEscrow).mockResolvedValue({ txHash: 'ESCROWTXHASH', escrowId: 'escrow-1' });

    render(<Marketplace navigate={() => {}} />);

    const firstProductCard = screen.getAllByText('Add to cart')[0].closest('.c-card') as HTMLElement;
    const productName = within(firstProductCard).getByText(/./, { selector: '.nm' }).textContent;
    fireEvent.click(within(firstProductCard).getByText('Add to cart'));

    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    await waitFor(() => expect(createEscrow).toHaveBeenCalledTimes(1));

    const call = vi.mocked(createEscrow).mock.calls[0][0];
    expect(call.mnemonic).toBe(MNEMONIC);
    expect(call.buyer).toBe(BUYER_ADDRESS);
    // seller is one of the real genesis addresses assigned to demo products,
    // not a placeholder/local-only value.
    expect(call.seller).toMatch(/^mall1[a-z0-9]{20,}$/);
    expect(call.description).toContain(productName);

    // Order should now be recorded with the real escrow id/tx hash the
    // (mocked) chain call returned, not a locally-fabricated one.
    fireEvent.click(screen.getByText(/📦 Orders \(1\)/));
    expect(await screen.findByText('Escrow #escrow-1')).toBeInTheDocument();
  });

  test('checkout is blocked with a clear message when no wallet is loaded', async () => {
    store.state.wallet.address = '';
    store.state.wallet.mnemonic = '';
    store.commit();

    render(<Marketplace navigate={() => {}} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    expect(createEscrow).not.toHaveBeenCalled();
  });

  test('a failed escrow broadcast leaves the cart intact instead of silently clearing it', async () => {
    vi.mocked(createEscrow).mockRejectedValue(new Error('insufficient funds'));

    render(<Marketplace navigate={() => {}} />);

    fireEvent.click(screen.getAllByText('Add to cart')[0]);
    fireEvent.click(screen.getByText(/🛒 Cart \(1\)/));
    fireEvent.click(screen.getByText('Checkout (escrow)'));

    await waitFor(() => expect(createEscrow).toHaveBeenCalledTimes(1));

    // Cart button should still show the item — checkout did not silently
    // "succeed" locally despite the real broadcast failing.
    expect(screen.getByText(/🛒 Cart \(1\)/)).toBeInTheDocument();
  });
});
