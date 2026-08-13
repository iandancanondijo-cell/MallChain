/**
 * Task 8.6: Input Validation Middleware for Critical Routes
 * 
 * Comprehensive input validation and sanitization middleware to prevent:
 * - NoSQL injection attacks
 * - XSS attacks
 * - Invalid data types
 * - Oversized payloads
 * 
 * Validates:
 * - /api/auth routes (username, password, email)
 * - /api/tx routes (transaction parameters)
 * - /api/market routes (market data)
 * 
 * Integration with Express:
 * - validateInput(schema): Validates req.body against Joi schema
 * - validateQuery(schema): Validates req.query parameters
 * - preventNoSQLInjection: Checks for MongoDB operators ($ne, $gt, etc.)
 * - sanitizeInputs: Removes HTML tags from string inputs
 * - limitPayloadSize: Rejects oversized requests (prevents memory exhaustion)
 * 
 * Middleware stack example (from auth.js):
 * POST /register → limitPayloadSize → preventNoSQLInjection → sanitizeInputs → validateInput → controller
 * Each middleware progressively hardens the request before reaching application logic
 */

const Joi = require('joi');

/**
 * Task 8.6: Auth validation schemas
 * Define acceptable formats for authentication data
 * Joi handles type coercion and normalization (e.g., email.lowercase())
 */
const authSchemas = {
  // Registration with email
  register: Joi.object({
    email: Joi.string()
      .email()
      .lowercase()  // Normalize to lowercase for case-insensitive lookups
      .trim()        // Remove leading/trailing whitespace
      .max(255)
      .required()
      .messages({
        'string.email': 'Invalid email format',
        'string.max': 'Email exceeds maximum length',
      }),
    password: Joi.string()
      .min(8)
      .max(128)
      // Require at least one uppercase letter (security requirement)
      .pattern(/[A-Z]/)
      // Require at least one lowercase letter (security requirement)
      .pattern(/[a-z]/)
      // Require at least one digit (security requirement)
      .pattern(/[0-9]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain uppercase, lowercase, and numbers',
      }),
  }),
  
  // Registration with username
  registerUsername: Joi.object({
    username: Joi.string()
      .lowercase()
      .trim()
      // Only allow lowercase letters, digits, underscore
      // Prevents confusing usernames like "I1l" (I, one, lowercase L)
      .pattern(/^[a-z0-9_]{3,32}$/)
      .required()
      .messages({
        'string.pattern.base': 'Username must be 3-32 chars using lowercase letters, numbers, or underscores',
      }),
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/[A-Z]/)
      .pattern(/[a-z]/)
      .pattern(/[0-9]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must contain uppercase, lowercase, and numbers',
      }),
  }),

  // Login with email
  login: Joi.object({
    email: Joi.string()
      .email()
      .lowercase()
      .trim()
      .max(255)
      .required(),
    password: Joi.string()
      .min(1)
      .max(256)
      .required(),
  }),

  // Login with username
  loginUsername: Joi.object({
    username: Joi.string()
      .lowercase()
      .trim()
      .max(32)
      .required(),
    password: Joi.string()
      .min(1)
      .max(256)
      .required(),
  }),
};

/**
 * Task 8.6: Transaction validation schemas
 * Validate blockchain transaction parameters before processing
 */
const txSchemas = {
  // Send transaction (user initiates send to another address)
  send: Joi.object({
    to: Joi.string()
      // Mallchain addresses: mall1<38-58 hex chars>
      // This pattern prevents sending to invalid addresses
      .pattern(/^mall1[a-z0-9]{38,58}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid recipient address format',
      }),
    amount: Joi.number()
      .positive()        // Prevent negative or zero amounts
      .max(1e15)         // Cap at 10^15 (prevents integer overflow in blockchain)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
      }),
    memo: Joi.string()
      .max(256)          // Limit memo size to reduce transaction size
      .optional()
      .messages({
        'string.max': 'Memo exceeds maximum length',
      }),
    txBytes: Joi.string()
      .max(10000)        // Signed transaction bytes limit
      .optional(),
  }),

  // Transfer transaction (system-initiated transfer)
  transfer: Joi.object({
    from: Joi.string()
      .pattern(/^mall1[a-z0-9]{38,58}$/)
      .required(),
    to: Joi.string()
      .pattern(/^mall1[a-z0-9]{38,58}$/)
      .required(),
    amount: Joi.number()
      .positive()
      .max(1e15)
      .required(),
    memo: Joi.string()
      .max(256)
      .optional(),
  }),
};

/**
 * Task 8.6: Market validation schemas
 * Validate marketplace listing parameters
 */
