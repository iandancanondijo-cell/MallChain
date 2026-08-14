const axios = require('axios');

jest.mock('axios');

const { getStakingSummary } = require('../services/stakingService');

describe('stakingService.getStakingSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('splits active and history records and totals staked/rewards', async () => {
    axios.get.mockResolvedValue({
      data: {
        staking_records: [
          {
            stake_id: '1',
            info: { staked_amount: '5000000', stake_date: 100, rewards_earned: '0', is_active: true, unlock_height: 500 },
          },
          {
            stake_id: '2',
            info: { staked_amount: '2000000', stake_date: 50, rewards_earned: '750000', is_active: false, unlock_height: 200 },
          },
        ],
      },
    });

    const summary = await getStakingSummary('mall1abc');

    expect(summary.address).toBe('mall1abc');
    expect(summary.displayDenom).toBe('MLCNS');
    expect(summary.active).toHaveLength(1);
    expect(summary.history).toHaveLength(1);
    expect(summary.active[0]).toMatchObject({ stakeId: '1', stakedAmount: 5, isActive: true, unlockHeight: 500 });
    expect(summary.totalStaked).toBe(5);
    expect(summary.totalRewardsClaimed).toBe(0.75);
  });

  test('accepts camelCase response shape from the REST gateway', async () => {
    axios.get.mockResolvedValue({
      data: {
        stakingRecords: [
          { stakeId: '9', Info: { stakedAmount: '1000000', isActive: true, unlockHeight: 10 } },
        ],
      },
    });

    const summary = await getStakingSummary('mall1def');

    expect(summary.active).toHaveLength(1);
    expect(summary.active[0].stakedAmount).toBe(1);
  });

  test('returns an empty summary when the chain request fails', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'));

    const summary = await getStakingSummary('mall1ghi');

    expect(summary.active).toEqual([]);
    expect(summary.history).toEqual([]);
    expect(summary.totalStaked).toBe(0);
    expect(summary.totalRewardsClaimed).toBe(0);
  });

  test('returns an empty summary when there are no staking records', async () => {
    axios.get.mockResolvedValue({ data: {} });

    const summary = await getStakingSummary('mall1jkl');

    expect(summary.active).toEqual([]);
    expect(summary.history).toEqual([]);
  });

  test('URL-encodes the address in the chain request', async () => {
    axios.get.mockResolvedValue({ data: { staking_records: [] } });

    await getStakingSummary('mall1 with space/slash');

    const calledUrl = axios.get.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent('mall1 with space/slash'));
  });
});
