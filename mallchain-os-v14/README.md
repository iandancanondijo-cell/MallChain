# Mallchain OS v14 — Mission Control Frontend

The decentralized operating system for commerce, creators, and communities: a
Vite + React + TypeScript single-page app with hash routing, a reactive store
with one mutation path (`applyTx`), and a fetch-based API service layer.

There is no demo mode. Every screen shows what the backend answered — or says
that nothing answered. The demo seeding (`src/demo/seeds.ts`), the `sim` timer
controller and the `VITE_DEMO_MODE` flag are gone, and the pages that existed
only to display invented content were deleted rather than stubbed (see
[docs/frontend-v14-integration-handoff-2026-11-10.md](../docs/frontend-v14-integration-handoff-2026-11-10.md) §7).

## Setup

```bash
npm ci               # dependencies per package.json (react 19, vite 8, vitest 5)
npm run dev          # http://localhost:5173 — /api proxied to http://localhost:4000
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serve dist/ on :4173 (also proxies /api)
npm run typecheck    # tsc --noEmit
npm run test         # vitest (watch)
npm run test:run     # full suite
```

Node 20+ (verified on Node 24). No backend reachable? `stub-api.mjs`, next to
this repository, serves these routes on `:4000` for local UI work.

## Configuration

Copy `.env.example` to `.env.local` (or set the variables in CI). They are
inlined at build time, so a bundle is rebuilt — not reconfigured — to point
somewhere else.

| Variable | Required | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | yes, in a production build | Absolute API origin, no trailing slash. Empty in dev/test so requests stay same-origin and hit the Vite proxy. |
| `VITE_ALLOW_LOCAL_API` | no | `1` permits a build aimed at `localhost`/`127.x`/`::1`. For local preview smoke tests only — never for an uploaded artifact. |
| `VITE_NETWORK` | no | `mainnet` \| `testnet` (default `testnet`). Labelled in the UI; selects the chain parameters used for signing. |
| `VITE_SESSION_TTL` | no | Idle minutes before logout (default 120). The server mints its own JWT TTL; the shorter wins. |
| `VITE_CHAIN_ID` / `VITE_CHAIN_PREFIX` / `VITE_GAS_PRICE` | no | `mallchain-1` / `mall` / `0.01stake` — must match `backend/src/config/index.js`. |

Two guards, deliberately: `vite.config.ts`'s `guardProductionApiUrl()` fails
`vite build` when the API origin is missing, unparseable or loopback, and
`src/services/config.ts` still refuses to start such a bundle at page load. A
wrongly-targeted artifact should never reach a user.

## How data reaches the screen

`src/services/api.ts` exposes:

```ts
api.get(path, params)   // → Promise<ApiResult<T>>
api.post(path, body)    // → Promise<ApiResult<T>>
api.mutate(tx)          // → Promise<ApiResult<T>>
// ApiResult = { ok: boolean; status?: number; data?: T; error?: string; details?: unknown }
```

`data` is the **whole parsed response body**. The backend wraps successes in
`ok(x)` → `{ ok: true, data: x }`, so a value arrives at `res.data.data.x`. A
few legacy routes return flat bodies and read as `res.data.x`. The endpoint
table and the per-route envelope rules are in §2-§3 of the handoff document
linked above.

`src/store/store.ts` is the single client-side source of truth:

- `store.state` — reactive state (`useStoreSlice` / `useStoreVersion`, or `store.subscribe(fn)`)
- `store.commit()` — persist to localStorage (`mallchain_os_v1_v14`; the encrypted vault is a separate key) + notify subscribers
- `store.applyTx(tx)` — the one mutation path: validate → mutate balances → append tx record → emit notification → append activity
- `store.reset()` — clear localStorage and re-initialize
- Pub/sub: `store.subscribe(fn)` / `store.unsubscribe(fn)`

### Signing and identity invariants

- The mnemonic is never read directly. `requestMnemonic()`
  (`src/services/mnemonicAccess.ts`) unlocks it with the PIN, passes it to the
  signing call and drops the plaintext. Only the PIN-encrypted form is ever
  persisted, and a credential that cannot unlock the wallet cannot be saved.
- Wallet creation and wallet linking require a server-verified KYC status; a
  referral code is assigned only after a wallet actually connects.
- Server-supplied paths go through a sanitizer before they reach the DOM, never
  raw: `src/services/assets.ts` resolves `avatarUrl` and other upload paths for
  `img src`, and `src/services/proofLink.ts` (`resolveProofLink`,
  `resolveContentLink`, `isStorableProof`) turns a user-authored `proof_url`
  into either a safe http(s) anchor or a visible "blocked" state.
- Counterparty names and pictures come from `POST /api/identity/resolve` via
  `src/components/WalletIdentity.tsx` and honour that account's
  `profileVisibility`. Unknown and private look identical.
- Naming: the product says **MALL** to people; **MLCNS** is the on-chain ticker
  and API field, used only in technical/builder text.

## Routes (hash routing — all deep-linkable)

