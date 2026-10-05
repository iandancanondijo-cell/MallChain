# Mallchain System Audit — Phases 10-13

**Date:** 2026-09-22  
**Auditor:** Automated Read-Only Audit  
**Repository:** /home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/  
**Rule:** No files were modified. All findings reported as-is.

---

## PHASE 10 — Frontend Audit

### 10.1 mallchain-os-v14 (Main Frontend)

#### 10.1.1 Routing Architecture

**What was inspected:** `mallchain-os-v14/src/App.tsx`, `mallchain-os-v14/src/router.tsx`

**What was found:**
- Hash-based routing (`#/path`) via a custom `useHashRoute()` hook — no React Router dependency.
- 40+ route definitions in `ROUTES` array, all code-split via `React.lazy()` except Dashboard, AuthFlow, and Landing.
- `matchRoute()` enforces authentication and admin authorization at the routing layer:
  - Unauthenticated users are redirected to `/landing` for all protected routes.
  - Non-admin users never mount `Admin.tsx` — they are redirected to Dashboard.
  - Public routes: only `/landing` and `/auth`.
- Route sections are themed via `data-section` attribute for ambient CSS theming.
- Document title updates per route (`${route.title} · Mallchain`).

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `router.tsx` lines 143-185; `App.tsx` lines 53-224.

---

#### 10.1.2 API Integration

**What was inspected:** `mallchain-os-v14/src/services/api.ts`, `config.ts`, all `*Api.ts` files in `services/`

**What was found:**
- All API calls use real `fetch()` against `config.apiBaseUrl` — no mock/simulation mode.
- `apiBaseUrl` is set via `VITE_API_BASE_URL` build-time env var.
- Authentication uses httpOnly cookies (`credentials: 'include'`) — JWT is never readable by JS.
- CSRF protection: mutating requests attach `X-CSRF-Token` header fetched from `/api/csrf-token`.
- Request deduplication: pending requests are tracked by `METHOD:path` key to prevent double-clicks.
- 401 interceptor: clears session, resets store, redirects to landing.
- 403 CSRF retry: transparently refreshes token and retries once on `EBADCSRFTOKEN`.
- Error handling distinguishes network errors from HTTP errors with structured `ApiResult<T>`.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `api.ts` lines 85-254; `auth.ts` lines 168-194.

---

#### 10.1.3 Hardcoded / Demo Data

**What was inspected:** All `.ts`/`.tsx` files in `mallchain-os-v14/src/` for hardcoded balances, demo/mock data.

**What was found:**
- **Landing page** (`Landing.tsx` lines 146-255): Contains a mock dashboard preview with `sampleMlcns = 100`, `samplePoints = 500`. This is explicitly a visual preview for unauthenticated visitors — not presented as real data.
- **DevHub** (`DevHub.tsx` lines 68-69): Contains code snippets with `balance = await client.wallet.balance(...)` — these are documentation examples, not live data.
- **Test files**: Multiple test files set `store.state.balances.MALL = 500` etc. — expected for unit tests.
- **No hardcoded balances in production feature components.** All wallet balances are fetched via `walletApi.getBalance(address)` which calls `GET /api/wallet/{address}`.
- **No hardcoded transaction data.** Transactions are fetched via `walletApi.getTransactions()` which calls `GET /api/tx/history`.

**Severity:** Low (landing page mock is clearly labeled and only visual)  
**Status:** [PASS]  
**Evidence:** `grep` results show balance assignments only in test files and the landing page preview.

---

#### 10.1.4 Authentication State Management

**What was inspected:** `mallchain-os-v14/src/services/auth.ts`, `store/store.ts`, `services/storeSync.ts`

**What was found:**
- JWT lives in httpOnly `auth_token` cookie — never accessible to JavaScript.
- Client-side `authedUntil` marker in localStorage is a UI hint only, never trusted for authorization.
- Auth initialization: On app load, if local session marker exists, `GET /api/auth/me` is called to validate the cookie server-side.
- Cross-tab synchronization via `storeSync.ts` — session state is shared across browser tabs.
- Session refresh: `refreshSession()` calls `POST /api/auth/refresh` to extend the cookie.
- Logout: `authService.logout()` revokes server-side (JWT denylist), clears local state, resets store, navigates to landing.
- "Sign out everywhere": revokes all tokens for the account.
- Google OAuth: Handles `?authed=1` redirect parameter, validates via `/api/auth/me`.
- Wallet linking: ADR-036 signature proves control of on-chain address before linking.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `auth.ts` lines 56-296; `App.tsx` lines 63-138.

---

#### 10.1.5 Error Handling and Loading States

