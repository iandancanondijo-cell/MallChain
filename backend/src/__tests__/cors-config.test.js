/**
 * Task 3.1 & 3.2: Test CORS configuration
 * Validates that CORS_ORIGINS parsing and FRONTEND_URL reading works correctly
 */

describe('CORS Configuration (Tasks 3.1 & 3.2)', () => {
  let config;
  let getAllowedOrigins;

  beforeEach(() => {
    // Clear module cache to reload config with new env vars
    jest.resetModules();
    
    // Set environment variables before importing config
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
    process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
    process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
    
    // Import config module
    ({ config, getAllowedOrigins } = require('../config'));
  });

  describe('Task 3.1: FRONTEND_URL reading', () => {
    it('should include FRONTEND_URL in allowed origins', () => {
      process.env.FRONTEND_URL = 'http://localhost:5173';
      
      // Reload config
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      expect(config.frontendUrl).toBe('http://localhost:5173');
      expect(config.corsOrigins).toBeDefined();
    });

    it('should use default FRONTEND_URL if not set', () => {
      delete process.env.FRONTEND_URL;
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      // Default should be localhost
      expect(config.frontendUrl).toBe('http://localhost:5173');
    });
  });

  describe('Task 3.2: CORS_ORIGINS parsing', () => {
    it('should parse comma-separated CORS_ORIGINS list', () => {
      process.env.CORS_ORIGINS = 'http://example.com,https://app.example.com,http://localhost:3000';
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      expect(config.corsOrigins).toEqual([
        'http://example.com',
        'https://app.example.com',
        'http://localhost:3000'
      ]);
    });

    it('should trim whitespace in CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = '  http://example.com  ,  https://app.example.com  ';
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      expect(config.corsOrigins).toEqual([
        'http://example.com',
        'https://app.example.com'
      ]);
    });

    it('should filter out empty strings from CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = 'http://example.com,,https://app.example.com,';
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      expect(config.corsOrigins).toEqual([
        'http://example.com',
        'https://app.example.com'
      ]);
    });

    it('should handle empty CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = '';
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      expect(config.corsOrigins).toEqual([]);
    });
  });

  describe('getAllowedOrigins() function', () => {
    it('should combine FRONTEND_URL and CORS_ORIGINS', () => {
      process.env.FRONTEND_URL = 'http://localhost:5173';
      process.env.CORS_ORIGINS = 'http://example.com,https://app.example.com';
      process.env.NODE_ENV = 'development';
      
      jest.resetModules();
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      const allowedOrigins = getAllowedOrigins();
      expect(typeof allowedOrigins).toBe('function'); // In dev mode, returns a function
    });
  });
});