const marketSchemas = {
  createListing: Joi.object({
    itemId: Joi.string()
      .alphanum()        // Only letters and digits, prevents injection
      .max(64)
      .required()
      .messages({
        'string.alphanum': 'Item ID must contain only alphanumeric characters',
      }),
    price: Joi.number()
      .positive()
      .max(1e15)
      .required(),
    quantity: Joi.number()
      .positive()
      .integer()
      .max(1000000)      // Prevent listing excessive quantities
      .required(),
    description: Joi.string()
      .max(1000)         // Limit description to prevent storage bloat
      .optional(),
  }),

  updateListing: Joi.object({
    listingId: Joi.string()
      .alphanum()
      .max(64)
      .required(),
    price: Joi.number()
      .positive()
      .max(1e15)
      .optional(),
    quantity: Joi.number()
      .positive()
      .integer()
      .max(1000000)
      .optional(),
  }),
};

/**
 * Task 8.6: Generic validation middleware factory
 * 
 * Returns Express middleware that validates request body against Joi schema
 * If validation fails, returns 400 error with detailed validation errors
 * If validation succeeds, stores validated/sanitized body in req.validatedBody
 */
function validateInput(schema, options = {}) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,     // Report all errors, not just first one
      stripUnknown: true,    // Remove unexpected fields (security)
      convert: true,         // Type coercion (e.g., "123" → 123)
      ...options,
    });

    if (error) {
      // Format validation errors for client response
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      // Return 400 Bad Request with detailed validation errors
      // Helps frontend show field-specific error messages
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        code: 400,
        details,
      });
    }

    // Store validated and sanitized body for route handler
    // This replaces req.body with schema-normalized version
    req.validatedBody = value;
    next();
  };
}

/**
 * Query parameter validation
 * Similar to validateInput but for URL query parameters (req.query)
 */
function validateQuery(schema, options = {}) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
      ...options,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        code: 400,
        details,
      });
    }

    req.validatedQuery = value;
    next();
  };
}

/**
 * Task 8.6: NoSQL injection prevention
 * 
 * Detects common NoSQL injection patterns in request body:
 * - MongoDB operators: $ne, $gt, $where, etc.
 * - Malicious objects: { $where: "..." }
 * - Eval-like patterns: eval(), function declarations
 * 
 * NoSQL injection example attack:
 * POST /login with body: { email: { $ne: null }, password: { $ne: null } }
 * Without validation, this might bypass authentication (MongoDB semantics)
 * 
 * This middleware prevents such attacks by rejecting operator-like structures
 */
function preventNoSQLInjection(req, res, next) {
  const checkValue = (value) => {
    if (typeof value === 'string') {
      // Check for dangerous code execution patterns only
      // Note: String values (like passwords) can safely contain $, {, }, [, ] characters
      // The object-level check for $-prefixed keys is sufficient to catch MongoDB operators
      const injectionPatterns = [
        /eval\s*\(/i,       // eval() calls
        /function\s*\(/i,   // function declarations
      ];

      for (const pattern of injectionPatterns) {
        if (pattern.test(value)) {
          return false;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      // Check nested objects for MongoDB operators
      for (const key of Object.keys(value)) {
        // Check if key is a MongoDB operator (starts with $)
        // Example: { $ne: null } is rejected
        if (key.startsWith('$')) {
          return false;
        }
        // Recursively check values in nested objects
        if (!checkValue(value[key])) {
          return false;
        }
      }
    }
    return true;
  };

  if (!checkValue(req.body)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid input detected',
      code: 400,
    });
  }

  next();
}

/**
 * Task 8.6: XSS (Cross-Site Scripting) prevention
 * 
 * Sanitizes string inputs to remove potential XSS vectors
 * XSS attack example in form input:
 * <input value="<script>alert('xss')</script>">
 * 
 * This middleware removes angle brackets that could break out of HTML context
 * Note: This is a basic sanitizer. For production, use DOMPurify or similar library
 */
function sanitizeInputs(req, res, next) {
  const sanitize = (value) => {
    if (typeof value === 'string') {
      // Remove characters that could inject or break out of HTML/JS context
      return value
        .replace(/[<>()"'/]/g, '')
        .trim();
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize object properties
      const sanitized = {};
      for (const key of Object.keys(value)) {
        sanitized[key] = sanitize(value[key]);
      }
      return sanitized;
    } else if (Array.isArray(value)) {
      // Recursively sanitize array elements
      return value.map(sanitize);
    }
    return value;
  };

  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }

  next();
}

/**
 * Task 8.6: Payload size limiting
 * 
 * Rejects requests with excessively large payloads
 * Prevents memory exhaustion attacks (sending huge JSON bodies)
 * 
 * Example: If maxSizeMb=1, requests > 1MB are rejected with 413 Payload Too Large
 */
function limitPayloadSize(maxSizeMb = 1) {
  return (req, res, next) => {
    if (req.headers['content-length']) {
      const sizeMb = parseInt(req.headers['content-length'], 10) / (1024 * 1024);
      if (sizeMb > maxSizeMb) {
        return res.status(413).json({
          ok: false,
          error: 'Payload too large',
          code: 413,
        });
      }
    }
    next();
  };
}

module.exports = {
  validateInput,
  validateQuery,
  preventNoSQLInjection,
  sanitizeInputs,
  limitPayloadSize,
  schemas: {
    auth: authSchemas,
    tx: txSchemas,
    market: marketSchemas,
  },
};
