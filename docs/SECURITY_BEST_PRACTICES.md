# Security Best Practices Guide

Comprehensive security documentation for the Mallchain Backend-Frontend Integration system, covering authentication, CORS policies, input validation, encryption, secret management, and production deployment security. This guide implements the security requirements from the backend-frontend integration specification and provides practical implementation guidance for developers and operations teams.

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Environment Configuration Security](#environment-configuration-security)
3. [Secret Management](#secret-management)
4. [Token Management and Storage](#token-management-and-storage)
5. [CORS Security Best Practices](#cors-security-best-practices)
6. [Input Validation and Output Encoding](#input-validation-and-output-encoding)
7. [Rate Limiting Strategy](#rate-limiting-strategy)
8. [HTTPS Enforcement](#https-enforcement)
9. [Content Security Policy Headers](#content-security-policy-headers)
10. [Authentication Flow Security](#authentication-flow-security)
11. [WebSocket Security](#websocket-security)
12. [Common Security Vulnerabilities and Prevention](#common-security-vulnerabilities-and-prevention)
13. [Database Security](#database-security)
14. [Deployment Security](#deployment-security)
15. [Production Security Checklist](#production-security-checklist)

---

## Security Architecture Overview

### Defense in Depth Strategy

The Mallchain integration implements multiple security layers to ensure comprehensive protection:

```
┌─────────────────────────────────────────┐
│   Browser (Frontend Security)            │
│   - Content Security Policy              │
│   - XSS Protection                       │
│   - Token Storage in localStorage        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Network Layer (HTTPS/TLS)              │
│   - End-to-End Encryption                │
│   - Certificate Validation               │
│   - HSTS Headers                         │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   API Gateway (Backend Entry)            │
│   - Rate Limiting                        │
│   - CORS Validation                      │
│   - Request Filtering                    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Authentication Layer                   │
│   - JWT Verification                     │
│   - Token Expiration Check               │
│   - User Validation                      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Application Layer                      │
│   - Input Validation                     │
│   - Authorization Checks                 │
│   - Business Logic Validation            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│   Data Layer (Database)                  │
│   - Parameterized Queries                │
│   - Encryption at Rest                   │
│   - Access Control Lists                 │
└─────────────────────────────────────────┘
```

### Security Principles

1. **Principle of Least Privilege**: Each component has only the minimum access needed
2. **Defense in Depth**: Multiple layers of security controls
3. **Fail Securely**: Errors don't expose sensitive information
4. **Security by Default**: Secure configuration is the default
5. **Complete Mediation**: All security checks must be enforced
6. **Open Design**: Security is not through obscurity

---

## Environment Configuration Security

### Secure Environment Variable Management

**Critical Environment Variables:**

```bash
# Backend .env (PRODUCTION)
NODE_ENV=production
PORT=4000

# Secrets (Generate with: openssl rand -base64 32)
JWT_SECRET=<32+ random characters>
SESSION_SECRET=<32+ random characters>

# Database
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname?authSource=admin&retryWrites=true&w=majority
REDIS_HOST=redis.internal.mallchain.io
REDIS_PORT=6379
REDIS_PASSWORD=<32+ random characters>

# Frontend
FRONTEND_URL=https://app.mallchain.io
CORS_ORIGINS=https://app.mallchain.io,https://admin.mallchain.io

# Blockchain
CHAIN_ID=mallchain-1
CHAIN_RPC=https://rpc.chain.io:26657
CHAIN_REST=https://rest.chain.io:1317

# Backend public URL (for Socket.IO, CORS, etc.)
BACKEND_PUBLIC_URL=https://api.mallchain.io

# SSL Certificates (for HTTPS)
SSL_KEY_PATH=/etc/ssl/private/api.mallchain.io.key
SSL_CERT_PATH=/etc/ssl/certs/api.mallchain.io.crt
```

### Environment Validation at Startup

**Implementation:**

```javascript
// backend/src/config/validate.js
const validateRuntimeSecrets = () => {
  const required = [
    'NODE_ENV',
    'JWT_SECRET',
    'SESSION_SECRET',
    'MONGO_URI',
    'REDIS_HOST',
    'REDIS_PORT',
    'FRONTEND_URL',
    'BACKEND_PUBLIC_URL',
    'CHAIN_RPC',
    'CHAIN_REST'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Runtime secret validation failed');
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }

  // Validate SESSION_SECRET length
  if (process.env.SESSION_SECRET.length < 32) {
    console.error('SESSION_SECRET must be at least 32 characters');
    process.exit(1);
  }

  // Validate MONGO_URI format
  if (!process.env.MONGO_URI.startsWith('mongodb')) {
    console.error('MONGO_URI must be a valid MongoDB connection string');
    process.exit(1);
  }

  // Validate FRONTEND_URL format
  try {
    new URL(process.env.FRONTEND_URL);
  } catch (e) {
    console.error('FRONTEND_URL must be a valid HTTP(S) URL');
    process.exit(1);
  }

  console.log('✓ All environment variables validated');
};

// Call at startup
if (require.main === module) {
  validateRuntimeSecrets();
  // Start server...
}
```

### Frontend Environment Configuration

**Configuration Module:**

```typescript
// frontend/src/config.ts
export interface MallchainConfig {
  apiBaseUrl: string;
  demoMode: boolean;
  network: 'mainnet' | 'testnet';
  sessionTtlMin: number;
}

export const config: MallchainConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  network: (import.meta.env.VITE_NETWORK || 'testnet') as 'mainnet' | 'testnet',
  sessionTtlMin: parseInt(import.meta.env.VITE_SESSION_TTL || '120')
};

// Validate configuration
const validateConfig = () => {
  // Validate apiBaseUrl if set
  if (config.apiBaseUrl) {
    try {
      const url = new URL(config.apiBaseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
      if (config.apiBaseUrl.endsWith('/')) {
        throw new Error('API base URL should not have trailing slash');
      }
    } catch (e) {
      console.error('Invalid VITE_API_BASE_URL:', e.message);
    }
  }

  // Validate sessionTtlMin
  if (config.sessionTtlMin <= 0) {
    console.warn('Session TTL is invalid, using default');
    config.sessionTtlMin = 120;
  }

  console.log('✓ Frontend configuration validated');
};

validateConfig();
```

### Sensitive Data Protection

**What NOT to do:**

```bash
# ✗ Never commit .env files
# ✗ Never include secrets in code
# ✗ Never expose secrets in logs
# ✗ Never send secrets in error messages
# ✗ Never version control private keys
```

**What TO do:**

```bash
# ✓ Use .env.example for documentation
# ✓ Add .env to .gitignore
# ✓ Store secrets in secure vaults
# ✓ Rotate secrets regularly
# ✓ Use environment variables for secrets
# ✓ Audit access to secrets
```

**.gitignore Example:**

```
# Secrets
.env
.env.local
.env.*.local
*.key
*.pem
*.p12
secrets/
```

**.env.example Template:**

```bash
# Backend Environment Example
# Copy to .env and fill in actual values

NODE_ENV=development

# Database - MongoDB connection string
# Format: mongodb://[username:password@]host[:port]/[database]
MONGO_URI=mongodb://localhost:27017/mallchain

# Cache - Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<generate with: openssl rand -base64 32>

# Secrets - Generate with: openssl rand -base64 32
JWT_SECRET=<must be at least 32 characters>
SESSION_SECRET=<must be at least 32 characters>

# Frontend
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=

# Server
PORT=4000
BACKEND_PUBLIC_URL=http://localhost:4000

# Blockchain
CHAIN_ID=mallchain-1
CHAIN_RPC=http://localhost:26657
CHAIN_REST=http://localhost:1317

# Optional: SSL Certificates for HTTPS
# SSL_KEY_PATH=/path/to/key.pem
# SSL_CERT_PATH=/path/to/cert.pem

# Optional: Sentry for error tracking
# SENTRY_DSN=https://key@sentry.io/project

# Optional: Analytics
# MIXPANEL_TOKEN=token
```

---

## Secret Management

### Secret Generation

**Secure Secret Generation:**

```bash
# Generate 32-character random secret (recommended minimum)
openssl rand -base64 32

# Generate 64-character secret (extra security)
openssl rand -base64 64

# Generate cryptographically secure random hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Secret Storage Options

**Development Environment:**

```bash
# Local .env file (DO NOT COMMIT)
echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
```

**Production Environment:**

**Option 1: AWS Secrets Manager (Recommended)**

```javascript
// Retrieve secrets from AWS Secrets Manager
const aws = require('aws-sdk');
const secretsManager = new aws.SecretsManager({ region: 'us-east-1' });

async function loadSecrets() {
  try {
    const secret = await secretsManager.getSecretValue({
      SecretId: 'mallchain/production'
    }).promise();
    
    const secrets = JSON.parse(secret.SecretString);
    process.env.JWT_SECRET = secrets.jwt_secret;
    process.env.SESSION_SECRET = secrets.session_secret;
    process.env.MONGO_URI = secrets.mongo_uri;
    // ... other secrets
  } catch (error) {
    console.error('Failed to load secrets:', error);
    process.exit(1);
  }
}
```

**Option 2: HashiCorp Vault**

```javascript
const vault = require('node-vault')({ endpoint: 'https://vault.internal' });

async function loadSecretsFromVault() {
  try {
    const auth = await vault.userpassLogin({
      username: process.env.VAULT_USER,
      password: process.env.VAULT_PASSWORD
    });

    const secrets = await vault.read('secret/data/mallchain/production', {
      headers: { 'X-Vault-Token': auth.auth.client_token }
    });

    process.env.JWT_SECRET = secrets.data.data.jwt_secret;
    // ... other secrets
  } catch (error) {
    console.error('Failed to load secrets from Vault:', error);
    process.exit(1);
  }
}
```

**Option 3: GitHub Secrets (For CI/CD)**

```yaml
# .github/workflows/deploy.yml
name: Deploy
on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        env:
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          SESSION_SECRET: ${{ secrets.SESSION_SECRET }}
          MONGO_URI: ${{ secrets.MONGO_URI }}
        run: |
          npm run deploy
```

### Secret Rotation

**Rotation Strategy:**

```javascript
// Implement refresh token for JWT rotation
const rotateJWTSecret = async () => {
  // 1. Keep old secret for 24 hours (grace period)
  const oldSecret = process.env.JWT_SECRET;
  
  // 2. Generate and store new secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  await secretsManager.updateSecret('JWT_SECRET', newSecret);
  
  // 3. Update environment
  process.env.JWT_SECRET_OLD = oldSecret;
  process.env.JWT_SECRET = newSecret;
  
  // 4. Accept both old and new for 24 hours
  // 5. Require all users to re-authenticate
};

// Verify token with old or new secret during rotation
const verifyTokenDuringRotation = (token) => {
  try {
    // Try new secret first
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (process.env.JWT_SECRET_OLD) {
      try {
        // Fall back to old secret during grace period
        return jwt.verify(token, process.env.JWT_SECRET_OLD);
      } catch (e) {
        throw error;
      }
    }
    throw error;
  }
};

// Rotation schedule
const secretRotationCron = '0 0 * * 1'; // Weekly on Monday
schedule.scheduleJob(secretRotationCron, rotateJWTSecret);
```

### Secret Access Auditing

**Audit Logging:**

```javascript
// Middleware to audit secret access
const auditSecretAccess = (req, res, next) => {
  // Log who accessed what
  console.log({
    timestamp: new Date().toISOString(),
    user: req.user?.userId,
    endpoint: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  next();
};

// Store audit logs securely
const storeAuditLog = async (accessLog) => {
  await AuditLog.create({
    userId: accessLog.user,
    action: 'api_access',
    resource: accessLog.endpoint,
    timestamp: accessLog.timestamp,
    ip: accessLog.ip,
    result: 'success'
  });
};
```

---

## Token Management and Storage

### Overview and Architecture

JWT (JSON Web Tokens) are used for stateless, cryptographically signed authentication. The backend issues tokens upon successful login, and the frontend includes them in subsequent API requests.

**Token Lifecycle:**

```
1. User logs in with credentials
   ↓
2. Backend validates credentials
   ↓
3. Backend generates JWT token
   ↓
4. Frontend stores token in localStorage
   ↓
5. Frontend includes token in Authorization header for all requests
   ↓
6. Backend validates token signature on every protected request
   ↓
7. Token expires after configured TTL (default: 120 minutes)
   ↓
8. User receives 403 Forbidden when token expires
   ↓
9. Frontend redirects user to login
   ↓
10. Cycle repeats
```

### JWT Token Overview

JWT (JSON Web Tokens) are used to securely transmit user identity and authorization information. The Mallchain backend issues JWT tokens upon successful authentication, containing user ID, username, and expiration time.

**Token Payload Structure:**

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "username": "user@example.com",
  "exp": 1707216000,
  "iat": 1707129600
}
```

- **userId**: MongoDB ObjectId uniquely identifying the user
- **username**: User's login identifier
- **exp**: Expiration time (Unix epoch seconds)
- **iat**: Issued at time (Unix epoch seconds)

### Token Generation Best Practices

**Backend Implementation:**

1. **Use Strong Secret**: Generate JWT_SECRET with minimum 32 random characters
   ```bash
   # Generate cryptographically secure random secret
   openssl rand -base64 32
   ```

2. **Set Expiration Time**: Configure token TTL to balance security and user experience
   - Default: 120 minutes (2 hours)
   - Short-lived tokens (session cookies): 15-30 minutes
   - Refresh tokens: 7-30 days
   - API tokens: 90 days or longer

3. **Include Minimal Claims**: Only include necessary information
   - Required: userId, username, exp
   - Avoid including sensitive data (passwords, API keys, permission lists)

4. **Use HMAC-SHA256 Algorithm**: Sign tokens with strong cryptographic algorithm
   ```javascript
   const jwt = require('jsonwebtoken');
   const token = jwt.sign(payload, JWT_SECRET, { 
     algorithm: 'HS256',
     expiresIn: '120m'
   });
   ```

### Token Storage Security

**Frontend Storage Options:**

| Storage Method | Security | Accessibility | Auto-Send | XSS Vulnerable | CSRF Vulnerable |
|---|---|---|---|---|---|
| **localStorage** | Low | High | No | Yes | No |
| **sessionStorage** | Low | High | No | Yes | No |
| **Memory** | High | Low | No | No | No |
| **HttpOnly Cookie** | High | Low | Yes | No | Yes |

**Recommendation**: Use **HttpOnly, Secure, SameSite cookies** for production

**HttpOnly Cookie Benefits:**
- Not accessible to JavaScript (protects against XSS)
- Automatically sent with requests (no code needed)
- Server-side only modification

**Implementation (Backend):**

```javascript
// After successful authentication
res.cookie('authToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict',
  maxAge: 2 * 60 * 60 * 1000 // 2 hours
});
```

**Current Implementation (localStorage):**

For development and to match current implementation, tokens are stored in localStorage. To minimize XSS risk:

1. Implement strict Content Security Policy
2. Sanitize all user inputs before rendering
3. Use DOMPurify library for user-generated content
4. Escape HTML entities in output

```javascript
// Frontend: Secure token storage
const token = response.data.token;
if (token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
  localStorage.setItem('authToken', token);
} else {
  console.error('Invalid token format');
}
```

### Token Validation Best Practices

**Backend Token Verification:**

```javascript
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

**Validation Checklist:**
- ✓ Token exists in Authorization header as "Bearer <token>"
- ✓ Token signature is valid (JWT_SECRET matches)
- ✓ Token is not expired (current time < exp)
- ✓ Token userId references valid user in database
- ✓ User account is not disabled/suspended
- ✓ Token not in revocation list (for token revocation feature)

### Token Rotation and Refresh

**Refresh Token Flow:**

```
1. User logs in with credentials
2. Backend issues short-lived access token (2 hours) + refresh token (30 days)
3. Frontend stores both tokens securely
4. Frontend uses access token for API requests
5. When access token expires (401 response), frontend sends refresh token to /api/auth/refresh
6. Backend validates refresh token and issues new access token
7. Frontend retries original request with new token
8. If refresh token expires, user must re-authenticate
```

**Implementation Benefits:**
- Access token compromise has limited time window (2 hours)
- Refresh token can be revoked server-side
- Reduces number of login prompts
- Enables logout by invalidating refresh tokens

### Token Revocation

**Server-Side Token Revocation:**

```javascript
// Store revoked tokens in Redis with TTL
async function revokeToken(token, expiresIn) {
  const decoded = jwt.decode(token);
  const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
  await redis.setex(`revoked_token:${token}`, ttl, '1');
}

// Check revocation before processing
async function isTokenRevoked(token) {
  const result = await redis.get(`revoked_token:${token}`);
  return !!result;
}
```

**Use Cases:**
- Logout: Revoke all user tokens
- Password change: Invalidate old tokens
- Account compromise: Revoke compromised tokens
- Permission changes: Require fresh token with new permissions

---

## CORS Security Best Practices

### CORS Overview

CORS (Cross-Origin Resource Sharing) is a security mechanism that controls which frontend origins can access backend APIs. Without proper CORS configuration, browsers block cross-origin requests.

### CORS Configuration

**Allowed Origins Setup:**

```javascript
// Backend: cors-middleware.js
const cors = require('cors');

function getAllowedOrigins() {
  const origins = [process.env.FRONTEND_URL];
  
  if (process.env.CORS_ORIGINS) {
    const additional = process.env.CORS_ORIGINS.split(',').map(o => o.trim());
    origins.push(...additional);
  }
  
  return origins;
}

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600 // Preflight cache 1 hour
};

module.exports = cors(corsOptions);
```

**Environment Variables:**

```bash
# .env.production
FRONTEND_URL=https://app.mallchain.io
CORS_ORIGINS=https://admin.mallchain.io,https://staging.mallchain.io
```

### CORS Headers Explained

**Response Headers Sent by Backend:**

| Header | Example Value | Purpose |
|---|---|---|
| Access-Control-Allow-Origin | https://app.mallchain.io | Which origin can access |
| Access-Control-Allow-Methods | GET, POST, PUT, DELETE | Allowed HTTP methods |
| Access-Control-Allow-Headers | Content-Type, Authorization | Allowed request headers |
| Access-Control-Allow-Credentials | true | Allow cookies in requests |
| Access-Control-Max-Age | 3600 | Preflight cache duration |

### CORS Preflight Requests

**Preflight Sequence:**

```
1. Browser makes OPTIONS request before actual request
2. Browser checks response headers
3. If allowed, browser sends actual request
4. If denied, browser blocks actual request with CORS error
```

**When Preflight is Needed:**
- Content-Type is application/json or application/xml
- Request includes Authorization header
- Request includes custom headers
- Request method is PUT, DELETE, PATCH

**Optimization:**
- Cache preflight responses (maxAge: 3600)
- Avoid unnecessary custom headers
- Use GET/POST when possible (though not recommended)

### CORS Security Best Practices

**Development Environment (.env.development):**

```bash
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=
```

**Production Environment (.env.production):**

```bash
FRONTEND_URL=https://app.mallchain.io
CORS_ORIGINS=https://admin.mallchain.io,https://staging.mallchain.io
NODE_ENV=production
```

**Security Rules:**
1. ✓ Never use wildcard origin (`*`) in production with credentials
2. ✓ Use HTTPS URLs only in production
3. ✓ Use localhost URLs only in development
4. ✓ Explicitly list all allowed origins
5. ✓ Never auto-allow all origins based on request

**Testing CORS:**

```bash
# Test allowed origin
curl -H "Origin: https://app.mallchain.io" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS http://localhost:4000/api/auth/login \
     -v

# Test disallowed origin
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS http://localhost:4000/api/auth/login \
     -v
```

---

## Input Validation and Output Encoding

### Input Validation Strategy

**Defense in Depth Approach:**

```
1. Frontend Validation → Early feedback to user
2. Backend Structural Validation → Type checking
3. Backend Business Logic Validation → Range, format, relationships
4. Backend Sanitization → Remove/escape dangerous characters
5. Database Constraints → Final safety net
```

### Frontend Input Validation

**Best Practices:**

```javascript
// React component example
import * as yup from 'yup';

const validationSchema = yup.object().shape({
  email: yup
    .string()
    .email('Invalid email format')
    .required('Email is required')
    .max(255),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/[A-Z]/, 'Password must contain uppercase')
    .matches(/[0-9]/, 'Password must contain number')
    .required('Password is required'),
  amount: yup
    .number()
    .positive('Amount must be positive')
    .max(1000000, 'Amount exceeds maximum')
});

const handleSubmit = async (values) => {
  try {
    await validationSchema.validate(values);
    // Send to backend
  } catch (error) {
    // Display validation error to user
  }
};
```

**Important Note:** Frontend validation is for UX only. Backend MUST validate all inputs.

### Backend Input Validation

**Express.js Validation Middleware:**

```javascript
const { body, query, param, validationResult } = require('express-validator');

// Validation schemas
const validateLogin = [
  body('username')
    .trim()
    .isEmail()
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Usage
router.post('/api/auth/login', validateLogin, loginController);
```

### Output Encoding/Escaping

**HTML Escaping:**

```javascript
// When returning user-generated content
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

// Example: Return user comment with escaping
app.get('/api/comments/:id', (req, res) => {
  const comment = db.comments.findById(req.params.id);
  return res.json({
    ...comment,
    text: escapeHtml(comment.text) // Escape user content
  });
});
```

**Frontend Output Escaping:**

```javascript
// React automatically escapes text content
const Comment = ({ comment }) => (
  <div>{comment.text}</div> // Safe - React escapes automatically
);

// Use textContent for dynamic content, not innerHTML
const SafeRender = ({ html }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = html; // Prevents XSS
    }
  }, [html]);
  return <div ref={ref} />;
};
```

### SQL/NoSQL Injection Prevention

**MongoDB Injection Prevention:**

```javascript
// ✓ SAFE: Use parameterized queries
db.collection('users').findOne({ username: req.body.username });

// ✗ UNSAFE: String concatenation
db.collection('users').findOne({ 
  $where: `this.username == '${req.body.username}'` 
}); // Vulnerable to injection

// ✓ SAFE: Use mongoose with validation
const userSchema = new Schema({
  username: { type: String, required: true, trim: true }
});
const user = await User.findOne({ username: req.body.username });
```

**Query Builder Best Practices:**

```javascript
// Use query builders to prevent injection
const query = User.find();

if (req.query.role) {
  query.where('role').equals(req.query.role); // Parameterized
}

const users = await query.exec();
```

### Path Traversal Prevention

```javascript
// ✗ UNSAFE: User input in file path
app.get('/api/files/:name', (req, res) => {
  res.sendFile(`./uploads/${req.params.name}`); // Vulnerable
});

// ✓ SAFE: Validate file path
const path = require('path');
app.get('/api/files/:name', (req, res) => {
  const filepath = path.join(__dirname, 'uploads', req.params.name);
  const normalized = path.normalize(filepath);
  
  // Ensure file is in uploads directory
  if (!normalized.startsWith(path.join(__dirname, 'uploads'))) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.sendFile(normalized);
});
```


---

## Rate Limiting Strategy

### Rate Limiting Purpose

Rate limiting prevents:
- Brute force attacks (password guessing)
- DoS (Denial of Service) attacks
- API abuse and scraping
- Resource exhaustion

### Rate Limiting Configuration

**Backend Rate Limit Rules:**

```javascript
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redis = require('redis');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

// General API rate limiter
const generalLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:general:'
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication endpoints (stricter)
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes per IP
  skipSuccessfulRequests: true, // Don't count successful attempts
  message: 'Too many login attempts, please try again later'
});

// Transaction endpoints (moderate)
const txLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:tx:'
  }),
  windowMs: 60 * 1000,
  max: 40, // 40 transactions per minute per IP
  message: 'Transaction rate limit exceeded'
});

// Apply limiters
app.use('/api/', generalLimiter);
app.post('/api/auth/login', authLimiter, loginController);
app.post('/api/auth/register', authLimiter, registerController);
app.post('/api/tx', txLimiter, transactionController);
```

**Rate Limit Tiers:**

| Endpoint | Limit | Window | Purpose |
|---|---|---|---|
| General API | 120/minute | Per IP | Default rate limit |
| Authentication | 5/15min | Per IP | Prevent brute force |
| Transactions | 40/minute | Per IP | Prevent spam |
| Public Health | 600/minute | Per IP | Health checks |

### Frontend Rate Limit Handling

**Response Format:**

```javascript
// Backend returns 429 Too Many Requests
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707216000

{
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

**Frontend Implementation:**

```javascript
// API service with rate limit handling
const api = {
  async post(path, body) {
    try {
      const response = await fetch(`${config.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (response.status === 429) {
        const data = await response.json();
        const retryAfter = data.retryAfter || 60;
        throw new RateLimitError(`Please wait ${retryAfter} seconds`);
      }
      
      return response.json();
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Show user-friendly message
        notifyUser('Too many requests. Please wait a moment.');
      }
      throw error;
    }
  }
};
```

### Distributed Rate Limiting

**Redis Implementation:**

```javascript
async function checkRateLimit(ip, endpoint) {
  const key = `ratelimit:${endpoint}:${ip}`;
  const limit = 120;
  const window = 60; // seconds
  
  const current = await redis.get(key);
  
  if (current === null) {
    // First request in window
    await redis.setex(key, window, 1);
    return { allowed: true, remaining: limit - 1 };
  } else if (parseInt(current) < limit) {
    // Within limit
    const remaining = limit - parseInt(current) - 1;
    await redis.incr(key);
    return { allowed: true, remaining };
  } else {
    // Exceeded limit
    const ttl = await redis.ttl(key);
    return { allowed: false, retryAfter: ttl };
  }
}
```

### DDoS Mitigation

**Additional Protections:**

1. **IP-based blocking**: Block IPs with excessive requests
2. **Gradual backoff**: Longer cooldowns for repeat offenders
3. **Geo-blocking**: Block requests from unexpected geographies
4. **CAPTCHA**: Require CAPTCHA after multiple failures
5. **WAF**: Use cloud WAF (Cloudflare, AWS WAF)

```javascript
// Example: Progressive backoff
function getBackoffMs(attempts) {
  return Math.min(60000, 1000 * Math.pow(2, attempts - 1));
}

// 1st failure: wait 1 second
// 2nd failure: wait 2 seconds
// 3rd failure: wait 4 seconds
// 4th failure: wait 8 seconds
// 5th+ failures: wait 60 seconds
```

---

## HTTPS Enforcement

### Why HTTPS is Critical

- **Encrypts data in transit**: Prevents man-in-the-middle attacks
- **Authenticates server**: Verifies backend is legitimate
- **Prevents tampering**: Ensures data integrity
- **Secure cookies**: Required for httpOnly cookies in production

### Production HTTPS Configuration

**Backend Setup:**

```javascript
const express = require('express');
const https = require('https');
const fs = require('fs');
const helmet = require('helmet');

const app = express();

// Enable HTTPS in production
if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH)
  };
  
  https.createServer(options, app).listen(process.env.PORT);
  
  // Redirect HTTP to HTTPS
  express()
    .use((req, res) => {
      res.redirect(`https://${req.headers.host}${req.url}`);
    })
    .listen(80);
} else {
  app.listen(process.env.PORT);
}

// Use Helmet for security headers
app.use(helmet());
```

### HSTS (HTTP Strict Transport Security)

**What HSTS Does:**
- Tells browsers to always use HTTPS for your domain
- Prevents downgrade attacks
- Protects against accidental HTTP access

**Backend Implementation:**

```javascript
const helmet = require('helmet');

app.use(helmet.hsts({
  maxAge: 31536000, // 1 year in seconds
  includeSubDomains: true,
  preload: true // Add to HSTS preload list
}));

// Response header:
// Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**HSTS Preload List:**
- Submit domain at https://hstspreload.org
- Browsers include domain in preload list
- HTTP requests are blocked automatically

### Certificate Management

**Using Let's Encrypt (Free SSL):**

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d app.mallchain.io

# Auto-renewal
sudo certbot renew --dry-run

# Cron for auto-renewal
0 12 * * * /usr/bin/certbot renew --quiet
```

**Certificate Paths:**

```bash
# Private key
/etc/letsencrypt/live/app.mallchain.io/privkey.pem

# Certificate
/etc/letsencrypt/live/app.mallchain.io/fullchain.pem
```

**Nginx Configuration:**

```nginx
server {
    listen 443 ssl http2;
    server_name app.mallchain.io;
    
    ssl_certificate /etc/letsencrypt/live/app.mallchain.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.mallchain.io/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name app.mallchain.io;
    return 301 https://$server_name$request_uri;
}
```

### Frontend HTTPS Enforcement

**React App (Production):**

```javascript
// Redirect to HTTPS in production
if (process.env.NODE_ENV === 'production' && window.location.protocol === 'http:') {
  window.location.protocol = 'https:';
}

// Configure API base URL for HTTPS
const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'https://api.mallchain.io'
};
```

---

## Content Security Policy Headers

### CSP Purpose

CSP prevents:
- Cross-Site Scripting (XSS) attacks
- Clickjacking attacks
- Data injection attacks
- Malicious inline scripts

### CSP Configuration

**Helmet.js Implementation:**

```javascript
const helmet = require('helmet');

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Should avoid unsafe-inline
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: [
      "'self'",
      "https://api.mallchain.io",
      "https://rpc.chain.io",
      "wss://api.mallchain.io" // WebSocket
    ],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  }
}));
```

**Production CSP Header:**

```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self' https://cdn.example.com;
  style-src 'self' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https:;
  connect-src 'self' https://api.mallchain.io wss://api.mallchain.io;
  frame-src 'none';
  base-uri 'self';
  form-action 'self'
