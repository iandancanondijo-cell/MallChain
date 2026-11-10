# Mallchain OS v14 — integration handoff for the rest of the stack

Date: 2026-11-10. Branch: `fix/stale-wallet-persistence`.
Covers the work since `a5d207ca` (dashboard pass) through the Profile & Settings
rebuild, Careers/DevHub, Mines, notifications, identity-in-transactions, and the
removal of all mock/demonstration data.

Read [backend-handoff-2026-11-09.md](./backend-handoff-2026-11-09.md) alongside
this: that file is the *request list* (endpoints the UI still cannot get). This
file is the *contract list* (what the shipped UI now calls and requires), plus
how to build, run, test and export it.

Everything below was read out of the files on this branch or observed in a
browser against this branch's code. Section 12 states exactly what was never
executed here.

---

## 1. What changed, by surface

| Surface | What it now does | Key files |
|---|---|---|
| Dashboard | Every figure comes from a server read; a panel that cannot be read says which read failed. Wallet identity (picture + name) rendered beside transaction counterparties. | `mallchain-os-v14/src/features/dashboard/Dashboard.tsx` |
| Wallet (Overview / Send / Receive / History / Swap / Mallpoints / Performance) | Real `MsgSend` signing through `requestMnemonic()`; fiat quote beside the typed amount; account picture in the session list; no plaintext mnemonic persisted. | `src/features/wallet/*`, `src/services/walletTx.ts`, `src/services/mnemonicAccess.ts` |
| Transactions | Counterparty identity resolved from the server, not from local guesses. | `src/pages/TransactionHistory.tsx`, `src/features/wallet/TransactionDetailModal.tsx` |
| Profile & Settings | Rebuilt from scratch: one data hook (`useSettingsData`), section components under one shell, real avatar upload, server-backed privacy/preferences, honest session/API-key/security panels. | `src/features/settings/*`, `src/features/profile/*` |
| Social accounts | Handles are written to and re-read from the server (`UserSettings.socialAccounts`). They used to live only in local state, so a refresh lost them. | `src/features/settings/*`, `backend/src/routes/settings.js:384-445` |
| Identity beside wallets | New `POST /api/identity/resolve` + a batching client + one widget used in 12 places. | `backend/src/routes/identity.js`, `src/services/identityApi.ts`, `src/components/WalletIdentity.tsx` |
| Staking | Real `MsgStake`/`MsgUnstake`; the ledger row a stake writes now moves **MALL**, not Mallpoints (it previously debited `MLPTS` for a coin the user never spent). | `src/features/staking/Staking.tsx`, `src/services/stakingTx.ts` |
| Marketplace | No fabricated catalog. `products` is an explicit seam; with nothing loaded the page says so. Escrow/checkout/dispute calls are real. | `src/features/marketplace/Marketplace.tsx` |
| Mines / Creator Space | Open→screenshot→review→pay closes end to end; campaigns available/opens pending/impressions are server-side; earnings/analytics/leaderboard read those. | `src/features/mines/*`, `backend/src/routes/mines*.js`, `backend/src/routes/taskAssignment.js` |
| Careers | Real openings, post/delete gated by server-verified status, Apply messages the author. | `src/features/careers/*`, `backend/src/routes/careers.js` |
| DevHub | Natural-language command composer + compile workspace; example commands no longer contain genesis addresses (see §7). | `src/features/devhub/*`, `src/services/commandParser.ts` |
| Mallpoints purchase | Price, minimum and quote totals come from the server; paying is disabled until the rate is known; an uncredited paid quote keeps its reference on screen. | `src/pages/MallpointsPurchase.tsx`, `backend/src/routes/mallpointsPurchase.js` |
| Explorer / Economy / Network status | Numbers from the chain or the economy endpoint; each row states when the source is unreachable instead of showing a constant. | `src/pages/BlockchainExplorer.tsx`, `src/features/economy/Economy.tsx` |
| Routing | Hash routing (`#/…`) with lazy per-route chunks, so any static host works without rewrites. Unknown paths fall back to Dashboard. | `src/router.tsx`, `vite.config.ts` |

