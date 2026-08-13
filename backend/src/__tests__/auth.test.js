const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

// Mock the User model
jest.mock('../models/user', () => {
  return {
    findById: jest.fn(),
  };
});

const User = require('../models/user');

describe('Authentication Middleware Tests', () => {
  let app;
  const JWT_SECRET = process.env.JWT_SECRET;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Public route (no auth)
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Protected route (requires auth)
    app.get('/api/protected', auth, (req, res) => {
      res.json({ msg: 'protected', user: req.user });
    });

    // Another protected route to test multiple scenarios
    app.post('/api/secure', auth, (req, res) => {
      res.json({ success: true, userId: req.user._id });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Public routes', () => {
    test('health endpoint returns 200 without authentication', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('JWT token extraction and validation', () => {
    test('extracts Bearer token from Authorization header and validates successfully', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        email: 'test@example.com',
      };

      // Generate a valid token
      const token = jwt.sign(
        { userId: mockUser._id, username: mockUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      // Mock User.findById to return the user
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.msg).toBe('protected');
      expect(response.body.user).toMatchObject(mockUser);
      expect(User.findById).toHaveBeenCalledWith(mockUser._id);
    });

    test('verifies JWT signature using JWT_SECRET', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
      };

      // Generate a token with wrong secret
      const wrongSecret = 'wrong_secret_key';
      const invalidToken = jwt.sign(
        { userId: mockUser._id, username: mockUser.username },
        wrongSecret,
        { expiresIn: '2h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });

    test('decodes payload and attaches user to req.user', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
        email: 'test@example.com',
      };

      const token = jwt.sign(
        { userId: mockUser._id, username: mockUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user._id).toBe(mockUser._id);
      expect(response.body.user.username).toBe(mockUser.username);
    });

    test('supports legacy token format with "id" field for backward compatibility', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'legacyuser',
      };

      // Generate token with old "id" field instead of "userId"
      const legacyToken = jwt.sign(
        { id: mockUser._id, username: mockUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${legacyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user._id).toBe(mockUser._id);
    });
  });

  describe('Error handling for missing/invalid tokens', () => {
    test('returns 401 for missing Authorization header', async () => {
      const response = await request(app).get('/api/protected');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('missing auth token');
    });

    test('returns 401 for malformed Authorization header (missing Bearer)', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'SomeToken123');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('bad auth header');
    });

    test('returns 401 for malformed Authorization header (wrong format)', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer token extra');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('bad auth header');
    });

    test('returns 401 for invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid.jwt.token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });

    test('returns 401 for token with invalid signature', async () => {
      const token = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', username: 'testuser' },
        'wrong_secret',
        { expiresIn: '2h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });

    test('returns 401 when user not found in database', async () => {
      const token = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', username: 'nonexistent' },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      // Mock User.findById to return null (user not found)
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });
  });

  describe('Error handling for expired tokens', () => {
    test('returns 401 for expired JWT token', async () => {
      // Generate an expired token (expired 1 hour ago)
      const expiredToken = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });

    test('expired token error is caught and returns 401', async () => {
      // Create a token that expires in 1 second
      const token = jwt.sign(
        { userId: '507f1f77bcf86cd799439011', username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a moment to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('invalid token');
    });
  });

  describe('Multiple request scenarios', () => {
    test('handles multiple consecutive authenticated requests', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
      };

      const token = jwt.sign(
        { userId: mockUser._id, username: mockUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      // First request
      const response1 = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response1.status).toBe(200);

      // Second request with same token
      const response2 = await request(app)
        .post('/api/secure')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: 'test' });

      expect(response2.status).toBe(200);
      expect(response2.body.success).toBe(true);
    });

    test('handles POST requests with authentication', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        username: 'testuser',
      };

      const token = jwt.sign(
        { userId: mockUser._id, username: mockUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUser),
      }));

      const response = await request(app)
        .post('/api/secure')
        .set('Authorization', `Bearer ${token}`)
        .send({ data: 'test payload' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(mockUser._id);
    });
  });

  describe('Environment configuration', () => {
    test('environment variables are set for testing', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.JWT_SECRET).toBeDefined();
      // Note: In test environment, JWT_SECRET is intentionally shorter for simplicity
      // In production, JWT_SECRET must be at least 32 characters (enforced by config validation)
      expect(process.env.JWT_SECRET).toBeTruthy();
    });
  });
});
