const axios = require('axios');

jest.mock('axios');

const { getTreasuryMnemonic } = require('../utils/keyManager');

describe('keyManager.getTreasuryMnemonic', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.TEST_MODE;
    delete process.env.TREASURY_MNEMONIC;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('fetches the mnemonic from Vault when VAULT_ADDR/VAULT_TOKEN are configured', async () => {
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';
    axios.get.mockResolvedValue({ data: { data: { mnemonic: 'word '.repeat(12).trim() } } });

    const { getTreasuryMnemonic } = require('../utils/keyManager');
    const mnemonic = await getTreasuryMnemonic();

    expect(mnemonic).toBe('word '.repeat(12).trim());
    expect(axios.get).toHaveBeenCalledWith(
      'https://vault.internal/v1/secret/data/marketplace/treasury',
      expect.objectContaining({ headers: { 'X-Vault-Token': 'vault-token' } })
    );
  });

  test('throws when Vault is configured but the request fails', async () => {
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';
    axios.get.mockRejectedValue(new Error('connection refused'));

    const { getTreasuryMnemonic } = require('../utils/keyManager');

    await expect(getTreasuryMnemonic()).rejects.toThrow('Failed to retrieve mnemonic from Vault');
  });

  test('throws when Vault responds without a mnemonic field', async () => {
    process.env.VAULT_ADDR = 'https://vault.internal';
    process.env.VAULT_TOKEN = 'vault-token';
    axios.get.mockResolvedValue({ data: { data: {} } });

    const { getTreasuryMnemonic } = require('../utils/keyManager');

    await expect(getTreasuryMnemonic()).rejects.toThrow('Failed to retrieve mnemonic from Vault');
  });

  test('falls back to TREASURY_MNEMONIC only when TEST_MODE=true and Vault is not configured', async () => {
    process.env.TEST_MODE = 'true';
    process.env.TREASURY_MNEMONIC = 'test mnemonic value';

    const { getTreasuryMnemonic } = require('../utils/keyManager');

    await expect(getTreasuryMnemonic()).resolves.toBe('test mnemonic value');
    expect(axios.get).not.toHaveBeenCalled();
  });

  test('throws in TEST_MODE when TREASURY_MNEMONIC is not set', async () => {
    process.env.TEST_MODE = 'true';

    const { getTreasuryMnemonic } = require('../utils/keyManager');

    await expect(getTreasuryMnemonic()).rejects.toThrow(
      'TEST_MODE enabled but TREASURY_MNEMONIC not provided'
    );
  });

  test('throws when neither Vault nor TEST_MODE is configured, even if TREASURY_MNEMONIC is set', async () => {
    // Guards against accidentally leaking a mnemonic from the environment in production
    // just because the env var happens to be present without TEST_MODE explicitly set.
    process.env.TREASURY_MNEMONIC = 'should not be used';

    const { getTreasuryMnemonic } = require('../utils/keyManager');

    await expect(getTreasuryMnemonic()).rejects.toThrow('Treasury mnemonic not configured');
  });
});
