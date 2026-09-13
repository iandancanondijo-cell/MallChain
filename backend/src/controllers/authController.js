const User = require('../models/user');
const UserSettings = require('../models/UserSettings');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const totp = require('../utils/totp');
const { config } = require('../config');
const { revokeToken, revokeAllUserTokens } = require('../middleware/tokenDenylist');
const getRedis = require('../mallwallet/queue/redis');

const LINK_WALLET_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;
const ADR036_CONSUMED_TTL_SECONDS = 60 * 60;

// Account lockout after repeated failed logins. limiters.auth (rateLimiter.js)
// already throttles by IP, which an attacker defeats by rotating IPs; this
// is keyed by the account identifier itself so it can't be sidestepped that
// way. Backed by Redis (best-effort — if Redis is unreachable we fail open
// and allow the attempt rather than locking everyone out on an infra blip).
const FAILED_LOGIN_LIMIT = 10;
const FAILED_LOGIN_WINDOW_SECONDS = 15 * 60;

async function checkAccountLock(identifier) {
  try {
    const redis = getRedis();
    const key = `failed_login:${identifier}`;
    const count = Number(await redis.get(key) || 0);
    if (count >= FAILED_LOGIN_LIMIT) {
      const ttl = await redis.ttl(key);
      return { locked: true, retryAfterSeconds: ttl > 0 ? ttl : FAILED_LOGIN_WINDOW_SECONDS };
    }
  } catch (_) {
    /* Redis unavailable — fail open. */
  }
  return { locked: false };
}

