# Handoff §9 — status as of 2026-11-13

`docs/frontend-v14-integration-handoff-2026-11-10.md` §9 listed the backend gaps
the v14 client was still working around. This is the closing report for that
list: what now exists, how it was verified against the running stack (not just
in Jest), and the two items that are operator work rather than code.

Verification stack for everything below: the merged tree at `56caea3e` —
backend on `:4000`, SPA on `:5173`, `marketplaced` on `:1317`/`:26657` (height
341 626 and producing), Mongo replica set member on `:27020`
(`--dbpath /home/elle_bryson/mongodb-data`).

## Closed in code

**1. `GET /api/transactions/:id` returned the raw Mongo document.** Now wrapped
in the `{ ok: true }` envelope with an `id` field, so a client reading
`transaction.id` gets an identifier.

**2. No marketplace catalog endpoint.** `GET /api/marketplace/catalog` serves the
seller documents with address, price, category and image, and `#/marketplace`
renders from it — the "Coming Soon" empty state is gone. A catalog request that
fails now says it failed instead of claiming the market is empty.

**3. Order ids were client-local (`ord-…`).** Server-issued ids are live.
`backend/src/models/MarketplaceOrder.js` + `backend/src/routes/marketplaceOrders.js`
(`GET /`, `GET /manage`, `GET /:id`, `POST /`, `PATCH /:id`) issue
`MLC-YYMMDD-XXXXXXXX`, and every recorded purchase is cross-checked against the
escrow the buyer claims to have settled: a receipt naming an escrow the chain
does not have is refused 404, an escrow paying a different seller or holding a
different amount is refused, and a node that cannot answer records the order
flagged `escrowVerified: false` rather than mislabelled as verified.
`services/marketplaceOrders.ts` and `Marketplace.tsx` carry that provenance into
the UI and hydrate the account's history on sign-in.

Live probes against the running node and Mongo, signed in as a real account:

| Probe | Result |
| --- | --- |
| `POST` escrow id `70001` (does not exist on-chain) | `404 NOT_FOUND` — "nothing is held for this order" |
| `POST` lines sum 59.98, total claims 99 | `400 INVALID_AMOUNT` |
| `POST` body with `buyerAddress: "0xdeadbeef"` | `400` on the address pattern |
| `POST` a valid receipt | `201`, `MLC-261112-98GF39ES`, `escrowVerified: false` |
| the same receipt posted again | `200 created: false`, same id |
| same basket, lines in reverse order | `200 created: false`, same id |
| `PATCH` processing→shipped→transit→delivered without a release hash | `400` — delivery needs `MsgReleaseFunds` |
| the same with a release hash | `200 delivered` |
| `PATCH` a delivered order onward | `400` (terminal) |
| `GET /orders` in the browser | four `MLC-…` rows, correct statuses, honest provenance line |

The retry rows above are why a fingerprint exists: a receipt whose escrow
broadcast never returned a reference has nothing to be matched on, and two
identical `POST`s used to write two orders. The fingerprint dedupes within ten
minutes so a deliberate repeat purchase next week still gets its own row.
The probe orders were deleted afterwards; the ledger is empty again.

**4. Mallpoints rate had no endpoint.** `GET /api/mallpoints/price` reads the
single source of truth, so the landing page and the purchase screen quote the
same number without pulling all of `/api/economy/state`.

**5. Socket.IO — the client half.** `resolveSocketOrigin()` in
`services/socket.ts` upgrades an `http:` API origin to `https:` whenever the
page itself is secure. Without it a production bundle built against
`http://api.…` dials `ws://` from an `https://` page, the browser kills the
handshake, and realtime reads "Disconnected" forever while REST works fine.

Server half: `src/index.js` used to build its own CORS list from
`FRONTEND_URL`/`CORS_ORIGINS`, which drifted from `getAllowedOrigins()` — REST
accepted any localhost port, the socket only `:5173`. Both now share one
delegate, verified against the live server:

```
Origin: http://localhost:4173      → 200, ACAO echo, credentials true
Origin: https://mallchain.network  → 200, ACAO echo, credentials true
Origin: http://evil.example        → 400 (refused)
```

and a `Socket connected` handshake appears in the backend log from the browser
session. Production with only loopback origins configured now logs a warning at
boot instead of quietly refusing every real user. `backend/.env.example`
documents the two variables and the deployed values.

## Closed by construction

**7. `/downloads/node/` origin collision.** It happened because a published
bundle copied the SPA, and a tab left on that copy wrote the same same-origin
`localStorage` key as the signed-in app. `scripts/build-validator-bundle.sh`
now stages `bin/`, `config/` and the operator scripts only — no app copy — so
nothing this repo publishes can recreate the collision. `storeSync.ts` keeps the
read-side guard (`claimsAnotherAccount`) as defence against an older bundle
still circulating.

## Re-scoped

**6. `stub-api.mjs` coverage.** The file does not live in this repository (its
README places it next to the repo), so "extend the stub in step with new routes"
is not actionable here. It is also no longer load-bearing: the browser
verification this week ran against the real backend and a producing node, which
is a stronger check than the stub was ever meant to substitute for.

## Still operator work — not code

**5 (remaining half).** The proxy in front of `api.mallchain.network` must
upgrade `/socket.io` to `wss://` (`proxy_set_header Upgrade/Connection`,
read timeouts well above the polling interval). Until it does, an HTTPS-served
app connects over long-polling at best. Namecheap/Cloudflare side, so it cannot
be tested from this machine.

**8.** Items 1-7 of `docs/backend-handoff-2026-11-09.md` — price window, market
cap, `/api/tx/history` shape, 401 discrimination, notification
archive/unread — are landed, and the corresponding client workarounds were
deleted as each endpoint shipped.

## Suites

- Backend: 132 suites / 1 370 tests passing (`npx jest --maxWorkers=2`). With the
  default worker count six suites fail on this machine under CPU starvation and
  pass in isolation — that is the known baseline behaviour, not a regression.
- Frontend: `tsc --noEmit` clean, `npm run build` clean, and 104 test files /
  1 848 tests passing (1 file skipped, 8 skipped and 8 todo cases), exit 0.
