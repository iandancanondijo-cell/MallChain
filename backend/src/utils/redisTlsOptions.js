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

/**
 * AUTH counterpart to redisTlsOptions(). Same six clients, same spread
 * pattern (plus src/queue/transactionQueue.js, which hands BullMQ a plain
 * options object).
 *
 * Without this, every client connects with no credentials — which was fine
 * only while the Redis nodes themselves accepted unauthenticated traffic.
 * docker-compose.prod.yml now starts them with --requirepass, so leaving the
 * app side credential-free would take the whole backend down.
 *
 * Unset REDIS_PASSWORD and this returns {}, so local dev against a plain
 * `redis-server` keeps working.
 *
 * Sentinel note: ioredis needs `sentinelPassword` separately when a client
 * talks to Sentinels that have their own `requirepass`. These clients connect
 * straight to the master by host/port (REDIS_SENTINEL_HOSTS is set in
 * compose but read nowhere in this codebase), so it does not apply yet — if
 * sentinel discovery is ever wired up, add it here.
 */
function redisAuthOptions() {
  if (!process.env.REDIS_PASSWORD) return {};
  return {
    password: process.env.REDIS_PASSWORD,
    // Only meaningful for ACL users (Redis 6+); default user needs no username.
    ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
  };
}

module.exports = { redisTlsOptions, redisAuthOptions };

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
