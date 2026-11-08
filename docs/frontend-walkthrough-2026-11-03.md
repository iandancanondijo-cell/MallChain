# Mallchain Frontend Walkthrough & Admin Verification — 2026-11-03

Scope: full step-by-step interaction sweep of the live dev stack (Vite :5173 → backend :4000 → chain mallchain-1), from public landing page through new-user signup, the entire authenticated experience, KYC submission, and all ten admin-panel windows as superadmin. Chain was producing blocks throughout (height ~205,659 → 206,583, ~5.5s blocks).

## 1. Platform state at walkthrough start

- MongoDB (rs `mallchain` :27020, persistent dbpath), Redis, backend :4000 with background workers, chain, explorer :4100, Vite :5173, cloudflared → api.mallchain.network: all healthy.
- Users in DB at start: 18 → 19 after this walkthrough's test registration.

## 2. Landing page (public)

Verified live data end-to-end: block height ticking (206,398 → 206,404 during observation), block time ~5.6s, MALL price KSh 0.60 / Mallpoints KSh 2.00, LIVE vs IN-DEVELOPMENT labels honest, node download links present. No hardcoded numbers observed in the status strip.

## 3. Sign-up flow

Client guards all fire before any request (bad email `bademail`, password `abc`, mismatched confirm, unchecked terms):
- "Enter a valid email address (e.g. you@example.com)."
- "Use at least 8 characters." + "Weak" strength meter
- "The passwords do not match."
- "Confirm your age and accept the Terms and Privacy Policy to continue."

Successful registration (`qoder.walker.2026@mallchain.io`, empty referral field): `POST /api/auth/register` → **200** — confirms the referral-code fix (e4b13f22) and the rate-limit fix (fee556bd lineage) work in the real UI. Auto-login straight to dashboard; welcome email sent via Brevo (verified in backend log).

Onboarding modal gauntlet for the new user:
1. PIN dialog "Enter your PIN to authorize" (wallet auto-link attempt).
2. "Identity Verification Required" KYC gate overlay — intercepts pointer events; must be minimized (working "Minimize" button → floating pill) before any other click.

## 4. Authenticated experience — page-by-page

| Surface | Result |
|---|---|
| Dashboard | Renders fully; KYC card "Not Submitted" → later "Under Review" correctly; quick actions present |
| Notifications | Welcome message, category tabs, mark-all-read present |
| Wallet Overview | **See Finding A** — showed a stale 3M-MALL wallet that is not this account's |
| Wallet Send | Stuck at `loading.........` (Finding B) |
| Wallet Receive | Address + QR + honest "Await payment" copy — good |
| Wallet Swap | Honest empty state: "No liquidity pools yet… once a pool is created on-chain" |
| Wallet Mallpoints | Conversion schedule correct: non-badge holders → December 27 only, next eligible 12/27/2026 |
| Wallet History / Transactions | Showed 3 real on-chain txs (1 + 1.5 MALL sends, 35.5 receive) — verified authentic via RPC tx_search, but they belong to Finding A's wallet, not to this account |
| Wallet Performance | Correct zeros, honest empty chart |
| Marketplace | Honest "Coming Soon — products appear once endpoints are connected" |
| Staking | Live: 0 staked, no unbonding copy, stake form present |
| Governance (+Voting) | Live: 0 proposals, voting power 0 STAKE with correct "delegate to gain weight" guidance; Voting tab currently renders the same proposals view |
| Mines (8 pages) | Command Center, Discover (0 campaigns), Participation/Earnings/Analytics/History (clean empty states), Leaderboard (live 16-user ranking), Reviewer queue (min stake 50 MLPTS, reputation 50 shown) |
| Creator Space | My Campaigns: 16-platform chooser, no campaigns yet; Purchase Mallpoints: correct "link wallet with PIN" gate |
| Validators | Live bonded set (1 validator, 1k MALL, 10% commission); Run a Node page pulls live chain status (height 206.5k, 5.51s blocks, CometBFT 0.38.19) every 15s; Apply form + My Application working |
| Explorer | Live height 206,524, latest block hash/proposer/time, overview/blocks/transactions tabs |
| Economy | Live emission schedule, 670M supply, price 0.62/0.58 KES, 1 MP ≈ 3.33 MLCNS, conversion windows |
| Ecosystem | Messaging (empty, works), EDU (empty + reward rates), Referrals (own code MALL-C8026C29 generated), Contracts (empty), DevHub (SDK + endpoints + node bundle info), Careers (5 roles, honest "applications not wired"), Settings (KYC/2FA/badge/wallet/status all live) |

## 5. KYC submission (user side)

5-step wizard (`#/kyc`) with progress rail and auto-save: About you → Address & contact → ID document (camera or upload, front+back both required) → Financial profile (AML occupation/funds/income + PEP declaration) → Review & submit.

Submitted synthetic test data + dummy ID images → landing copy: "your application is now with our compliance team… within one business day." Backend truth (`GET /api/kyc/status`): `status: pending, riskLevel: high, provider: "unavailable"` with warning "AML screening provider unreachable at submit time — manual review required" (Chainalysis 530). **The fail-closed behavior from 3cdd575d works exactly as intended in the UI**: no fake "low risk" signal is ever shown to the user; submission queues for human review. Dashboard banner updates to "Under Review" — though the top warning banner still says "Complete Now" (Finding D).

