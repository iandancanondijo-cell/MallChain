const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');
const { SigningStargateClient } = require('@cosmjs/stargate');

// Factory mocks (not auto-mock) so Jest never has to load the real
// @cosmjs/proto-signing module tree — @cosmjs/crypto@0.39's argon2 support
// pulls in an ESM-only transitive dependency that Jest's default CJS
// resolution can't parse, which auto-mocking would otherwise trigger.
jest.mock('@cosmjs/proto-signing', () => ({
  DirectSecp256k1HdWallet: { fromMnemonic: jest.fn() },
}));
jest.mock('@cosmjs/stargate', () => ({
  SigningStargateClient: { connectWithSigner: jest.fn() },
}));

const { burnCoinsOnChain, getAddressFromMnemonic } = require('../services/burnTxBuilder');

describe('burnCoinsOnChain', () => {
  const fakeWallet = { getAccounts: jest.fn().mockResolvedValue([{ address: 'mall1burner' }]) };

  beforeEach(() => {
    jest.clearAllMocks();
    DirectSecp256k1HdWallet.fromMnemonic = jest.fn().mockResolvedValue(fakeWallet);
  });

  test('requires a mnemonic', async () => {
    await expect(burnCoinsOnChain({ burnAmount: 10 })).rejects.toThrow(
      'Mnemonic required for burn transaction'
    );
  });

  test('rejects a non-positive burn amount', async () => {
    await expect(burnCoinsOnChain({ mnemonic: 'm', burnAmount: 0 })).rejects.toThrow(
      'Burn amount must be positive'
    );
    await expect(burnCoinsOnChain({ mnemonic: 'm', burnAmount: -5 })).rejects.toThrow(
      'Burn amount must be positive'
    );
  });

  test('signs and broadcasts a MsgBurn, returning the tx result on success', async () => {
    const client = {
      signAndBroadcast: jest.fn().mockResolvedValue({
        code: 0,
        transactionHash: 'BURNHASH',
        height: 10,
        gasUsed: 90000,
        gasWanted: 100000,
      }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(client);

    const result = await burnCoinsOnChain({ mnemonic: 'm', burnAmount: 500 });

    expect(result).toMatchObject({ success: true, txHash: 'BURNHASH', height: 10 });
    expect(client.signAndBroadcast).toHaveBeenCalledWith(
      'mall1burner',
      expect.arrayContaining([
        expect.objectContaining({
          typeUrl: '/marketplace.mlcoin.v1.MsgBurn',
          value: expect.objectContaining({ from: 'mall1burner' }),
        }),
      ]),
      expect.any(Object),
      expect.any(String)
    );
  });

  test('throws when the chain rejects the burn tx', async () => {
    const client = {
      signAndBroadcast: jest.fn().mockResolvedValue({ code: 7, rawLog: 'unauthorized burn' }),
    };
    SigningStargateClient.connectWithSigner.mockResolvedValue(client);

    await expect(burnCoinsOnChain({ mnemonic: 'm', burnAmount: 500 })).rejects.toThrow(
      'Burn failed: code 7 - unauthorized burn'
    );
  });
});

describe('getAddressFromMnemonic', () => {
  test('derives the signer address from a mnemonic', async () => {
    DirectSecp256k1HdWallet.fromMnemonic = jest
      .fn()
      .mockResolvedValue({ getAccounts: jest.fn().mockResolvedValue([{ address: 'mall1xyz' }]) });

    await expect(getAddressFromMnemonic('mnemonic words')).resolves.toBe('mall1xyz');
  });

  test('rethrows when address derivation fails', async () => {
    DirectSecp256k1HdWallet.fromMnemonic = jest.fn().mockRejectedValue(new Error('bad mnemonic'));

    await expect(getAddressFromMnemonic('bad')).rejects.toThrow('bad mnemonic');
  });
});
