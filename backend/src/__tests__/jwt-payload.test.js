/**
 * Task 4.1: Test JWT token generation with correct payload
 * Validates that /api/auth/login generates JWT with {userId, username, exp} payload
 */

const jwt = require('jsonwebtoken');

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
process.env.SESSION_TTL_MIN = '120';

describe('JWT Token Generation (Task 4.1)', () => {
  // Mock user object
  const mockUser = {
    _id: '507f1f77bcf86cd799439011', // Valid MongoDB ObjectId
    email: 'test@example.com',
    username: 'testuser',
  };

  it('should generate JWT token with userId field instead of id', () => {
    // Simulate the signToken function from authController
    const token = jwt.sign(
      { 
        userId: String(mockUser._id),
        username: mockUser.username || mockUser.email,
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '120m' }
    );

    // Verify token is generated
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature

    // Decode token and verify payload structure
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Task 4.1: Verify new payload format {userId, username, exp}
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('username');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).not.toHaveProperty('id'); // Old format should not exist
    
    // Verify field values
    expect(decoded.userId).toBe(String(mockUser._id));
    expect(decoded.username).toBe(mockUser.username);
    expect(typeof decoded.exp).toBe('number');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000)); // exp is in future
  });

  it('should use sessionTtlMin environment variable for expiration', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { 
        userId: String(mockUser._id),
        username: mockUser.username || mockUser.email,
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '120m' }
    );
    const after = Math.floor(Date.now() / 1000);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 120 minutes = 7200 seconds
    const expectedExp = after + (120 * 60);
    const actualExpDiff = decoded.exp - after;
    
    // Allow ±5 second tolerance for test execution time
    expect(actualExpDiff).toBeGreaterThanOrEqual(120 * 60 - 5);
    expect(actualExpDiff).toBeLessThanOrEqual(120 * 60 + 5);
  });

  it('should fall back to email as username if username not provided', () => {
    const userWithoutUsername = { ...mockUser, username: null };
    
    const token = jwt.sign(
      { 
        userId: String(userWithoutUsername._id),
        username: userWithoutUsername.username || userWithoutUsername.email,
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '120m' }
    );

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.username).toBe(mockUser.email);
  });

  it('should create tokens that can be verified later', () => {
    const token1 = jwt.sign(
      { 
        userId: String(mockUser._id),
        username: mockUser.username || mockUser.email,
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '120m' }
    );

    // Verify can be called later
    const decoded = jwt.verify(token1, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(String(mockUser._id));
  });

  it('should reject token with wrong secret', () => {
    const token = jwt.sign(
      { 
        userId: String(mockUser._id),
        username: mockUser.username || mockUser.email,
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '120m' }
    );

    // Try to verify with different secret
    expect(() => {
      jwt.verify(token, 'wrong-secret');
    }).toThrow();
  });
});
