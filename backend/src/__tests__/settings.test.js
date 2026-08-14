const request = require('supertest');
const express = require('express');

jest.mock('../models/UserSettings', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../middleware/auth', () =>
  jest.fn((req, res, next) => {
    req.user = { _id: 'user1' };
    next();
  })
);

const UserSettings = require('../models/UserSettings');
const settingsRoutes = require('../routes/settings');

function fakeSettings(overrides = {}) {
  return {
    userId: 'user1',
    prefs: { accent: 'gold', currency: 'USD', lang: 'EN', theme: 'dark' },
    notifications: { email: { transactions: true }, push: { transactions: true }, frequency: 'realtime' },
    security: { twoFactorEnabled: false },
    privacy: { profileVisibility: 'public' },
    display: { compactMode: false },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('settings routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET / creates default settings on first access, persisted per user', async () => {
    UserSettings.findOne.mockResolvedValue(null);
    const created = fakeSettings();
    UserSettings.create.mockResolvedValue(created);

    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(UserSettings.create).toHaveBeenCalledWith({ userId: 'user1' });
  });

  test('GET / returns existing settings without recreating them', async () => {
    const existing = fakeSettings();
    UserSettings.findOne.mockResolvedValue(existing);

    await request(app).get('/api/settings');

    expect(UserSettings.create).not.toHaveBeenCalled();
  });

  test('PUT / merges partial prefs updates and persists them', async () => {
    const existing = fakeSettings();
    UserSettings.findOne.mockResolvedValue(existing);

    const res = await request(app).put('/api/settings').send({ prefs: { currency: 'KES' } });

    expect(res.status).toBe(200);
    expect(existing.prefs.currency).toBe('KES');
    expect(existing.prefs.accent).toBe('gold'); // untouched fields survive the merge
    expect(existing.save).toHaveBeenCalled();
  });

  test('PUT /security only accepts allow-listed fields', async () => {
    const existing = fakeSettings();
    UserSettings.findOne.mockResolvedValue(existing);

    await request(app).put('/api/settings/security').send({ twoFactorEnabled: true, notAllowedField: 'x' });

    expect(existing.security.twoFactorEnabled).toBe(true);
    expect(existing.security.notAllowedField).toBeUndefined();
  });

  test('POST /reset deletes and recreates default settings', async () => {
    UserSettings.deleteOne.mockResolvedValue({});
    UserSettings.findOne.mockResolvedValue(null);
    UserSettings.create.mockResolvedValue(fakeSettings());

    const res = await request(app).post('/api/settings/reset');

    expect(res.status).toBe(200);
    expect(UserSettings.deleteOne).toHaveBeenCalledWith({ userId: 'user1' });
  });
});
