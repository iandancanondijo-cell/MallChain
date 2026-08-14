const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient, calculateFee } = require('@cosmjs/stargate');

// Factory mock (not auto-mock) so Jest never has to load the real
// @cosmjs/proto-signing module tree — @cosmjs/crypto@0.39's argon2 support
// pulls in an ESM-only transitive dependency that Jest's default CJS
// resolution can't parse, which auto-mocking would otherwise trigger.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: { connectWithSigner: jest.fn() },
  GasPrice: { fromString: jest.fn(() => ({})) },
  calculateFee: jest.fn(() => ({ amount: [{ denom: 'stake', amount: '1000' }], gas: '250000' })),
}));

const { toBaseUnits, getAddressFromMnemonic, addLiquidityOnChain } = require('../services/dexTxBuilder');

describe('toBaseUnits', () => {
  test('converts a display amount to base units using the given decimals', () => {
    expect(toBaseUnits(1.5, 6)).toBe('1500000');
  });

  test('defaults to 6 decimals', () => {
    expect(toBaseUnits(2)).toBe('2000000');
  });

  test('rejects negative amounts', () => {
    expect(() => toBaseUnits(-1)).toThrow('Invalid amount for base unit conversion');
  });

  test('rejects non-numeric amounts', () => {
    expect(() => toBaseUnits('not-a-number')).toThrow('Invalid amount for base unit conversion');
  });
});

describe('addLiquidityOnChain', () => {
  const fakeWallet = { getAccounts: jest.fn().mockResolvedValue([{ address: 'mall1provider' }]) };

  beforeEach(() => {
    jest.clearAllMocks();
    DirectSecp256k1HdWallet.fromMnemonic = jest.fn().mockResolvedValue(fakeWallet);
  });

  test('requires a mnemonic', async () => {
    await expect(addLiquidityOnChain({})).rejects.toThrow('Missing mnemonic for liquidity provider');
  });

  test('requires a poolId', async () => {
    await expect(addLiquidityOnChain({ mnemonic: 'm' })).rejects.toThrow('Missing poolId');
  });

  test('rejects when the mnemonic does not match the supplied provider address', async () => {
    await expect(
      addLiquidityOnChain({ mnemonic: 'm', poolId: 1, providerAddress: 'mall1someoneelse' })
    ).rejects.toThrow('Provider mnemonic does not match provider address');
  });

  test('requires tokenA with denom and amount', async () => {
    await expect(
      addLiquidityOnChain({ mnemonic: 'm', poolId: 1, tokenB: { denom: 'b', amount: '1' } })
    ).rejects.toThrow('tokenA must include denom and amount');
  });

  test('requires tokenB with denom and amount', async () => {
    await expect(
      addLiquidityOnChain({ mnemonic: 'm', poolId: 1, tokenA: { denom: 'a', amount: '1' } })
    ).rejects.toThrow('tokenB must include denom and amount');
  });

  test('signs and broadcasts a well-formed liquidity add, returning the tx result', async () => {
    const client = {
      simulate: jest.fn().mockResolvedValue(200000),
      signAndBroadcast: jest.fn().mockResolvedValue({
        code: 0,
        transactionHash: 'HASHLIQ',
        height: 42,
        gasUsed: 190000,
        events: [],
      }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(client);

    const result = await addLiquidityOnChain({
      mnemonic: 'm',
      poolId: 1,
      tokenA: { denom: 'mlcn', amount: '100' },
      tokenB: { denom: 'stake', amount: '100' },
    });

    expect(result).toMatchObject({ success: true, txHash: 'HASHLIQ', height: 42 });
    expect(client.signAndBroadcast).toHaveBeenCalledWith(
      'mall1provider',
      expect.arrayContaining([expect.objectContaining({ typeUrl: '/marketplace.dex.v1.MsgAddLiquidity' })]),
      expect.any(Object),
      ''
    );
  });

  test('throws with the chain rawLog when the broadcast tx fails', async () => {
    const client = {
      simulate: jest.fn().mockResolvedValue(200000),
      signAndBroadcast: jest.fn().mockResolvedValue({ code: 5, rawLog: 'insufficient liquidity' }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(client);

    await expect(
      addLiquidityOnChain({
        mnemonic: 'm',
        poolId: 1,
        tokenA: { denom: 'mlcn', amount: '100' },
        tokenB: { denom: 'stake', amount: '100' },
      })
    ).rejects.toThrow('insufficient liquidity');
  });

  test('falls back to a default gas estimate when simulation fails', async () => {
    const client = {
      simulate: jest.fn().mockRejectedValue(new Error('simulate down')),
      signAndBroadcast: jest.fn().mockResolvedValue({ code: 0, transactionHash: 'HASH2' }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(client);

    const result = await addLiquidityOnChain({
      mnemonic: 'm',
      poolId: 1,
      tokenA: { denom: 'mlcn', amount: '100' },
      tokenB: { denom: 'stake', amount: '100' },
    });

    expect(result.success).toBe(true);
    expect(calculateFee).toHaveBeenCalledWith(Math.min(Math.ceil(250000 * 1.3), 800000), expect.any(Object));
  });
});

describe('getAddressFromMnemonic', () => {
  test('derives the signer address from a mnemonic', async () => {
    DirectSecp256k1HdWallet.fromMnemonic = jest
      .fn()
      .mockResolvedValue({ getAccounts: jest.fn().mockResolvedValue([{ address: 'mall1xyz' }]) });

    await expect(getAddressFromMnemonic('mnemonic words')).resolves.toBe('mall1xyz');
  });
});
