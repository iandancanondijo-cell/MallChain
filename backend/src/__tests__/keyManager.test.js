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
    delete process.env.VAULT_ROLE_ID;
    delete process.env.VAULT_SECRET_ID;
    delete process.env.TEST_MODE;
    delete process.env.TREASURY_MNEMONIC;
    process.env.VAULT_RETRY_BASE_DELAY_MS = '1'; // keep retry-backoff tests fast
    require('../utils/keyManager')._resetAppRoleTokenCache();
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

  describe('retry on transient Vault failures', () => {
    beforeEach(() => {
      process.env.VAULT_ADDR = 'https://vault.internal';
      process.env.VAULT_TOKEN = 'vault-token';
    });

    test('retries on a 429 and succeeds on the next attempt', async () => {
      const rateLimited = { response: { status: 429 } };
      axios.get
        .mockRejectedValueOnce(rateLimited)
        .mockResolvedValueOnce({ data: { data: { mnemonic: 'retried mnemonic' } } });

      await expect(getTreasuryMnemonic()).resolves.toBe('retried mnemonic');
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('retries on a 503 and succeeds on the next attempt', async () => {
      const serverError = { response: { status: 503 } };
      axios.get
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce({ data: { data: { mnemonic: 'retried after 503' } } });

      await expect(getTreasuryMnemonic()).resolves.toBe('retried after 503');
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('does not retry a non-retryable 403 — fails on the first attempt', async () => {
      const forbidden = { response: { status: 403 } };
      axios.get.mockRejectedValue(forbidden);

      await expect(getTreasuryMnemonic()).rejects.toThrow('Failed to retrieve mnemonic from Vault');
      expect(axios.get).toHaveBeenCalledTimes(1);
    });

    test('gives up after exhausting VAULT_MAX_RETRIES retries on persistent 500s', async () => {
      process.env.VAULT_MAX_RETRIES = '2';
      const serverError = { response: { status: 500 } };
      axios.get.mockRejectedValue(serverError);

      await expect(getTreasuryMnemonic()).rejects.toThrow('Failed to retrieve mnemonic from Vault');
      expect(axios.get).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
    });
  });

  describe('AppRole authentication', () => {
    test('exchanges VAULT_ROLE_ID/VAULT_SECRET_ID for a client token and uses it to fetch the secret', async () => {
      process.env.VAULT_ADDR = 'https://vault.internal';
      process.env.VAULT_ROLE_ID = 'role-1';
      process.env.VAULT_SECRET_ID = 'secret-1';
      axios.post.mockResolvedValue({ data: { auth: { client_token: 'approle-token', lease_duration: 3600 } } });
      axios.get.mockResolvedValue({ data: { data: { mnemonic: 'approle mnemonic' } } });

      await expect(getTreasuryMnemonic()).resolves.toBe('approle mnemonic');
      expect(axios.post).toHaveBeenCalledWith(
        'https://vault.internal/v1/auth/approle/login',
        { role_id: 'role-1', secret_id: 'secret-1' },
        expect.any(Object)
      );
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { 'X-Vault-Token': 'approle-token' } })
      );
    });

    test('caches the AppRole token across calls instead of re-authenticating every time', async () => {
      process.env.VAULT_ADDR = 'https://vault.internal';
      process.env.VAULT_ROLE_ID = 'role-1';
      process.env.VAULT_SECRET_ID = 'secret-1';
      axios.post.mockResolvedValue({ data: { auth: { client_token: 'approle-token', lease_duration: 3600 } } });
      axios.get.mockResolvedValue({ data: { data: { mnemonic: 'approle mnemonic' } } });

      await getTreasuryMnemonic();
      await getTreasuryMnemonic();

      expect(axios.post).toHaveBeenCalledTimes(1); // only logged in once
      expect(axios.get).toHaveBeenCalledTimes(2); // but fetched the secret both times
    });

    test('prefers AppRole over a static VAULT_TOKEN when both are configured', async () => {
      process.env.VAULT_ADDR = 'https://vault.internal';
      process.env.VAULT_TOKEN = 'static-token';
      process.env.VAULT_ROLE_ID = 'role-1';
      process.env.VAULT_SECRET_ID = 'secret-1';
      axios.post.mockResolvedValue({ data: { auth: { client_token: 'approle-token', lease_duration: 3600 } } });
      axios.get.mockResolvedValue({ data: { data: { mnemonic: 'x' } } });

      await getTreasuryMnemonic();

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { 'X-Vault-Token': 'approle-token' } })
      );
    });

    test('throws a clear error when AppRole login does not return a client token', async () => {
      process.env.VAULT_ADDR = 'https://vault.internal';
      process.env.VAULT_ROLE_ID = 'role-1';
      process.env.VAULT_SECRET_ID = 'secret-1';
      axios.post.mockResolvedValue({ data: { auth: {} } });

      await expect(getTreasuryMnemonic()).rejects.toThrow('Failed to authenticate to Vault');
      expect(axios.get).not.toHaveBeenCalled();
    });
  });
});