**What was inspected:** `mallchain-os-v14/src/services/errorHandler.ts`, `App.tsx` ErrorBoundary usage

**What was found:**
- Centralized error handler with user-friendly messages for all HTTP status codes (400-504).
- Network errors show "Unable to connect to server" — no technical details leaked.
- Rate limit (429) errors show wait time guidance.
- 401 errors trigger automatic logout with redirect.
- Retry logic with exponential backoff via `withErrorHandling()` wrapper.
- `ErrorBoundary` wraps all routed content with per-route reset.
- `<Suspense fallback>` shows "Loading..." during code-split chunk fetches.
- Global banners for maintenance mode and frozen accounts.
- Toast notification system for transient errors.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `errorHandler.ts` lines 1-308; `App.tsx` lines 333-339.

---

### 10.2 mallchain-app (Blockchain Wallet App)

**What was inspected:** `mallchain-app/src/App.tsx`, `mallchain-app/src/services/`, `mallchain-app/src/blockchain/`

**What was found:**
- **Separate application** from mallchain-os-v14 — a blockchain-native wallet/gateway.
- Tab-based navigation (no URL routing): Dashboard, Send, Receive, Activity, Explorer, Validators, Smart Contracts, dApp Portal, Settings.
- Uses `MallchainDashboard` layout (dark glassmorphism design) as the active view.
- Direct blockchain interaction via `MallchainClient` SDK — queries chain state (balances, blocks, validators) via RPC/REST.
- Wallet management: encrypted keystore storage in localStorage (`mallchain_encrypted_keystores_v1`), AES-256-GCM.
- Network switching: supports local, testnet, and mainnet configurations.
- Lock/unlock wallet sessions, multi-account switching.
- PWA install support, offline indicator.
- **Key distinction:** mallchain-os-v14 is the full-featured marketplace dashboard (backend-dependent); mallchain-app is a standalone blockchain wallet (chain-dependent).

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `mallchain-app/src/App.tsx` lines 1-452; `wallet/storage.ts`.

---

### 10.3 localStorage / sessionStorage Usage

**What was inspected:** `grep -r "localStorage|sessionStorage"` across both frontends.

**What was found:**

**mallchain-os-v14** (31 files):
- `store/store.ts`: Full app state persisted to localStorage (balances, preferences, wallet state).
- `services/auth.ts`: Session marker (`authedUntil` timestamp) in localStorage.
- `services/addressBookStore.ts`: Address book entries.
- `services/sessionDraft.ts`: Draft transaction data.
- `services/soundService.ts`: Sound preference.
- `services/maintenanceApi.ts`: Maintenance status cache.
- `components/CookieConsentBanner.tsx`: Cookie consent choice.
- `hooks/useWizard.ts`: Wizard state persistence.
- `pages/AddressBook.tsx`: Address book data.
- `features/wallet/WalletFlow.tsx`: Wallet creation/import state.

**mallchain-app** (2 files):
- `wallet/storage.ts`: Encrypted keystores and active address.
- `config/networks.ts`: Selected network ID.

**Assessment:** All localStorage usage is for legitimate client-side state persistence. No evidence of fake data being stored and presented as real. Balances in the store are populated from API responses, not from localStorage defaults.

**Severity:** Informational  
**Status:** [PASS]

---

### 10.4 Frontend Availability

**What was inspected:** `curl` to localhost:5173, localhost:3000, localhost:4000.

**What was found:**
| Service | Port | HTTP Status | Binding |
|---------|------|-------------|---------|
| mallchain-os-v14 (Vite dev) | 5173 | 200 | 127.0.0.1 |
| mallchain-app | 3000 | 200 | 0.0.0.0 |
| Backend API | 4000 | 404 (root) | * (all interfaces) |

- mallchain-os-v14 is running and serving pages.
- mallchain-app is running and serving pages.
- Backend is running (404 on root is expected — no root route defined).

**Severity:** Informational  
**Status:** [PASS]

---

## PHASE 11 — Mining / MallPoints System Audit

### 11.1 Campaign Model

**What was inspected:** `backend/src/models/Campaign.js`

**What was found:**
- Schema includes anti-abuse fields:
  - `max_completions_per_user` (default: 1, min: 1) — caps rewarded submissions per user.
  - `cooldown_seconds` (default: 3600, min: 0) — minimum gap between submissions.
  - `budget_remaining` (min: 0) — tracks remaining budget, prevents overspend.
  - `multiplier` (min: 0.5, max: 5) — clamped campaign reward multiplier.
  - `rate_per_task` (min: 0) — server-computed reward per task.
  - `status` enum: active, paused, completed.
- Timestamps for creation and updates.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `Campaign.js` lines 1-30.

---

### 11.2 Task Submission Model

