jest.mock('../utils/cosmosClient', () => ({
  getClient: jest.fn(),
  simulate: jest.fn(),
  signAndBroadcast: jest.fn(),
  broadcastRawTxBase64: jest.fn(),
  CHAIN_REST: 'http://127.0.0.1:1317',
}));
jest.mock('../utils/redisLock', () => ({
  acquireLock: jest.fn(),
  releaseLock: jest.fn(),
}));

const cosmosClient = require('../utils/cosmosClient');
const redisLock = require('../utils/redisLock');
const { broadcastTransaction } = require('../services/transactionService');

describe('transactionService.broadcastTransaction', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('broadcasts a pre-signed tx directly without touching server signing', async () => {
    cosmosClient.broadcastRawTxBase64.mockResolvedValue({ code: 0, transactionHash: 'HASH1' });

    const result = await broadcastTransaction({
      from: 'mall1a',
      to: 'mall1b',
      amount: 100,
      signedTxBase64: 'c2lnbmVk',
    });

    expect(result).toEqual({ code: 0, transactionHash: 'HASH1' });
    expect(cosmosClient.broadcastRawTxBase64).toHaveBeenCalledWith('c2lnbmVk', expect.any(String));
    expect(cosmosClient.getClient).not.toHaveBeenCalled();
    expect(cosmosClient.signAndBroadcast).not.toHaveBeenCalled();
    expect(redisLock.acquireLock).not.toHaveBeenCalled();
  });

  test('throws when no signed tx is provided', async () => {
    await expect(
      broadcastTransaction({ from: 'mall1a', to: 'mall1b', amount: 100 })
    ).rejects.toThrow('Missing signed transaction');

    expect(cosmosClient.getClient).not.toHaveBeenCalled();
  });

  // Regression: this service used to build a MsgSend from caller-supplied
  // from/to/amount and sign it with the operator key whenever serverSign was
  // set, so any request naming the operator address could move system funds.
  test('ignores serverSign and never signs with the operator key', async () => {
    await expect(
      broadcastTransaction({
        from: 'mall1a',
        to: 'mall1b',
        amount: 100,
        serverSign: true,
      })
    ).rejects.toThrow('Missing signed transaction');

    expect(cosmosClient.signAndBroadcast).not.toHaveBeenCalled();
    expect(cosmosClient.simulate).not.toHaveBeenCalled();
    expect(redisLock.acquireLock).not.toHaveBeenCalled();
  });

  test('still refuses to sign when a signed tx accompanies serverSign', async () => {
    cosmosClient.broadcastRawTxBase64.mockResolvedValue({ code: 0, transactionHash: 'HASH2' });

    const result = await broadcastTransaction({
      from: 'mall1a',
      to: 'mall1b',
      amount: 100,
      signedTxBase64: 'c2lnbmVk',
      serverSign: true,
    });

    expect(result.transactionHash).toBe('HASH2');
    expect(cosmosClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});
