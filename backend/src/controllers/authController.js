const User = require('../models/user');
const UserSettings = require('../models/UserSettings');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const totp = require('../utils/totp');

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
  const sessionTtlMin = parseInt(process.env.SESSION_TTL_MIN || '120', 10);
  return jwt.sign(
    { 
      userId: String(user._id),
      username: user.username || user.email,
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
  const u = await User.findOne({ email });
  if (!u) return res.status(400).json({ error: 'invalid credentials' });
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });

  const twoFactorResult = await checkTwoFactor(u._id, otp);
  if (twoFactorResult?.requires2fa) return res.json({ requires2fa: true });
  if (twoFactorResult?.error) return res.status(twoFactorResult.status).json({ error: twoFactorResult.error });

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

  const u = await User.findOne({ username });
  if (!u) return res.status(400).json({ error: 'invalid credentials' });
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });

  const twoFactorResult = await checkTwoFactor(u._id, req.body?.otp);
  if (twoFactorResult?.requires2fa) return res.json({ requires2fa: true });
  if (twoFactorResult?.error) return res.status(twoFactorResult.status).json({ error: twoFactorResult.error });

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

  const { address } = req.body || {};
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
