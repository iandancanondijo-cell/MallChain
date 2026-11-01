/**
 * Category-scoped access middleware.
 *
 * Pairs with `requireAdmin` (or `requireSuperAdmin`); pass it the single
 * category the route belongs to and it lets the request through if:
 *   - the caller is a superadmin (always full access), OR
 *   - the caller's adminCategory matches `category` exactly.
 *
 * Any other admin gets a 403 with a body that tells the UI why, and zero
 * payload — strict isolation means a category admin who hits a sibling
 * category's endpoint never even learns the sibling exists.
 *
 * Usage:
 *   const { requireCategory } = require('../middleware/categoryAccess');
 *   router.get('/mining/campaigns', requireCategory('mining'), handler);
 *
 * For superadmin-only routes use `requireSuperAdmin` directly.
 */
function requireCategory(category) {
  return function categoryAccessMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'auth required' });
    }

    // Superadmins see everything by design.
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Non-admins never reach this middleware in normal operation (the
    // requireAdmin upstream would have already 403'd), but guard anyway.
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'admin role required' });
    }

    if (req.user.adminCategory !== category) {
      // Note the deliberate absence of `category` in the response body —
      // a category admin hitting the wrong endpoint shouldn't learn the
      // shape of the route space. They get the same 403 as a 401 with a
      // generic message elsewhere.
      return res.status(403).json({ error: 'category access denied' });
    }

    return next();
  };
}

/**
 * Variant of `requireCategory` for endpoints that legitimately serve more
 * than one category (e.g. structuring flags: they're raised from withdrawal
 * activity [treasury] but reviewed as part of the AML/compliance flow [kyc]).
 * Passes if the caller is a superadmin, or an admin whose adminCategory is
 * any one of `categories`.
 */
function requireAnyCategory(categories) {
  const list = Array.isArray(categories) ? categories : [categories];
  return function anyCategoryMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'auth required' });
    }
    if (req.user.role === 'superadmin') return next();
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'admin role required' });
    }
    if (!list.includes(req.user.adminCategory)) {
      return res.status(403).json({ error: 'category access denied' });
    }
    return next();
  };
}

module.exports = { requireCategory, requireAnyCategory };