```

### CSP Directives Explained

| Directive | Purpose | Example |
|---|---|---|
| **default-src** | Fallback for all sources | `'self'` (same origin only) |
| **script-src** | Allowed script sources | `'self' https://cdn.example.com` |
| **style-src** | Allowed stylesheet sources | `'self' https://fonts.googleapis.com` |
| **img-src** | Allowed image sources | `'self' data: https:` |
| **connect-src** | Allowed fetch/XHR/WebSocket | `'self' https://api.example.com` |
| **frame-src** | Allowed iframe sources | `'none'` (prevent framing) |
| **object-src** | Allowed plugin objects | `'none'` (prevent Flash/Java) |
| **form-action** | Allowed form submission targets | `'self'` |
| **base-uri** | Allowed base tag URLs | `'self'` |

### CSP Violations

**Report-Only Mode (Testing):**

```javascript
app.use(helmet.contentSecurityPolicy({
  directives: { /* ... */ },
  reportOnly: true // Don't block, just report
}));

// Report CSP violations to server
app.post('/api/csp-report', (req, res) => {
  const violation = req.body['csp-report'];
  console.warn('CSP Violation:', {
    violatedDirective: violation['violated-directive'],
    blockedURI: violation['blocked-uri'],
    sourceFile: violation['source-file'],
    lineNumber: violation['line-number']
  });
  res.status(204).send();
});
```

