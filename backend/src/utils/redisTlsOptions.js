/* eslint-env node */
/* global require, module, process */
/**
 * Shared TLS option builder for every ioredis client in this codebase
 * (production-readiness E3: connections to Redis had no TLS support coded
 * at all — not just "disabled", the option to enable it didn't exist).
 *
 * Six different files each construct their own Redis client
 * (mallwallet/queue/redis.js, middleware/authCache.js,
 * middleware/tokenDenylist.js, utils/activityTracker.js,
 * utils/redisLock.js, services/faucetService.js) — rather than duplicate
 * TLS wiring six times, each spreads `...redisTlsOptions()` into its own
 * ioredis constructor options.
 *
 * Disabled by default (REDIS_TLS unset/false) so local dev against a plain
 * `redis-server` keeps working unchanged; set REDIS_TLS=true against a
 * TLS-enabled Redis (most managed providers — ElastiCache in-transit
 * encryption, Redis Cloud, Upstash — enable this by default). A self-signed
 * or private-CA Redis (e.g. one you stood up yourself) needs
 * REDIS_TLS_CA_FILE pointed at that CA's cert.
 */
const fs = require('fs');

function redisTlsOptions() {
  if (String(process.env.REDIS_TLS).toLowerCase() !== 'true') return {};

  const tls = {
    // Defaults to verifying against the system trust store, same as any
    // other TLS client — only relaxed if REDIS_TLS_CA_FILE or
    // REDIS_TLS_REJECT_UNAUTHORIZED=false are explicitly set.
    rejectUnauthorized: String(process.env.REDIS_TLS_REJECT_UNAUTHORIZED).toLowerCase() !== 'false',
  };

  if (process.env.REDIS_TLS_CA_FILE) tls.ca = fs.readFileSync(process.env.REDIS_TLS_CA_FILE);
  if (process.env.REDIS_TLS_CERT_FILE) tls.cert = fs.readFileSync(process.env.REDIS_TLS_CERT_FILE);
  if (process.env.REDIS_TLS_KEY_FILE) tls.key = fs.readFileSync(process.env.REDIS_TLS_KEY_FILE);
  if (process.env.REDIS_TLS_SERVERNAME) tls.servername = process.env.REDIS_TLS_SERVERNAME;

  return { tls };
}

module.exports = { redisTlsOptions };
