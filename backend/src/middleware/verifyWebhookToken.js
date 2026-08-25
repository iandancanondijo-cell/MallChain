const crypto = require('crypto');

// Safaricom can't sign its webhook payloads, so authentication relies on a
// shared-secret token baked into the callback URL registered with them (see
// config's appendWebhookToken). If PAYMENT_WEBHOOK_SECRET isn't configured
// this is a no-op (matches dev/test where the secret is never required).
// Shared by every route that receives an M-Pesa callback (buy.js, badge.js)
// so there's one audited implementation rather than copies that could drift.
function verifyWebhookToken(req, res, next) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return next();

  const provided = String(req.query.token || '');
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return res.status(401).json({ error: 'invalid webhook token' });
  }
  return next();
}

module.exports = verifyWebhookToken;
