/**
 * Wallet-age withdrawal rule (services/walletAgeService.js).
 *
 * models/user is mocked rather than real: jest.config.js mounts no global
 * Mongo, so an unstubbed User.findOne() would buffer for 10s waiting for a
 * connection and blow the test timeout — the failure would look like a hang,
 * not like a wrong answer.
 */
jest.mock('../models/user', () => ({ findOne: jest.fn() }));
jest.mock('../utils/fieldEncryption', () => ({
  // Identity blind index: the service only needs the lookup to be keyed
  // consistently, and crypto here would need FIELD_BLIND_INDEX_KEY.
  blindIndex: (v) => `bi:${v}`,
}));

const User = require('../models/user');
const { checkWalletWithdrawalAge, describeWalletAgeBlock } = require('../services/walletAgeService');

const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);
const ADDRESS = 'mall1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function linkedTo(overrides) {
  User.findOne.mockResolvedValue({ _id: 'u1', ...overrides });
}

describe('walletAgeService.checkWalletWithdrawalAge', () => {
  beforeEach(() => {
    User.findOne.mockReset();
  });

  it('blocks an address no account claims', async () => {
    User.findOne.mockResolvedValue(null);
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: false, code: 'wallet_not_linked', walletLinked: false, ageDays: null });
    expect(User.findOne).toHaveBeenCalledWith({ walletAddress_blind: `bi:${ADDRESS}` });
  });

  it('treats a missing address the same way, without querying', async () => {
    for (const bad of ['', '   ', null, undefined, 42]) {
      User.findOne.mockClear();
      const r = await checkWalletWithdrawalAge(bad);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('wallet_not_linked');
    }
    // '   ' trims to '' — no lookup attempted.
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('allows a wallet linked at least 29 days ago', async () => {
    linkedTo({ walletLinkedAt: ago(30), createdAt: ago(300) });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: true, code: null, ageDays: 30, minimumDays: 29, reference: 'walletLinkedAt' });
  });

  it('is still a hard block at 28 days however large the balance is', async () => {
    // Balance is not an input to this rule at all — the check takes only an
    // address, so the strongest version of this test is that no amount can
    // change the verdict.
    linkedTo({ walletLinkedAt: ago(28), createdAt: ago(28) });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: false, code: 'wallet_age_not_met', ageDays: 28 });
    expect(new Date(r.unlockAt).getTime()).toBeCloseTo(Date.now() + DAY, -4);
  });

  it('falls back to the account date for wallets linked before the field existed', async () => {
    linkedTo({ walletLinkedAt: null, createdAt: ago(60) });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: true, reference: 'accountCreatedAt', ageDays: 60 });
  });

  it('never lets the account date rescue a genuinely new wallet', async () => {
    // walletLinkedAt is newer than createdAt: the clock that counts is the
    // link, so re-linking a fresh address restarts the wait.
    linkedTo({ walletLinkedAt: ago(2), createdAt: ago(400) });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: false, ageDays: 2, reference: 'walletLinkedAt' });
  });

  it('refuses to guess when an account carries no dates at all', async () => {
    linkedTo({ walletLinkedAt: null, createdAt: null });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: false, code: 'wallet_age_unverifiable', walletLinked: true });
  });

  it('fails closed instead of throwing when the owner lookup itself fails', async () => {
    // FIELD_BLIND_INDEX_KEY missing/malformed makes blindIndex() throw, and a
    // mongoose outage makes findOne reject. Either way the payout route must
    // get a verdict it can surface, not a 500 that reads as "try again".
    for (const failure of [
      new Error("Cannot read properties of undefined (reading 'fieldBlindIndexKey')"),
      new Error('ECONNREFUSED 127.0.0.1:27017'),
    ]) {
      User.findOne.mockRejectedValue(failure);
      const r = await checkWalletWithdrawalAge(ADDRESS);
      expect(r).toMatchObject({ ok: false, code: 'wallet_age_unverifiable', ageDays: null });
    }
  });

  it('names the moment the rule lifts', async () => {
    const linked = ago(9);
    linkedTo({ walletLinkedAt: linked, createdAt: linked });
    const r = await checkWalletWithdrawalAge(ADDRESS);
    expect(new Date(r.unlockAt).getTime()).toBeCloseTo(linked.getTime() + 29 * DAY, -3);
    expect(r.referenceAt).toBe(linked.toISOString());
  });
});

describe('walletAgeService minimum-days override', () => {
  // MIN_WALLET_AGE_DAYS is computed when the module is first required, so
  // changing the env needs a fresh registry. That also recreates the mocked
  // model from its factory, so the User the service sees has to be required
  // again in the same breath — otherwise the stub below would be attached to
  // the stale instance and the service would call an untouched mock.
  const load = (envValue) => {
    jest.resetModules();
    process.env.WITHDRAWAL_MIN_WALLET_AGE_DAYS = envValue;
    const mod = require('../services/walletAgeService');
    delete process.env.WITHDRAWAL_MIN_WALLET_AGE_DAYS;
    return { mod, user: require('../models/user') };
  };

  afterEach(() => jest.resetModules());

  it('honours an explicit 0 (deliberate disable)', async () => {
    const { user, mod } = load('0');
    user.findOne.mockResolvedValue({ _id: 'u1', walletLinkedAt: new Date() });
    expect(mod.MIN_WALLET_AGE_DAYS).toBe(0);
    const r = await mod.checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: true, code: null, ageDays: 0, minimumDays: 0 });
  });

  it('honours a different positive window', async () => {
    const { user, mod } = load('14');
    user.findOne.mockResolvedValue({ _id: 'u1', walletLinkedAt: ago(10) });
    expect(mod.MIN_WALLET_AGE_DAYS).toBe(14);
    const r = await mod.checkWalletWithdrawalAge(ADDRESS);
    expect(r).toMatchObject({ ok: false, code: 'wallet_age_not_met', ageDays: 10 });
  });

  it('falls back to 29 rather than switching off on a bad value', () => {
    expect(load('not-a-number').mod.MIN_WALLET_AGE_DAYS).toBe(29);
    expect(load('-5').mod.MIN_WALLET_AGE_DAYS).toBe(29);
  });
});

describe('walletAgeService.describeWalletAgeBlock', () => {
  // Every payout boundary quotes this text to the user, so the number it
  // prints has to be the number the check produced — a shared sentence is the
  // only way the five doors stay consistent with each other.
  it('says nothing when the wallet is allowed to cash out', () => {
    expect(describeWalletAgeBlock({ ok: true, code: null, minimumDays: 29, ageDays: 40 })).toBeNull();
  });

  it('names the age and the moment it lifts', async () => {
    linkedTo({ walletLinkedAt: ago(28), createdAt: ago(28) });
    const text = describeWalletAgeBlock(await checkWalletWithdrawalAge(ADDRESS));
    expect(text).toContain('29 days');
    expect(text).toContain('28 day(s) old');
    expect(text).toMatch(/Cash-outs open from \d{4}-\d{2}-\d{2}T/);
  });

  it('asks for a link instead of quoting an age for an unknown wallet', async () => {
    User.findOne.mockResolvedValue(null);
    expect(describeWalletAgeBlock(await checkWalletWithdrawalAge(ADDRESS)))
      .toMatch(/not linked to an account/);
  });

  it('never prints "null day(s) old" when the clock could not be read', async () => {
    linkedTo({ walletLinkedAt: null, createdAt: null });
    const text = describeWalletAgeBlock(await checkWalletWithdrawalAge(ADDRESS));
    expect(text).toMatch(/could not confirm how long/);
    expect(text).not.toMatch(/null day/);
  });
});
