/**
 * Task 4.6: Complete authentication flow integration test
 * Tests: login → store token → access protected route
 * 
 * This integration test validates the complete end-to-end authentication flow:
 * 1. User logs in with valid credentials
 * 2. Server returns JWT token
 * 3. Token is stored (simulated localStorage)
 * 4. Protected route is accessed with token
 * 5. Protected route returns data with 200 status
 * 6. Invalid token scenarios (expect 401)
 * 7. Missing token scenarios (expect 401)
 * 
 * Requirements Reference:
 * - Section 4: Complete authentication system integration
 * - Section 10.3: Integration tests must cover full authentication flow
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');

// Mock the User model
jest.mock('../models/user', () => {
  return {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  };
});

const User = require('../models/user');

describe('Complete Authentication Flow Integration Test (Task 4.6)', () => {
  let app;
  let JWT_SECRET;
  let testUser;
  let testPassword;
  let hashedPassword;

  beforeAll(async () => {
    // Use JWT_SECRET from jest.setup.js
    JWT_SECRET = process.env.JWT_SECRET;
    process.env.SESSION_TTL_MIN = '120';

    // Create test user data
    testPassword = 'TestPassword123!';
    hashedPassword = await bcrypt.hash(testPassword, 10);
    
    testUser = {
      _id: '507f1f77bcf86cd799439011',
      email: 'testuser@example.com',
      username: 'testuser',
      password: hashedPassword,
      role: 'user',
    };

    // Create minimal Express app mimicking the real backend
    app = express();
    app.use(express.json());

    // Public route: Login (no auth required)
    app.post('/api/auth/login', async (req, res) => {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password required' });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ error: 'invalid credentials' });
      }

      if (!user.password) {
        return res.status(400).json({ error: 'use OAuth login' });
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        return res.status(400).json({ error: 'invalid credentials' });
      }

      // Generate JWT token with correct payload
      const sessionTtlMin = parseInt(process.env.SESSION_TTL_MIN || '120', 10);
      const token = jwt.sign(
        { 
          userId: String(user._id),
          username: user.username || user.email,
        }, 
        JWT_SECRET, 
        { expiresIn: `${sessionTtlMin}m` }
      );

      res.json({ token, user: { _id: user._id, email: user.email, username: user.username } });
    });

    // Protected route: User profile (requires auth)
    app.get('/api/profile', auth, (req, res) => {
      res.json({ 
        success: true,
        user: req.user,
        message: 'Profile data retrieved successfully' 
      });
    });

    // Protected route: User data (requires auth)
    app.get('/api/user/data', auth, (req, res) => {
      res.json({ 
        data: {
          userId: req.user._id,
          username: req.user.username,
          email: req.user.email,
          preferences: { theme: 'dark', language: 'en' }
        }
      });
    });

    // Protected route: Transactions (requires auth)
    app.get('/api/tx', auth, (req, res) => {
      res.json({ 
        transactions: [
          { id: '1', amount: 100, type: 'credit' },
          { id: '2', amount: 50, type: 'debit' }
        ]
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Auth Flow: Login → Store Token → Access Protected Route', () => {
    test('successful login returns JWT token with user data', async () => {
      // Mock User.findOne to return test user
      User.findOne.mockResolvedValue(testUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      // Verify response contains token
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toBeTruthy();
      expect(typeof response.body.token).toBe('string');

      // Verify response contains user data
      expect(response.body).toHaveProperty('user');
      expect(response.body.user._id).toBe(testUser._id);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.username).toBe(testUser.username);

      // Verify token is valid JWT
      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      expect(decoded.userId).toBe(testUser._id);
      expect(decoded.username).toBe(testUser.username);
      expect(decoded.exp).toBeDefined();
    });

    test('complete flow: login → receive token → access protected route with token', async () => {
      // Step 1: Login
      User.findOne.mockResolvedValue(testUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const token = loginResponse.body.token;
      expect(token).toBeTruthy();

      // Step 2: Simulate storing token in localStorage (in browser context)
      // In test, we just keep the token variable to use in next request
      const storedToken = token; // Simulates: localStorage.setItem('token', token)

      // Step 3: Access protected route with Authorization header containing token
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: testUser._id,
          email: testUser.email,
          username: testUser.username,
          role: testUser.role,
        }),
      }));

      const protectedResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${storedToken}`)
        .expect(200);

      // Step 4: Verify protected route returns data
      expect(protectedResponse.body.success).toBe(true);
      expect(protectedResponse.body.user).toBeDefined();
      expect(protectedResponse.body.user._id).toBe(testUser._id);
      expect(protectedResponse.body.user.email).toBe(testUser.email);
    });

    test('protected route returns 200 with data when valid token provided', async () => {
      // Generate valid token
      const token = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: testUser._id,
          email: testUser.email,
          username: testUser.username,
        }),
      }));

      const response = await request(app)
        .get('/api/user/data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.userId).toBe(testUser._id);
      expect(response.body.data.username).toBe(testUser.username);
    });

    test('multiple protected routes can be accessed with same token', async () => {
      // Login and get token
      User.findOne.mockResolvedValue(testUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const token = loginResponse.body.token;

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: testUser._id,
          email: testUser.email,
          username: testUser.username,
        }),
      }));

      // Access first protected route
      const response1 = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response1.body.success).toBe(true);

      // Access second protected route with same token
      const response2 = await request(app)
        .get('/api/user/data')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response2.body.data).toBeDefined();

      // Access third protected route with same token
      const response3 = await request(app)
        .get('/api/tx')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response3.body.transactions).toBeDefined();
      expect(Array.isArray(response3.body.transactions)).toBe(true);
    });
  });

  describe('Invalid Token Scenarios (Expect 401)', () => {
    test('protected route returns 401 with invalid token', async () => {
      const invalidToken = 'invalid.jwt.token.string';

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });

    test('protected route returns 401 with token signed by wrong secret', async () => {
      const wrongSecret = 'wrong-secret-key-at-least-32-chars!!!';
      const token = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        wrongSecret,
        { expiresIn: '2h' }
      );

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });

    test('protected route returns 401 with expired token', async () => {
      // Create token that expired 1 hour ago
      const expiredToken = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });

    test('protected route returns 401 when token user not found in database', async () => {
      const token = jwt.sign(
        { userId: 'nonexistent123456789012', username: 'ghost' },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      // Mock User.findById to return null (user not found)
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });

    test('protected route returns 401 with malformed JWT token', async () => {
      const malformedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malformed';

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${malformedToken}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });

    test('protected route returns 401 with token for different user', async () => {
      const otherUserId = '507f1f77bcf86cd799439099';
      const token = jwt.sign(
        { userId: otherUserId, username: 'otheruser' },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      // Mock returns null for this user
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(null),
      }));

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.error).toBe('invalid token');
    });
  });

  describe('Missing Token Scenarios (Expect 401)', () => {
    test('protected route returns 401 when Authorization header is missing', async () => {
      const response = await request(app)
        .get('/api/profile')
        // No Authorization header
        .expect(401);

      expect(response.body.error).toBe('missing auth token');
    });

    test('protected route returns 401 when Authorization header has no Bearer prefix', async () => {
      const token = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', token) // Missing "Bearer " prefix
        .expect(401);

      expect(response.body.error).toBe('bad auth header');
    });

    test('protected route returns 401 when Authorization header is empty', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', '')
        .expect(401);

      expect(response.body.error).toBe('missing auth token');
    });

    test('protected route returns 401 when Authorization header has only Bearer', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer ')
        .expect(401);

      // Empty token after "Bearer " is caught as "bad auth header" by the split logic
      expect(response.body.error).toBe('bad auth header');
    });

    test('protected route returns 401 with malformed Authorization header format', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Basic some-token-here')
        .expect(401);

      // "Basic" authentication scheme will fail JWT verification
      expect(response.body.error).toBe('invalid token');
    });
  });

  describe('Login Error Scenarios', () => {
    test('login fails with invalid credentials (wrong password)', async () => {
      User.findOne.mockResolvedValue(testUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid credentials');
    });

    test('login fails when user does not exist', async () => {
      User.findOne.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid credentials');
    });

    test('login fails when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: testPassword
        })
        .expect(400);

      expect(response.body.error).toBe('email and password required');
    });

    test('login fails when password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email
        })
        .expect(400);

      expect(response.body.error).toBe('email and password required');
    });

    test('login fails for OAuth user without password', async () => {
      const oauthUser = {
        ...testUser,
        password: null, // OAuth user has no password
        googleId: 'google-id-12345'
      };

      User.findOne.mockResolvedValue(oauthUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: oauthUser.email,
          password: 'SomePassword123!'
        })
        .expect(400);

      expect(response.body.error).toBe('use OAuth login');
    });
  });

  describe('Token Payload Verification', () => {
    test('JWT token contains correct userId and username', async () => {
      User.findOne.mockResolvedValue(testUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      
      expect(decoded.userId).toBe(testUser._id);
      expect(decoded.username).toBe(testUser.username);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    test('JWT token expiration is set correctly', async () => {
      User.findOne.mockResolvedValue(testUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const decoded = jwt.verify(response.body.token, JWT_SECRET);
      
      // Verify expiration is set to SESSION_TTL_MIN (120 minutes = 7200 seconds)
      const expectedExp = decoded.iat + (120 * 60);
      expect(decoded.exp).toBeCloseTo(expectedExp, -1); // Allow 10 second tolerance
    });

    test('protected route receives correct user data from token', async () => {
      const token = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      const mockUserData = {
        _id: testUser._id,
        email: testUser.email,
        username: testUser.username,
        role: 'user',
      };

      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(mockUserData),
      }));

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user._id).toBe(testUser._id);
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.email).toBe(testUser.email);
    });
  });

  describe('End-to-End Workflow Simulation', () => {
    test('simulate realistic user session: login → multiple protected requests', async () => {
      // Step 1: User logs in
      User.findOne.mockResolvedValue(testUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const token = loginResponse.body.token;
      
      // Step 2: Store token (simulated)
      const localStorage = { token }; // Simulates browser localStorage

      // Step 3: Make multiple authenticated requests
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: testUser._id,
          email: testUser.email,
          username: testUser.username,
        }),
      }));

      // Request 1: Get profile
      const profileResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${localStorage.token}`)
        .expect(200);

      expect(profileResponse.body.success).toBe(true);

      // Request 2: Get user data
      const dataResponse = await request(app)
        .get('/api/user/data')
        .set('Authorization', `Bearer ${localStorage.token}`)
        .expect(200);

      expect(dataResponse.body.data).toBeDefined();

      // Request 3: Get transactions
      const txResponse = await request(app)
        .get('/api/tx')
        .set('Authorization', `Bearer ${localStorage.token}`)
        .expect(200);

      expect(txResponse.body.transactions).toBeDefined();
      expect(Array.isArray(txResponse.body.transactions)).toBe(true);

      // All requests succeeded with same token
      expect(User.findById).toHaveBeenCalledTimes(3);
    });

    test('simulate token expiration: login → wait → access fails → re-login', async () => {
      // Step 1: User logs in
      User.findOne.mockResolvedValue(testUser);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      // Step 2: Simulate expired token (create with negative expiration)
      const expiredToken = jwt.sign(
        { userId: testUser._id, username: testUser.username },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      // Step 3: Try to access protected route with expired token → 401
      const failedResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(failedResponse.body.error).toBe('invalid token');

      // Step 4: User re-logs in
      const reLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testPassword
        })
        .expect(200);

      const newToken = reLoginResponse.body.token;

      // Step 5: Access protected route with new token → success
      User.findById.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: testUser._id,
          email: testUser.email,
          username: testUser.username,
        }),
      }));

      const successResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(successResponse.body.success).toBe(true);
    });
  });
});
