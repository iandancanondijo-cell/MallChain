/**
 * Shared CSRF protection instance — used both by index.js's GET
 * /api/csrf-token endpoint and requireAuth.js's enforcement on
 * authenticated mutating requests. One instance in one place so the two
 * can't drift into checking against different secrets/config.
 *
 * @dr.pogodin/csurf (the maintained fork — upstream csurf is deprecated)
 * stores its own secret in a cookie (`cookie: true`) and, by default, only
 * enforces token validation on state-changing methods (POST/PUT/PATCH/
 * DELETE — GET/HEAD/OPTIONS are exempt), so running this on every request
 * is safe: it just establishes/reads the secret on GETs and actually
 * verifies the X-CSRF-Token header on everything else.
 */
const csurf = require('@dr.pogodin/csurf');

const csrfProtection = csurf({ cookie: true });

module.exports = { csrfProtection };