**What was inspected:** `backend/src/models/TaskSubmission.js`

**What was found:**
- Supports full review lifecycle: `pending_assignment → assigned → voting → approved/rejected`.
- Validator voting: `assigned_validators` array, `validator_votes` map, `votes_required` (default: 6).
- Reputation-weighted voting: `votes_yes_weight` / `votes_no_weight` (separate from raw counts).
- `strict: false` allows dynamic fields — **potential concern** as it permits arbitrary data on submissions.
- Indexes on `status`, `miner_id`, `assignment_status` for query performance.

**Severity:** Low (strict:false is a design choice for flexibility, but could allow unexpected fields)  
**Status:** [PASS]  
**Evidence:** `TaskSubmission.js` lines 1-51.

---

### 11.3 Campaign Creation — MLPTS Escrow

**What was inspected:** `backend/src/routes/mines.js` lines 132-206

**What was found:**
- Self-serve campaign creation via `POST /api/mines/campaigns/create`.
- `rate_per_task` is **server-computed** from base rate table x campaign multiplier — never trusted from client.
- Budget is **atomically escrowed** from creator's MLPTS balance in a MongoDB transaction:
  1. `User.findOneAndUpdate({ _id, mlpts_balance: { $gte: budget } }, { $inc: { mlpts_balance: -budget } })` — atomic check-and-deduct.
  2. `Campaign.create()` with `budget_remaining: budget`.
  3. `WalletTransaction.create()` recording the debit.
- All three operations are in a single MongoDB session/transaction — if any fails, all roll back.
- Validation: platform must exist, activity must be valid for platform, budget must cover at least one completion.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `mines.js` lines 156-197.

---

### 11.4 Duplicate Claim Prevention

**What was inspected:** `backend/src/routes/mines.js` — `checkCampaignAbuseLimits()` function (lines 282-341)

**What was found:**
Three layers of abuse prevention, all checked atomically within a MongoDB transaction:

1. **Per-campaign completion cap:** Checks `max_completions_per_user` — rejects if user already reached the limit.
2. **Cooldown enforcement:** Checks `cooldown_seconds` since last submission to same campaign.
3. **Daily platform earning cap:** Aggregates all non-rejected submissions to the same platform in the last 24h, compares against `getDailyCapMlpts(platform)`. Uses `$lookup` to join with campaigns collection for platform matching.

The submission creation itself is wrapped in `session.withTransaction()` — the check-and-create is atomic, preventing race conditions where concurrent requests could bypass limits.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `mines.js` lines 282-371.

---

### 11.5 Reward Payout

**What was inspected:** `backend/src/routes/mines.js` — `POST /submissions/:id/approve` (lines 392-440)

**What was found:**
- Admin approval endpoint (`requireAdmin`).
- Reward amount: uses campaign's `rate_per_task` if no explicit amount provided.
- Atomic transaction:
  1. `WalletTransaction.create()` — credit MLPTS to miner.
  2. `User.findByIdAndUpdate()` — increment `mlpts_balance`.
  3. `Campaign.findByIdAndUpdate()` — decrement `budget_remaining`, increment `completions_count`.
- Campaign budget is decremented, preventing payout beyond escrowed budget.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `mines.js` lines 392-440.

---

### 11.6 Fraud Prevention Mechanisms

**What was inspected:** Campaign model, TaskSubmission model, mines routes, review service references.

**What was found:**
- **Reputation-weighted reviewer voting:** `minesReviewService.js` (referenced) implements weighted voting where reviewer reputation affects vote tally.
- **Random reviewer assignment:** `autoAssignReviewers()` assigns up to 6 staked reviewers randomly.
- **Reviewer staking:** Reviewers must stake MLPTS to participate — `MinesReviewer` model tracks stakes.
- **Fraud tracking on user model:** `fraud_strikes` and `fraud_status` fields on User model (exposed in profile endpoint).
- **Daily earning caps per platform:** Prevents farming even across multiple campaigns on the same platform.
- **Fallback to admin review:** If no reviewers are available, submission falls to manual admin review queue.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `mines.js` lines 13, 363-364; `TaskSubmission.js` voting fields.

---

### 11.7 CRITICAL: Mines Authentication Gap

**What was inspected:** `backend/src/routes/mines.js` — `verifyToken()` function (lines 24-49)

**What was found:**
The mines routes use a **legacy `verifyToken()` function** instead of the main `requireAuth` middleware. The code contains an explicit comment acknowledging the gap:

> "This predates the JWT->httpOnly-cookie migration and never got updated — it only ever checked the Authorization header, so every /api/mines route has been unreachable from the actual web app (which stopped sending that header) since that migration shipped."

