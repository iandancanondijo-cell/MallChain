const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, getJwtSecret(), { expiresIn: '7d' });
}

exports.register = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ error: 'email exists' });
  const hash = await bcrypt.hash(password, 10);
  const u = await User.create({ email, password: hash });
  const token = signToken(u);
  res.json({ token });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const u = await User.findOne({ email });
  if (!u) return res.status(400).json({ error: 'invalid credentials' });
  if (!u.password) return res.status(400).json({ error: 'use OAuth login' });
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  const token = signToken(u);
  res.json({ token });
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
