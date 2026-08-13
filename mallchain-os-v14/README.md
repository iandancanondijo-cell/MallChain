# Mallchain OS v14 — Mission Control Frontend

The decentralized operating system for commerce, creators, and communities. A production-ready Vite + React + TypeScript single-page app with hash routing, a reactive store with a single `applyTx` mutation path, demo-mode seeding, and a fetch-based API service layer.

## Overview

Mallchain Mission Control is the Web3 OS frontend for the Mallchain network: wallets, marketplace with escrow, staking, governance, mines (campaign participation), a full 13-step validator lifecycle including a Rewards Calculator (projection + break-even + export/share) and Rewards Leaderboard, chain explorer, messaging, referrals, admin controls, and settings.

**Design system:** deep navy base (`#050810` / `#0d111b`), gold primary (`#f3ba2f`), emerald success, crimson errors. Fixed 252px sidebar with 9 collapsible groups.

## Setup

```bash
npm install        # install dependencies (react 18, vite 5, typescript 5)
npm run dev        # start dev server → http://localhost:5173
npm run build      # typecheck (tsc --noEmit) + production build → dist/
npm run preview    # preview the production build
npm run typecheck  # tsc --noEmit only
```

Requires Node 18+ (Node 20 recommended).

## Environment configuration

Copy `.env.example` to `.env`:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `''` | Backend base URL. Empty → local simulated store (demo). Set → real `fetch()` calls |
| `VITE_DEMO_MODE` | `'true'` | Seed the store with demo data on boot |
| `VITE_NETWORK` | `'mainnet'` | `mainnet` or `testnet` |

## Demo mode vs production mode

- **Demo mode (`VITE_DEMO_MODE=true`, no API URL):** the store is seeded from `src/demo/seeds.ts` (balances, transactions, validators, campaigns, marketplace items, blocks, messages, referrals). Simulated timers (explorer block stream, pending-payment polls, consensus vote tick-in) run through the central `sim` controller in `src/services/config.ts`.
- **Production mode (`VITE_API_BASE_URL` set, `VITE_DEMO_MODE=false`):** the store initializes **empty** and every module shows its proper empty state with a primary CTA ("No transactions yet — send or receive MALL to get started", "Connect a wallet to participate", "You are not a validator yet — Become a Validator", etc.). All reads/writes go through the API service layer.

## API service contract

`src/services/api.ts` exposes:

```ts
api.get(path, params)   // GET → Promise<JSON>
api.post(path, body)    // POST → Promise<JSON>
api.mutate(tx)          // apply a transaction → Promise<tx>
```

When `config.apiBaseUrl` is set these perform real `fetch()` calls (JSON in/out). When empty they resolve from the local store (the current simulated engine). The backend is expected to expose the same paths the frontend calls (e.g. `/wallet/balance`, `/validators/me`, `/marketplace/products`, `/campaigns`).

## Store API

`src/store/store.ts` is the single source of truth:

- `store.state` — reactive state (subscribe via `useStoreVersion()` in components or `store.subscribe(fn)`)
- `store.commit()` — persist to localStorage (key `mallchain_os_v1_v14`) + notify subscribers
- `store.applyTx(tx)` — the single mutation path: validate → mutate → create transaction record → emit notification → append activity. All module mutations go through it
- `store.reset()` — clear localStorage and re-initialize
- Pub/sub: `store.subscribe(fn)` / `store.unsubscribe(fn)`

## Route map (hash routing — all deep-linkable)

