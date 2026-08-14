const axios = require('axios');

jest.mock('axios');

// NOTE: src/utils/keystore.js is not currently wired up anywhere in the app —
// src/utils/keyManager.js is the implementation actually used by
// rewardsController/validatorController. These tests document keystore.js's
// behavior as-is, which diverges from keyManager.js in a way worth flagging:
// it prefers a bare TREASURY_MNEMONIC env var with no TEST_MODE gate, and
// returns null instead of throwing when nothing is configured.
const { getTreasuryMnemonic } = require('../utils/keystore');

describe('keystore.getTreasuryMnemonic', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.TREASURY_MNEMONIC;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('prefers TREASURY_MNEMONIC from the environment over Vault', async () => {
    process.env.TREASURY_MNEMONIC = 'env mnemonic';
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';

    const { getTreasuryMnemonic } = require('../utils/keystore');

    await expect(getTreasuryMnemonic()).resolves.toBe('env mnemonic');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('falls back to Vault when no env var is set', async () => {
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';
    axios.get.mockResolvedValue({ data: { data: { TREASURY_MNEMONIC: 'vault mnemonic' } } });

    const { getTreasuryMnemonic } = require('../utils/keystore');

    await expect(getTreasuryMnemonic()).resolves.toBe('vault mnemonic');
  });

  test('returns null (does not throw) when Vault fetch fails', async () => {
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';
    axios.get.mockRejectedValue(new Error('connection refused'));

    const { getTreasuryMnemonic } = require('../utils/keystore');

    await expect(getTreasuryMnemonic()).resolves.toBeNull();
  });

  test('returns null when nothing is configured at all', async () => {
    const { getTreasuryMnemonic } = require('../utils/keystore');

    await expect(getTreasuryMnemonic()).resolves.toBeNull();
  });
});