---

## 2. Response envelope — the one thing that breaks integrations

`src/services/api.ts` returns `{ ok, status, data }` where **`data` is the whole
parsed body**. The backend wraps every success in `ok(x)`, i.e.
`{ ok: true, data: x }`. So a backend value reaches the UI at:

```js
// backend
res.json(ok({ summary }))          // body = { ok: true, data: { summary } }
// frontend
const res = await api.get('/x');
res.data.data.summary              // ← note the second .data
```

`src/services/identityApi.ts` and the settings hooks unwrap this. Two endpoints
deliberately return **flat** bodies and must *not* be unwrapped the same way —
`/api/creator-space/balance` (`res.data.mlpts_balance`) and the legacy
`transactions` routes (`res.json(tx)`). A new route should use `ok()`/`fail()`
like `routes/identity.js`; then the client can unwrap uniformly.

Errors: `fail(message)` → `{ ok: false, error }`, HTTP 4xx/5xx with
`{ error, details? }`. The client shows a toast for a 4xx/5xx only where it
opts in; `401` clears the session marker (`api.ts`, `api.integration.test.ts`).

---

## 3. Server contracts the shipped UI depends on

### 3.1 `POST /api/identity/resolve` — address → display identity
`backend/src/routes/identity.js`, mounted at `backend/src/index.js:797-798`.

- `auth` middleware + a 120 requests / 15 min limiter.
- Body `{ addresses: string[] }`. More than 50 (`MAX_ADDRESSES`,
  `identity.js:26`) → **400**. Entries failing
  `/^[A-Za-z0-9:_-]{6,128}$/` (`identity.js:29`) or duplicated are **silently
  dropped**, not rejected — a malformed address must not fail the whole page.
- Lookup is on `walletAddress_blind` (HMAC of the address,
  `utils/fieldEncryption`), selecting only `name username avatarUrl
  walletAddress_blind`; then `UserSettings.privacy.profileVisibility` decides
  visibility. `discoverable = choice === undefined || choice === 'public'`
  (`identity.js:106`).
- Answer is `{ [address]: { displayName, avatarUrl } }`, **or `null` for that
  address**. Unknown and private produce byte-identical answers, so this route
  is not an account-existence oracle. An empty request returns `{}`.
- Frontend: `identityApi.ts` queues and batches (≤50 per call, one HTTP request
  per tick), caches negative answers for the session, and never renders a face
  it did not get from this route. `WalletIdentity.tsx` falls back to initials.

### 3.2 Privacy — `profileVisibility`
`backend/src/routes/settings.js:478-486`: `PUT /api/settings/privacy` accepts
`['public','contacts','private']` and 400s anything else. The resolve route
treats only `public` (and unset) as discoverable, so `contacts` currently
behaves as *not discoverable by address* — if the other team ships a contacts
graph, that is the place to extend.

### 3.3 Social accounts
`backend/src/routes/settings.js:384-445`, stored in
`models/UserSettings.js:118-125`:

- `GET /api/settings/social` → `ok(socialAccounts)`; the panel re-reads after a
  write, so the server is the only source of truth.
- `POST /api/settings/social/:platform` body `{ handle }`. Platform must be one
  of `twitter discord telegram reddit github youtube twitch linkedin tiktok
  instagram` (`settings.js:370-373`) → else 400. `handle` is required, ≤100
  chars (`sanitizeHandle`) → else 400. Upserts one entry per platform.
- `DELETE /api/settings/social/:platform` → `{ removed: true }`, 404 if absent.
- `connected/url/lastConnected` are server-written. Nothing about a handle is
  trusted for display without the `profileVisibility` check above.

### 3.4 Avatars and every uploaded asset
- `POST /api/upload/avatar` (`backend/src/routes/upload.js:46-62`): **2 MB**
  limit, `image/jpeg|png|webp` only. Other kinds have their own limits
  (products/badges 2 MB, courses/store 5 MB).
- Static: `/uploads/<kind>` per kind (`index.js:471-476`) **and**
  `/api/uploads` over the whole uploads tree with `index:false,
  dotfiles:'ignore'` (`index.js:483-487`).