async function recordFailedLogin(identifier) {
  try {
    const redis = getRedis();
    const key = `failed_login:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, FAILED_LOGIN_WINDOW_SECONDS);
  } catch (_) {
    /* best-effort only */
  }
}

async function clearFailedLogins(identifier) {
  try {
    await getRedis().del(`failed_login:${identifier}`);
  } catch (_) {
    /* best-effort only */
  }
}

/**
 * If this account has real 2FA enabled (see settings.js's /2fa/enable),
 * require and verify a code before completing login. Previously nothing
 * here ever checked UserSettings at all — enabling "2FA" was purely
 * cosmetic and provided zero actual login protection.
 * Returns null if login can proceed, or a response object to send instead.
 */
async function checkTwoFactor(userId, otp) {
  const settings = await UserSettings.findOne({ userId })
    .select('+security.twoFactorSecret +security.twoFactorBackupCodeHashes');
  if (!settings?.security?.twoFactorEnabled) return null;

  if (!otp) return { requires2fa: true };

  if (totp.verifyToken(settings.security.twoFactorSecret, otp)) return null;

  const hashes = settings.security.twoFactorBackupCodeHashes || [];
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(String(otp).trim().toUpperCase(), hashes[i])) {
      // Backup codes are single-use — remove this one so it can't be replayed.
      hashes.splice(i, 1);
      settings.security.twoFactorBackupCodeHashes = hashes;
      await settings.save();
      return null;
    }
  }

  return { error: 'invalid 2FA code', status: 400 };
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function signToken(user) {
  // Task 4.1: Generate JWT with correct payload: {userId, username, exp}
  // exp is set automatically by jsonwebtoken with expiresIn option
  // jti is a per-token id: logout revokes by jti (see routes/auth.js's
  // /logout and middleware/tokenDenylist.js) without needing to invalidate
  // every other token this user holds.
  const sessionTtlMin = parseInt(process.env.SESSION_TTL_MIN || '120', 10);
  return jwt.sign(
    {
      userId: String(user._id),
      username: user.username || user.email,
      jti: crypto.randomUUID(),
    },
    getJwtSecret(),
    { expiresIn: `${sessionTtlMin}m` }
  );
}

function toPublicUser(user) {
  return {
    _id: user._id,
    id: user._id,
    email: user.email,
    name: user.name || null,
    username: user.username || null,
    phone: user.phone || null,
    walletAddress: user.walletAddress || null,
    role: user.role || 'user',
    creator_level: String(user.creator_level ?? 0),
    mlpts_balance: Number(user.mlpts_balance || 0),
    mallcoin_balance: Number(user.mallcoin_balance || 0),
    streak_count: Number(user.streak_count || 0),
    tasks_completed: Number(user.tasks_completed || 0),
    rank_points: Number(user.rank_points || 0),
    fraud_strikes: Number(user.fraud_strikes || 0),
    fraud_status: user.fraud_status || 'clear',
    banned: Boolean(user.banned),
    kycLevel: Number(user.kycLevel || 1),
    created_at: user.createdAt || new Date().toISOString(),
    updated_at: user.updatedAt || user.createdAt || new Date().toISOString(),
  };
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

// The Joi schema (middleware/inputValidation.js) declares .email().lowercase().trim()
// on register/login, but writes the normalized value to req.validatedBody —
// which these handlers never read (they read req.body directly). That left
// email lookups case-sensitive: "Foo@x.com" and "foo@x.com" could register as
// two separate accounts, and a user could get locked out of their own account
// by typing their email with different casing than they registered with.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function makeSyntheticEmail(username) {
  return `${username}@mines.mallchain.local`;
}

// Flat MLPTS bonus credited to a referrer when someone signs up with their code.
const REFERRAL_SIGNUP_BONUS = 10;

/**
 * Assigns a real, persisted referralCode to a freshly-created user and — if
 * they signed up with someone else's code — links and credits that
 * referrer. This used to live only in register() (email/password signup);
 * registerUsername() and googleCallback() created users with no
 * referralCode at all, so GET /api/referrals fell back to a display-only
 * code computed from username/id that looked identical to a real one but
 * was never in the DB — any signup using that shown code as `referralCode`
 * silently found no matching user and credited nobody. Confirmed live:
 * referring through a username-signup user's shown code produced zero
 * referralCount/referralEarnings change, with no error surfaced anywhere.
 */
async function assignReferralCode(user, referralCodeInput) {
  let referrer = null;
  if (referralCodeInput) {
    referrer = await User.findOne({ referralCode: String(referralCodeInput).trim().toUpperCase() });
  }
  user.referredBy = referrer ? referrer._id : undefined;
  user.referralCode = `MALL-${user._id.toString().slice(-8)}`.toUpperCase();
  await user.save();

  if (referrer) {
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { referralCount: 1, referralEarnings: REFERRAL_SIGNUP_BONUS },
    });
  }
}

exports.register = async (req, res) => {
  const { password, referralCode } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'email exists' });
  const hash = await bcrypt.hash(password, 10);

  const u = await User.create({ email, password: hash });
  await assignReferralCode(u, referralCode);

  const token = signToken(u);
  res.json({ token, user: toPublicUser(u) });
};

exports.login = async (req, res) => {
  const { password, otp } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const lock = await checkAccountLock(email);
  if (lock.locked) {
    return res.status(423).json({ error: 'account temporarily locked after repeated failed logins', retryAfterSeconds: lock.retryAfterSeconds });
  }

  const u = await User.findOne({ email });
  if (!u) { await recordFailedLogin(email); return res.status(400).json({ error: 'invalid credentials' }); }
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) { await recordFailedLogin(email); return res.status(400).json({ error: 'invalid credentials' }); }

  const twoFactorResult = await checkTwoFactor(u._id, otp);
  if (twoFactorResult?.requires2fa) return res.json({ requires2fa: true });
  if (twoFactorResult?.error) return res.status(twoFactorResult.status).json({ error: twoFactorResult.error });

  await clearFailedLogins(email);
  u.lastLoginAt = new Date();
  await u.save();
  const token = signToken(u);
  res.json({ token, user: toPublicUser(u) });
};

exports.registerUsername = async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'username must be 3-32 chars using letters, numbers, or underscores' });
  }

  const existingUsername = await User.findOne({ username });
  if (existingUsername) return res.status(400).json({ error: 'username exists' });

  const syntheticEmail = makeSyntheticEmail(username);
  const existingEmail = await User.findOne({ email: syntheticEmail });
  if (existingEmail) return res.status(400).json({ error: 'username exists' });

  const hash = await bcrypt.hash(password, 10);
  const u = await User.create({ username, email: syntheticEmail, password: hash });
  await assignReferralCode(u, req.body?.referralCode);

  const token = signToken(u);
  res.json({ token, user: toPublicUser(u) });
};

exports.loginUsername = async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const lock = await checkAccountLock(username);
  if (lock.locked) {
    return res.status(423).json({ error: 'account temporarily locked after repeated failed logins', retryAfterSeconds: lock.retryAfterSeconds });
  }

  const u = await User.findOne({ username });
  if (!u) { await recordFailedLogin(username); return res.status(400).json({ error: 'invalid credentials' }); }
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) { await recordFailedLogin(username); return res.status(400).json({ error: 'invalid credentials' }); }

  const twoFactorResult = await checkTwoFactor(u._id, req.body?.otp);
  if (twoFactorResult?.requires2fa) return res.json({ requires2fa: true });
  if (twoFactorResult?.error) return res.status(twoFactorResult.status).json({ error: twoFactorResult.error });

  await clearFailedLogins(username);
  u.lastLoginAt = new Date();
  await u.save();

  const token = signToken(u);
  res.json({ token, user: toPublicUser(u) });
};

exports.me = async (req, res) => {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'missing token' })
  const token = auth.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'bad auth header' })
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    // Task 4.1: Handle both old (id) and new (userId) token formats for compatibility
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId).select('-password')
    if (!user) return res.status(401).json({ error: 'user not found' })

    const publicUser = toPublicUser(user);
    if (user.walletAddress) {
      const { getUserBadgeInfo } = require('../services/badgeService');
      const badge = await getUserBadgeInfo(user.walletAddress).catch(() => ({ exists: false }));
      publicUser.hasBadge = Boolean(badge.exists);
    } else {
      publicUser.hasBadge = false;
    }

    return res.json({ user: publicUser })
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }
};

/**
 * POST /api/auth/link-wallet — associate this login with an on-chain
 * address. The only place a userId<->address link is created; badges (and
 * anything else keyed by address) can't otherwise be tied back to a login.
 * Idempotent: re-linking the same address is a no-op; linking a different
 * one overwrites (no verification of address ownership is done here, same
 * trust model as wallet connection elsewhere in this app — see
 * walletConnectionController.js's "derive locally, never send private keys"
 * comment. This only affects which address gets streak-earned badges;
 * it does not grant any spending/signing authority over that address).
 */
exports.linkWallet = async (req, res) => {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'missing token' })
  const token = auth.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'bad auth header' })

  let userId;
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    userId = decoded.userId || decoded.id;
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }

  const { address, timestamp, pubKey, signature } = req.body || {};
  const bech32 = require('bech32');
  let decoded;
  try {
    decoded = bech32.decode(String(address || ''));
  } catch {
    return res.status(400).json({ error: 'invalid address' });
  }
  if (decoded.prefix !== 'mall' || bech32.fromWords(decoded.words).length !== 20) {
    return res.status(400).json({ error: 'invalid address' });
  }

  // Proves the caller actually holds the private key for `address` before
  // linking it — a well-formed address alone used to be enough, letting
  // anyone link a stranger's address to their own account (surfacing that
  // address's badge/KYC status via /me, and letting the linked-address
  // ownership check on socket wallet subscriptions be satisfied to watch
  // someone else's balance updates in real time).
  if (!timestamp || !pubKey || !signature) {
    return res.status(401).json({ error: 'a wallet signature is required to link this address' });
  }
  const signedAtMs = Date.parse(timestamp);
  if (!Number.isFinite(signedAtMs) || Math.abs(Date.now() - signedAtMs) > LINK_WALLET_SIGNATURE_MAX_AGE_MS) {
    return res.status(401).json({ error: 'signature expired — please try again' });
  }
  const sigKey = `adr036_consumed:link:${Buffer.from(String(signature || '').slice(0, 128)).toString('base64')}`;
  if (process.env.TEST_MODE !== 'true') {
    try {
      const getRedis = require('../mallwallet/queue/redis');
      const rds = getRedis();
      const already = await rds.set(sigKey, '1', 'EX', ADR036_CONSUMED_TTL_SECONDS, 'NX');
      if (already === null) {
        return res.status(401).json({ error: 'signature already used — please sign a fresh message' });
      }
    } catch (_) {
      /* Redis unavailable — allow through; replay window + sequence replay on chain is still protection enough */
    }
  }
  // Lazy require: verifyAdr036.js pulls in @cosmjs/amino -> @cosmjs/crypto,
  // whose argon2 support is an ESM-only transitive dependency Jest's
  // default CJS resolution can't parse. Requiring it only when this handler
  // actually runs (instead of at module scope) means tests that exercise
  // other authController handlers don't have to load or mock it at all.
  const { verifyLinkWalletSignature } = require('../mallwallet/security/verifyAdr036');
  const ownsAddress = verifyLinkWalletSignature({
    address,
    timestamp,
    pubKeyBase64: pubKey,
    signatureBase64: signature,
    addressPrefix: config.chain.prefix,
  });
  if (!ownsAddress) {
    return res.status(401).json({ error: 'invalid signature — unable to verify you control this wallet' });
  }

  const user = await User.findByIdAndUpdate(userId, { walletAddress: address }, { new: true }).select('-password');
  if (!user) return res.status(401).json({ error: 'user not found' });

  return res.json({ ok: true, walletAddress: user.walletAddress });
};

exports.googleCallback = async (req, res) => {
  // passport attaches profile in req.user
  const profile = req.user;
  const email = normalizeEmail((profile.emails && profile.emails[0] && profile.emails[0].value) || `${profile.id}@google`);
  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    user = await User.create({ email, googleId: profile.id });
    // GET /google (routes/auth.js) echoes the referral code through as the
    // OAuth `state` param — Google returns it verbatim on the callback.
    const referralCode = typeof req.query.state === 'string' ? req.query.state : undefined;
    await assignReferralCode(user, referralCode);
  }
  const token = signToken(user);
  // redirect to frontend with token
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  return res.redirect(`${frontend}/?token=${token}`);
};

// POST /api/auth/logout — revokes just this token (by jti). Without this,
// "logging out" only ever cleared the token client-side; the JWT itself
// stayed valid server-side until it naturally expired (SESSION_TTL_MIN).
exports.logout = async (req, res) => {
  const payload = req.tokenPayload;
  if (payload?.jti && payload?.exp) {
    const ttlSeconds = payload.exp - Math.floor(Date.now() / 1000);
    await revokeToken(payload.jti, ttlSeconds);
  }
  return res.json({ ok: true });
};

// POST /api/auth/logout-everywhere — revokes every token issued to this
// user up to now. Backs the "Sign Out Everywhere" button, which previously
// only cleared the calling device's own local token despite its name —
// any other device holding a token for this account stayed fully logged in.
exports.logoutEverywhere = async (req, res) => {
  await revokeAllUserTokens(String(req.user._id));
  return res.json({ ok: true });
};