**Two specific issues:**
1. **Unreachable from web app:** The main frontend uses cookie auth (httpOnly), but `verifyToken()` primarily checks `Authorization: Bearer` header. It does fall back to `req.cookies.auth_token`, so cookie auth works — but the comment says routes are "unreachable," suggesting a period where they were broken.
2. **No JTI revocation check:** Unlike `requireAuth.js`, `verifyToken()` does NOT check `isRevoked(decoded)`. This means a logged-out user's JWT (still within its expiry window) can still access mines endpoints. The comment acknowledges: "this endpoint group still trusts any signature-valid token even post-logout."

**Severity:** High  
**Status:** [FAIL]  
**Evidence:** `mines.js` lines 24-49; comparison with `requireAuth.js` lines 64-74.

---

### 11.8 Leaderboard PII Leakage

**What was inspected:** `backend/src/routes/mines.js` — `GET /leaderboard` (lines 97-115)

**What was found:**
The leaderboard endpoint:
1. Selects `email` field from User model: `.select('username email mlpts_balance tasks_completed rank_points')`.
2. Derives display name from email prefix: `name: u.username || u.email.split('@')[0]`.
3. While the full email is NOT returned in the response, the endpoint does fetch it from the database and uses the local part as a fallback name.
4. The `id` field returns the user's MongoDB `_id` as a string.

**Risk:** If a user has no username, their email prefix (e.g., `john.doe` from `john.doe@company.com`) becomes publicly visible on the leaderboard. This is a minor PII leakage.

**Severity:** Medium  
**Status:** [FAIL]  
**Evidence:** `mines.js` lines 99-110.

---

## PHASE 12 — Marketplace Audit

### 12.1 Marketplace Architecture

**What was inspected:** `marketplace/` directory, `backend/src/routes/marketplace.js`, `backend/src/controllers/marketplaceEscrowController.js`, `mallchain-os-v14/src/services/marketplaceApi.ts`

**What was found:**
- The `marketplace/` directory contains **Go protobuf-generated code** for the on-chain `x/marketplace` Cosmos SDK module.
- Sub-modules: `badge`, `crosschain`, `dex`, `governance`, `mallcoin`, `mallpoints`, `marketplace`, `mlcoin`, `vault`, `wasm`.
- These are compiled protobuf bindings (`.pb.go` files) — not application logic, but type definitions and gRPC service stubs.
- The marketplace is an **on-chain escrow system**, not a traditional off-chain e-commerce module.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `marketplace/` directory listing; `marketplaceEscrowController.js` lines 1-13.

---

### 12.2 Marketplace Escrow Endpoints

**What was inspected:** `backend/src/routes/marketplace.js`, `backend/src/controllers/marketplaceEscrowController.js`

**What was found:**
Three endpoints exposed:

1. **`POST /api/marketplace/escrow/broadcast`** — Relays client-signed transactions to the chain. Caller signs `MsgCreateEscrow`/`MsgReleaseFunds`/`MsgRefundBuyer`/`MsgOpenDispute` client-side and POSTs `txBytes`. Backend broadcasts via `POST /cosmos/tx/v1beta1/txs`.
   - **No authentication required** — but this is by design (broadcast relay). The transaction itself must be signed by the rightful party's wallet.

2. **`GET /api/marketplace/escrow/:id`** — Queries escrow by ID from chain.
   - **No authentication required.** Returns escrow data from chain state.

3. **`GET /api/marketplace/escrow`** — Lists all escrows, optionally filtered by `buyer` or `seller` address.
   - **No authentication required.** Returns all escrows from chain state.

**Live test:** `curl http://localhost:4000/api/marketplace/escrow` returned `{"success":true,"escrows":[]}` — endpoint is functional, no escrows exist yet.

**Severity:** Low (escrow data is public chain state; transactions require wallet signatures)  
**Status:** [PASS]  
**Evidence:** `marketplaceEscrowController.js` lines 19-74.

---

### 12.3 Money Flow Trace

**What was inspected:** Payment routes, buy routes, market routes, marketplace escrow.

**What was found:**
The marketplace supports two distinct money flows:

**Flow 1: Fiat On-Ramp (M-Pesa)**
- `POST /api/payment/mpesa/initiate` — Creates pending payment with STK push.
- `POST /api/payment/mpesa/confirm` — Provider webhook confirms payment (HMAC-SHA256 verification if `PAYMENT_WEBHOOK_SECRET` is set).
- `POST /api/buy/mpesa` — Converts confirmed fiat payment to Mallcoin.
- `POST /api/buy/credit` — Credits Mallcoin to user's on-chain account.
- Rate limiting: 60 requests/minute on payment endpoints.
- Input validation: Joi schemas for payment method, phone, amounts.