```
#/                      Dashboard          #/auth, #/login        Sign in / up
#/signup-v2             Register (v2)      #/kyc                  Identity verification
#/wallet                Wallet hub         #/wallet/send          Send MALL
#/wallet/receive        Receive            #/wallet/swap          Swap
#/wallet/history        Chain history      #/wallet/points        Mallpoints
#/wallet/performance    Performance        #/wallet/buy|withdraw  On/off ramps
#/wallet/connect        Create / link      #/wallet/settings      Wallet settings
#/wallet/address-book   Saved addresses    #/transactions         Transaction history
#/security              Security settings  #/marketplace          Marketplace + escrow
#/staking               Stake MALL         #/governance           Proposals + voting
#/mines                 Command center     #/mines/discover       Campaigns to do
#/mines/participation   Your opens         #/mines/my-campaigns   Creator space
#/mines/earnings        Earnings           #/mines/leaderboard    Leaderboard
#/mines/analytics       Analytics          #/mines/history        History
#/mines/validator-queue Proof review       #/mines/reviewer/stake Reviewer stake
#/mallpoints-purchase   Spend MLPTS (STK)  #/validators           Validator home
#/validators/apply      Application        #/validators/leaderboard  Active set
#/validators/profile    Your application   #/explorer             Blocks & txs
#/economy               Network economy    #/edu                  EDU
#/messaging             Messages           #/referrals            Referrals
#/contracts             Smart contracts    #/devhub               Developer hub
#/run-node              Run a node         #/careers              Jobs
#/learning              Lessons            #/notifications        Notification centre
#/settings              Profile & Settings #/search               Search results
#/admin                 Admin (role-gated) #/help  #/dmca  #/landing
```

Unmatched paths fall through to Dashboard (`matchRoute`), and `/admin` sends an
authenticated non-admin to Dashboard rather than rendering it. `/social-tasks`
and `/analytics` no longer exist — they were the mock-data pages, so a stale
bookmark or old share link now lands somewhere honest.

## Feature list

- **Auth:** register/sign in (email, phone, Google OAuth), 18+ age gate, terms
  acceptance, 2FA, recovery, KYC session, PIN-protected wallet create/import
- **Wallet:** hub with sessions, send (fee + fiat quote, real `MsgSend`),
  receive (QR, payment polling), swap, history with CSV export, Mallpoints,
  performance, buy/withdraw, address book
- **Marketplace:** browse/filter, wishlist, cart, escrow checkout, order
  tracking, disputes, seller dashboard. Nothing is listed until a catalog
  endpoint exists — the page says so instead of inventing sellers.
- **Staking / Governance:** real `MsgStake`/`MsgUnstake` and validator voting,
  proposals and weights from the chain
- **Mines / Creator Space:** campaigns available to you, link opens recorded
  server-side, screenshot proof (upload or URL, scheme-checked), reviewer queue
  with staking and votes, earnings, leaderboard, analytics, creator campaigns
  funded with Mallpoints
- **Validators:** real Cosmos `x/staking` validators — apply gated on
  eligibility that is actually enforced, active-set leaderboard, your application
- **Explorer / Economy / Network status:** blocks, transactions, chain metrics
  and the emission schedule read live; a row whose source is unreachable says so
- **Ecosystem:** messaging, referrals, smart contracts (deploy/inspect/share/
  accept), DevHub (natural-language command composer, WASM workspace, API keys),
  careers (real openings; Apply messages the author), EDU, learning, run-a-node,
  notifications centre, help, search
- **Profile & Settings:** avatar upload, profile edit, social accounts that
  persist, privacy (including `profileVisibility`), notification channels and
  categories, security (password, 2FA, sessions, API keys), display/theme

## Build & deploy

```bash
npm run build      # → dist/ (static assets only, .htaccess included)
npm run preview    # local check of the real artifact:
                   # VITE_API_BASE_URL=http://localhost:4173 VITE_ALLOW_LOCAL_API=1 npm run build
```

`base: './'` plus hash routing means `dist/` works on any static host, in any
directory, with no server rewrites. `public/.htaccess` is the single tracked
copy and Vite copies it into `dist/`; for Namecheap/Apache it adds HTTPS and
`www.`→apex redirects, the SPA fallback, MIME types, security headers with
HSTS, 1-year asset caching and 5-minute `index.html` caching. The full export
checklist (backend env, uploads persistence, WSS for Socket.IO) is §10 of the
handoff document.

## Project structure

```
src/
  main.tsx             entry
  App.tsx              shell: sidebar + top bar + route outlet + cross-tab sync
  router.tsx           hash router, lazy route chunks, role gating
  store/store.ts       reactive store, applyTx, persistence, pub/sub
  services/api.ts      fetch layer → ApiResult
  services/config.ts   env parsing + validation (fail fast)
  services/assets.ts   stored asset path → safe URL
  services/mnemonicAccess.ts   PIN-gated key unlock
  services/identityApi.ts      batched address → identity resolution
  hooks/               useLivePrice, useStoreSlice, …
  components/          Sidebar, TopBar, WalletIdentity, ComplianceGates,
                       CommandPalette, ui (Modal/Toast/Chart/ScoreRing/Stepper/…)
  features/            one folder per module: admin, auth, careers, contracts,
                       dashboard, devhub, economy, edu, governance, help, kyc,
                       marketplace, messaging, mines, misc, node, profile,
                       referrals, search, settings, staking, validators, wallet
  pages/               Landing, BlockchainExplorer, TransactionHistory,
                       MallpointsPurchase, SecuritySettings, WalletSettings,
                       AddressBook, Dmca, KycWizard, …
  styles/              global.css (design tokens) + section stylesheets
  test-setup.ts        vitest environment setup
```

## Tests

`npm run test:run` — 85 files, ~1670 tests (vitest + happy-dom, configured in
`vite.config.ts`). Component tests drive real interactions and assert the
arguments handed to the signing and API services (`Staking.test.tsx`,
`WalletSend.test.tsx`, `MallpointsPurchase.test.tsx`,
`WalletIdentity.test.tsx`, `Settings.test.tsx`, `Careers.test.tsx`, …), so a
regression that only shows up inside a payload is caught too.

## Design system

Deep navy base (`#050810` / `#0d111b`), gold primary (`#f3ba2f`), emerald
success, crimson error. 252px sidebar with collapsible groups, per-route
`document.title` from `router.tsx`, and toasts, modals, empty states and status
chips from `components/ui.tsx`.
