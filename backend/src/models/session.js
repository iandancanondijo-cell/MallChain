const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * One row per issued JWT — the thing that makes "active sessions" mean
 * anything. Until services/sessionRegistry.js existed nothing ever wrote
 * here (the only writer was POST /api/sessions/create, which no client ever
 * called), so GET /api/sessions always returned an empty list and the
 * Settings panel's device table was decoration.
 */
const SessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // The JWT `jti` claim: the identity of a single issued session. This, not a
  // token hash, is what the routes match the caller's own session against —
  // the token itself lives in an httpOnly cookie the frontend never reads,
  // so `Authorization` is absent on every browser request and the old
  // hash-the-header comparison silently matched nothing.
  jti: { type: String, required: true, unique: true },

  // SHA-256 of the signed token. Nothing reads it any more, but the
  // collection's legacy unique index on this path is still installed in any
  // environment that has booted this backend, and a row that omitted the
  // field would collide with it on a second null.
  tokenHash: { type: String, required: false, default: null },

  // Device & browser, as stated by the request's User-Agent (null = the
  // request did not state it). See utils/deviceInfo.js.
  device: { type: String, default: 'unknown' }, // 'desktop' | 'mobile' | 'tablet' | 'unknown'
  browser: { type: String, default: null },
  browserVersion: { type: String, default: null },
  os: { type: String, default: null },
  automatedClient: { type: Boolean, default: false },

  // Network info
  ipAddress: { type: String, default: null },
  country: { type: String, default: null }, // ISO 3166-1 alpha-2 from Cloudflare's edge header
  city: { type: String, default: null }, // No GeoIP lookup is wired up — stays null

  // How this session came to exist, so the panel can say so.
  loginMethod: { type: String, default: 'password' }, // 'password' | 'google' | 'refresh'

  // Activity tracking (throttled write in requireAuth — see sessionRegistry.touch)
  createdAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },

  // Lifecycle
  isActive: { type: Boolean, default: true, index: true },
  // Mirrors the JWT's `exp`. The session ends here whether or not the user was
  // active — sessions do not renew on activity, and the UI must not claim they
  // do. Terminating a session also revokes this jti in Redis, which is what
  // actually invalidates the token before this timestamp.
  expiresAt: { type: Date, required: true, index: true },

  // Session metadata
  userAgent: { type: String, default: null },
});

// Indexes for performance
SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ userId: 1, lastActivityAt: -1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