**Production Implementation:**

```javascript
app.use(helmet.contentSecurityPolicy({
  directives: { /* ... */ },
  reportUri: 'https://api.mallchain.io/api/csp-report'
}));
```

### Safe Inline Scripts

**Problem:** CSP blocks inline scripts. Avoid:

```html
<!-- ✗ UNSAFE: Inline script -->
<button onclick="alert('Clicked')">Click me</button>
<script>console.log('Hello')</script>
```

**Solution:** Move to external file or use nonce:

```html
<!-- ✓ SAFE: External script -->
<script src="/assets/script.js"></script>

<!-- ✓ SAFE: Nonce for inline script -->
<script nonce="random-nonce-123">
  console.log('Hello');
</script>
```

**Nonce Generation:**

```javascript
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('hex');
  next();
});

// In template
<script nonce="<%= cspNonce %>">
  // Inline script allowed
</script>
```


---

## Database Security

### Connection Security

**Secure MongoDB Connection String:**

```javascript
// ✓ SECURE: Authentication with encryption
const MONGO_URI = 'mongodb+srv://user:password@cluster.mongodb.net/dbname?authSource=admin&retryWrites=true&w=majority&ssl=true';

// ✓ SECURE: Local development with authentication
const MONGO_URI_DEV = 'mongodb://admin:password@localhost:27017/mallchain?authSource=admin';

// ✗ INSECURE: No authentication
const MONGO_URI_BAD = 'mongodb://localhost:27017/mallchain';

// ✗ INSECURE: Password in connection string (avoid in code)
const MONGO_URI_BAD2 = 'mongodb://admin:hardcodedpassword@prod.db.com/mallchain';
```

