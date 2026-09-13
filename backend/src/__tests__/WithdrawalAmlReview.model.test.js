// Real end-to-end coverage for models/WithdrawalAmlReview.js's narrative
// encryption — a real in-memory MongoDB, verifying the actual bytes stored
// are ciphertext (not just that encryptField/decryptField round-trip in
// isolation), and exercising a real .save() call, which is what caught the
// Mongoose-9 zero-argument-pre-hook bug in models/kyc.js in the first place
// (see the comment there) — a mocked-model test would never catch that.
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const os = require('os');

let mongod;
let WithdrawalAmlReview;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  // mongodb driver 7.6.0's client-metadata handshake auto-detects the
  // runtime adapter in a way that fails under Jest specifically (works
  // fine under plain Node) — a known upstream regression
  // (mongodb/node-mongodb-native#4992, typegoose/mongodb-memory-server#1026)
  // that surfaces as "Missing required sub-document 'driver'". Passing the
  // adapter explicitly is the documented workaround.
  await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
  WithdrawalAmlReview = require('../models/WithdrawalAmlReview');
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}, 30000); // mongod.stop()'s process teardown can outlast Jest's 5s hook default under CPU/memory contention

afterEach(async () => {
  await WithdrawalAmlReview.deleteMany({});
});

function baseFields(overrides = {}) {
  return {
    userId: new mongoose.Types.ObjectId(),
    walletAddress: 'mall1testaddress0000000000000000000000000',
    triggerAmountKes: 3000,
    fundsSource: 'salary',
    isNativeEarnings: false,
    narrative: 'This withdrawal is funded by my monthly salary payment.',
    documentRef: 'user123-1700000000000-payslip.pdf',
    ...overrides,
  };
}

describe('WithdrawalAmlReview model', () => {
  test('the raw document stored in MongoDB has ciphertext, not plaintext, for narrative', async () => {
    const created = await WithdrawalAmlReview.create(baseFields());

    const raw = await mongoose.connection.db
      .collection('withdrawalamlreviews')
      .findOne({ _id: created._id });

    expect(raw.narrative).not.toBe(baseFields().narrative);
    expect(raw.narrative).toMatch(/^v1:/); // fieldEncryption.js's envelope format
    // documentRef is not in ENCRYPTED_FIELDS — it's just a filename, no PII.
    expect(raw.documentRef).toBe(baseFields().documentRef);
  });

  test('decryptAmlPii returns the original plaintext narrative', async () => {
    const created = await WithdrawalAmlReview.create(baseFields());
    const fetched = await WithdrawalAmlReview.findById(created._id);
    const decrypted = WithdrawalAmlReview.decryptAmlPii(fetched);
    expect(decrypted.narrative).toBe(baseFields().narrative);
  });

  test('decryptAmlPii works on a .lean() plain object too', async () => {
    await WithdrawalAmlReview.create(baseFields());
    const lean = await WithdrawalAmlReview.findOne({}).lean();
    const decrypted = WithdrawalAmlReview.decryptAmlPii(lean);
    expect(decrypted.narrative).toBe(baseFields().narrative);
  });

  test('re-saving without modifying narrative does not double-encrypt it', async () => {
    const created = await WithdrawalAmlReview.create(baseFields());
    created.reviewNotes = 'looks fine';
    await created.save(); // must not re-encrypt narrative — isModified() guard

    const fetched = await WithdrawalAmlReview.findById(created._id);
    const decrypted = WithdrawalAmlReview.decryptAmlPii(fetched);
    expect(decrypted.narrative).toBe(baseFields().narrative);
  });

  test('NATIVE_EARNINGS_SOURCES is exported and matches the schema enum values used for the document waiver', () => {
    expect(WithdrawalAmlReview.NATIVE_EARNINGS_SOURCES).toEqual(
      expect.arrayContaining(['mining_staking_rewards', 'mallpoints_conversion', 'referral_bonus'])
    );
  });

  test('consumedByWithdrawalId defaults to null and can be set to mark single-use consumption', async () => {
    const created = await WithdrawalAmlReview.create(baseFields());
    expect(created.consumedByWithdrawalId).toBeNull();

    const withdrawalId = new mongoose.Types.ObjectId();
    created.consumedByWithdrawalId = withdrawalId;
    await created.save();

    const fetched = await WithdrawalAmlReview.findById(created._id);
    expect(String(fetched.consumedByWithdrawalId)).toBe(String(withdrawalId));
  });

  test('rejects an invalid fundsSource', async () => {
    await expect(WithdrawalAmlReview.create(baseFields({ fundsSource: 'not_a_real_source' }))).rejects.toThrow();
  });
});
