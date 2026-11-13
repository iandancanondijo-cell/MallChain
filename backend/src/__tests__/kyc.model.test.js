// Real end-to-end coverage for models/kyc.js's field-level PII encryption —
// unlike kycController.test.js (which mocks the model entirely), this
// spins up a real in-memory MongoDB and verifies the *actual bytes stored*
// are ciphertext, not just that a utility function round-trips in isolation.
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const os = require('os');

let mongod;
let KYC;

beforeAll(async () => {
  // launchTimeout: mongodb-memory-server's own internal startup timeout
  // defaults to 10s, which the full test suite (many files' worth of
  // parallel Jest workers competing for CPU/disk) can blow past even
  // though this file's own beforeAll timeout below is much larger —
  // that's a separate, shorter timeout inside the library itself.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  // mongodb driver 7.6.0's client-metadata handshake auto-detects the
  // runtime adapter in a way that fails under Jest specifically (works
  // fine under plain Node) — a known upstream regression
  // (mongodb/node-mongodb-native#4992, typegoose/mongodb-memory-server#1026)
  // that surfaces as "Missing required sub-document 'driver'". Passing the
  // adapter explicitly is the documented workaround.
  await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
  KYC = require('../models/kyc');
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}, 30000); // mongod.stop()'s process teardown can outlast Jest's 5s hook default under CPU/memory contention

afterEach(async () => {
  await KYC.deleteMany({});
});

function baseFields(overrides = {}) {
  return {
    userId: new mongoose.Types.ObjectId(),
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: new Date('1990-01-01'),
    nationality: 'KE',
    address: '123 Real Street',
    city: 'Nairobi',
    country: 'KE',
    postalCode: '00100',
    phoneNumber: '254712345678',
    idType: 'national_id',
    idNumber: '12345678',
    idExpiry: new Date('2030-01-01'),
    occupation: 'Engineer',
    sourceOfFunds: 'Salary',
    annualIncome: '50000',
    riskLevel: 'low',
    ...overrides,
  };
}

describe('KYC model — field-level PII encryption', () => {
  test('the raw document stored in MongoDB has ciphertext, not plaintext, for PII fields', async () => {
    const created = await KYC.create(baseFields());

    // Bypass Mongoose entirely and read the raw collection bytes — this is
    // the actual security property under test: what a DB-level compromise
    // (a stolen backup, a misconfigured read replica) would expose.
    const raw = await mongoose.connection.db.collection('kycs').findOne({ _id: created._id });

    expect(raw.idNumber).not.toBe('12345678');
    expect(raw.phoneNumber).not.toBe('254712345678');
    expect(raw.address).not.toBe('123 Real Street');
    expect(raw.city).not.toBe('Nairobi');
    expect(raw.postalCode).not.toBe('00100');
    expect(raw.idNumber.startsWith('v1:')).toBe(true);

    // The encrypted set is ENCRYPTED_FIELDS in models/kyc.js, which 5fa735f6
    // widened past the original idNumber/phoneNumber/address/city/postalCode
    // to the name fields, date of birth, income and the document URLs. This
    // test predated that widening and still asserted the narrower boundary,
    // which is why it failed on a raw `v1:…` firstName.
    expect(raw.firstName).not.toBe('Jane');
    expect(raw.firstName.startsWith('v1:')).toBe(true);
    expect(raw.lastName.startsWith('v1:')).toBe(true);
    expect(raw.annualIncome.startsWith('v1:')).toBe(true);

    // Fields genuinely outside the list stay plain, readable text.
    expect(raw.occupation).toBe('Engineer');
    expect(raw.country).toBe('KE');
    expect(raw.nationality).toBe('KE');

    // dateOfBirth is IN ENCRYPTED_FIELDS but its schema path is a Date, so the
    // ciphertext the pre-save hook assigns is cast straight back out and the
    // value lands in the collection as a plain BSON date. Pinned as-is so the
    // gap is visible from the suite instead of silent: closing it means
    // changing the path to String and backfilling existing records — a
    // data-model decision, not a test change.
    expect(raw.dateOfBirth).toBeInstanceOf(Date);
    expect(String(raw.dateOfBirth)).toContain('1990');
  });

  test('decryptKycPii recovers the exact original plaintext', async () => {
    const created = await KYC.create(baseFields());
    const fetched = await KYC.findById(created._id);
    const decrypted = KYC.decryptKycPii(fetched);

    expect(decrypted.idNumber).toBe('12345678');
    expect(decrypted.phoneNumber).toBe('254712345678');
    expect(decrypted.address).toBe('123 Real Street');
    expect(decrypted.city).toBe('Nairobi');
    expect(decrypted.postalCode).toBe('00100');
    // The widened fields have to round-trip too — GET /api/kyc/status reads
    // them back through this helper, so a gap here shows up as the user
    // seeing their own ciphertext.
    expect(decrypted.firstName).toBe('Jane');
    expect(decrypted.lastName).toBe('Doe');
    expect(decrypted.annualIncome).toBe('50000');
  });

  test('decryptKycPii also works on a .lean() plain object (the admin list / GDPR export path)', async () => {
    await KYC.create(baseFields());
    const [lean] = await KYC.find().lean();
    const decrypted = KYC.decryptKycPii(lean);

    expect(decrypted.idNumber).toBe('12345678');
    expect(decrypted.phoneNumber).toBe('254712345678');
  });

  test('re-saving a document after only changing status does not double-encrypt the PII fields', async () => {
    const created = await KYC.create(baseFields());
    const doc = await KYC.findById(created._id);

    doc.status = 'approved';
    doc.reviewedAt = new Date();
    await doc.save();

    const refetched = await KYC.findById(created._id);
    const decrypted = KYC.decryptKycPii(refetched);
    expect(decrypted.idNumber).toBe('12345678');
    expect(decrypted.phoneNumber).toBe('254712345678');
  });

  test('a genuine PII update re-encrypts to a new ciphertext (fresh IV), and still decrypts correctly', async () => {
    const created = await KYC.create(baseFields());
    const doc = await KYC.findById(created._id);
    const firstCiphertext = (await mongoose.connection.db.collection('kycs').findOne({ _id: created._id })).idNumber;

    doc.idNumber = '99999999';
    await doc.save();

    const raw = await mongoose.connection.db.collection('kycs').findOne({ _id: created._id });
    expect(raw.idNumber).not.toBe(firstCiphertext);
    expect(raw.idNumber).not.toBe('99999999');
    expect(KYC.decryptKycPii(await KYC.findById(created._id)).idNumber).toBe('99999999');
  });
});
