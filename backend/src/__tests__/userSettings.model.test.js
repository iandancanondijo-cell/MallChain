// Real end-to-end coverage for models/UserSettings.js's notification
// preference defaults. Unlike notify.test.js (which mocks the model and
// hand-feeds prefs), this spins up a real in-memory MongoDB and creates a
// brand-new settings document with no overrides, then asserts the ACTUAL
// stored defaults: email (Gmail) is the only default-on channel, SMS and
// WhatsApp are opt-in only.
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const os = require('os');

let mongod;
let UserSettings;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongod.getUri(), { runtimeAdapters: { os } });
  UserSettings = require('../models/UserSettings');
}, 90000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}, 30000);

afterEach(async () => {
  await UserSettings.deleteMany({});
});

const CATEGORIES = ['transactions', 'campaigns', 'governance', 'marketing', 'security', 'badgeAlerts'];

describe('UserSettings notification defaults', () => {
  test('a brand-new user defaults to email-only: every email category on except marketing, all sms/whatsapp off', async () => {
    const created = await UserSettings.create({ userId: new mongoose.Types.ObjectId() });
    const { email, sms, whatsapp } = created.notifications;

    // Email (Gmail) is the default channel: on for everything the user
    // would want to be reached on, off only for bulk marketing.
    expect(email.transactions).toBe(true);
    expect(email.campaigns).toBe(true);
    expect(email.governance).toBe(true);
    expect(email.security).toBe(true);
    expect(email.badgeAlerts).toBe(true);
    expect(email.marketing).toBe(false);

    // SMS is strictly opt-in — never on by default.
    for (const c of CATEGORIES) {
      expect(sms[c]).toBe(false);
    }

    // WhatsApp is strictly opt-in — never on by default.
    for (const c of CATEGORIES) {
      expect(whatsapp[c]).toBe(false);
    }
  });

  test('persisted defaults survive a round-trip through the database (not just the in-memory doc)', async () => {
    const userId = new mongoose.Types.ObjectId();
    await UserSettings.create({ userId });

    const fetched = await UserSettings.findOne({ userId }).lean();
    expect(fetched.notifications.email.transactions).toBe(true);
    expect(fetched.notifications.email.badgeAlerts).toBe(true);
    expect(fetched.notifications.sms.badgeAlerts).toBe(false);
    expect(fetched.notifications.whatsapp.badgeAlerts).toBe(false);
  });

  test('an explicit opt-in is persisted per-channel without leaking into other channels', async () => {
    const userId = new mongoose.Types.ObjectId();
    await UserSettings.create({
      userId,
      notifications: { whatsapp: { transactions: true }, sms: { transactions: true } },
    });

    const fetched = await UserSettings.findOne({ userId }).lean();
    expect(fetched.notifications.whatsapp.transactions).toBe(true);
    expect(fetched.notifications.sms.transactions).toBe(true);
    // Email stays on by default; unrelated categories stay off.
    expect(fetched.notifications.email.transactions).toBe(true);
    expect(fetched.notifications.whatsapp.campaigns).toBe(false);
    expect(fetched.notifications.sms.campaigns).toBe(false);
  });
});