```
#/                    → Dashboard (Mission Control)
#/auth                → Sign in / Sign up / verify / wallet setup
#/wallet              → Wallet Hub          #/wallet/send      → Send MALL
#/wallet/receive      → Receive             #/wallet/swap      → Swap
#/wallet/history      → Tx history (CSV export)
#/marketplace         → Marketplace + escrow checkout
#/staking             → Staking (7-day unstake cooldown)
#/governance          → Proposals (create, vote, comment)
#/mines               → Mines command center
#/mines/discover      → Campaign discovery + Campaign Intelligence
#/mines/my-campaigns  → Creator analytics   #/mines/participation
#/mines/earnings      → Earnings            #/mines/leaderboard
#/mines/analytics     → 6 charts            #/mines/history
#/mines/validator-queue → Submissions awaiting validation
#/validators          → Validator home      #/validators/apply
#/validators/stake    → 500 MALL stake      #/validators/training
#/validators/approval → Approval countdown  #/validators/dashboard
#/validators/calculator → Rewards Calculator (projection + break-even + export/share)
#/validators/rewards-leaderboard → Rewards leaderboard
#/validators/leaderboard → Reputation leaderboard
#/validators/profile  → Validator profile
#/explorer            → Block/tx explorer (streaming)
#/messaging           → Messages            #/referrals  → Referrals
#/admin               → Admin control center (feature flags, freeze, announcements)
#/settings            → Settings (accent, currency, language)
#/profile             → Profile edit        #/contracts → Smart contracts
#/devhub              → Developer hub       #/notifications, #/analytics, #/help…
```

## Feature list

- **Auth:** sign up/login (email/phone), 2FA, recovery, wallet create/import, PIN
- **Wallet:** hub, send (fee slider, single-word phrase signing), receive (QR, address rotation, payment polling), swap, history + CSV export
- **Marketplace:** browse/filter, wishlist, cart, escrow checkout, order tracking, disputes, seller dashboard
- **Staking:** delegate MALL, 7-day cooldown unstake + claim
- **Governance:** create proposals, MALL-weighted voting, discussion threads
- **Mines:** Campaign Participants model — discover campaigns with Campaign Intelligence (Validator Confidence, Completion Rate, Creator Trust Score), 5-step participation flow, creator analytics, leaderboard, validator queue + appeal
- **Validators (13-step lifecycle):** eligibility checks → apply → 500 MALL stake → 90% training quiz → approval → dashboard (Today's Work) → blind review with auto-flag → consensus (15 validators, 80%) → matched rewards (+0.8 MALL) / wrong-vote penalties (−0.2 rep) → reputation → 5-tier strike ladder → profile/leaderboard
- **Rewards Calculator:** projection mode (0.8 MALL per consensus-matched review, 0.5× strike multiplier from tier 2, 25% stake slash at tier 4), break-even mode (days to recover 500 MALL stake), Copy Summary / CSV export / share links, presets, live recompute
- **Rewards Leaderboard:** seeded validators ranked by projected net MALL, current user highlighted, "Calculate mine" pre-fill
- **Explorer:** streaming blocks/txs · **Messaging:** typing indicator, unread badges · **Referrals:** claim commission · **Admin:** feature flags (maintenance mode, trading freeze, hide marketplace), user freeze, announcements broadcast
- **Settings:** theme accent (gold/cyan/purple/emerald), currency (USD/KES/EUR/GBP), language (EN/FR/ES/SW) — applied app-wide

## Build & deploy

```bash
npm run build        # → dist/ (static assets only)
npm run preview      # verify locally
```

Deploy `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3). Hash routing means no server rewrites needed — every route is `#/...` and works from `index.html` alone.

## Project structure

```
src/
  main.tsx            entry
  App.tsx             layout shell (Sidebar + TopBar + route outlet)
  router.tsx          hash router + route table
  store/store.ts      reactive store + applyTx + pub/sub + persistence
  services/api.ts     fetch service layer (local fallback)
  services/config.ts  env config + sim controller (demoMode flag)
  demo/seeds.ts       demo seed data (loaded only when demoMode)
  styles/global.css   design-system tokens + all component styles
  components/         Sidebar, TopBar, CommandPalette, ui (Modal/Toast/Chart/ScoreRing/Stepper/StatusChip/EmptyState)
  features/           one folder per module (auth, wallet, marketplace, staking,
                      governance, mines×9, validators×9, explorer, messaging,
                      referrals, admin, settings, profile, contracts, devhub, misc)
```
