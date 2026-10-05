const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

const APIKeySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Key name (user-friendly label)
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },

  // Hashed key (SHA256) — actual key never stored in plaintext
  keyHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // First 8 chars of key for display (e.g., "mk_live_****")
  keyPrefix: {
    type: String,
    required: true,
  },

  // API key scopes (permissions)
  scope: {
    type: [String],
    enum: [
      'read:wallet',
      'read:transactions',
      'read:profile',
      'read:notifications',
      'write:transactions',
      'write:profile',
      'write:notifications',
      'write:security',
      'admin:audit',
      'admin:users',
    ],
    default: ['read:profile'],
  },

  // Expiration date (auto-cleanup with TTL)
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },

  // Revocation (soft delete)
  revokedAt: {
    type: Date,
    default: null,
    index: true,
  },

  // IP whitelist (CIDR notation, optional)
  ipWhitelist: {
    type: [String],
    default: [],
  },

  // Usage tracking
  lastUsedAt: {
    type: Date,
    default: null,
  },

  usageCount: {
    type: Number,
    default: 0,
  },

  // Rate limiting
  rateLimitPerMinute: {
    type: Number,
    default: 60,
    min: 1,
    max: 10000,
  },

  // Metadata
  description: {
    type: String,
    maxlength: 500,
  },

  // Environment (optional)
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'development',
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for userId + created to find recent keys
APIKeySchema.index({ userId: 1, createdAt: -1 });

// TTL index: Automatically delete revoked keys after 90 days
APIKeySchema.index(
  { revokedAt: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days
    partialFilterExpression: { revokedAt: { $exists: true, $ne: null } },
  }
);

// TTL index: Auto-delete expired keys after expiration
APIKeySchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0, // Delete immediately when expireAt is reached
    partialFilterExpression: { revokedAt: { $eq: null } },
  }
);

// Update updatedAt before save
APIKeySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method: Hash a key
APIKeySchema.statics.hashKey = function (key) {
  return crypto.createHash('sha256').update(key).digest('hex');
};

// Static method: Generate a random API key
APIKeySchema.statics.generateKey = function () {
  const prefix = 'mk_live_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix + randomBytes;
};

// Instance method: Check if key is valid (not revoked, not expired)
APIKeySchema.methods.isValid = function () {
  const now = new Date();
  return !this.revokedAt && this.expiresAt > now;
};

// Instance method: Check if IP is whitelisted (if whitelist exists)
APIKeySchema.methods.isIpAllowed = function (ip) {
  if (this.ipWhitelist.length === 0) return true; // No whitelist = allow all

  // Simple CIDR check (basic implementation)
  // For production, use 'cidr-js' or 'ipaddress' library
  const parts = ip.split('.');
  return this.ipWhitelist.some((cidr) => {
    if (cidr === '*') return true;
    if (cidr === ip) return true;
    // Basic prefix matching (e.g., "192.168.*")
    const cidrParts = cidr.split('.');
    return cidrParts.every((part, idx) => part === '*' || part === parts[idx]);
  });
};

// Instance method: Check if scope includes required permission
APIKeySchema.methods.hasScope = function (requiredScope) {
  return this.scope.includes(requiredScope);
};

// Instance method: Check if any of required scopes match
APIKeySchema.methods.hasScopeAny = function (requiredScopes) {
  return requiredScopes.some((scope) => this.scope.includes(scope));
};

module.exports = mongoose.models.APIKey || mongoose.model('APIKey', APIKeySchema);