## 6. Admin panel (superadmin iandancan, `#/admin`)

All ten windows render live-scoped data with a "superadmin view" badge:

- **KYC & AML**: queue showed 3 pending in real time (18d-old test, a REAL new submission, and this walkthrough's test). Every card: ID doc links via audited `/api/kyc/document`, review-notes box, and a **screenshot that is enforced** — clicking Approve with no screenshot issues no request at all (client gate) and the backend re-validates. Tabs: AML reviews (0), Reviewed (audit table with decided-by/when/proof), Structuring flags (0).
- **Full approve test** (on our own synthetic account only): uploaded screenshot → Approve → verified downstream: queue 3→2, Reviewed 1/1→2/2, `user.kycLevel 1→2`, kyc doc `status: approved, reviewedBy: iandancan`, "KYC verification approved" email delivered via Brevo, and Platform→Audit log captured both `admin_proof_upload` and `kyc_review` entries with the screenshot reference. The approval chain is genuinely tamper-evident end-to-end.
- **Users Admin**: 19 accounts, decrypted emails, roles, join dates, ban actions.
- **Blockchain Admin**: height 206,583, 9s-old block, 1 validator / 1B stake, recent blocks list.
- **Validator Admin**: 0 pending applications.
- **Mining Admin**: 1 active campaign ("Proof-of-work test campaign"), 1 submission pending 17d, badge-issuance queue 0.
- **Treasury Admin**: 0 withdrawals, 0 structuring flags, 5 burn policies (2% marketplace, 1% transfer, 30% cash-out, 100% validator penalty, 5% lost recovery), ledger table.
- **Marketplace Admin**: 0 escrows, honest explanation of what's not yet on-chain.
- **MLPTS & Liquidity**: 4 conversions recorded (133.33 MLCNS issued, all `liquidity_settled` with tx refs), 50-entry live activity feed — the liquidity ledger work is holding in production.
- **Reports Admin**: 3 reports with full lifecycle (read/actioned/reply states).
- **Platform Control**: maintenance board all-live, broadcast composer, reconciliation panel, and a 1.5k-entry audit log streaming every admin view/action live.

## 7. Real-user activity noticed during the walkthrough

- **eetate049@gmail.com ("41607890 YARI") submitted KYC on 2026-11-03 05:47 — still pending.** It is a real person's application; I deliberately did not decide it. It needs a human approve/reject with a review screenshot in the KYC & AML window.
- New sign-ups arriving Nov 2–3: kumurifarm, duncanianondijo, derrickokello813 (role admin), plus earlier brverify/violetadhiambo. Sign-in alert emails and "KYC verification submitted" confirmations went out correctly (Brevo log verified).
- 05:00 pending-task digest ran: grandTotal 2, sent 0, skipped 4 — worth a look to confirm "skipped" means dedup/no-open-queue rather than a delivery failure.

## 8. Findings

| # | Severity | Finding | Evidence / location |
|---|---|---|---|
| A | **High** | **Stale wallet state leaks the previous device user's wallet into a new account's UI.** The browser profile previously used for admin testing held iandancan's linked wallet (mall1nma8m…). After registering qoder.walker in the same browser, the wallet/history/transactions pages showed that address's 3M-MALL balance and real tx history. The server side is SAFE (`/api/auth/me` → `walletAddress: null`; linking requires an adr-036 signature), but on a shared/public device a new user sees the prior user's financial data. Root: `mallchain-os-v14/src/store/store.ts:493` rehydrates `saved.wallet` (address kept, secrets blanked) over the blank base on register/logout. Fix: wipe the `wallet` slice of persisted state on both logout and successful registration. |
| B | Medium | `#/wallet/send` renders only `loading.........` for an unlinked/no-keystore wallet instead of a clear "link your wallet / set a PIN" call to action. |
| C | Medium | AML screening vendor still unreachable (530) — every KYC submission lands as `risk: high` fail-closed. Correct, safe behavior, but it means 100% of real submissions need manual review until a vendor contract is live. |
| D | Low | After submitting KYC, the top warning banner still says "Complete KYC Verification / Complete Now" while the section card correctly shows "Under Review" — banner state is stale until reload. |
| E | Low | Dashboard header showed "MALL 0" while wallet pages showed "3M" for the same device wallet (same stale-state root as A). |
| F | Info | Governance "Voting" tab currently duplicates the Proposals view; Marketplace/Swap/Careers applications show honest empty/coming-soon states — no action needed. |

## 9. Test artifacts left behind

- Account `qoder.walker.2026@mallchain.io` (password redacted here on purpose — it is in the session record if needed) — now kycLevel 2, synthetic KYC docs on file, referral code MALL-C8026C29. Recommend ban or fold into a periodic test-account cleanup.
- No code was changed, nothing was committed, no chain/validator actions taken. The only admin decision recorded was approving this walkthrough's own synthetic KYC to test the approval chain.

## 10. Suggested next actions

1. Fix Finding A (client-side wallet state wipe on register/logout) — small, high-value before shared-device usage grows.
2. Decide eetate049's pending KYC in the admin panel.
3. Improve wallet-send empty state (B) and KYC banner staleness (D).
4. Verify pendingTaskNotifier "skipped 4" semantics.
5. AML vendor decision (C) remains the compliance bottleneck.