**Mongoose Connection with Security:**

```javascript
const mongoose = require('mongoose');

const mongoOptions = {
  autoIndex: false, // Prevent index creation on every connection
  serverSelectionTimeoutMS: 5000, // Timeout after 5s
  socketTimeoutMS: 45000, // Socket timeout after 45s
  family: 4, // Use IPv4
  retryWrites: true,
  w: 'majority',
  readPreference: 'primary',
  ssl: process.env.NODE_ENV === 'production', // Require SSL in production
  sslValidate: true,
  sslCA: process.env.MONGO_CA_CERT, // Path to CA certificate
  authSource: 'admin',
  maxPoolSize: 20,
  minPoolSize: 5
};

mongoose.connect(process.env.MONGO_URI, mongoOptions)
  .then(() => console.log('✓ MongoDB connected securely'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
```

### Access Control

**Principle of Least Privilege:**

```javascript
// Create separate database users for different purposes

// 1. Application user (read/write to app collections)
{
  user: 'mallchain_app',
  password: '<secure_password>',
  roles: [
    { role: 'readWrite', db: 'mallchain' },
    { role: 'dbStats', db: 'mallchain' }
  ]
}

// 2. Read-only user (analytics, backups)
{
  user: 'mallchain_readonly',
  password: '<secure_password>',
  roles: [
    { role: 'read', db: 'mallchain' }
  ]
}

// 3. Admin user (backups, maintenance)
{
  user: 'mallchain_admin',
  password: '<super_secure_password>',
  roles: [
    { role: 'dbOwner', db: 'mallchain' },
    { role: 'restore', db: 'mallchain' }
  ]
}

// Use different credentials per application instance
// Production app → mallchain_app user
// Analytics service → mallchain_readonly user
// Backup service → mallchain_admin user (on separate network)
```

### Query Security

**Parameterized Queries (Best Practice):**

```javascript
// ✓ SAFE: Using Mongoose with validation
const user = await User.findOne({ 
  email: req.body.email // Parameterized
});

// ✗ UNSAFE: String concatenation
const user = await User.findOne({ 
  email: `${req.body.email}` // Vulnerable to injection
});

// ✓ SAFE: Using aggregation pipeline
const results = await User.aggregate([
  { $match: { email: req.body.email } },
  { $project: { password: 0 } } // Exclude sensitive fields
]);

// ✓ SAFE: Explicit field projection
const user = await User.findOne(
  { email: req.body.email },
  'name email role -password' // Exclude password
);
```

**MongoDB Injection Prevention:**

```javascript
// ✗ VULNERABLE: $where operator allows code injection
db.collection('users').find({ $where: `this.email == '${email}'` });

// ✓ SAFE: Don't use $where, use equality operators
db.collection('users').find({ email: email });

// ✓ SAFE: Validate input before querying
const email = req.body.email;
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return res.status(400).json({ error: 'Invalid email format' });
}
const user = await User.findOne({ email });
```

### Schema Validation

**Define Strong Schemas:**

```javascript
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // Email validation
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    // Never include password in queries or responses
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  locked: {
    type: Boolean,
    default: false
  },
  lockedUntil: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
});

// Don't return password field by default
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.loginAttempts;
    delete ret.locked;
    return ret;
  }
});
```

### Encryption at Rest

**Field-Level Encryption:**

```javascript
const crypto = require('crypto');

// Encrypt sensitive fields before storing
const encryptField = (value) => {
  const cipher = crypto.createCipher(
    'aes-256-cbc',
    process.env.ENCRYPTION_KEY
  );
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decryptField = (encrypted) => {
  const decipher = crypto.createDecipher(
    'aes-256-cbc',
    process.env.ENCRYPTION_KEY
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// Use in schema
const userSchema = new Schema({
  email: String,
  ssn: {
    type: String,
    set: (value) => encryptField(value),
    get: (value) => value ? decryptField(value) : null
  },
  phone: {
    type: String,
    set: (value) => encryptField(value),
    get: (value) => value ? decryptField(value) : null
  }
});

// MongoDB database encryption at rest (encryption-at-rest feature)
// Enable in MongoDB Enterprise Edition or MongoDB Atlas
```

### Backup Security

**Secure Backup Procedures:**

```bash
#!/bin/bash
# backup.sh - Secure database backup

BACKUP_DIR="/var/backups/mongodb"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mallchain_$BACKUP_DATE.tar.gz"

# Create backup directory with restricted permissions
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Perform backup
mongodump \
  --uri="$MONGO_URI" \
  --archive="$BACKUP_FILE" \
  --gzip \
  --ssl \
  --sslCAFile="$MONGO_CA_CERT"

# Encrypt backup
openssl enc -aes-256-cbc -salt -in "$BACKUP_FILE" -out "$BACKUP_FILE.enc" -pass file:"$ENCRYPTION_KEY_FILE"

# Remove unencrypted backup
rm "$BACKUP_FILE"

# Set restrictive permissions on encrypted backup
chmod 600 "$BACKUP_FILE.enc"

# Copy to offsite storage
aws s3 cp "$BACKUP_FILE.enc" "s3://secure-backups/mallchain/" --sse AES256 --storage-class GLACIER

# Verify backup integrity
echo "Backup created: $BACKUP_FILE.enc"
echo "Size: $(du -h "$BACKUP_FILE.enc" | cut -f1)"
```

**Backup Retention Policy:**

```javascript
// Delete old backups automatically
const backupRetention = {
  hourly: 24,   // Keep 24 hourly backups
  daily: 30,    // Keep 30 daily backups
  weekly: 12,   // Keep 12 weekly backups
  monthly: 12   // Keep 12 monthly backups
};

// Retention schedule
const schedules = {
  hourly: '0 * * * *',      // Every hour
  daily: '0 2 * * *',       // Daily at 2 AM
  weekly: '0 3 * * 0',      // Weekly Sunday at 3 AM
  monthly: '0 4 1 * *'      // Monthly 1st at 4 AM
};
```

### Backup Restoration Testing