- The frontend stores only the server's path (`/uploads/avatars/x.jpg`) and
  renders it through `src/services/assets.ts`:
  `resolveAssetUrl()` rewrites a relative path onto `/api/uploads/…`, prefixes
  it with the configured API base, refuses any scheme that is not `http(s)`,
  allows only the six known kinds, and rejects `..` segments. It returns
  `null` → the UI shows initials. **Do not put a raw `avatarUrl` from Mongo into
  an `img src`.** Same rule applies to `proof_url` (§7 of the backend handoff).
- Files land in `backend/uploads/` (gitignored). A redeploy that does not
  preserve that directory loses every avatar; attach it to a volume or a bucket.

### 3.5 Mallpoints price and purchase quotes
- Single source of truth: `backend/src/services/economyConstants.js`
  (`getMallpointPriceKes()`, default `2`, env `MALLPOINT_PRICE_KES`).
- Exposed to the UI in two places, both consumed now:
  `GET /api/economy/state` → `pointPriceKes` (`routes/economy.js:112,172`), read
  by `src/hooks/useLivePrice.ts`; and `POST /api/mallpoints/purchase/reserve` →
  `amountKes`, `mallpointsAmount`, `pricePerMallpoint`
  (`routes/mallpointsPurchase.js:179-191`).
- The client quotes from the server rate and, once a quote exists, treats the
  **reserve response as the truth** — if the rate moved after page load, the STK
  push settles the quote's amount, and the UI says the rate was updated.
- The KSh 10 floor is server-side (`mallpointsPurchase.js:161`); the client
  derives the minimum in MLPTS from the live rate rather than hardcoding it.

### 3.6 Other routes now depended on
`GET /api/auth/me`, `POST /api/auth/*`, KYC routes, `GET /api/wallet/balance`,
`/api/tx/history`, `/api/staking/*`, `/api/governance/*`, `/api/mines/*`
(incl. `campaigns/available`, `opens/pending`, impressions),
`/api/task-assignment/*`, `/api/careers/*`, `/api/contracts/*`,
`/api/notification-preferences/*` + `/effective`, `/api/settings/*`,
`/api/devhub/keys`, `/api/market/price`, `/api/economy/state`,
`/api/explorer/latest`, `/api/validators/*`. The stub enumerates them.

---

## 4. Wallet keys and signing — invariants the other team must not break

1. Nothing reads `store.state.wallet.mnemonic` for signing. Everything goes
   through `requestMnemonic()` (`src/services/mnemonicAccess.ts`), which asks
   for the PIN, decrypts in memory and drops the plaintext when the call ends.
2. The mnemonic is only ever stored encrypted with the PIN-derived key
   (`wallet.pinEncryptedMnemonic`). A credential that cannot unlock the wallet
   cannot be saved — see `src/features/wallet/*` tests.
3. Wallet creation and wallet linking both require a **server-verified KYC
   status** first (owner rule), client *and* server. A referral code is assigned
   only after a wallet is successfully connected.
4. Cross-tab store sync (`src/App.tsx` → `storeSync.initialize()`) broadcasts
   snapshots on the same origin. An inbound snapshot must never replace a
   server-verified identity. This is why §9 of the backend handoff asks for the
   `/downloads/node/` bundles to move to a separate origin.
5. Chain parameters for client-side signing come from `src/services/config.ts`
   (`VITE_CHAIN_ID`/`VITE_CHAIN_PREFIX`/`VITE_GAS_PRICE`, defaults
   `mallchain-1` / `mall` / `0.01stake`) and must match
   `backend/src/config/index.js:74-77`.

---

## 5. Build and environment requirements

New file: `mallchain-os-v14/.env.example` (all variables, commented).

- `VITE_API_BASE_URL` is **mandatory**. It is checked twice, added this pass:
  1. **at build time** — `vite.config.ts`'s `guardProductionApiUrl()` plugin
     fails `vite build` when the variable is unset, unparseable, or a loopback
     address (`localhost`, `127.x`, `0.0.0.0`, `::1`). A bundle bakes its API
     origin into every request, so an artifact aimed at the build machine is
     dead the moment it is uploaded; that is now a failed build step rather
     than a live outage.
  2. **at page load** — `src/services/config.ts:44-95` still refuses to start
     with a missing/invalid/loopback value, so an artifact that predates this
     check cannot fail silently either.