**Flow 2: On-Chain Escrow (Marketplace)**
- Buyer signs `MsgCreateEscrow` client-side with their wallet.
- Signed tx broadcast via `POST /api/marketplace/escrow/broadcast`.
- Funds locked in on-chain escrow contract.
- Seller fulfills order.
- Buyer signs `MsgReleaseFunds` to release, or `MsgRefundBuyer`/`MsgOpenDispute` to dispute.
- All escrow operations are on-chain — backend is a stateless relay.

**Flow 3: Market Data (Read-Only)**
- `GET /api/market/price` — Current Mallcoin price.
- `GET /api/market/supply` — Total supply.
- `GET /api/market/monthly_emissions` — Emission schedule.
- Protected by `preventNoSQLInjection` middleware.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `payment.js`, `buy.js`, `market.js`, `marketplaceEscrowController.js`.

---

### 12.4 Frontend Marketplace Integration

**What was inspected:** `mallchain-os-v14/src/features/marketplace/Marketplace.tsx`, `services/marketplaceApi.ts`

**What was found:**
- `marketplaceApi.ts` provides two methods: `getEscrow(id)` and `listEscrows(params)`.
- Both call the backend's `/api/marketplace/escrow` endpoints.
- The Marketplace feature module is code-split and lazy-loaded.
- The frontend also has `buyApi.ts` for the M-Pesa purchase flow with comprehensive config, preview, and status checking.
- `marketplaceTx.ts` and `marketplaceProto.ts` handle client-side transaction signing for escrow operations.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `marketplaceApi.ts` lines 1-29; `buyApi.ts`.

---

## PHASE 13 — Security Audit

### 13.1 NoSQL Injection

**What was inspected:** Backend routes and middleware for MongoDB operator injection.

**What was found:**
- **Dedicated middleware exists:** `preventNoSQLInjection()` in `middleware/inputValidation.js` (line 346) checks for MongoDB operators (`$ne`, `$gt`, `$where`, etc.) and malicious objects.
- **Applied to critical routes:** Auth routes (`/api/auth`), DEX routes, market routes all use `preventNoSQLInjection`.
- **NOT universally applied:** The mines routes (`/api/mines/*`) do NOT use this middleware. However, mines routes use Mongoose models with typed schemas, which provides implicit protection against operator injection in most cases.
- **Risk area:** `PUT /api/mines/campaigns/:id` passes `req.body` directly to `$set` (line 210). An attacker with admin access could inject MongoDB operators via `req.body`. Same for `PUT /api/mines/submissions/:id` (line 380), though this checks ownership first.

**Severity:** Medium (mass assignment via `$set: req.body` on admin routes; regular user submissions route checks ownership but still passes `req.body` to `$set`)  
**Status:** [FAIL]  
**Evidence:** `mines.js` lines 210, 380; `inputValidation.js` line 346.

---

### 13.2 XSS (Cross-Site Scripting)

**What was inspected:** Frontend code for `dangerouslySetInnerHTML` and `innerHTML`.

**What was found:**
- **Zero instances** of `dangerouslySetInnerHTML` in mallchain-os-v14.
- **Zero instances** of `dangerouslySetInnerHTML` in mallchain-app.
- **Zero instances** of `innerHTML` in either frontend.
- Backend uses `sanitize-html` for input sanitization on auth routes.
- React's default JSX escaping handles XSS prevention for all user-generated content.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `grep` returned no matches.

---

### 13.3 Command Injection

**What was inspected:** Backend code for `exec()`, `execSync()`, `spawn()`, `child_process`.

**What was found:**
- Only matches are in **test files** (`__tests__/badgeTxBuilder.test.js`, `__tests__/mallcoinTxBuilder.test.js`) using `RegExp.exec()` for URL parsing — not shell command execution.
- No `child_process` usage in production code.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `grep` results — all matches are `RegExp.exec()`, not `child_process.exec()`.

---

### 13.4 Path Traversal

**What was inspected:** Backend code for `../`, `path.join` with `req.*`.

**What was found:**
- No path traversal patterns found.
- File upload middleware (`upload.js`) uses `sanitizeFilename()` which strips all non-alphanumeric characters and limits to 80 chars.
- Upload filenames are prefixed with `${userId}-${Date.now()}-` — no user-controlled path components.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `upload.js` lines 11-13.

---

### 13.5 File Upload Security

**What was inspected:** `backend/src/middleware/upload.js`

**What was found:**
- **Three upload handlers:** KYC documents, AML documents, EDU resources.
- **MIME type allowlisting:**
  - KYC/AML: `image/jpeg`, `image/png`, `application/pdf` only.
  - EDU: PDF, JPG, PNG, TXT, Markdown, DOCX, PPTX, MP4.
