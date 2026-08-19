/**
 * Component-level test for WalletSend — the flow behind commit a81288e
 * ("Send never worked for real (mall1...) addresses, including genesis
 * wallets"). Unlike mallcoinTx.test.ts (which exercises the signing service
 * directly), this drives the actual component through user interaction —
 * address entry, review, and the recovery-word authorize step — the layer
 * where all three original bugs (address validation, hardcoded word list,
 * local-only simulation) actually lived.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WalletSend from './WalletSend';
import { store } from '../../store/store';
import { sendMallcoinTransfer, MallcoinTxError } from '../../services/mallcoinTx';

vi.mock('../../services/mallcoinTx', () => ({
  sendMallcoinTransfer: vi.fn(),
  MallcoinTxError: class MallcoinTxError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('../../services/faucetApi', () => ({
  faucetApi: { fundGas: vi.fn() },
}));

const SENDER_ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const RECIPIENT_ADDRESS = 'mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6';
// Every word identical so the test doesn't need to know useWizard's
// randomly-picked word index up front — whichever word it asks for, typing
// "abandon" satisfies it.
const UNIFORM_MNEMONIC = Array(12).fill('abandon').join(' ');

describe('WalletSend', () => {
  beforeEach(() => {
    store.reset();
    sessionStorage.clear();
    vi.mocked(sendMallcoinTransfer).mockReset();

    store.state.wallet.address = SENDER_ADDRESS;
    store.state.wallet.mnemonic = UNIFORM_MNEMONIC;
    store.state.balances.MALL = 100;
    store.commit();
  });

  test('happy path: fills recipient/amount, reviews, authorizes, and broadcasts a real signed transfer', async () => {
    vi.mocked(sendMallcoinTransfer).mockResolvedValue({
      txHash: 'REALTXHASH123',
      from: SENDER_ADDRESS,
      to: RECIPIENT_ADDRESS,
      amount: 10,
    });

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });

    fireEvent.click(screen.getByText('Review transaction →'));
    expect(screen.getByText('Review')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue to authorize →'));
    expect(screen.getByText(/Authorize transaction/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('your recovery word'), { target: { value: 'abandon' } });
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    await waitFor(() => expect(sendMallcoinTransfer).toHaveBeenCalledTimes(1));

    // The core regression: a real signed-transfer call, not a local
    // store.applyTx simulation, with the exact address/amount the user
    // entered — matching what the fixed WalletSend actually does.
    expect(sendMallcoinTransfer).toHaveBeenCalledWith({
      mnemonic: UNIFORM_MNEMONIC,
      fromAddress: SENDER_ADDRESS,
      toAddress: RECIPIENT_ADDRESS,
      amountMlcns: 10,
    });

    await waitFor(() => expect(screen.getByText('tx REALTXHASH123')).toBeInTheDocument());
    expect(screen.getByText('Sent 10 MALL')).toBeInTheDocument();
  });

  test('wrong recovery word blocks authorization and never calls sendMallcoinTransfer', async () => {
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Review transaction →'));
    fireEvent.click(screen.getByText('Continue to authorize →'));

    fireEvent.change(screen.getByPlaceholderText('your recovery word'), { target: { value: 'definitely-wrong' } });
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    expect(await screen.findByText(/Incorrect word/i)).toBeInTheDocument();
    expect(sendMallcoinTransfer).not.toHaveBeenCalled();
  });

  test('an invalid (non-bech32) recipient address is rejected before reaching review', () => {
    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Review transaction →'));

    expect(screen.getByText(/Invalid address/i)).toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  test('surfaces the no-on-chain-history error with a way to get gas, instead of a raw error', async () => {
    vi.mocked(sendMallcoinTransfer).mockRejectedValue(
      new MallcoinTxError('needs a small stake balance for gas', 'NO_ON_CHAIN_HISTORY')
    );

    render(<WalletSend />);

    fireEvent.change(screen.getByPlaceholderText(/mall1… \(bech32 address\)/i), {
      target: { value: RECIPIENT_ADDRESS },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.click(screen.getByText('Review transaction →'));
    fireEvent.click(screen.getByText('Continue to authorize →'));
    fireEvent.change(screen.getByPlaceholderText('your recovery word'), { target: { value: 'abandon' } });
    fireEvent.click(screen.getByText('Authorize & broadcast'));

    expect(await screen.findByText(/Get network fee tokens/i)).toBeInTheDocument();
  });
});
