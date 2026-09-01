// Regression coverage for config/index.js's production secret guardrails.
//
// The concrete bug this locks in: validateRuntimeSecrets() used to read
// config.secrets.treasuryMnemonic, a field that config/index.js never
// actually populates (the secrets object has no such key) — so in
// production this was always undefined and validateRuntimeSecrets() always
// threw "Missing required environment variable: TREASURY_MNEMONIC", even
// when the operator had correctly configured Vault (the real production
// signing path per utils/keyManager.js). That meant a correctly-configured
// production backend could never start.
const REAL_SECRET = 'a-genuinely-random-secret-value-that-is-long-enough';

function setBaseValidSecrets() {
  process.env.JWT_SECRET = REAL_SECRET;
  process.env.SESSION_SECRET = REAL_SECRET;
  process.env.ADMIN_API_KEY = REAL_SECRET;
  process.env.MONITORING_API_KEY = 'a-second-random-value-long-enough-monitor01';
  process.env.OPERATOR_MNEMONIC = 'word '.repeat(12).trim();
  process.env.FAUCET_MNEMONIC = 'word '.repeat(12).trim();
  process.env.PAYMENT_WEBHOOK_SECRET = REAL_SECRET;
  process.env.MONGO_URI = 'mongodb://localhost:27017/marketplace';
}

describe('validateRuntimeSecrets (production guardrails)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = 'production';
    setBaseValidSecrets();
    delete process.env.TEST_MODE;
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
    delete process.env.TREASURY_MNEMONIC;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('passes with a fully valid production configuration (Vault-backed treasury signing)', () => {
    process.env.VAULT_ADDR = 'https://vault.internal:8200';
    process.env.VAULT_TOKEN = 'a-real-vault-token';

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).not.toThrow();
  });

  test('rejects production startup when Vault is not configured, even with TREASURY_MNEMONIC set', () => {
    process.env.TREASURY_MNEMONIC = 'word '.repeat(12).trim();
    // No VAULT_ADDR/VAULT_TOKEN — this must fail, not silently accept the
    // env-var mnemonic, since TEST_MODE (the only path that honors
    // TREASURY_MNEMONIC) is rejected in production separately.

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).toThrow(/VAULT_ADDR and VAULT_TOKEN are required/);
  });

  test('rejects TEST_MODE=true in production', () => {
    process.env.VAULT_ADDR = 'https://vault.internal:8200';
    process.env.VAULT_TOKEN = 'a-real-vault-token';
    process.env.TEST_MODE = 'true';

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).toThrow(/TEST_MODE must not be enabled/);
  });

  test('rejects a placeholder secret copied verbatim from .env.example', () => {
    process.env.VAULT_ADDR = 'https://vault.internal:8200';
    process.env.VAULT_TOKEN = 'a-real-vault-token';
    process.env.JWT_SECRET = 'REPLACE_WITH_RANDOM_32PLUS_CHAR_SECRET';

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).toThrow(/placeholder/);
  });

  test('rejects an ADMIN_API_KEY shorter than 32 characters', () => {
    process.env.VAULT_ADDR = 'https://vault.internal:8200';
    process.env.VAULT_TOKEN = 'a-real-vault-token';
    process.env.ADMIN_API_KEY = 'too-short';

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).toThrow(/ADMIN_API_KEY must be at least 32 characters/);
  });

  test('rejects production startup without PAYMENT_WEBHOOK_SECRET', () => {
    process.env.VAULT_ADDR = 'https://vault.internal:8200';
    process.env.VAULT_TOKEN = 'a-real-vault-token';
    delete process.env.PAYMENT_WEBHOOK_SECRET;

    const { validateRuntimeSecrets } = require('../config');
    expect(() => validateRuntimeSecrets()).toThrow(/PAYMENT_WEBHOOK_SECRET/);
  });
});