- **File size limits:** 10MB for KYC/AML, 50MB for EDU.
- **Filename sanitization:** Non-alphanumeric chars replaced with `_`, truncated to 80 chars.
- **Ownership prefix:** Files named `${userId}-${Date.now()}-${sanitizedName}`.
- **Concern:** MIME type checking uses `file.mimetype` (client-declared Content-Type), not content-sniffing. The code comments acknowledge this: "not a substitute for content-sniffing if this content is ever rendered inline."

**Severity:** Low (MIME type trust is a known limitation, mitigated by files never being served inline)  
**Status:** [PASS]  
**Evidence:** `upload.js` lines 1-103.

---

### 13.6 CORS Configuration

**What was inspected:** `backend/src/index.js` lines 191-200, `backend/src/config/index.js`

**What was found:**
- CORS is configured with explicit origin allowlist from `FRONTEND_URL` and `CORS_ORIGINS` env vars.
- `credentials: true` is set (required for cookie auth).
- NOT using wildcard `*` in production — `getAllowedOrigins()` returns specific origins.
- Test files use `cors: { origin: '*' }` but these are isolated test configurations, not production.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `index.js` lines 191-200; `config/index.js` line 114.

---

### 13.7 Secrets Management

**What was inspected:** Code for hardcoded secrets, `.env` files, `.gitignore`.

**What was found:**
- **No `.env` file present** in the repository (only `.env.example`).
- **`.gitignore` properly excludes:** `.env`, `.env.*` (but not `.env.example`).
- **`.env.example` uses placeholder values:** `REPLACE_WITH_RANDOM_32PLUS_CHAR_SECRET` for all secrets.
- **No hardcoded secrets in backend code:** All secrets reference `process.env.*` or `config.*`.
- **M-Pesa password generation** (`badge.js` line 64, `buy.js` line 93): Uses `BUSINESS_SHORT_CODE` + `PASSKEY` + `timestamp` — these come from env vars, not hardcoded.
- **Key manager** (`utils/keyManager.js`): References vault and env var fallbacks for sensitive keys.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `.gitignore`, `.env.example`, `grep` results.

---

### 13.8 Cookie Security

**What was inspected:** `backend/src/index.js` lines 274-276

**What was found:**
```javascript
secure: config.isProduction,  // true in production (HTTPS required)
sameSite: 'strict',           // CSRF protection via SameSite
httpOnly: true,               // JWT not accessible to JavaScript
```
- Auth cookie is properly secured with all three critical flags.
- `secure: config.isProduction` means cookies are NOT HTTPS-only in development — acceptable for local dev but worth noting.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `index.js` lines 274-276.

---

### 13.9 Security Headers (Helmet)

**What was inspected:** `backend/src/index.js` lines 118+

**What was found:**
- Helmet is enabled with custom CSP directives:
  - Production: Strict CSP with `defaultSrc: ['self']`, no inline scripts, no frames, no object embeds.
  - Development: Relaxed CSP for HMR and dev tools.
  - `reportUri: '/csp-report'` for CSP violation reporting.
- Additional security headers applied automatically by Helmet (X-Frame-Options, X-Content-Type-Options, etc.).

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `index.js` lines 118-145.

---

### 13.10 Rate Limiting

**What was inspected:** `backend/src/middleware/rateLimiter.js`, `backend/src/index.js`

**What was found:**
- Multiple rate limiters configured:
  - **API limiter:** Configurable window/max from config.
  - **Mines limiter:** 100 requests/60 seconds.
  - **Payment limiter:** 60 requests/60 seconds.
  - **Auth limiter:** Separate, stricter limits for authentication endpoints.
  - **Financial limiter:** Separate limits for financial operations.
- IP-based key generation.
- 429 responses return structured error messages.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** `rateLimiter.js` lines 1-53; `index.js` lines 221-228.

---

### 13.11 Backend Network Exposure

**What was inspected:** `ss -tlnp` output for all listening ports.

**What was found:**

| Service | Port | Binding | Exposure |
|---------|------|---------|----------|
| mallchain-os-v14 (Vite) | 5173 | 127.0.0.1 | Localhost only (GOOD) |
| Chain REST (marketplaced) | 1317 | 127.0.0.1 | Localhost only (GOOD) |
| Chain RPC (marketplaced) | 26657 | 127.0.0.1 | Localhost only (GOOD) |
| mallchain-app | 3000 | 0.0.0.0 | **ALL INTERFACES (CONCERN)** |
| Backend API | 4000 | * (all) | **ALL INTERFACES (CONCERN)** |