```bash
#!/bin/bash
# test_restore.sh - Test backup restoration

BACKUP_FILE="$1"
TEST_MONGO_URI="mongodb://admin:password@test.db.local:27017/mallchain_test"

# Restore to test database
mongorestore \
  --uri="$TEST_MONGO_URI" \
  --archive="$BACKUP_FILE.dec" \
  --gzip \
  --drop

# Verify critical collections
mongosh "$TEST_MONGO_URI" << EOF
// Check collections
db.users.countDocuments()
db.transactions.countDocuments()
db.wallets.countDocuments()

// Spot check a few documents
db.users.findOne()
db.transactions.findOne()

// Verify indexes
db.users.getIndexes()

// Check replication status
rs.status()
EOF

# Verify data integrity
if mongosh "$TEST_MONGO_URI" --quiet << EOF | grep -q "OK"; then
  print("Backup integrity verified")
EOF
  echo "✓ Backup restoration test passed"
  exit 0
else
  echo "✗ Backup restoration test failed"
  exit 1
fi
```

### Audit Logging

**Database Audit Configuration:**

```javascript
// Enable audit logging for security events
const auditSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  userId: String,
  action: String, // 'create', 'update', 'delete'
  collection: String,
  documentId: String,
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  ip: String,
  userAgent: String,
  success: Boolean,
  error: String
});

// Middleware to log all changes
userSchema.post(['save', 'findByIdAndUpdate'], async function(doc) {
  await AuditLog.create({
    userId: req.user?.id,
    action: 'update',
    collection: 'users',
    documentId: doc._id,
    changes: {
      after: doc.toObject()
    },
    ip: req.ip,
    success: true
  });
});

// Retain audit logs for compliance (e.g., 1 year)
const auditLogRetention = 365 * 24 * 60 * 60 * 1000; // 1 year
auditSchema.index({ timestamp: 1 }, { expireAfterSeconds: auditLogRetention });
```

---

## Deployment Security

### Pre-Deployment Security Verification

**Security Checklist Before Going Live:**

```javascript
// deployment/security-check.js
const checkSecurityPrerequisites = async () => {
  const checks = {
    environment: {
      NODE_ENV_set: () => process.env.NODE_ENV === 'production',
      JWT_SECRET_length: () => (process.env.JWT_SECRET || '').length >= 32,
      SESSION_SECRET_length: () => (process.env.SESSION_SECRET || '').length >= 32,
      SSL_certificates_valid: () => verifyCertificates(),
      no_debug_mode: () => !process.env.DEBUG
    },
    security_headers: {
      HSTS_enabled: () => checkHSTSHeaders(),
      CSP_configured: () => checkCSPHeaders(),
      CORS_not_wildcard: () => !process.env.CORS_ORIGINS?.includes('*'),
      secure_cookies: () => process.env.SECURE_COOKIES !== 'false'
    },
    database: {
      SSL_enabled: () => process.env.MONGO_URI?.includes('ssl=true'),
      credentials_provided: () => process.env.MONGO_URI?.includes(':'),
      not_local: () => !process.env.MONGO_URI?.includes('localhost')
    },
    dependencies: {
      no_high_vulnerabilities: () => hasHighVulnerabilities() === false,
      modules_installed: () => checkNodeModules()
    }
  };

  let passed = 0;
  let failed = 0;

  for (const [category, categoryChecks] of Object.entries(checks)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const [checkName, checkFn] of Object.entries(categoryChecks)) {
      try {
        const result = checkFn();
        if (result) {
          console.log(`  ✓ ${checkName}`);
          passed++;
        } else {
          console.log(`  ✗ ${checkName}`);
          failed++;
        }
      } catch (e) {
        console.log(`  ✗ ${checkName}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.error('❌ Security checks failed. Fix issues before deployment.');
    process.exit(1);
  }

  console.log('✅ All security checks passed. Safe to deploy.');
};

checkSecurityPrerequisites();
```

### Infrastructure Security

**Docker Security:**

```dockerfile
# Dockerfile - Secure configuration
FROM node:18-alpine

# Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY --chown=nodejs:nodejs . .

# Don't run as root
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Expose port
EXPOSE 4000

# Start application
CMD ["node", "src/index.js"]
```

**Docker Compose Security:**

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    image: mallchain-backend:latest
    container_name: mallchain_backend
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      MONGO_URI: ${MONGO_URI}
      JWT_SECRET: ${JWT_SECRET}
      # Other secrets from .env file
    volumes:
      - /var/log/mallchain:/app/logs
      - /etc/ssl/private:/app/certs:ro  # Read-only SSL certs
    networks:
      - mallchain_network
    security_opt:
      - no-new-privileges:true
    read_only: true  # Read-only filesystem
    tmpfs:
      - /tmp
      - /app/node_modules/.cache
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongodb:
    image: mongo:6
    container_name: mallchain_mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes:
      - mongodb_data:/data/db
      - /etc/ssl/private/ca.crt:/etc/ssl/certs/ca.crt:ro
    networks:
      - mallchain_network
    security_opt:
      - no-new-privileges:true
    command: >
      mongod
      --auth
      --sslMode requireSSL
      --sslCAFile /etc/ssl/certs/ca.crt

  redis:
    image: redis:7-alpine
    container_name: mallchain_redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - mallchain_network
    security_opt:
      - no-new-privileges:true

volumes:
  mongodb_data:
    driver: local
  redis_data:
    driver: local

networks:
  mallchain_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Network Security

**Firewall Configuration:**

```bash
#!/bin/bash
# firewall.sh - UFW firewall configuration for production

sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH access from bastion only
sudo ufw allow from 10.0.1.10 to any port 22

# HTTP/HTTPS from load balancer
sudo ufw allow from 10.0.1.5 to any port 80
sudo ufw allow from 10.0.1.5 to any port 443

# MongoDB from app server only (internal network)
sudo ufw allow from 10.0.2.10 to any port 27017

# Redis from app server only
sudo ufw allow from 10.0.2.10 to any port 6379

# Enable firewall
sudo ufw enable

# Display rules
sudo ufw status verbose
```

**Security Groups (AWS Example):**

```javascript
// AWS Security Group configuration
const securityGroupRules = {
  backend: {
    inbound: [
      { protocol: 'tcp', port: 443, source: 'alb-security-group' }, // HTTPS from ALB
      { protocol: 'tcp', port: 22, source: 'bastion-security-group' } // SSH from bastion
    ],
    outbound: [
      { protocol: 'tcp', port: 27017, destination: 'mongodb-security-group' }, // MongoDB
      { protocol: 'tcp', port: 6379, destination: 'redis-security-group' }, // Redis
      { protocol: 'tcp', port: 443, destination: '0.0.0.0/0' } // HTTPS to internet
    ]
  }
};
```

### SSL/TLS Certificate Management

**Certificate Deployment:**

```bash
#!/bin/bash
# deploy-ssl.sh

DOMAIN="api.mallchain.io"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"

# Copy certificates to application directory
sudo cp "$CERT_DIR/privkey.pem" /var/www/mallchain/certs/
sudo cp "$CERT_DIR/fullchain.pem" /var/www/mallchain/certs/

# Set correct permissions
sudo chown -R app:app /var/www/mallchain/certs/
sudo chmod 600 /var/www/mallchain/certs/privkey.pem
sudo chmod 644 /var/www/mallchain/certs/fullchain.pem

# Test certificate chain
openssl verify -CAfile "$CERT_DIR/fullchain.pem" "$CERT_DIR/cert.pem"

# Reload application
sudo systemctl reload mallchain-backend

# Test HTTPS
curl -I https://api.mallchain.io/api/health
```

**Certificate Renewal Automation:**

```bash
# /etc/cron.d/letsencrypt-renewal
# Renewal check daily at 2 AM
0 2 * * * root /usr/bin/certbot renew --quiet && systemctl reload mallchain-backend

# Certificate expiration monitoring
0 */6 * * * root /usr/local/bin/check_cert_expiry.sh
```

### Logging and Monitoring

**Secure Logging Configuration:**

```javascript
// backend/src/middleware/logging.js
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Create log directory
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { mode: 0o700 }); // Only owner can read
}

// Don't log sensitive data
const redactSensitive = (str) => {
  return str
    .replace(/password[^&\s]*/gi, 'password=***')
    .replace(/token[^&\s]*/gi, 'token=***')
    .replace(/secret[^&\s]*/gi, 'secret=***')
    .replace(/api[_-]?key[^&\s]*/gi, 'api_key=***');
};

// HTTP access log
const accessLogStream = fs.createWriteStream(
  path.join(logDir, 'access.log'),
  { flags: 'a', mode: 0o600 }
);

app.use(morgan(
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (str) => accessLogStream.write(redactSensitive(str))
    }
  }
));

// Error logging
const errorLogger = (err, req, res, next) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userId: req.user?.userId
  };

  console.error(JSON.stringify(errorLog));
  
  // Store in database for long-term analysis
  ErrorLog.create(errorLog).catch(err => {
    console.error('Failed to log error:', err);
  });

  // Send generic response to user
  res.status(500).json({ error: 'Internal server error' });
};

app.use(errorLogger);
```

---

### 1. Cross-Site Scripting (XSS)

**What it is:** Injection of malicious scripts into web pages viewed by other users.

**Attack Example:**

```javascript
// User submits comment: <img src=x onerror="alert('XSS')">
// When other users view comment, script executes
```

**Prevention:**

1. **Input Validation:** Only allow expected characters
2. **Output Encoding:** Escape HTML entities when displaying user content
3. **Content Security Policy:** Block inline scripts
4. **Template Escaping:** Use framework's built-in escaping

**Implementation:**

```javascript
// Backend: Sanitize input
const sanitizeHtml = require('sanitize-html');
const comment = sanitizeHtml(req.body.comment, {
  allowedTags: ['b', 'i', 'em', 'strong'],
  allowedAttributes: {}
});

