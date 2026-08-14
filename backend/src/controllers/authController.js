const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
    username: user.username || null,
    phone: user.phone || null,
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

function makeSyntheticEmail(username) {
  return `${username}@mines.mallchain.local`;
}

// Flat MLPTS bonus credited to a referrer when someone signs up with their code.
const REFERRAL_SIGNUP_BONUS = 10;

exports.register = async (req, res) => {
  const { email, password, referralCode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'email exists' });
  const hash = await bcrypt.hash(password, 10);

  let referrer = null;
  if (referralCode) {
    referrer = await User.findOne({ referralCode: String(referralCode).trim().toUpperCase() });
  }

  const u = await User.create({ email, password: hash, referredBy: referrer ? referrer._id : undefined });
  u.referralCode = `MALL-${u._id.toString().slice(-8)}`.toUpperCase();
  await u.save();

  if (referrer) {
    await User.findByIdAndUpdate(referrer._id, {
      $inc: { referralCount: 1, referralEarnings: REFERRAL_SIGNUP_BONUS },
    });
  }

  const token = signToken(u);
  res.json({ token, user: toPublicUser(u) });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const u = await User.findOne({ email });
  if (!u) return res.status(400).json({ error: 'invalid credentials' });
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
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
    return res.json({ user: toPublicUser(user) })
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }
};

exports.googleCallback = async (req, res) => {
  // passport attaches profile in req.user
  const profile = req.user;
  const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || `${profile.id}@google`;
  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    user = await User.create({ email, googleId: profile.id });
  }
  const token = signToken(user);
  // redirect to frontend with token
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  return res.redirect(`${frontend}/?token=${token}`);
};