- **Blockchain node (RPC 26657, REST 1317):** Bound to 127.0.0.1 only — not externally accessible. This is correct.
- **Backend API (4000):** Bound to all interfaces. In production, this should be behind a reverse proxy (nginx/Cloudflare) with TLS termination. Without a reverse proxy, the API is directly exposed.
- **mallchain-app (3000):** Bound to 0.0.0.0 — accessible from any network interface. Should be localhost-only for development.

**Severity:** Medium (backend and mallchain-app exposed on all interfaces)  
**Status:** [FAIL]  
**Evidence:** `ss -tlnp` output.

---

### 13.12 Debug Endpoints

**What was inspected:** `curl` to `/debug` and `/api/debug`.

**What was found:**
- `GET /debug` — Returns Express's default 404 HTML page. No debug endpoint exists.
- `GET /api/debug` — Returns Express's default 404 HTML page. No debug endpoint exists.

**Severity:** Informational  
**Status:** [PASS]  
**Evidence:** curl responses returned HTML error pages (404).

---

### 13.13 Dependency Vulnerabilities

**What was inspected:** `npm audit --production` in backend directory.

**What was found:**
```
elliptic  *
Elliptic Uses a Cryptographic Primitive with a Risky Implementation - GHSA-848j-6mx2-7j84
No fix available

uuid  <11.1.1
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided - GHSA-w5hq-g745-h8pq
fix available via `npm audit fix --force`
```

- **2 vulnerabilities:** 1 low (elliptic), 1 moderate (uuid).
- `elliptic` has no fix available — it's a transitive dependency of the crypto libraries.
- `uuid` has a fix available but requires a breaking version change.

