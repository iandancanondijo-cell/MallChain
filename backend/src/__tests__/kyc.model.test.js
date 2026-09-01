// Real end-to-end coverage for models/kyc.js's field-level PII encryption —
// unlike kycController.test.js (which mocks the model entirely), this
// spins up a real in-memory MongoDB and verifies the *actual bytes stored*
// are ciphertext, not just that a utility function round-trips in isolation.
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;
let KYC;

beforeAll(async () => {
  // launchTimeout: mongodb-memory-server's own internal startup timeout
  // defaults to 10s, which the full test suite (many files' worth of
  // parallel Jest workers competing for CPU/disk) can blow past even
  // though this file's own beforeAll timeout below is much larger —
  // that's a separate, shorter timeout inside the library itself.
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongod.getUri());
  KYC = require('../models/kyc');
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

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

    // Fields deliberately NOT in scope stay as plain, readable text — this
    // documents the actual encrypted-field boundary rather than assuming it.
    expect(raw.firstName).toBe('Jane');
    expect(raw.occupation).toBe('Engineer');
    expect(raw.country).toBe('KE');
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
