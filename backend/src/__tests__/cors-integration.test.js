/**
 * Task 3.3: Integration test for CORS with requests from allowed origin
 * Tests that backend properly allows requests from configured frontend origin
 * and includes proper CORS headers in responses
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');

describe('CORS Integration Tests (Task 3.3)', () => {
  let app;
  let config;
  let getAllowedOrigins;

  beforeEach(() => {
    // Clear module cache
    jest.resetModules();
    
    // Set required environment variables
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
    process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
    process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.CORS_ORIGINS = '';
    process.env.NODE_ENV = 'development';
    
    // Import config after setting env vars
    ({ config, getAllowedOrigins } = require('../config'));
    
    // Create a minimal Express app with CORS middleware (mimics actual setup)
    app = express();
    app.use(cors({
      origin: getAllowedOrigins(),
      credentials: true,
    }));
    app.use(express.json());
    
    // Add test routes
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    app.get('/api/test', (req, res) => {
      res.json({ message: 'test endpoint' });
    });
    
    // Protected route that expects Authorization header
    app.get('/api/protected', (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
      }
      res.json({ message: 'authorized', authHeader });
    });
  });

  describe('Requests from allowed origin (http://localhost:5173)', () => {
    it('should include Access-Control-Allow-Origin header in response', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      // Verify response includes CORS header
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should allow credentials in CORS response', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      // Verify credentials are allowed
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should successfully handle GET request from allowed origin', async () => {
      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      expect(response.body).toEqual({ message: 'test endpoint' });
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should allow Authorization headers from allowed origin', async () => {
      const testToken = 'Bearer test-jwt-token-12345';
      
      const response = await request(app)
        .get('/api/protected')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', testToken)
        .expect(200);
      
      // Verify the Authorization header was received
      expect(response.body.authHeader).toBe(testToken);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle preflight OPTIONS request from allowed origin', async () => {
      const response = await request(app)
        .options('/api/protected')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .expect(204);
      
      // Verify CORS preflight headers are set correctly
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Multiple allowed origins', () => {
    beforeEach(() => {
      // Reconfigure with multiple CORS origins
      jest.resetModules();
      
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      process.env.FRONTEND_URL = 'http://localhost:5173';
      process.env.CORS_ORIGINS = 'http://example.com,https://app.example.com';
      process.env.NODE_ENV = 'development';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      // Recreate app with new config
      app = express();
      app.use(cors({
        origin: getAllowedOrigins(),
        credentials: true,
      }));
      app.use(express.json());
      
      app.get('/api/test', (req, res) => {
        res.json({ message: 'test' });
      });
    });

    it('should allow requests from FRONTEND_URL', async () => {
      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should allow requests from CORS_ORIGINS entries', async () => {
      const response1 = await request(app)
        .get('/api/test')
        .set('Origin', 'http://example.com')
        .expect(200);
      
      expect(response1.headers['access-control-allow-origin']).toBe('http://example.com');

      const response2 = await request(app)
        .get('/api/test')
        .set('Origin', 'https://app.example.com')
        .expect(200);
      
      expect(response2.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });

    it('should allow requests from localhost variations (dev mode)', async () => {
      // In development, any localhost port should be allowed
      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('Credentials support', () => {
    it('should set Access-Control-Allow-Credentials to true', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow cookies and Authorization headers through CORS', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', 'Bearer test-token')
        .set('Cookie', 'sessionId=abc123')
        .expect(200);
      
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.authHeader).toBe('Bearer test-token');
    });
  });

  describe('Preflight OPTIONS requests', () => {
    it('should handle OPTIONS preflight for POST requests', async () => {
      const response = await request(app)
        .options('/api/test')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization')
        .expect(204);
      
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should handle OPTIONS preflight for custom headers', async () => {
      const response = await request(app)
        .options('/api/protected')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization,X-Custom-Header')
        .expect(204);
      
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });

  describe('Request success verification', () => {
    it('should successfully process JSON POST request from allowed origin', async () => {
      app.post('/api/data', (req, res) => {
        res.json({ received: req.body });
      });

      const testData = { key: 'value', number: 42 };
      
      const response = await request(app)
        .post('/api/data')
        .set('Origin', 'http://localhost:5173')
        .set('Content-Type', 'application/json')
        .send(testData)
        .expect(200);
      
      expect(response.body.received).toEqual(testData);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should not have CORS errors when making multiple requests', async () => {
      // Make multiple requests to verify CORS is consistently working
      const requests = [
        request(app).get('/api/health').set('Origin', 'http://localhost:5173'),
        request(app).get('/api/test').set('Origin', 'http://localhost:5173'),
        request(app).get('/api/health').set('Origin', 'http://localhost:5173'),
      ];

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      });
    });
  });

  /**
   * Task 3.4: Test CORS with requests from disallowed origin
   * These tests verify that backend properly rejects requests from non-allowed origins
   * The current implementation returns 500 errors for disallowed origins (via callback error)
   */
  describe('Requests from disallowed origins (Task 3.4)', () => {
    it('should reject requests from disallowed origin with 500 error', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com')
        .expect(500); // CORS middleware returns error for disallowed origin
      
      // Verify CORS header is NOT present - browser would block if it were 200
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject requests from unknown HTTPS origin with 500 error', async () => {
      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'https://evil.example.com')
        .expect(500);
      
      // CORS header should not be set for disallowed origin
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject requests from unauthorized origin with 500 error', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://unauthorized-app.com')
        .expect(500);
      
      // Verify neither CORS origin nor credentials headers are present
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject random origin in production mode with 500 error', async () => {
      // Reconfigure for production mode (stricter CORS)
      jest.resetModules();
      
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long!!!';
      process.env.SESSION_SECRET = 'session-secret-key-at-least-32-chars!!!';
      process.env.ADMIN_API_KEY = 'admin-api-key-at-least-32-characters!!!';
      process.env.FRONTEND_URL = 'https://app.example.com';
      process.env.CORS_ORIGINS = '';
      process.env.NODE_ENV = 'production';
      
      ({ config, getAllowedOrigins } = require('../config'));
      
      // Recreate app with production config
      app = express();
      app.use(cors({
        origin: getAllowedOrigins(),
        credentials: true,
      }));
      app.use(express.json());
      
      app.get('/api/test', (req, res) => {
        res.json({ message: 'test' });
      });

      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'http://localhost:3000')
        .expect(500);
      
      // In production mode, localhost:3000 should be rejected (not in allowlist)
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject preflight OPTIONS request from disallowed origin', async () => {
      const response = await request(app)
        .options('/api/protected')
        .set('Origin', 'http://attacker.com')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .expect(500);
      
      // Preflight rejected with error - no CORS headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should reject POST request from disallowed origin with 500 error', async () => {
      app.post('/api/data', (req, res) => {
        res.json({ received: req.body });
      });

      const response = await request(app)
        .post('/api/data')
        .set('Origin', 'http://phishing-site.com')
        .set('Content-Type', 'application/json')
        .send({ data: 'test' })
        .expect(500); // CORS middleware rejects before reaching route handler
      
      // Request is blocked at CORS level, no CORS header set
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should consistently reject multiple disallowed origins', async () => {
      const disallowedOrigins = [
        'http://evil1.com',
        'http://evil2.com',
        'https://phishing.net',
        'http://attacker.org',
      ];

      for (const origin of disallowedOrigins) {
        const response = await request(app)
          .get('/api/health')
          .set('Origin', origin)
          .expect(500);
        
        // None of the disallowed origins should get CORS headers
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('should verify CORS isolation between allowed and disallowed origins', async () => {
      // First request from allowed origin - should succeed
      const allowedResponse = await request(app)
        .get('/api/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      
      expect(allowedResponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowedResponse.headers['access-control-allow-credentials']).toBe('true');

      // Second request from disallowed origin - should be rejected with 500
      const disallowedResponse = await request(app)
        .get('/api/test')
        .set('Origin', 'http://malicious-site.com')
        .expect(500);
      
      // Disallowed origin should not get CORS header
      expect(disallowedResponse.headers['access-control-allow-origin']).toBeUndefined();

      // Verify that allowing one origin doesn't leak to the rejected request
      expect(allowedResponse.headers['access-control-allow-origin']).not.toBe(
        disallowedResponse.headers['access-control-allow-origin']
      );
    });

    it('should allow requests without Origin header (e.g., server-to-server)', async () => {
      // Requests without Origin header are typically from non-browser clients
      const response = await request(app)
        .get('/api/health')
        // No Origin header set
        .expect(200);
      
      // Without Origin header, CORS doesn't apply, request should succeed
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