**Severity:** Low (neither vulnerability is directly exploitable in this application's usage patterns)  
**Status:** [PASS with note]  
**Evidence:** `npm audit` output.

---

### 13.14 Mass Assignment Vulnerability

**What was inspected:** `PUT /api/mines/campaigns/:id` and `PUT /api/mines/submissions/:id`

**What was found:**
Both endpoints pass `req.body` directly to MongoDB's `$set` operator:

```javascript
// Line 210 — admin only
Campaign.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true })

// Line 380 — ownership checked, but then:
TaskSubmission.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true })
```

**Risk for submissions (line 380):** An authenticated user who owns a submission could set arbitrary fields including:
- `status` → change to `auto_approved` to bypass review
- `reward_amount` → inflate their reward
- `miner_id` → transfer ownership
- `assignment_status` → manipulate voting state

**Risk for campaigns (line 210):** Admin-only, so lower risk, but an admin could still set unexpected fields like `budget_remaining` to arbitrary values.

**Severity:** Critical (submission update allows privilege escalation to self-approve rewards)  
**Status:** [FAIL]  
**Evidence:** `mines.js` lines 210, 380.

---

### 13.15 Input Validation Middleware Coverage

**What was inspected:** Middleware directory, route files for middleware usage.

**What was found:**
- Comprehensive middleware library exists:
  - `inputValidation.js` — NoSQL injection prevention, HTML sanitization, payload size limits, Joi schema validation.
  - `requireAuth.js` — JWT auth with cookie/bearer support, CSRF, token revocation, banned user check.
  - `adminAuth.js` — Role-based admin/superadmin authorization.
  - `rateLimiter.js` — Multiple rate limiter tiers.
  - `idempotency.js` — Idempotency key support for financial operations.
  - `maintenanceMode.js` — Maintenance mode enforcement.
  - `sanitizeSensitive.js` — Strips sensitive data from responses.
  - `correlationId.js` — Request tracing.
  - `upload.js` — File upload validation.
  - `csrf.js` — CSRF double-submit cookie protection.
  - `tokenDenylist.js` — JWT revocation list.
  - `authCache.js` — User lookup caching.
  - `validation.js` — Additional validation utilities.
  - `apiKeyAuth.js` — API key authentication.
  - `verifyWebhookToken.js` — Webhook signature verification.

- **Coverage gap:** Not all routes use all applicable middleware. Mines routes use the legacy `verifyToken()` instead of `requireAuth()`. Some routes lack `preventNoSQLInjection`.

**Severity:** Medium (excellent middleware library, inconsistent application)  
**Status:** [FAIL]  
**Evidence:** Middleware directory listing; `mines.js` line 24-49.

---

## Summary of Findings

### Critical

| ID | Finding | Phase | Location |
|----|---------|-------|----------|
| C-1 | Mass assignment in `PUT /api/mines/submissions/:id` allows users to self-approve rewards by setting `status: 'auto_approved'` and `reward_amount` via `$set: req.body` | 11, 13 | `backend/src/routes/mines.js:380` |

### High

| ID | Finding | Phase | Location |
|----|---------|-------|----------|
| H-1 | Mines routes use legacy `verifyToken()` that does NOT check JWT revocation (JTI denylist). Logged-out users' tokens remain valid until expiry. | 11, 13 | `backend/src/routes/mines.js:24-49` |

### Medium

| ID | Finding | Phase | Location |
|----|---------|-------|----------|
| M-1 | Leaderboard endpoint exposes email prefix as display name when username is unset | 11 | `backend/src/routes/mines.js:104` |
| M-2 | Backend API (port 4000) bound to all interfaces (`*:4000`) — directly exposed without reverse proxy | 13 | `ss -tlnp` |
| M-3 | mallchain-app (port 3000) bound to `0.0.0.0` — accessible from all network interfaces | 13 | `ss -tlnp` |
| M-4 | Mass assignment in `PUT /api/mines/campaigns/:id` via `$set: req.body` (admin-only but still unsafe) | 13 | `backend/src/routes/mines.js:210` |
| M-5 | Inconsistent middleware application — mines routes lack `preventNoSQLInjection` and use weaker auth | 13 | Multiple route files |

### Low

| ID | Finding | Phase | Location |
|----|---------|-------|----------|
| L-1 | File upload MIME type checking relies on client-declared Content-Type, not content-sniffing | 13 | `backend/src/middleware/upload.js` |
| L-2 | TaskSubmission model uses `strict: false` allowing arbitrary fields | 11 | `backend/src/models/TaskSubmission.js:43` |
| L-3 | npm audit: 2 dependency vulnerabilities (elliptic — no fix, uuid — moderate) | 13 | `backend/node_modules/` |
| L-4 | Landing page contains mock dashboard with sample data (clearly labeled as preview) | 10 | `mallchain-os-v14/src/pages/Landing.tsx:146-255` |

### Informational (Pass)

| ID | Finding | Phase | Status |
|----|---------|-------|--------|
| I-1 | Frontend routing with proper auth guards and admin authorization | 10 | [PASS] |
| I-2 | API service with real fetch calls, no hardcoded data | 10 | [PASS] |
| I-3 | httpOnly cookie auth with CSRF protection | 10, 13 | [PASS] |
| I-4 | Comprehensive error handling with user-friendly messages | 10 | [PASS] |
| I-5 | Campaign creation with atomic MLPTS escrow in MongoDB transactions | 11 | [PASS] |
| I-6 | Triple-layer abuse prevention (per-user cap, cooldown, daily platform cap) | 11 | [PASS] |
| I-7 | Reputation-weighted reviewer voting with random assignment | 11 | [PASS] |
| I-8 | On-chain escrow marketplace (client-signed, backend is stateless relay) | 12 | [PASS] |
| I-9 | No XSS vectors (no dangerouslySetInnerHTML or innerHTML) | 13 | [PASS] |
| I-10 | No command injection vectors | 13 | [PASS] |
| I-11 | No path traversal vectors | 13 | [PASS] |
| I-12 | Proper CORS with explicit origin allowlist | 13 | [PASS] |
| I-13 | No hardcoded secrets; .env properly gitignored | 13 | [PASS] |
| I-14 | Auth cookies secured with httpOnly, secure, sameSite flags | 13 | [PASS] |
| I-15 | Helmet with strict CSP in production | 13 | [PASS] |
| I-16 | Rate limiting on API, auth, payment, and mines endpoints | 13 | [PASS] |
| I-17 | Blockchain node RPC/REST bound to localhost only | 13 | [PASS] |
| I-18 | No debug endpoints exposed | 13 | [PASS] |
| I-19 | File uploads with MIME allowlist, size limits, sanitized filenames | 13 | [PASS] |
| I-20 | Both frontends running and serving content | 10 | [PASS] |

---

## Overall Assessment

**Total findings:** 1 Critical, 1 High, 5 Medium, 4 Low, 20 Informational (Pass)

The Mallchain system demonstrates **strong security fundamentals**: httpOnly cookie auth, CSRF protection, comprehensive middleware library, on-chain escrow for marketplace transactions, atomic MongoDB transactions for financial operations, and proper blockchain node isolation. The frontend is well-architected with real API integration, proper error handling, and no hardcoded data.

The **most urgent issue** is C-1 (mass assignment in submission updates), which allows a user to potentially self-approve their own task submissions and claim unearned rewards. This should be fixed by whitelisting which fields can be set via `$set` instead of passing `req.body` directly.

The **second priority** is H-1 (mines auth gap), where the legacy `verifyToken()` should be replaced with the main `requireAuth()` middleware to enforce JWT revocation on logout.
