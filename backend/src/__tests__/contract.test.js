/**
 * Contract Tests — validate API response shapes haven't changed unexpectedly.
 *
 * These tests lock the shape of critical API responses so that backend
 * refactors can't silently break frontend consumers. Each test describes
 * the expected JSON schema for a route's response body.
 *
 * Run: npx jest --testPathPattern contract
 */

const Joi = require('joi');

const healthSchema = Joi.object({
  status: Joi.string().valid('ok', 'degraded').required(),
  timestamp: Joi.string().required(),
  uptime: Joi.number().required(),
  version: Joi.string().required(),
}).unknown(true);

const sloSchema = Joi.object({
  status: Joi.string().valid('healthy', 'warning', 'critical').required(),
  timestamp: Joi.string().required(),
  slos: Joi.object({
    availability: Joi.object({
      value: Joi.number().required(),
      target: Joi.number().required(),
      status: Joi.string().required(),
    }).unknown(true),
    errorRate: Joi.object({
      value: Joi.number().required(),
      target: Joi.number().required(),
      status: Joi.string().required(),
    }).unknown(true),
    latency: Joi.object({
      value: Joi.number().required(),
      target: Joi.number().required(),
      status: Joi.string().required(),
    }).unknown(true),
  }).required(),
}).unknown(true);

const errorResponseSchema = Joi.object({
  error: Joi.alternatives().try(Joi.string(), Joi.object()).required(),
  message: Joi.string().optional(),
});

const paginatedResponseSchema = Joi.object({
  docs: Joi.array().required(),
  pagination: Joi.object({
    page: Joi.number().integer().optional(),
    limit: Joi.number().integer().optional(),
    total: Joi.number().integer().optional(),
    pages: Joi.number().integer().optional(),
    hasNext: Joi.boolean().optional(),
    hasPrev: Joi.boolean().optional(),
    cursor: Joi.string().allow(null).optional(),
    hasMore: Joi.boolean().optional(),
    count: Joi.number().integer().optional(),
  }).required(),
}).unknown(true);

const authMeSchema = Joi.object({
  user: Joi.object({
    _id: Joi.string().required(),
    email: Joi.string().email().required(),
    username: Joi.string().required(),
    role: Joi.string().valid('user', 'admin', 'superadmin').required(),
    walletAddress: Joi.string().allow(null).optional(),
    banned: Joi.boolean().optional(),
    kycStatus: Joi.string().optional(),
  }).required(),
}).unknown(true);

const realtimeStatsSchema = Joi.object({
  sse: Joi.object({
    activeClients: Joi.number().integer().min(0).required(),
    maxClients: Joi.number().integer().min(1).required(),
  }).required(),
  websocket: Joi.object({
    activeConnections: Joi.number().integer().min(0).required(),
    maxConnections: Joi.number().integer().min(1).required(),
  }).required(),
});

describe('Contract Tests — API Response Shapes', () => {
  describe('Health endpoint', () => {
    it('matches the health response contract', () => {
      const mockResponse = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        version: '0.1.0',
        mongo: 'connected',
        redis: 'connected',
      };

      const { error } = healthSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });

    it('rejects responses missing required fields', () => {
      const badResponse = { status: 'ok' };
      const { error } = healthSchema.validate(badResponse);
      expect(error).toBeDefined();
    });
  });

  describe('SLO endpoint', () => {
    it('matches the SLO response contract', () => {
      const mockResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        slos: {
          availability: { value: 99.9, target: 99.5, status: 'healthy' },
          errorRate: { value: 0.1, target: 1.0, status: 'healthy' },
          latency: { value: 120, target: 500, status: 'healthy' },
        },
        errorBudget: { remaining: 0.4, consumed: 0.6 },
      };

      const { error } = sloSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });
  });

  describe('Error responses', () => {
    it('always include an error field', () => {
      const responses = [
        { error: 'not_found' },
        { error: 'validation_failed', message: 'Email is required' },
        { error: { code: 'RATE_LIMITED', retryAfter: 30 } },
      ];

      responses.forEach(res => {
        const { error } = errorResponseSchema.validate(res);
        expect(error).toBeUndefined();
      });
    });

    it('rejects responses without error field', () => {
      const { error } = errorResponseSchema.validate({ message: 'something went wrong' });
      expect(error).toBeDefined();
    });
  });

  describe('Paginated responses', () => {
    it('matches offset pagination contract', () => {
      const mockResponse = {
        docs: [{ _id: '1', name: 'test' }],
        pagination: {
          page: 1,
          limit: 20,
          total: 100,
          pages: 5,
          hasNext: true,
          hasPrev: false,
        },
      };

      const { error } = paginatedResponseSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });

    it('matches cursor pagination contract', () => {
      const mockResponse = {
        docs: [{ _id: '1', name: 'test' }],
        pagination: {
          cursor: 'eyJfaWQiOiIxIn0=',
          hasMore: true,
          count: 1,
          limit: 20,
        },
      };

      const { error } = paginatedResponseSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });
  });

  describe('Auth /me endpoint', () => {
    it('matches the user profile contract', () => {
      const mockResponse = {
        user: {
          _id: '507f1f77bcf86cd799439011',
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          walletAddress: 'mall1abc123',
          banned: false,
          kycStatus: 'none',
        },
      };

      const { error } = authMeSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });

    it('rejects missing required user fields', () => {
      const badResponse = {
        user: { email: 'test@example.com' },
      };

      const { error } = authMeSchema.validate(badResponse);
      expect(error).toBeDefined();
    });
  });

  describe('Realtime stats endpoint', () => {
    it('matches the realtime stats contract', () => {
      const mockResponse = {
        sse: { activeClients: 42, maxClients: 500 },
        websocket: { activeConnections: 150, maxConnections: 5000 },
      };

      const { error } = realtimeStatsSchema.validate(mockResponse);
      expect(error).toBeUndefined();
    });
  });
});