- `VITE_ALLOW_LOCAL_API=1` is the single opt-out, and both checks honour it.
  Set it only for a deliberate local build — the `vite preview` smoke test
  below — and never in an uploaded build.
- Vite inlines these at build time: a bundle built against the wrong API origin
  must be **rebuilt**, not reconfigured on the server.
- `npm ci` in `mallchain-frontend/mallchain-os-v14`. Node 20+ (verified on
  24.x), Vite 8.3.6, React 19.x, vitest via `vite.config.ts`'s `test` block.
- Toolchain note for this machine: `mallchain-os-v14/node_modules` is a symlink
  into `mallchain-audit/mallchain-os-v14/node_modules`, which has **no
  `vite/bin`**. The working binaries are in `mallchain-frontend/node_modules`.
  From a clean clone with a normal `npm ci` this does not apply.

## 6. Running, testing, building

```sh
# from mallchain-frontend/mallchain-os-v14   (no VITE_API_BASE_URL needed)
npm run dev            # http://localhost:5173, /api proxied → :4000

# API for local work without the real backend (lives one level ABOVE the repo):
#   "../New Tab_files/stub-api.mjs" — a byte-faithful mock of the routes in §3.6
node ../path/to/stub-api.mjs           # :4000

npm run typecheck      # tsc --noEmit
npm run test           # vitest watch
npm run test:run       # full suite
npm run build          # tsc --noEmit && vite build → dist/
npm run preview        # serves dist/ on :4173, /api proxied → :4000 (added this pass)
```

`vite.config.ts` now has a `preview` block mirroring the dev proxy. Without it
the only way to exercise a production build against a local API was to cross
origins, and the API is not CORS-permissive — a preview would have looked fine
while every request failed. To smoke-test a build locally:

```sh
VITE_API_BASE_URL=http://localhost:4173 VITE_ALLOW_LOCAL_API=1 npm run build && npm run preview
```

Test suite as of this writing: **85 files, 1664 passing + 8 todo, 0 failing**
(~25 min single-threaded on this machine; use
`--pool=threads --no-file-parallelism --maxWorkers=1` to reproduce it here).
Component tests drive real interactions and assert on the arguments passed to
the signing/API services — e.g. `src/features/staking/Staking.test.tsx` pins the
ledger asset, `src/pages/MallpointsPurchase.test.tsx` pins the server-rate
behaviour, `src/components/WalletIdentity.test.tsx` pins the privacy fallback.

---

## 7. Surfaces removed on purpose — do not reintroduce

| Removed | Why |
|---|---|
| `/social-tasks` page ("Follow @mallchain on X +25 MLPTS", Telegram +40, referral +30, email+phone +50) | No backend pays any of those rewards. The numbers were invented in the client. `src/features/misc/MiscViews.tsx`, route + lazy import deleted. |
| `/analytics` page (network stats panel) | No endpoint served any of it. Deleted, not stubbed. |
| Hardcoded marketplace catalog with genesis-address sellers | Those addresses are funded accounts on the real chain; a "demo" listing could send value to someone's wallet. `Marketplace.tsx` now defaults to `products = []` and states that the catalog endpoint is missing. |
| Genesis addresses in DevHub example commands (`commandParser.ts`) | A one-tap example used to be able to send real MALL to a funded genesis account. The examples now use well-formed but unowned addresses (`mall1example…`), which the checksum rejects if anyone tries to sign one. |
| `MLPTS` used as the ledger asset for a MALL stake (`Staking.tsx`) | Mislabelled a real-money action and corrupted the local balance view. Fixed with a test that pins it. |
| Static tokenomics prose on Economy, static MLPTS price on the purchase page | Both now derive from `/api/economy/state` / the reserve response. |

