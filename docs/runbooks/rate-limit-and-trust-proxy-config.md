# Rate Limiting + Reverse Proxy Trust (Trust-Proxy) Configuration Runbook

## Purpose

All sensitive endpoints use `express-rate-limit` via [rateLimiter.js](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/backend/src/middleware/rateLimiter.js) and `express-rate-limit` requires the real client IP to be read correctly (`req.ip`) so that rate limits don't accidentally apply to the reverse proxy (nginx / Cloudflare / AWS ALB) instead of the real end user.

If `trust proxy` is misconfigured, **every request appears to come from 127.0.0.1 and the entire CDN/proxy fleet is treated as a single "user"** → one login request across many users trips the 5/15min auth limit → false positives → entire user base is rate-limited.

## Rate limiter tiers

| Limiter       | windowMs  | max / window | Usage                                                                 |
| ------------- | --------- | ------------ | --------------------------------------------------------------------- |
| `auth`        | 15 * 60s  | 5            | register / login / forgot-password. Skips successful requests so active users not throttled.         |
| `strict`      | 15 * 60s  | 10           | Superadmin toggles; faucet; KYC upload; admin-panel role-change / user delete |
| `financial`   | 15 * 60s  | 20           | send / withdraw / buy / convert / payout                              |
| `standard`    | 15 * 60s  | 100          | most POST/PATCH/PUT routes; search; dex estimates (non-mutating)  |
| `lenient`     | 15 * 60s  | 300          | read-only GET routes; maintenance banner; explorer local paths      |

`standardHeaders: true` (so clients see `RateLimit-*` + client can back off).

## Correct production deployment

### Option A — single nginx / ALB fronting one hop

```bash
# .env.prod
TRUST_PROXY=127.0.0.1,::1,10.0.0.0/8
```

Equivalent logic in `index.js`:

```js
if (process.env.TRUST_PROXY) {
  const proxies = process.env.TRUST_PROXY.split(',').map(p => p.trim()).filter(Boolean);
  app.set('trust proxy', proxies);
} else {
  app.set('trust proxy', 1);  // default, insecure if user has multiple hops → audit logs will show wrong IP
}
```

### Option B — Cloudflare in front → nginx → app (two hops)

Set the explicit Cloudflare CIDRs + nginx IP as trusted, NOT `trust proxy, 1`.

```bash
# IPv4 ranges (Cloudflare as of 2024)
export CF_IPV4='173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,104.24.0.0/14,172.64.0.0/13,131.0.72.0/22'
export CF_IPV6='2400:cb00::/32,2606:4700::/32,2803:f800::/32,2405:b500::/32,2405:8100::/32,2a06:98c0::/29,2c0f:f248::/32'
# Add internal nginx / VPC CIDRs as well
export TRUST_PROXY="$CF_IPV4,$CF_IPV6,10.0.0.0/8,192.168.0.0/16"
```

If you miss Cloudflare CIDRs, the leftmost (real client) IP in `X-Forwarded-For` is **not accepted** and Express picks the Cloudflare IP as the "client" → rate limiting by Cloudflare server instead of real user → everyone rate-limited.

## Validation (after deployment)

Test `req.ip` correctness via the `/api/protected` route:

```bash
curl -H "Authorization: Bearer $USER_JWT" -H "X-Forwarded-For: 203.0.113.5, 104.16.100.5" \
  https://api.mallchain.example/api/protected
```

The JSON `user` should show `req.ip` as **203.0.113.5**, not 104.16.100.5 or 127.0.0.1. If wrong, audit `TRUST_PROXY`.

## Rate limit test

```bash
# Trigger auth rate limit intentionally
for i in {1..7}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.mallchain.example/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"bogus@example.com","password":"wrong"}'
done
# Expect: first 5 → 401, #6 and #7 → 429 with {error:'rate_limit_exceeded'}
```

If all 7 return 401, rate limiting isn't applied — confirm the `limiters.auth` is mounted to `/api/auth/login` in `authRoutes`.

## Environment matrix

| Env                  | TRUST_PROXY recommended | Notes                                                     |
| ---------------- | ---------------- | --------------------------------------------------------- |
| Local `NODE_ENV=dev`, no reverse proxy | unset (falls back to `1` only is fine here)                  | `localhost` only                                          |
| Behind one nginx          | `127.0.0.1,10.0.0.0/8,VPC CIDRs`                           | Typical single-region ECS                                 |
| Cloudflare + nginx        | Cloudflare CIDRs (as above) + VPC + nginx host              | **Do NOT** use trust proxy `n` numeric value here         |
| K8s + ingress-nginx       | ingress-nginx service CIDR + `10.0.0.0/8`                   |                                                           |

## When to edit

When adding a new protected route, pick the appropriate limiter tier from `rateLimiter.js`:

```js
const { limiters } = require('../middleware/rateLimiter');
router.post('/my-sensitive-route', limiters.financial, myHandler);
```

Never mount a money-moving POST/PUT without `limiters.financial` or stricter.

## Debugging logs

If you see `'TRUST_PROXY is not set'` warnings at startup in production logs → fix `TRUST_PROXY` now — rate limits in their current form will throttle the proxy not the end user.