// Frontend: React auto-escapes text content
const UserComment = ({ text }) => (
  <div>{text}</div> // Auto-escaped
);

// For HTML content, use DOMPurify
import DOMPurify from 'dompurify';
const SafeHTML = ({ html }) => (
  <div dangerouslySetInnerHTML={{ 
    __html: DOMPurify.sanitize(html) 
  }} />
);
```

### 2. Cross-Site Request Forgery (CSRF)

**What it is:** Attacker tricks user into making unwanted requests to another site.

**Attack Example:**

```html
<!-- Attacker's site -->
<img src="https://bank.com/transfer?to=attacker&amount=1000" />
<!-- Clicks to this site, browser sends auth cookies automatically -->
```

**Prevention:**

1. **SameSite Cookies:** Browser doesn't send cookies to cross-site requests
2. **CSRF Tokens:** Require token that attacker can't predict
3. **Double-submit Cookies:** Compare token in cookie vs request body

**Implementation:**

```javascript
// Middleware: Generate CSRF token
app.use((req, res, next) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = token;
  req.session.csrfToken = token;
  next();
});

// Verify CSRF token
const verifyCSRF = (req, res, next) => {
  const token = req.body.csrfToken || req.headers['x-csrf-token'];
  if (token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }
  next();
};

// SameSite cookies (recommended)
res.cookie('sessionId', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict', // Prevent cross-site cookie sending
  maxAge: 24 * 60 * 60 * 1000
});
```

### 3. SQL/NoSQL Injection

**What it is:** Attacker injects database commands to manipulate queries.

**Attack Example:**

```javascript
// ✗ UNSAFE
const username = req.body.username; // Could be: "' OR '1'='1"
db.collection('users').find({ username: username });
// Matches ALL users
```

**Prevention:**

1. **Parameterized Queries:** Never concatenate user input
2. **Schema Validation:** Enforce data types
3. **Principle of Least Privilege:** DB user has minimal permissions

**Implementation:**

```javascript
// ✓ SAFE: Mongoose parameterized queries
const user = await User.findOne({ username: req.body.username });

// ✓ SAFE: Query validation
const { body, validationResult } = require('express-validator');
router.post('/users', 
  body('username').isAlphanumeric(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Safe to use req.body.username
  }
);

// ✓ SAFE: MongoDB projection
db.users.find({ id: userId }, { password: 0 }); // Exclude sensitive fields
```

### 4. Broken Authentication

**What it is:** Weak password policies, session hijacking, or credential theft.

**Common Issues:**
- Default passwords not changed
- Passwords sent over HTTP
- Weak password requirements
- No account lockout after failed attempts
- Missing multi-factor authentication

**Prevention:**

```javascript
// Enforce strong passwords
const passwordRequirements = [
  /[A-Z]/, // Uppercase
  /[a-z]/, // Lowercase
  /[0-9]/, // Number
  /[!@#$%^&*]/ // Special character
];

const isPasswordStrong = (password) => {
  return password.length >= 12 && 
         passwordRequirements.every(regex => regex.test(password));
};

// Account lockout after failures
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

async function handleFailedLogin(username) {
  const user = await User.findOne({ username });
  user.loginAttempts = (user.loginAttempts || 0) + 1;
  
  if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.locked = true;
    user.lockedUntil = new Date(Date.now() + LOCKOUT_TIME);
  }
  
  await user.save();
  return user;
}

// Multi-factor authentication
const mfaRequired = (req, res, next) => {
  if (!req.user.mfaEnabled || req.session.mfaVerified) {
    return next();
  }
  res.status(403).json({ error: 'MFA required' });
};
```

### 5. Sensitive Data Exposure

**What it is:** Exposure of passwords, credit cards, or personal information.

**Common Issues:**
- Logging sensitive data
- Storing passwords in plain text
- Sending data over HTTP
- Git history contains secrets
- Unnecessary data collection

**Prevention:**

```javascript
// ✓ Hash passwords with bcrypt
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(password, 10);

// ✓ Never log sensitive data
// ✗ UNSAFE
console.log('Login attempt:', { username, password });

// ✓ SAFE
console.log('Login attempt:', { username });

// ✓ Exclude sensitive fields from responses
const user = await User.findById(userId).select('-password -salt');

// ✓ Encrypt sensitive database fields
const crypto = require('crypto');
const encryptField = (value) => {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
  return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
};
```

### 6. Broken Access Control

**What it is:** Users can access or modify data they shouldn't have access to.

**Attack Example:**

```javascript
// ✗ UNSAFE
app.get('/api/users/:id', (req, res) => {
  const user = User.findById(req.params.id); // No permission check
  res.json(user);
});