`Learning` still marks lesson progress locally; the page says so ("marked on
this device, not synced to your account") instead of implying a server record.
If the other team adds a progress endpoint, delete that sentence with it.

## 8. Product rules that are owner decisions, not code review opinions

- **KYC before wallet.** No wallet creation or linking before the server reports
  a verified identity. Both gates exist client and server; keep them.
- **Referral code only after a wallet is connected.** A user without a wallet
  does not get a code to share.
- **Naming.** The product says **MALL** to people. **MLCNS** is the on-chain
  ticker and API field name and belongs in technical/builder lines only.
- Nothing may display a number the server did not give it. If a read fails, the
  panel says which read failed. That is the standard the removed pages failed.

## 9. Known gaps the other team owns

1. **`GET /api/transactions/:id` returns the raw Mongo document**
   (`backend/src/routes/transactions.js:103-116` — `res.json(tx)`), so the key
   serialises as `_id` and clients reading `transaction.id` get an empty
   identifier. Either wrap in `ok({ ... })` with an `id` field or keep the flat
   body and document it (see §2).
2. **No marketplace catalog endpoint.** `GET /api/marketplace/products` (with
   seller address, price, category, images from `/uploads/products`) is the only
   thing standing between the current "Coming Soon" empty state and a working
   buyer view. `Marketplace.tsx` takes `products` as a seam so it lights up
   without new UI work.
3. **Order ids are local** (`ord-…` generated in the client). Escrow settlement
   works; persistence of an order across devices does not. Needs a server-issued
   order id.
4. **Mallpoints rate has no dedicated public endpoint.** The UI reads it from
   `/api/economy/state`. A `GET /api/mallpoints/price` would let the landing
   page and the purchase screen quote the same number without pulling the whole
   economy state.
5. **Socket.IO**: `src/services/socket.ts` connects to `config.apiBaseUrl`.
   Against a host without a socket server it logs a connection error and backs
   off (1s→30s) — that is what the local stub shows. On HTTPS the page **cannot
   open `ws://`**: the API origin must be `https://` and the proxy must upgrade
   `/socket.io` to `wss://`. If the SPA and API are on different origins,
   Socket.IO CORS needs the app's origin explicitly, with credentials.
6. **Stub coverage**: `stub-api.mjs` has no mallpoints-purchase/economy routes
   and no `/api/explorer/latest`; it also sends no CORS headers. Extend it in
   step with new routes so the browser verification stays possible without a
   full chain node.
7. **`storeSync` origin collision** — see backend handoff §9: `/downloads/node/`
   must move to its own origin.
8. Items 1-7 of `backend-handoff-2026-11-09.md` (price window, market cap,
   `/api/tx/history` shape, PIN-verify vs 401 discrimination, notification
   archive/unread, dead notification code) are still open, and each one has a
   conservative frontend workaround that should be deleted when the endpoint
   lands.

## 10. Export to Namecheap (static hosting for the SPA)

The app is a static SPA. Nothing in it needs Node on the hosting account; it
needs a backend origin that serves `/api` over HTTPS.

1. Set the API origin — **the origin you control**, e.g.
   `VITE_API_BASE_URL=https://api.mallchain.network` (no trailing slash).
   Ownership of `mallchain.network` has never been verified from this workspace;
   confirm the domain and where its API actually runs before building. `vite
   build` refuses to produce a loopback-targeted artifact without
   `VITE_ALLOW_LOCAL_API=1` (§5), so the build step itself tells you the origin
   is wrong; a build aimed at a reachable-but-wrong origin still has to be
   checked in the deployed page's network tab before anyone is told the site is
   down.
2. `npm ci && VITE_API_BASE_URL=… npm run build` (runs `tsc --noEmit` first).
3. Upload the **contents of `dist/`** to `public_html/`.
   `dist/` contains `index.html`, `assets/*` (hashed), `.htaccess`,
   `favicon.svg`, `mallchain.svg`, `robots.txt`, `sitemap.xml`,
   `.well-known/security.txt`, `downloads/`.
4. `.htaccess` is generated for you: it is the single tracked copy at
   `mallchain-os-v14/public/.htaccess`, which Vite copies into `dist/`. (The
   previous duplicate at `mallchain-os-v14/.htaccess` is deleted — edit the
   `public/` one only.) It provides HTTPS redirect, `www.` → apex canonical,
   SPA fallback, MIME types, `nosniff`/`X-Frame-Options`/`Referrer-Policy`/
   `Permissions-Policy`/HSTS, hashed assets cached 1 year and `text/html` 5
   minutes. Because routing is hash-based and `base: './'`, the app also works
   from a subdirectory without touching those rules.
5. Backend side of the same deployment: `backend/uploads/` must survive
   redeploys (§3.4), `MALLPOINT_PRICE_KES`, `CHAIN_ID`/`CHAIN_PREFIX`, an
   authenticated Redis, and TLS termination that upgrades `/socket.io`.
6. Post-deploy checklist: register → age gate → KYC → create wallet → send →
   stake (ledger row says MALL) → purchase Mallpoints (rate from server,
   quote totals from server) → upload avatar (reloads as a picture) → connect a
   social handle, sign out, sign in again (still there) → transaction row shows
   the counterparty's picture from `/api/identity/resolve` → a private account
   shows initials only.
7. `dist/` is a build output and is gitignored — never commit it, and never
   publish the `node-download` bundles from this workspace (see §11).

Bundle today: `dist` ≈ 4.1 MB, largest chunks `txConfirmation` 1,053 kB and
`index` 817 kB (gzip 137 kB / 257 kB). The 700 kB warning is intentional
signal, not an error. Splitting `@cosmjs`/hash-wasm further
(`build.rollupOptions.output.manualChunks`) is the next step if it matters.

## 11. Owner-only security items — still open, deliberately not touched here

- **Four genesis seed phrases remain in git history.** They were removed from
  the working tree (C1) and the unauthenticated operator-signed transfer is
  closed (C2), but the phrases in past commits are still live credentials.
  Rotating them and purging history is an owner action with the chain and the
  hosting accounts; it was **not** attempted from this workspace.
- Do not run the published node-download bundles here, and do not treat
  "mallchain.network" as a verified-owned domain. Deployment work must route
  through the source repo and a staging origin you control.
- H1-H9 (fee distribution, OAuth state, `proof_url` scheme, PII in status
  endpoints, Redis auth, `curl | sudo bash` in install docs, EKS exposure,
  release signing, superadmin bootstrap) are fixed on this branch.
  Re-verify each against the deployed config, not the code alone.

## 12. What was verified and what was not

Verified here:
- Frontend typecheck clean; full frontend suite green (85 files / 1664 tests)
  before the config guard, and re-run after it.
- Production build succeeds; `VITE_API_BASE_URL` is inlined into the shipped
  bundle; `dist/.htaccess` is emitted.
- The new build guard was exercised four ways: unset `VITE_API_BASE_URL` →
  build fails; `http://localhost:4000` → build fails with the loopback message
  and exit 1; the same value plus `VITE_ALLOW_LOCAL_API=1` → build succeeds;
  `https://api.example.com` → build succeeds.
- The built bundle, served by `vite preview` on :4173 with `/api` proxied to
  :4000, boots, registers, reaches the dashboard and renders live values (block
  height, prices, notifications) — i.e. the production code path with an
  absolute API base, not just the dev server. Re-loaded after the guard landed,
  to confirm the guard does not fire when the override is set.
- Mock-data removal was confirmed in the browser: `/analytics` and
  `/social-tasks` fall back to Dashboard, the marketplace shows its empty
  state, Learning states its local-only progress.

Not verified here:
- **The real backend test suite was never run** — its dependencies are not
  installed in this workspace. `routes/identity.js`, `PUT /settings/privacy`,
  the social routes and the upload limits were verified by reading the source
  and by a byte-faithful stub, not by executing Jest.
- No transaction was ever signed or broadcast against a live chain node from
  this workspace; signing flows were verified against the stub and unit tests.
- Real M-Pesa/STK push settlement, avatar files on a production disk, and
  Socket.IO over TLS are untested — they need the deployed backend.
- Domain ownership and hosting credentials: not checked, not assumed.
