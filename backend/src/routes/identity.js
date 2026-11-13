const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { createLimiter } = require('../middleware/rateLimiter');
const User = require('../models/user');
const UserSettings = require('../models/UserSettings');
const { blindIndex } = require('../utils/fieldEncryption');
const { respondFailure } = require('../utils/respondFailure');

function ok(data) { return { ok: true, data }; }
function fail(err) {
  if (typeof err === 'string') {
    logger.warn('identity', 'request refused', { reason: err });
    return { ok: false, error: err };
  }
  logger.error('identity', 'request failed', err);
  return { ok: false, error: 'Invalid request' };
}

// A transaction page shows 5-50 counterparties at once, so the client batches
// one page into one call. 120 calls per 15 minutes is far above what scrolling
// through history generates and well below what a scraper needs to map the
// address space, which is the reason this route exists at all.
const resolveLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 120 });

const MAX_ADDRESSES = 50;
// Chain addresses (bech32 'mall1…', '0x…' EVM, valoper…) are alphanumeric with
// optional separators; anything else came from a malformed client.
const ADDRESS_SHAPE = /^[A-Za-z0-9:_-]{6,128}$/;

/**
 * Map wallet addresses to the display identity of the account that registered
 * each one.
 *
 * The transaction records a wallet holds are address-only — there is no user id
 * on them — so this is the lookup that lets a history row show a face beside an
 * address instead of a bare string. It is deliberately the *public* half of the
 * profile (display name and picture, never email, phone or KYC state), and it
 * answers for every address the caller asked about, known or not:
 *
 *   { "mall1abc…": { "displayName": "ada", "avatarUrl": "/uploads/avatars/…" } }
 *   { "mall1def…": null }
 *
 * An unknown address and a known-but-private address produce the same null, so
 * the response cannot be used to test whether some address belongs to a Mallchain
 * account. Callers that need that are asking for data this product has decided
 * not to publish.
 */
router.post('/resolve', auth, resolveLimiter, async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.addresses) ? req.body.addresses : null;
    if (!raw) return res.status(400).json(fail('addresses must be an array of wallet addresses'));
    if (raw.length > MAX_ADDRESSES) {
      return res.status(400).json(fail(`at most ${MAX_ADDRESSES} addresses per request`));
    }

    const asked = [];
    const seen = new Set();
    for (const value of raw) {
      if (typeof value !== 'string') continue;
      const address = value.trim();
      if (!ADDRESS_SHAPE.test(address) || seen.has(address)) continue;
      seen.add(address);
      asked.push(address);
    }
    if (!asked.length) return res.json(ok({}));

    const owners = await User.find(
      { walletAddress_blind: { $in: asked.map(blindIndex) } },
      'name username avatarUrl walletAddress_blind'
    ).lean();

    // The blind index is an HMAC of the address, not the address itself, so the
    // match is made by re-deriving it rather than by comparing strings.
    const hashToAddress = new Map(asked.map((a) => [blindIndex(a), a]));
    const byAddress = new Map();
    for (const owner of owners) {
      const address = hashToAddress.get(owner.walletAddress_blind);
      if (!address) continue;
      byAddress.set(address, owner);
    }

    // profileVisibility is the account's own switch for being identified by
    // address, and it lives on the settings document, so the second read is
    // scoped to exactly the accounts that matched above.
    const settings = await UserSettings.find(
      { userId: { $in: [...byAddress.values()].map((u) => u._id) } },
      'userId privacy.profileVisibility'
    ).lean();
    const visibility = new Map(settings.map((s) => [String(s.userId), s.privacy?.profileVisibility]));

    const data = {};
    for (const address of asked) {
      const owner = byAddress.get(address);
      // 'public' is the schema default, so an account that never opened
      // Settings is public. An explicit choice to hide the profile suppresses
      // the lookup for everyone — including that account itself, which does
      // not need this route in order to recognise its own address.
      //
      // Each answer depends only on the target's own settings, and that is what
      // makes the result cacheable by a client: an identity looked up while
      // viewing one person's history cannot leak a private account's name to
      // the next person who signs in on that browser, because the answer was
      // never conditional on who asked.
      const choice = owner ? visibility.get(String(owner._id)) : undefined;
      const discoverable = choice === undefined || choice === 'public';
      if (owner && discoverable) {
        const displayName = (owner.username || owner.name || '').trim() || null;
        data[address] = { displayName, avatarUrl: owner.avatarUrl || null };
      } else {
        data[address] = null;
      }
    }

    res.json(ok(data));
  } catch (e) {
    respondFailure(res, e, fail);
  }
});

module.exports = router;
