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

describe('settings social-account routes', () => {
  let app;
  let settings;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    settings = fakeSettings({ socialAccounts: [] });
    UserSettings.findOne.mockResolvedValue(settings);
  });

  test('GET empty → POST reddit → GET shows it → DELETE → GET empty', async () => {
    const get0 = await request(app).get('/api/settings/social');
    expect(get0.status).toBe(200);
    expect(get0.body).toEqual({ ok: true, data: [] });

    const post = await request(app).post('/api/settings/social/reddit').send({ handle: '@Ian_' });
    expect(post.status).toBe(200);
    // leading '@' stripped, envelope matches settingsApi.updateSocialAccount
    expect(post.body).toEqual({ ok: true, data: { platform: 'reddit', handle: 'Ian_', connected: true } });
    expect(settings.save).toHaveBeenCalled();

    const get1 = await request(app).get('/api/settings/social');
    expect(get1.body.data).toHaveLength(1);
    expect(get1.body.data[0]).toMatchObject({ platform: 'reddit', handle: 'Ian_', connected: true });

    const del = await request(app).delete('/api/settings/social/reddit');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true, data: { removed: true } });

    const get2 = await request(app).get('/api/settings/social');
    expect(get2.body.data).toEqual([]);
  });

  test('POST rejects unknown platforms, empty handles and >100-char handles', async () => {
    const bad = await request(app).post('/api/settings/social/myspace').send({ handle: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.ok).toBe(false);

    const empty = await request(app).post('/api/settings/social/reddit').send({ handle: '   ' });
    expect(empty.status).toBe(400);

    const long = await request(app).post('/api/settings/social/reddit').send({ handle: 'a'.repeat(101) });
    expect(long.status).toBe(400);

    expect(settings.socialAccounts).toHaveLength(0);
  });

  test('POST upserts an already-connected platform instead of duplicating it', async () => {
    settings.socialAccounts.push({ platform: 'reddit', handle: 'old', connected: true });
    await request(app).post('/api/settings/social/reddit').send({ handle: 'new' });
    expect(settings.socialAccounts).toHaveLength(1);
    expect(settings.socialAccounts[0].handle).toBe('new');
  });

  test('DELETE of a not-connected platform returns 404 with envelope error', async () => {
    const res = await request(app).delete('/api/settings/social/github');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
