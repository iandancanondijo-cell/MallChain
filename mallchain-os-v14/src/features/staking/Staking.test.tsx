/**
 * Component-level test for Staking — a real MsgStake/MsgUnstake flow
 * (stakingTx.ts). Drives the actual stake/unstake interaction to lock in
 * that the component calls the real signing service with the right
 * arguments, rather than only testing stakingTx.ts in isolation.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Staking from './Staking';
import { store } from '../../store/store';
import { stakingApi, type StakingSummary } from '../../services/stakingApi';
import { stakeMlcns, unstake } from '../../services/stakingTx';
import { requestMnemonic } from '../../services/mnemonicAccess';

vi.mock('../../services/stakingApi', () => ({
  stakingApi: { getSummary: vi.fn() },
}));

vi.mock('../../services/stakingTx', () => ({
  stakeMlcns: vi.fn(),
  unstake: vi.fn(),
  StakingTxError: class StakingTxError extends Error {},
}));

vi.mock('../../services/mnemonicAccess', () => ({
  requestMnemonic: vi.fn(),
}));

const ADDRESS = 'mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg';
const MNEMONIC = Array(12).fill('abandon').join(' ');

function emptySummary(overrides: Partial<StakingSummary> = {}): StakingSummary {
  return {
    address: ADDRESS,
    displayDenom: 'MLCNS',
    totalStaked: 0,
    totalRewardsClaimed: 0,
    active: [],
    history: [],
    ...overrides,
  };
}

describe('Staking', () => {
  beforeEach(() => {
    store.reset();
    vi.mocked(stakingApi.getSummary).mockReset();
    vi.mocked(stakeMlcns).mockReset();
    vi.mocked(unstake).mockReset();
    vi.mocked(requestMnemonic).mockReset();
    vi.mocked(requestMnemonic).mockResolvedValue(MNEMONIC);

    store.state.wallet.address = ADDRESS;
    store.state.wallet.pinEncryptedMnemonic = 'encrypted-blob';
    store.state.balances.MALL = 500;
    store.commit();
  });

  test('staking an amount calls the real signing service and refreshes the summary', async () => {
    vi.mocked(stakingApi.getSummary).mockResolvedValue({ ok: true, data: { summary: emptySummary() } });
    vi.mocked(stakeMlcns).mockResolvedValue({ txHash: 'STAKETXHASH', stakeId: 's1' } as never);

    render(<Staking />);
    await waitFor(() => expect(stakingApi.getSummary).toHaveBeenCalledWith(ADDRESS));

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Stake'));

    await waitFor(() => expect(stakeMlcns).toHaveBeenCalledWith({ mnemonic: MNEMONIC, fromAddress: ADDRESS, amountMlcns: 50 }));
    // load() is called again after a successful stake to refresh the summary.
    await waitFor(() => expect(stakingApi.getSummary).toHaveBeenCalledTimes(2));
  });

  test('unstaking an active stake calls the real signing service with its stakeId', async () => {
    vi.mocked(stakingApi.getSummary).mockResolvedValue({
      ok: true,
      data: {
        summary: emptySummary({
          active: [{ stakeId: 'stake-42', stakedAmount: 100, stakeDate: 1700000000, rewardsEarned: 5, isActive: true, unlockHeight: 0 }],
        }),
      },
    });
    vi.mocked(unstake).mockResolvedValue({ txHash: 'UNSTAKETXHASH' } as never);

    render(<Staking />);
    await waitFor(() => expect(screen.getByText('Unstake')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Unstake'));

    await waitFor(() =>
      expect(unstake).toHaveBeenCalledWith({ mnemonic: MNEMONIC, fromAddress: ADDRESS, stakeId: 'stake-42' })
    );
  });

  test('the ledger row a stake writes moves the chain coin, not Mallpoints', async () => {
    vi.mocked(stakingApi.getSummary).mockResolvedValue({ ok: true, data: { summary: emptySummary() } });
    vi.mocked(stakeMlcns).mockResolvedValue({ txHash: 'STAKETXHASH', stakeId: 's1' } as never);

    store.state.balances.MLPTS = 100;
    store.commit();

    render(<Staking />);
    await waitFor(() => expect(stakingApi.getSummary).toHaveBeenCalledWith(ADDRESS));

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Stake'));
    await waitFor(() => expect(stakeMlcns).toHaveBeenCalled());

    // It used to record asset 'MLPTS', which took 50 points out of a balance
    // the user never spent and labelled the row with the wrong token.
    expect(store.state.balances.MLPTS).toBe(100);
    expect(store.state.balances.MALL).toBe(450);

    const row = store.state.txs.find((t) => t.type === 'stake');
    expect(row?.asset).toBe('MALL');
    expect(row?.note).toContain('MALL');
  });

  test('does not call stakeMlcns for an amount exceeding the wallet balance', async () => {
    vi.mocked(stakingApi.getSummary).mockResolvedValue({ ok: true, data: { summary: emptySummary() } });

    render(<Staking />);
    await waitFor(() => expect(stakingApi.getSummary).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '999999' } });
    fireEvent.click(screen.getByText('Stake'));

    expect(stakeMlcns).not.toHaveBeenCalled();
  });
});
