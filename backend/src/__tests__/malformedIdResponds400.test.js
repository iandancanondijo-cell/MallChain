/**
 * A malformed id is a 400, not a 500.
 *
 * These cases exist because the platform's own error log was full of
 * `Cast to ObjectId failed for value ":x"` lines answering `HTTP 500` —
 * /api/edu/:id, /api/careers/openings/:id, /api/admin/kyc/user/:id,
 * /api/messaging/conversations/:id. Every router that ends in
 * `res.status(500).json(fail(e))` reported a caller's typo as a server
 * outage, which both misleads the UI and spends the 5xx budget that
 * /metrics, the admin health panels and the alert webhook are built on.
 *
 * No database needed: this tests the classification itself.
 */
const {
  AppError,
  ErrorCodes,
  classifyDriverError,
  errorHandler,
} = require('../utils/errorHandler');
const { respondFailure, respondDriverError } = require('../utils/respondFailure');
const logger = require('../utils/logger');

// A CastError as Mongoose actually throws it (name/kind/path/value/reason).
function castError(path = '_id', model = 'Campaign', value = ':x') {
  const err = new Error(`Cast to ObjectId failed for value "${value}" (type string) at path "${path}" for model "${model}"`);
  err.name = 'CastError';
  err.kind = 'ObjectId';
  err.value = value;
  err.path = path;
  err.model = model;
  return err;
}

function mockRes() {
  const res = { req: { method: 'GET', path: '/api/edu/:x' }, statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function runHandler(err) {
  const res = mockRes();
  const req = { method: 'GET', path: '/api/edu/some-id', id: 'test-request' };
  errorHandler()(err, req, res, () => { throw new Error('next() must not be called'); });
  return res;
}

describe('classifyDriverError', () => {
  it('calls a failed ObjectId cast a client error', () => {
    const c = classifyDriverError(castError());
    expect(c).toMatchObject({ code: ErrorCodes.INVALID_RESOURCE_ID, statusCode: 400 });
    expect(c.message).toContain('_id');
  });

  it('names the field that failed to cast', () => {
    expect(classifyDriverError(castError('userId')).message).toContain('userId');
  });

  it('does not echo the offending value back to the client', () => {
    // The value is attacker-controlled; `error.message` is rendered directly by
    // some screens, so reflecting it would put arbitrary text in the UI.
    const evil = castError('_id', 'Campaign', '<img src=x onerror=alert(1)>');
    expect(classifyDriverError(evil).message).not.toContain('onerror');
  });

  it('treats a Mongoose ValidationError wrapping a cast as the same case', () => {
    const inner = castError();
    const err = new Error('Invalid value for "_id"');
    err.name = 'ValidationError';
    err.reason = inner;
    err.path = '_id';
    expect(classifyDriverError(err)).toMatchObject({ statusCode: 400 });
  });

  it('leaves real database faults as server errors', () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key error'), {
      name: 'MongoServerError',
      code: 11000,
    });
    expect(classifyDriverError(duplicate)).toBeNull();
    expect(classifyDriverError(new Error('connection reset'))).toBeNull();
    expect(classifyDriverError(undefined)).toBeNull();
    expect(classifyDriverError('a string')).toBeNull();
  });
});

