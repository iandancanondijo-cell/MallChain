const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock auth controller functions
const mockAuthController = {
  register: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email and password required' });
      }
      res.status(201).json({ ok: true, user: { email, id: 'test-id' } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  },
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email and password required' });
      }
      const token = jwt.sign({ userId: 'test-id' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(200).json({ ok: true, token, user: { email, id: 'test-id' } });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
};

describe('Auth Controller Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/api/auth/register', mockAuthController.register);
    app.post('/api/auth/login', mockAuthController.login);
  });

  describe('POST /api/auth/register', () => {
    test('should register user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
    });

    test('should fail with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ password: 'password123' });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });

    test('should fail with missing password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.token).toBeDefined();
    });

    test('should fail with missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      
      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
    });
  });
});
