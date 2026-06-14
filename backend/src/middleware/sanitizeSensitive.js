function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const redacted = Array.isArray(obj) ? [] : {};
  const sensitive = /password|passphrase|mnemonic|privatekey|private_key|secret|token|access_token/i;
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (k.match(sensitive)) {
        redacted[k] = '[REDACTED]';
        continue;
      }
      if (typeof v === 'object' && v !== null) {
        redacted[k] = redact(v);
      } else if (typeof v === 'string') {
        // mask long-looking secrets
        if (v.length > 128) {
          redacted[k] = '[REDACTED]';
        } else {
          redacted[k] = v;
        }
      } else {
        redacted[k] = v;
      }
    } catch (e) {
      redacted[k] = '[REDACTED]';
    }
  }
  return redacted;
}

module.exports = function sanitizeSensitive(req, _res, next) {
  try {
    if (req && req.body) {
      req._rawBodyForLogging = JSON.stringify(redact(req.body));
    }
  } catch (e) {
    // ignore
  }
  next();
};