// Attacker visits /api/users/someoneelse-id and sees their data
```

**Prevention:**

```javascript
// ✓ SAFE: Check permissions
app.get('/api/users/:id', auth, (req, res) => {
  if (req.params.id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const user = User.findById(req.params.id);
  res.json(user);
});

// ✓ SAFE: Role-based access control
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

app.post('/api/admin/settings', requireRole('admin'), updateSettings);
```

### 7. Security Misconfiguration

**What it is:** Incorrect security settings like default credentials or unnecessary services.

**Common Issues:**
- Default passwords not changed
- Unnecessary services running
- Stack traces exposed to users
- Outdated dependencies
- Debug mode enabled in production

**Prevention:**

```javascript
// Environment-specific configuration
if (process.env.NODE_ENV === 'production') {
  // Hide error details
  app.use((err, req, res, next) => {
    console.error('Server error:', err); // Log for debugging
    res.status(500).json({ error: 'Internal server error' }); // Generic message
  });
  
  // Disable debug mode
  app.set('view cache', true);
  
  // Update dependencies regularly
  // npm audit fix
  
  // Remove unnecessary headers
  app.disable('x-powered-by');
}
```

---

## Authentication Flow Security

### Login Flow Diagram

```
User                Frontend             Backend
  |                   |                    |
  |--enter creds----->|                    |
  |                   |--POST /login------>|
  |                   |                    | validate credentials
  |                   |                    | hash password + bcrypt
  |                   |                    | check against DB
  |                   |<----JWT token-----|
  |                   |                    |
  |<-store in LS------|                    |
  |                   |                    |
  | request resource  |                    |
  |--GET /wallet----->|--Bearer token---->|
  |                   |                    | verify token signature
  |                   |                    | check expiration
  |                   |<----wallet data----|
  |<--display data----|                    |
```

### Secure Login Implementation

**Frontend:**

```javascript
const handleLogin = async (username, password) => {
  try {
    // Input validation
    if (!username || !password) {
      throw new Error('Username and password required');
    }
    
    // Send credentials over HTTPS only
    const response = await fetch('https://api.mallchain.io/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include' // Include cookies if using httpOnly
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const { token, user } = await response.json();
    
    // Validate token format before storing
    if (!isValidToken(token)) {
      throw new Error('Invalid token format');
    }
    
    // Store token securely
    localStorage.setItem('authToken', token);
    
    // Clear password from memory
    password = undefined;
    
    // Redirect to dashboard
    window.location.href = '/dashboard';
  } catch (error) {
    // Show generic error message (don't leak info)
    showError('Login failed. Please try again.');
  }
};

// Validate token format (JWT)
const isValidToken = (token) => {
  const pattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  return pattern.test(token);
};
```

**Backend:**

```javascript
const login = async (req, res) => {
  const { username, password } = req.body;
  
  // Validate inputs
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  
  try {
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      // Use same response for security (don't leak if user exists)
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check account status
    if (user.locked && user.lockedUntil > new Date()) {
      return res.status(429).json({ 
        error: 'Account locked. Try again later.' 
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await handleFailedLogin(username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username
      },
      process.env.JWT_SECRET,
      { expiresIn: '120m' }
    );
    
    // Reset login attempts on success
    user.loginAttempts = 0;
    user.locked = false;
    await user.save();
    
    // Return token
    return res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
```

### Session Management

**Session Timeout:**

```javascript
// Backend: Require re-authentication after timeout
app.get('/api/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.userId);
  
  // Check last activity
  const inactivityTime = Date.now() - (user.lastActivity || Date.now());
  const maxInactivity = 30 * 60 * 1000; // 30 minutes
  
  if (inactivityTime > maxInactivity) {
    // Session expired
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Update last activity
  user.lastActivity = Date.now();
  await user.save();
  
  res.json(user.profile);
});

// Frontend: Show timeout warning
useEffect(() => {
  const warningTime = 25 * 60 * 1000; // 25 minutes
  const logoutTime = 30 * 60 * 1000; // 30 minutes
  
  const warningTimer = setTimeout(() => {
    showWarning('Your session will expire in 5 minutes');
  }, warningTime);
  
  const logoutTimer = setTimeout(() => {
    logout();
    showMessage('Session expired. Please log in again.');
  }, logoutTime);
  
  return () => {
    clearTimeout(warningTimer);
    clearTimeout(logoutTimer);
  };
}, []);
```

### Logout Implementation

**Frontend:**

```javascript
const logout = () => {
  // Clear token from storage
  localStorage.removeItem('authToken');
  
  // Clear sensitive data from memory
  sessionStorage.clear();
  
  // Notify backend (optional)
  fetch('https://api.mallchain.io/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Redirect to login
  window.location.href = '/login';
};
```

**Backend:**

```javascript
// Optional: Revoke token on backend
app.post('/api/auth/logout', auth, async (req, res) => {
  // Add token to revocation list
  const decoded = jwt.decode(req.headers.authorization.split(' ')[1]);
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  
  await redis.setex(`revoked_token:${req.user.userId}`, ttl, '1');
  
  res.json({ message: 'Logged out successfully' });
});
```

---

## WebSocket Security

### Socket.IO Authentication

**Backend Setup:**

```javascript
const io = require('socket.io')(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  }
});

// Middleware: Authenticate socket connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Missing token'));
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.username} connected: ${socket.id}`);
  
  // Handle events
  socket.on('subscribe:wallet', (address) => {
    // Validate address belongs to authenticated user
    validateWalletOwnership(socket.userId, address)
      .then(() => {
        socket.join(`wallet:${address}`);
      })
      .catch(() => {
        socket.emit('error', 'Unauthorized');
      });
  });
});
```

### Frontend Socket Authentication

```javascript
import { io } from 'socket.io-client';

const connectSocket = () => {
  const token = localStorage.getItem('authToken');
  
  const socket = io('https://api.mallchain.io', {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });
  
  socket.on('connect', () => {
    console.log('Socket connected');
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });
  
  return socket;
};
```

### Room Access Control

**Prevent Unauthorized Room Access:**

```javascript
// ✗ UNSAFE: Trust client room name
socket.on('subscribe:wallet', (address) => {
  socket.join(`wallet:${address}`); // Client could join any wallet
});

// ✓ SAFE: Validate room access
socket.on('subscribe:wallet', (address) => {
  // Verify user owns this wallet
  validateWalletOwnership(socket.userId, address)
    .then(() => {
      socket.join(`wallet:${address}`);
      socket.emit('subscription_confirmed', { address });
    })
    .catch(() => {
      socket.emit('error', 'Access denied');
    });
});
```

### Event Validation

```javascript
// Validate all incoming events
io.on('connection', (socket) => {
  socket.on('subscribe:wallet', (data) => {
    // Type check
    if (typeof data !== 'string') {
      socket.emit('error', 'Invalid data type');
      return;
    }
    
    // Format validation
    if (!isValidBlockchainAddress(data)) {
      socket.emit('error', 'Invalid address format');
      return;
    }
    
    // Permission check
    validateWalletOwnership(socket.userId, data)
      .then(() => socket.join(`wallet:${data}`))
      .catch(() => socket.emit('error', 'Unauthorized'));
  });
});
```

### Message Encryption (Optional)

**For Highly Sensitive Data:**

```javascript
const crypto = require('crypto');

// Encrypt event data
socket.on('sensitive_event', (data) => {
  const encrypted = crypto
    .createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY)
    .update(JSON.stringify(data), 'utf8', 'hex') +
    crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY)
    .final('hex');
  
  io.to(socket.id).emit('secure_response', encrypted);
});

// Decrypt on client
socket.on('secure_response', (encrypted) => {
  const decrypted = crypto
    .createDecipher('aes-256-cbc', encryptionKey)
    .update(encrypted, 'hex', 'utf8') +
    crypto.createDecipher('aes-256-cbc', encryptionKey)
    .final('utf8');
  
  const data = JSON.parse(decrypted);
  // Use data
});
```


---

## Production Security Checklist

### Pre-Deployment Security Review

Use this checklist before deploying to production:

#### Environment Configuration

- [ ] All required environment variables are set
- [ ] No sensitive values (passwords, keys) hardcoded in source code
- [ ] Secrets are stored in secure vault (not in .env file in repo)
- [ ] `NODE_ENV=production` is set in production
- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] `SESSION_SECRET` is at least 32 random characters
- [ ] SSL certificates are valid and not expired
- [ ] CORS_ORIGINS is explicitly set (not wildcard)
- [ ] FRONTEND_URL points to production domain

#### Authentication & Authorization

- [ ] bcrypt salt rounds >= 10 for password hashing
- [ ] Password requirements enforced (min 8 chars, complexity)
- [ ] Account lockout after failed login attempts
- [ ] Session timeout configured (30 minutes recommended)
- [ ] JWT tokens expire after 120 minutes
- [ ] Refresh tokens are implemented and secure
- [ ] Login endpoints are rate-limited (5 attempts/15 min)
- [ ] Administrative access requires strong authentication
- [ ] Multi-factor authentication enabled for admin accounts
- [ ] Default credentials changed

#### HTTPS & Transport Security

- [ ] HTTPS enabled on all endpoints
- [ ] HTTP redirects to HTTPS
- [ ] HSTS headers configured (max-age >= 31536000)
- [ ] TLS version >= 1.2 (no SSLv3, TLSv1.0, TLSv1.1)
- [ ] Strong ciphers configured (HIGH:!aNULL:!MD5)
- [ ] SSL certificate from trusted CA
- [ ] Certificate auto-renewal configured
- [ ] Certificate includes all necessary domains

#### Security Headers

- [ ] Content-Security-Policy headers set
- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY or SAMEORIGIN
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Referrer-Policy configured
- [ ] Permissions-Policy configured
- [ ] No unnecessary headers exposed (X-Powered-By disabled)

#### Input Validation & Output Encoding

- [ ] All inputs validated on backend
- [ ] Input type, length, format verified
- [ ] NoSQL injection prevention implemented
- [ ] Path traversal protection implemented
- [ ] Command injection prevention implemented
- [ ] User-generated content sanitized
- [ ] HTML entities escaped in output
- [ ] Parameterized queries used (no string concatenation)

#### CORS Configuration

- [ ] CORS_ORIGINS whitelist configured
- [ ] Wildcard origin not used with credentials
- [ ] Access-Control-Allow-Credentials: true only with explicit origins
- [ ] Preflight caching enabled
- [ ] Allowed methods restricted
- [ ] Allowed headers restricted

#### Rate Limiting

- [ ] General API rate limit: 120 requests/minute per IP
- [ ] Authentication rate limit: 5 attempts/15 minutes per IP
- [ ] Transaction rate limit: 40 requests/minute per IP
- [ ] Rate limiter uses Redis for distributed tracking
- [ ] Rate limit responses include Retry-After header
- [ ] Rate limit bypasses not accessible to users

#### Logging & Monitoring

- [ ] Sensitive data (passwords, tokens) NOT logged
- [ ] All authentication attempts logged
- [ ] Failed access attempts logged
- [ ] Errors logged with non-sensitive details
- [ ] Logs stored securely with restricted access
- [ ] Log retention policy implemented (e.g., 30 days)
- [ ] Real-time alerts configured for suspicious activity
- [ ] Database query logging disabled in production
- [ ] Verbose error messages disabled (generic errors shown to users)

#### Database Security

- [ ] Database user has minimal required permissions
- [ ] Database connections use strong passwords
- [ ] Database encryption at rest enabled
- [ ] Database backups encrypted
- [ ] Database backups stored off-site
- [ ] Database connection pool limits configured
- [ ] Prepared statements/parameterized queries used
- [ ] Database stored procedures validated
- [ ] Unused database features disabled

#### API Security

- [ ] All endpoints require authentication (except public health checks)
- [ ] Public endpoints identified and documented
- [ ] API versioning implemented
- [ ] Endpoint access controls enforced
- [ ] API documentation doesn't expose implementation details
- [ ] Unused API endpoints disabled
- [ ] Deprecated endpoints removed or versioned

#### Socket.IO Security

- [ ] Socket connections require authentication
- [ ] Token validation implemented on connection
- [ ] Room access validated
- [ ] Invalid room names rejected
- [ ] Event payloads validated
- [ ] Malformed events rejected gracefully
- [ ] Socket events rate-limited
- [ ] Connection limits enforced
- [ ] Disconnection timeouts configured

#### Dependencies & Updates

- [ ] npm audit shows no vulnerabilities (or documented exceptions)
- [ ] All dependencies updated to latest secure versions
- [ ] Vulnerable packages removed or updated
- [ ] Dependency pinning used (exact versions, not ranges)
- [ ] Dependencies from trusted sources
- [ ] Deprecated packages replaced
- [ ] Regular dependency audits scheduled

#### Cryptography

- [ ] HMAC-SHA256 used for JWT signing
- [ ] AES-256 used for data encryption
- [ ] Random number generation uses crypto library (not Math.random)
- [ ] Encryption keys rotated periodically
- [ ] Key derivation uses PBKDF2 or bcrypt
- [ ] No custom cryptography implemented (use standard libraries)

#### Secrets Management

- [ ] All secrets stored in secure vault (AWS Secrets Manager, HashiCorp Vault)
- [ ] Secrets never committed to version control
- [ ] Rotation policy implemented for secrets
- [ ] Access to secrets logged and monitored
- [ ] Secrets not exposed in logs or error messages
- [ ] Development and production secrets separate
- [ ] Secret access restricted to necessary services
- [ ] Secrets Manager backup/recovery plan exists

#### Infrastructure & Deployment

- [ ] Production environment isolated from development
- [ ] Database backups tested and verified
- [ ] Disaster recovery plan documented
- [ ] Infrastructure as Code (IaC) version controlled
- [ ] Changes require approval before deployment
- [ ] Staging environment tests production configuration
- [ ] Deployment process documented
- [ ] Rollback procedure documented and tested
- [ ] CI/CD pipeline includes security checks
- [ ] SSH/API keys use strong passphrases

#### Access Control

- [ ] Root/admin accounts use strong passwords
- [ ] SSH keys don't have empty passphrases
- [ ] Password managers used for secret management
- [ ] Principle of least privilege enforced
- [ ] Service accounts have minimal permissions
- [ ] Multi-factor authentication enabled for admin
- [ ] Access logs monitored
- [ ] Unused accounts disabled
- [ ] Regular access reviews scheduled

#### Testing & QA

- [ ] Security testing conducted (OWASP Top 10)
- [ ] Penetration testing completed
- [ ] Code review includes security review
- [ ] Static analysis tools (eslint, semgrep) configured
- [ ] Dependency vulnerability scanner enabled
- [ ] Security testing automated in CI/CD
- [ ] SQL injection tests pass
- [ ] XSS injection tests pass
- [ ] CSRF protection tested
- [ ] CORS configuration tested

#### Compliance & Documentation

- [ ] Privacy policy updated and published
- [ ] Terms of Service reviewed
- [ ] Data handling procedures documented
- [ ] Data retention policy implemented
- [ ] GDPR compliance verified (if applicable)
- [ ] PCI-DSS compliance verified (if handling payments)
- [ ] Security incidents response plan documented
- [ ] Incident reporting procedure established
- [ ] Regular security audits scheduled
- [ ] Security training completed by developers

#### Monitoring & Alerting

- [ ] Real-time monitoring alerts configured
- [ ] Alert recipients defined and on-call
- [ ] Alert escalation process defined
- [ ] Database connection pool monitoring
- [ ] Memory usage monitoring
- [ ] Disk space monitoring
- [ ] CPU usage monitoring
- [ ] Error rate monitoring
- [ ] Response time monitoring
- [ ] Failed login attempts monitoring

### Post-Deployment Verification

**Day 1 After Deployment:**

```bash
# Verify HTTPS
curl -I https://api.mallchain.io/api/health

# Verify HSTS headers
curl -I https://api.mallchain.io | grep Strict-Transport

# Verify CSP headers
curl -I https://api.mallchain.io | grep Content-Security-Policy

# Verify CORS
curl -H "Origin: https://app.mallchain.io" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS https://api.mallchain.io/api/profile

# Test authentication
curl -X POST https://api.mallchain.io/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"test","password":"test"}'

# Test rate limiting
for i in {1..150}; do 
  curl https://api.mallchain.io/api/health
done
# Should get 429 after 120 requests

# Verify environment variables
ssh user@production "echo $NODE_ENV"
# Should output: production

# Check for exposed secrets in logs
ssh user@production "grep -r 'password\|token\|secret' /var/log/app.log"
# Should find nothing
```

### Ongoing Security Maintenance

**Weekly:**
- [ ] Monitor logs for suspicious activity
- [ ] Review failed login attempts
- [ ] Check for unhandled errors
- [ ] Monitor resource usage

**Monthly:**
- [ ] Review access logs
- [ ] Audit new user accounts
- [ ] Update dependency vulnerabilities
- [ ] Test backup restoration
- [ ] Review security incidents

**Quarterly:**
- [ ] Penetration testing
- [ ] Security audit
- [ ] Update security documentation
- [ ] Review and update incident response plan
- [ ] Conduct security training

**Annually:**
- [ ] Full security assessment
- [ ] Compliance audit
- [ ] Architecture review
- [ ] Update security policies
- [ ] Plan security improvements

### Security Incident Response

**If Security Breach Suspected:**

1. **Immediate Actions (First 1 Hour)**
   - [ ] Isolate affected systems
   - [ ] Stop active attacks
   - [ ] Preserve evidence/logs
   - [ ] Notify security team

2. **Investigation (1-24 Hours)**
   - [ ] Determine breach scope
   - [ ] Identify compromised data
   - [ ] Analyze attack vectors
   - [ ] Document findings

3. **Containment (24-72 Hours)**
   - [ ] Patch vulnerabilities
   - [ ] Reset credentials
   - [ ] Rotate secrets
   - [ ] Deploy patches

4. **Communication (Ongoing)**
   - [ ] Notify affected users
   - [ ] Inform stakeholders
   - [ ] Prepare public statement
   - [ ] Report to authorities if required

5. **Recovery (Post-Incident)**
   - [ ] Restore from clean backups
   - [ ] Verify system integrity
   - [ ] Monitor for re-compromise
   - [ ] Post-incident review

---

## Security Resources

### External References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) - Top 10 web vulnerabilities
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework) - Security standards
- [CWE Top 25](https://cwe.mitre.org/top25/) - Common weakness enumeration
- [CSP Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) - Content Security Policy

### Tools

- **npm audit** - Check for known vulnerabilities in dependencies
- **ESLint** - Static code analysis with security plugins
- **Semgrep** - Regex-based static analysis
- **OWASP ZAP** - Penetration testing tool
- **Burp Suite** - Web security testing platform
- **Snyk** - Dependency vulnerability scanning

### Best Practices

1. Keep dependencies updated
2. Regular security audits
3. Principle of least privilege
4. Defense in depth (multiple layers)
5. Fail securely
6. Security by default
7. Least astonishment
8. Complete mediation
9. Open design
10. Separation of mechanism and policy

---

## Conclusion

Security is an ongoing process, not a one-time implementation. Regular audits, updates, and monitoring are essential to maintain a secure system. Use this guide as a foundation for your security practices and adapt it to your specific needs.

For questions or to report security vulnerabilities, please contact the security team at security@mallchain.io.

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Next Review:** Quarterly


---

## Common Security Vulnerabilities and Prevention

### 1. Cross-Site Scripting (XSS)

**What it is:** Injection of malicious scripts into web pages viewed by other users.

**Attack Example:**
```javascript
// User submits comment: <img src=x onerror="alert('XSS')">
// When other users view comment, script executes
```

**Prevention:**
1. Input Validation: Only allow expected characters
2. Output Encoding: Escape HTML entities when displaying user content
3. Content Security Policy: Block inline scripts
4. Template Escaping: Use framework's built-in escaping

### 2. Cross-Site Request Forgery (CSRF)

**What it is:** Attacker tricks user into making unwanted requests to another site.

**Prevention:**
1. SameSite Cookies: Browser doesn't send cookies to cross-site requests
2. CSRF Tokens: Require token that attacker can't predict
3. Use secure headers and strict cookie policies

### 3. SQL/NoSQL Injection

**What it is:** Attacker injects database commands to manipulate queries.

**Prevention:**
1. Parameterized Queries: Never concatenate user input
2. Schema Validation: Enforce data types
3. Principle of Least Privilege: DB user has minimal permissions

### 4. Broken Authentication

**What it is:** Weak password policies, session hijacking, or credential theft.

**Common Issues:**
- Default passwords not changed
- Passwords sent over HTTP
- Weak password requirements
- No account lockout after failed attempts
- Missing multi-factor authentication

### 5. Sensitive Data Exposure

**What it is:** Exposure of passwords, credit cards, or personal information.

**Common Issues:**
- Logging sensitive data
- Storing passwords in plain text
- Sending data over HTTP
- Git history contains secrets
- Unnecessary data collection

### 6. Broken Access Control

**What it is:** Users can access or modify data they shouldn't have access to.

**Prevention:**
- Check permissions before every operation
- Implement role-based access control
- Principle of least privilege

### 7. Security Misconfiguration

**What it is:** Incorrect security settings like default credentials or unnecessary services.

**Common Issues:**
- Default passwords not changed
- Unnecessary services running
- Stack traces exposed to users
- Outdated dependencies
- Debug mode enabled in production

### 8. Using Components with Known Vulnerabilities

**What it is:** Using outdated dependencies with known security vulnerabilities.

**Prevention:**
```bash
# Regular vulnerability scanning
npm audit

# Fix vulnerabilities
npm audit fix

# Update dependencies
npm update
```

---

## Database Security

### Connection Security

**Secure MongoDB Connection String:**
- Use authentication with strong passwords
- Enable SSL/TLS encryption
- Use least privilege database user
- Restrict network access

### Access Control

**Principle of Least Privilege:**
- Separate database users for different purposes
- Application user (read/write)
- Read-only user for analytics
- Admin user for backups/maintenance

### Query Security

**Parameterized Queries (Best Practice):**
- Use Mongoose parameterized queries
- Never use string concatenation
- Validate all input before querying
- Use aggregation pipeline for complex queries

### Backup Security

**Secure Backup Procedures:**
- Encrypt backups with strong encryption
- Test backup restoration regularly
- Store backups offsite
- Maintain backup retention policy
- Document recovery procedure

### Audit Logging

**Database Audit Configuration:**
- Log all sensitive operations
- Track who accessed what and when
- Retain audit logs for compliance
- Monitor audit logs for suspicious activity

---

## Deployment Security

### Pre-Deployment Security Verification

**Security Checklist Before Going Live:**
- All required environment variables are set
- No sensitive values hardcoded
- Secrets in secure vault
- NODE_ENV=production set
- SSL certificates valid and not expired
- CORS_ORIGINS explicitly set (not wildcard)
- Rate limiting configured
- Logging and monitoring enabled

### Infrastructure Security

**Docker Security:**
- Run as non-root user
- Use minimal base images
- Implement health checks
- Set resource limits
- Use read-only filesystem

### Network Security

**Firewall Configuration:**
- Deny by default, allow by exception
- Restrict SSH access
- Limit database access to app servers
- Monitor network traffic
- Use VPC/private networks

### SSL/TLS Certificate Management

**Certificate Deployment:**
- Use trusted CA certificates
- Implement auto-renewal
- Monitor certificate expiration
- Rotate certificates before expiry
- Use strong cipher suites

### Logging and Monitoring

**Secure Logging Configuration:**
- Don't log sensitive data
- Log all authentication attempts
- Monitor for suspicious activity
- Aggregate logs securely
- Implement alerting

---

## Conclusion

Security is an ongoing process, not a one-time implementation. Regular audits, updates, and monitoring are essential to maintain a secure system. Use this guide as a foundation for your security practices and adapt it to your specific needs.

Key takeaways:
1. **Defense in Depth**: Implement multiple security layers
2. **Principle of Least Privilege**: Grant minimal necessary access
3. **Secure by Default**: Default configuration should be secure
4. **Continuous Monitoring**: Actively monitor for threats
5. **Regular Updates**: Keep dependencies and systems patched

For questions or to report security vulnerabilities, please contact the security team at security@mallchain.io.

---

**Document Version:** 2.0  
**Last Updated:** 2024  
**Security Focus:** Backend-Frontend Integration  
**Next Review:** Quarterly  
**Maintained by:** Security Team
