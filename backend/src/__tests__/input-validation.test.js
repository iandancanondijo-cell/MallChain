/**
 * Task 8.6: Input Validation Tests
 * 
 * Validates that input validation middleware properly:
 * - Rejects NoSQL injection attempts
 * - Sanitizes XSS vectors
 * - Enforces payload size limits
 * - Validates authentication inputs
 */

const { 
  preventNoSQLInjection, 
  sanitizeInputs, 
  limitPayloadSize, 
  validateInput,
  schemas,
} = require('../middleware/inputValidation');

describe('Input Validation Middleware', () => {
  
  describe('NoSQL Injection Prevention', () => {
    test('Rejects requests with MongoDB operators in body', () => {
      const req = {
        body: {
          email: 'test@test.com',
          password: { $ne: '' }
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      preventNoSQLInjection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          error: 'Invalid input detected',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('Rejects requests with $where operators', () => {
      const req = {
        body: {
          query: { $where: 'this.admin == true' }
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      preventNoSQLInjection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    test('Allows normal valid requests', () => {
      const req = {
        body: {
          email: 'test@test.com',
          password: 'ValidPassword123'
        }
      };
      const res = {};
      const next = jest.fn();

      preventNoSQLInjection(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('XSS Sanitization', () => {
    test('Removes angle brackets from strings', () => {
      const req = {
        body: {
          username: 'test<script>alert("xss")</script>',
          email: 'test@test.com'
        }
      };
      const res = {};
      const next = jest.fn();

      sanitizeInputs(req, res, next);

      expect(req.body.username).toBe('testscriptalertxssscript');
      expect(next).toHaveBeenCalled();
    });

    test('Sanitizes nested objects', () => {
      const req = {
        body: {
          user: {
            name: 'Test<b>User</b>',
            email: 'test@test.com'
          }
        }
      };
      const res = {};
      const next = jest.fn();

      sanitizeInputs(req, res, next);

      expect(req.body.user.name).toBe('TestbUserb');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Auth Schema Validation', () => {
    test('Rejects weak passwords', () => {
      const schema = schemas.auth.register;
      const { error } = schema.validate({
        email: 'test@test.com',
        password: 'weak'
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('at least 8');
    });

    test('Rejects password without uppercase', () => {
      const schema = schemas.auth.register;
      const { error } = schema.validate({
        email: 'test@test.com',
        password: 'lowercase123'
      });

      expect(error).toBeDefined();
    });

    test('Accepts valid credentials', () => {
      const schema = schemas.auth.register;
      const { error } = schema.validate({
        email: 'test@test.com',
        password: 'ValidPassword123'
      });

      expect(error).toBeUndefined();
    });

    test('Rejects invalid email format', () => {
      const schema = schemas.auth.register;
      const { error } = schema.validate({
        email: 'not-an-email',
        password: 'ValidPassword123'
      });

      expect(error).toBeDefined();
    });

    test('Normalizes email to lowercase', () => {
      const schema = schemas.auth.register;
      const { value } = schema.validate({
        email: 'Test@Test.COM',
        password: 'ValidPassword123'
      });

      expect(value.email).toBe('test@test.com');
    });
  });

  describe('Transaction Validation', () => {
    test('Validates transaction amount is positive', () => {
      const schema = schemas.tx.send;
      const { error } = schema.validate({
        to: 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz123456',
        amount: -100
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('positive');
    });

    test('Validates recipient address format', () => {
      const schema = schemas.tx.send;
      const { error } = schema.validate({
        to: 'invalid-address',
        amount: 100
      });

      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('address');
    });

    test('Accepts valid transaction', () => {
      const schema = schemas.tx.send;
      const { error } = schema.validate({
        to: 'mall1abc1234567890abcdefghijklmnopqrstuvwxyz123456',
        amount: 100
      });

      expect(error).toBeUndefined();
    });
  });
});
