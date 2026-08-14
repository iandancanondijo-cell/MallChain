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
    expect(redisLock.acquireLock).not.toHaveBeenCalled();
  });

  test('throws when neither a signed tx nor server signing is provided', async () => {
    await expect(
      broadcastTransaction({ from: 'mall1a', to: 'mall1b', amount: 100 })
    ).rejects.toThrow('Missing signed transaction or server signing is not configured');

    expect(cosmosClient.getClient).not.toHaveBeenCalled();
  });

  test('server-signs, acquires and releases the signer lock, and broadcasts on success', async () => {
    cosmosClient.getClient.mockResolvedValue({});
    cosmosClient.simulate.mockResolvedValue(150000);
    redisLock.acquireLock.mockResolvedValue({ token: 'lock-token' });
    cosmosClient.signAndBroadcast.mockResolvedValue({ code: 0, transactionHash: 'HASH2' });

    const result = await broadcastTransaction({
      from: 'mall1a',
      to: 'mall1b',
      amount: 100,
      serverSign: true,
    });

    expect(result).toEqual({ code: 0, transactionHash: 'HASH2' });
    expect(redisLock.acquireLock).toHaveBeenCalledTimes(1);
    expect(redisLock.releaseLock).toHaveBeenCalledWith({ token: 'lock-token' });
    expect(cosmosClient.signAndBroadcast).toHaveBeenCalledTimes(1);

    const [msgs, fee] = cosmosClient.signAndBroadcast.mock.calls[0];
    expect(msgs[0]).toMatchObject({
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: { fromAddress: 'mall1a', toAddress: 'mall1b' },
    });
    // gas estimate (150000) * 1.2 buffer, rounded up
    expect(Number(fee.gas)).toBe(Math.ceil(150000 * 1.2));
  });

  test('falls back to a default gas estimate when simulation fails', async () => {
    cosmosClient.getClient.mockResolvedValue({});
    cosmosClient.simulate.mockRejectedValue(new Error('simulate unavailable'));
    redisLock.acquireLock.mockResolvedValue({ token: 'lock-token' });
    cosmosClient.signAndBroadcast.mockResolvedValue({ code: 0, transactionHash: 'HASH3' });

    await broadcastTransaction({ from: 'mall1a', to: 'mall1b', amount: 100, serverSign: true });

    const [, fee] = cosmosClient.signAndBroadcast.mock.calls[0];
    expect(Number(fee.gas)).toBe(200000);
  });

  test('releases the signer lock even when signAndBroadcast throws', async () => {
    cosmosClient.getClient.mockResolvedValue({});
    cosmosClient.simulate.mockResolvedValue(150000);
    redisLock.acquireLock.mockResolvedValue({ token: 'lock-token' });
    cosmosClient.signAndBroadcast.mockRejectedValue(new Error('broadcast failed'));

    await expect(
      broadcastTransaction({ from: 'mall1a', to: 'mall1b', amount: 100, serverSign: true })
    ).rejects.toThrow('broadcast failed');

    expect(redisLock.releaseLock).toHaveBeenCalledWith({ token: 'lock-token' });
  });
});
