jest.mock('../utils/keyManager', () => ({
  getTreasuryMnemonic: jest.fn(),
}));
jest.mock('../services/mallcoinTxBuilder', () => ({
  transferFromMnemonic: jest.fn(),
}));

const { getTreasuryMnemonic } = require('../utils/keyManager');
const { transferFromMnemonic } = require('../services/mallcoinTxBuilder');
const rewardMallcoins = require('../utils/rewardMallcoins');

describe('rewardMallcoins', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('signs and broadcasts a real MLCNS transfer using the treasury mnemonic', async () => {
    getTreasuryMnemonic.mockResolvedValue('word '.repeat(12).trim());
    transferFromMnemonic.mockResolvedValue({ txHash: '0xreward' });

    const result = await rewardMallcoins('mall1recipient', 25);

    expect(getTreasuryMnemonic).toHaveBeenCalled();
    expect(transferFromMnemonic).toHaveBeenCalledWith({
      mnemonic: 'word '.repeat(12).trim(),
      toAddress: 'mall1recipient',
      amountMlcns: 25,
      memo: 'Mallcoin reward',
    });
    expect(result).toEqual({ txHash: '0xreward' });
  });

  test('rejects a non-positive amount without touching the treasury mnemonic', async () => {
    await expect(rewardMallcoins('mall1recipient', 0)).rejects.toThrow('amount must be a positive number');
    expect(getTreasuryMnemonic).not.toHaveBeenCalled();
  });

  test('rejects a missing address', async () => {
    await expect(rewardMallcoins('', 10)).rejects.toThrow('address is required');
    expect(getTreasuryMnemonic).not.toHaveBeenCalled();
  });

  test('propagates a treasury-mnemonic failure (e.g. Vault unreachable)', async () => {
    getTreasuryMnemonic.mockRejectedValue(new Error('Failed to retrieve mnemonic from Vault'));

    await expect(rewardMallcoins('mall1recipient', 10)).rejects.toThrow('Failed to retrieve mnemonic from Vault');
    expect(transferFromMnemonic).not.toHaveBeenCalled();
  });
});