describe('errorHandler', () => {
  let warn, error;
  beforeEach(() => { warn = jest.spyOn(logger, 'warn').mockImplementation(); error = jest.spyOn(logger, 'error').mockImplementation(); });
  afterEach(() => jest.restoreAllMocks());

  it('answers 400 INVALID_RESOURCE_ID for a bad id', () => {
    const res = runHandler(castError());
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESOURCE_ID');
    expect(res.body.error.requestId).toBe('test-request');
  });

  it('logs a client-caused 4xx at warn, never at error', () => {
    // logger.error is what feeds ALERT_WEBHOOK_URL — a bot probing /api/x/null
    // must not be able to page anyone.
    runHandler(castError());
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('still answers 500, at error level, for a genuine server fault', () => {
    const res = runHandler(Object.assign(new Error('E11000 duplicate key error'), { name: 'MongoServerError', code: 11000 }));
    expect(res.statusCode).toBe(500);
    expect(error).toHaveBeenCalled();
    // The driver's message stays out of the response unless DEBUG_ERRORS is on.
    expect(JSON.stringify(res.body)).not.toContain('E11000');
  });

  it('preserves a status a non-AppError already carries (e.g. payload too large)', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), { status: 413 });
    expect(runHandler(tooLarge).statusCode).toBe(413);
  });

  it('passes an AppError through untouched', () => {
    const res = runHandler(new AppError(ErrorCodes.NOT_FOUND, 'Opening not found'));
    expect(res.statusCode).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('respondFailure / respondDriverError', () => {
  let warn, error;
  beforeEach(() => { warn = jest.spyOn(logger, 'warn').mockImplementation(); error = jest.spyOn(logger, 'error').mockImplementation(); });
  afterEach(() => jest.restoreAllMocks());

  it('skips the router fail() entirely — and its 500 — on a bad id', () => {
    const res = mockRes();
    const localFail = jest.fn(() => ({ ok: false, error: 'Invalid request' }));
    respondFailure(res, castError(), localFail);
    expect(localFail).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      ok: false,
      error: 'Invalid "_id": this endpoint expects a record identifier',
      code: 'INVALID_RESOURCE_ID',
    });
  });

  it('keeps the router body and status for a real failure', () => {
    const res = mockRes();
    const localFail = jest.fn((e) => ({ ok: false, error: 'Invalid request' }));
    respondFailure(res, new Error('socket hang up'), localFail, { operation: 'campaign_create' });
    expect(localFail).toHaveBeenCalledWith(expect.any(Error), { operation: 'campaign_create' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'Invalid request' });
  });

  it('respondDriverError reports whether it answered, for inline 500 bodies', () => {
    const res = mockRes();
    expect(respondDriverError(res, castError('userId'))).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(respondDriverError(mockRes(), new Error('boom'))).toBe(false);
  });
});

/**
 * The same thing through a real router, because the classification only matters
 * if a request actually gets it. careers.js is representative: `GET
 * /api/careers/openings/:id` did `findById(req.params.id)` inside
 * `catch (e) { res.status(500).json(fail(e)) }`, so an id of `undefined` — which
 * is what the frontend produced whenever a board row had not finished loading —
 * came back as a 500.
 */
describe('GET /api/careers/openings/:id with an unusable id', () => {
  const request = require('supertest');
  const express = require('express');

  let app, JobOpening;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../middleware/auth', () => jest.fn((req, res, next) => { req.user = { _id: 'user1' }; next(); }));
    jest.doMock('../middleware/requireKyc', () => ({ requireVerifiedKyc: () => (req, res, next) => next() }));
    jest.doMock('../models/JobApplication', () => ({ findOne: jest.fn().mockResolvedValue(null), find: jest.fn() }));
    jest.doMock('../models/user', () => ({ find: jest.fn().mockResolvedValue([]) }));
    jest.doMock('../services/notificationEngine', () => ({ notify: jest.fn().mockResolvedValue({}) }));
    JobOpening = { findById: jest.fn(), find: jest.fn(), create: jest.fn(), countDocuments: jest.fn() };
    jest.doMock('../models/JobOpening', () => JobOpening);

    const careers = require('../routes/careers');
    app = express();
    app.use(careers);
    // The router answers through its own catch; a thrown error reaching here
    // would mean respondFailure did not handle it.
    app.use((err, req, res, next) => res.status(999).json({ leaked: err.message }));
  });

  it('is a 400 naming the id, not a 500', async () => {
    // The route reads `JobOpening.findById(id).lean()`, so the mock has to be a
    // query, not a promise — rejecting a bare promise never reaches .lean().
    JobOpening.findById.mockReturnValue({ lean: () => Promise.reject(castError('_id', 'JobOpening', 'undefined')) });
    const res = await request(app).get('/openings/undefined');
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false, code: 'INVALID_RESOURCE_ID' });
    expect(res.body.error).toContain('_id');
  });

  it('still answers 500 when the database itself fails', async () => {
    JobOpening.findById.mockReturnValue({ lean: () => Promise.reject(new Error('topology is closed')) });
    const res = await request(app).get('/openings/507f1f77bcf86cd799439011');
    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
  });

  it('still answers 404 for a well-formed id that matches nothing', async () => {
    JobOpening.findById.mockImplementation(() => ({ lean: async () => null }));
    const res = await request(app).get('/openings/507f1f77bcf86cd799439011');
    expect(res.statusCode).toBe(404);
  });
});
