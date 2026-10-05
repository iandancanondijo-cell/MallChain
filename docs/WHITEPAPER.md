# Mallchain Whitepaper

**The decentralized operating system for commerce, creators, and communities**

Version 1.0 — October 2026
Derived from the Mallchain codebase (`mallchain-1`, `marketplaced`, backend `0.1.0`, Mallchain OS v14)

---

## Abstract

Mallchain is a Cosmos SDK layer-1 blockchain and application platform built for a single purpose: making cryptocurrency usable in everyday commerce and creative work, starting with Kenya's mobile-money economy. The network pairs a real-time M-Pesa payment rail with a three-layer token system — **Mallpoints (MLPTS)** earned through verified social engagement, **Mallcoin (MLCNS)** priced by on-chain network activity, and the native **stake (MALL)** unit that secures the chain — and wraps them in "Mallchain OS," a web application that feels like a consumer product rather than a crypto wallet.

The protocol's defining design choice is that prices are not set by decree and not by speculative order books alone. MLCNS is quoted in Kenyan shillings by an on-chain price engine driven by measurable network activity (transaction volume, trade counts, active users), bounded by real liquidity, and crossed into the fiat world through a fiat-pegged oracle. Every mechanism that mints, burns, converts, or pays out is governed by code-level caps, time-locked windows, staked human verification, and compliance gates — an economic design that treats regulatory reality as a first-class constraint rather than an afterthought.

---

## 1. Introduction and Problem Statement

### 1.1 The problem

Three friction points keep most people out of cryptocurrency:

1. **The fiat gap.** Moving value between mobile money and crypto requires centralized exchanges, foreign on-ramps, and exposure to volatility at exactly the moment a first-time user is most vulnerable.
2. **The earning gap.** In most token economies, tokens are distributed to investors and insiders; everyday users have no way to *earn* their way in through work they already do — creating content, reviewing peers, learning.
3. **The trust gap.** "Earn crypto by liking posts" schemes are notorious for paying from thin air and disappearing. Rewards need verifiable scarcity, staked review, and a treasury that cannot silently debase them.

### 1.2 The Mallchain answer

Mallchain (chain ID `mallchain-1`, bech32 prefix `mall`, binary `marketplaced`, built with Ignite CLI on Cosmos SDK v0.53.4 and CometBFT v0.38.21) answers all three:

- **Fiat gap:** M-Pesa STK-push purchases settle to MLCNS balances in seconds at a quoted rate; Mallpoints are hard-pegged at **1 MLPTS = KSh 2**.
- **Earning gap:** The **Mines** ecosystem pays MLPTS for completed, reviewer-verified social campaigns; the **EDU** library pays authors per verified view and download.
- **Trust gap:** Campaign budgets are escrowed before work begins; payouts require randomized, staked proof reviewers; every mint passes a total-supply cap, a daily limit, and an automatic burn.

The platform's self-description on the landing page: *"Buy it. Earn it. Trade it. Grow it."*

---

## 2. Architecture Overview

Mallchain is a three-tier system.

```
┌─────────────────────────────────────────────────────────────┐
│  Mallchain OS (mallchain-os-v14)     mallchain-app (Electron)│
│  React 19 · Vite · CosmJS · dark glassmorphism UI            │
│  Client-side key custody: BIP39 + ed25519, PIN-encrypted      │
└──────────────────────────┬──────────────────────────────────┘
                           │  REST + Socket.IO + SSE
┌──────────────────────────▼──────────────────────────────────┐
│  Backend API (Node.js/Express, port 4000)                    │
│  Fiat rails (M-Pesa/Daraja) · reward engine · compliance      │
│  liquidity orchestration · MongoDB (off-chain MLPTS ledger)   │
│  Redis · BullMQ · Prometheus · OpenTelemetry                  │
└──────────────────────────┬──────────────────────────────────┘
                           │  tx broadcast / REST queries
┌──────────────────────────▼──────────────────────────────────┐
│  mallchain-1 (Cosmos SDK v0.53.4 / CometBFT v0.38.21)        │
│  12 custom modules · 5 s blocks · IBC · custom WASM VM        │
│  On-chain truth: MLCNS ledger, points, escrow, staking, gov   │
└─────────────────────────────────────────────────────────────┘
```

**Division of responsibility.** The chain is the source of truth for MLCNS balances, conversion-rate bounds, escrow, staking, governance, and document provenance. The backend owns what the chain cannot do well: fiat communication (M-Pesa callbacks), high-frequency off-chain point bookkeeping (MongoDB, mirrored to chain at conversion), reward-rate policy tables, AML/KYC gating, and operational keys (HashiCorp Vault in production). The frontend never sends private keys to the backend — signing is client-side via CosmJS, gated by a PIN challenge.

**Consensus and block cadence.** 5-second block time (`timeout_commit`), 17,280 blocks per day, up to 100 active validators, 21-day unbonding period, slashing for downtime (1%) and double-signing (5%).

---

## 3. The Three-Token System

Mallchain deliberately separates three economic roles that most single-token designs conflate.

| Layer | Token | Role | Ledger | Units |
|---|---|---|---|---|
| Engagement | **MLPTS** — Mallpoints | Earned through work; spent on campaigns and creator tools | Off-chain (MongoDB) mirrored on-chain (`x/mallpoints`) | Integer points; pegged 1 MLPTS = KSh 2 |
| Economy | **MLCNS** — Mallcoin | Store of value, payments, staking, trading | On-chain (`x/mlcoin`), 6-decimal micro units | Hard cap 670,000,000 MLCN |
| Security | **stake (MALL/MAL)** | Gas, bonding, governance weight | Cosmos SDK native | Chain-native |

**Why three layers?** MLPTS absorbs the volatility problem for earners — a reviewer completing a task today is quoted a stable shilling value, not a speculative token price. MLCNS carries the monetary premium and is intentionally scarce. `stake` keeps consensus incentives isolated from the application economy.

### 3.1 Mallpoints (MLPTS)

- **Peg:** 1 MLPTS = KSh 2.00, enforced at the purchase rail (backend `MALLPOINT_PRICE_KES`, default 2).
- **Issuance:** on-chain `MsgAwardPoints` is issuer-only; the `points_issuer` parameter **fails closed** when empty. The `engagement` task type additionally requires a proof-of-work — SHA-256 over `(nonce ‖ creator ‖ recipient ‖ task_type ‖ amount)` with **16 leading zero bits**, compared in constant time. Badge holders bypass PoW.
- **Emission control:** a per-month global cap of **10,000,000,000 points** (`MonthlyPointsCap`), keyed by `YYYY-MM` on-chain.
- **Conversion windows:** points convert to MLCNS only inside on-chain windows — **day 15 of any month for badge holders**, **December 27 for non-badge holders**. (The deployed backend carries an operator env override `MALLPOINTS_CONVERT_ANY_DAY` for testing.)
- **Conversion rate:** submitted as a proposed fixed-point rate (`proposed_rate`, scale 10⁶) and validated on-chain against parameterized bounds `[1,000 … 100,000,000]`, i.e. 0.001–100 MLCNS per MLPTS. Points are **debited before minting** (double-spend guard), and the mint re-enters the governed MLCNS mint path with its supply cap, daily limit, and burn.

### 3.2 Mallcoin (MLCNS)

MLCNS is the economic heart, implemented in `x/mlcoin` with a 6-decimal micro-unit ledger.

**Fixed supply architecture:**

| Allocation | Amount (MLCN) | Note |
|---|---|---|
| Total supply (hard cap) | **670,000,000** | Minting rejected above cap |
| Founder | 160,000,000 | Time-locked **5 years** (unlock ≈ Jan 2031) |
| Team | 90,000,000 | |
| Orthopharm | 3,000,000 | |
| AFA charity | 1,500,000 | |
| Emission reserve | **415,500,000** | Released by halving schedule |

**Emission schedule.** Phase one releases **3,000,000 MLCN/month**; the schedule **halves every 36 months** (3.0M → 1.5M → 0.75M → 375K → 187.5K). The released mint path also enforces a per-day limit as a safety valve, and every mint auto-burns **1%** (`BurnRateBps = 100`) — only the net amount reaches circulation.

**Built-in deflation.** MLCNS is destroyed at every economic exit:

| Event | Burn |
|---|---|
| Every governed mint | 1% of minted amount |
| Cash-out (MLCNS → KES withdrawal) | **30%** static default; a dynamic schedule takes over once circulating supply crosses its thresholds — ≥100M → 10%, ≥200M → 20%, ≥500M → 30%. Below 100M the schedule matches nothing and the static 30% applies |
| Marketplace purchase | 2% |
| P2P wallet transfer | 1% |
| Validator penalty (via governance `MsgSlashValidator`) | up to 100% |

Burn amounts are split `floor(total × pct)` burned, remainder to treasury; each burn executes as an on-chain `MsgBurn` with a `TreasuryLedger` record.

**Fee structure.** A 1% fee is accumulated on-chain into three buckets — transaction fees (transfers/mints), trading fees (buy/sell), conversion fees — and distributed at each day boundary: **50% to stakers, 50% to the treasury module account**. P2P transfers additionally carry a 0.0097% protocol fee (minimum 1 micro-unit).

### 3.3 stake (MALL/MAL)

The native bonded denom secures consensus, pays gas (`--minimum-gas-prices=0.01stake`), and weights governance. It is intentionally *not* the marketing token: staking economics live in the Cosmos SDK staking module, while MLCNS staking (below) is an application-level product on top of `x/mlcoin`.

---

## 4. The Price Engine

### 4.1 Activity-driven on-chain pricing

Every **100 blocks**, `x/mlcoin` recomputes an **EngagementScore** (0–1000):

- trade volume / 10⁶, capped at 500 points
- transaction count / 100, capped at 300
- active users / 10, capped at 200

A score above 500 raises the price multiplier by `(score − 500)/10`; a score below 300 lowers it by `(300 − score)/6`. A **circuit breaker caps any single adjustment at 10%**, with a price floor of 1 (KES cent-scale quotes). Default launch quotes: **buy 0.62 KES / sell 0.58 KES** per MLCNS. Since trade volume is scored as MLCN-traded (one score point per MLCN, capped at 500), every 10 score points above 500 move the quote one KES-cent — always subject to the caps and breaker. Cumulative fiat-side buying is capped at **570,000 KES** on-chain.

### 4.2 Fiat-pegged conversion oracle

The off-chain oracle computes the MLPTS→MLCNS rate as

```
proposed_rate = (MLPTS price in KES / MLCNS mid-market price in KES) × 1,000,000
```

clamped to the on-chain bounds before submission. Worked example from the code: at MLPTS = KSh 2 and MLCNS mid = KSh 0.62, the rate is **3,225,806** (≈ 3.23 MLCNS per MLPTS). The chain's default reference conversion is **3.2 MLCNS per MLPTS** (`mlpts_per_mlcns = 3,200,000`). Backend preview and on-chain settlement use the identical safe-multiplication formula, so what a user is shown is what they receive.

### 4.3 Community rate discovery

Beyond the authority-set `CurrencyRates`, a community mechanism adjusts stored fiat rates over 1,000-block windows: net demand `net = (buys − sells)/(buys + sells)` moves each rate by at most **α = 0.10 × net** — bounded crowd-sourced price discovery that cannot be whipsawed by a single actor.

### 4.4 Liquidity-bounded access

- **Liquidity pool cap: 500,000 KES** (MLCN/KES pool, on-chain bank balances, both legs 6-decimal). Once reached, **direct fiat→MLCNS buying is permanently disabled** by a durable on/off flag; MLCNS is thereafter acquired only by converting Mallpoints or receiving transfers.
- The **DEX** (`x/dex`) is a constant-product AMM with 0.3% default fee (bounded 0.1%–1%), a **20% per-swap pool-drain cap**, slippage enforcement (`min_token_out`), and a global pause switch.
- The **sell side fails closed**: withdrawals are blocked if the estimated KES payout exceeds the pool's KES reserve — including when the pool cannot be read at all.

---

## 5. Earning: The Mines Ecosystem

Mines is not a mining game. As the product states: *"Users are not miners. Users are Campaign Participants — completing real marketing tasks for Mallpoints. Proof Reviewers are the trust layer."*

**Flow.** A creator escrows an MLPTS budget to launch a campaign (rate per task is **server-computed** from the policy table — participants cannot be under- or over-promised by the creator). Participants submit proof (description + URL). Up to six **staked reviewers** are randomly assigned and vote; payout requires consensus. Reviewers stake their own MLPTS to become eligible — a Sybil-resistant bond that is forfeitable by governance of the review economy.

**Reward rate table** (MLPTS per verified action; campaign multipliers clamp to 0.5×–5×; global default daily cap **20 MLPTS**):

| Action | X/Twitter | TikTok | Instagram / Facebook | YouTube |
|---|---|---|---|---|
| View/impression | 0.50 | 0.28 | 0.28 | 0.80 |
| Like | 1.00 | 0.391 | 0.391 | 1.00 |
| Comment | 2.00 | 0.51 | 0.51 | 1.40 |
| Follow/subscribe | 3.00 | 3.00 | 3.00 | 4.00 |
| Repost/share | — | 0.90 | 0.90 | 1.50 |
| Save/bookmark | 1.50 | 0.75 | 0.75 | 1.00 |

Further platforms (Telegram, WhatsApp, Discord, LinkedIn, Reddit, Twitch, Spotify, Medium, Snapchat, Pinterest, Threads) carry their own calibrated rates; TikTok has a 15 MLPTS daily cap. These tables were rebalanced specifically to prevent emission imbalance — an earlier draft priced a single follow at the equivalent of KSh 30; the shipped tables keep a day of maximum engagement within the daily cap.

**Payout formula:** `payout = base rate × campaign multiplier × verification factor`, settled only after reviewer votes approve the submission.

### 5.1 Education rewards

The EDU module anchors community-authored learning material on-chain (SHA-256 document hashes with versioned parent links). Authors — not viewers — earn **KSh 7 (3.5 MLPTS) per verified view** and **KSh 13 (6.5 MLPTS) per verified download**, once per user per resource, with wallet-first enforcement and self-reward blocked.

---

## 6. Fiat Rails: M-Pesa

Purchases ride Safaricom's Daraja API:

1. User requests a quote (minimum **KES 10**, quote valid **10 minutes** in Redis).
2. Backend triggers an **STK push** (`CustomerPayBillOnline`, sandbox or production Daraja by env), referencing the quote ID.
3. User confirms on their phone; the signed callback credits MLPTS or MLCNS atomically (MongoDB transaction across `MallPointAccount` and `User.mlpts_balance`).
4. A liquidity leg adds both MLCNS and KES to the MLCN/KES pool; if that leg fails, the user is **still credited** and a reconciliation job repairs the pool asynchronously (BullMQ dead-letter queue with retries).

Direct MLCNS buys and MLPTS purchases are separate rails with the same properties; both respect the 500,000 KES liquidity caps. Withdrawals (MLCNS → KES) are the compliance-heavy direction and are covered in §9.

---

## 7. Module Reference

Twelve Cosmos SDK modules ship in the chain.

| Module | Purpose |
|---|---|
| `x/mlcoin` | MLCNS ledger, mint/burn, buy/sell engine, MLCNS staking, emission, fee distribution, MGP-20, dynamic pricing |
| `x/mallpoints` | Engagement points, PoW-gated award, capped issuance, windowed conversion |
| `x/badge` | Operator-issued user badges (conversion-window privileges, PoW bypass); 7-day activity streak, KSh 17 issuance cost |
| `x/marketplace` | Buyer/seller **escrow** with dispute flow (`CreateEscrow`, `ReleaseFunds`, `RefundBuyer`, `OpenDispute`); the OS checkout signs real escrow transactions with a **7-day dispute window** |
| `x/dex` | Constant-product AMM (create pool, add/remove liquidity, swap with slippage and drain caps) |
| `x/governance` | Proposals, weighted voting, deposits, and authority-gated **validator slashing** executable only via passed proposals |
| `x/vault` | On-chain **encrypted key recovery**: client-side Argon2id + AES-GCM blobs (minimum 19 MiB Argon2 memory enforced on-chain); passwords and TOTP secrets never leave the client |
| `x/edu` | Educational document provenance: SHA-256 registration with versioned parent chain |
| `x/crosschain` | IBC bridge with escrow, ICS-23 membership-proof verification, bonded-validator attestation, timeout refunds, 10,000-pending cap |
| `x/wasm` | Custom contract VM on **wazero** (not CosmWasm): StoreCode / Instantiate / Execute, host ABI (`db_read`, `db_write`, `get_balance`, `transfer`), SDK gas metering |
| `x/wasmbridge` | Token-action dispatcher bridging WASM contracts to MGP-20 (`transfer`, `approve`, `transfer_from`), signer-validated |
| `x/mallcoin` | Vestigial stub (params only); retained for genesis compatibility, carries no economics |

### 7.1 MLCNS staking (product staking)

Distinct from validator bonding: users stake MLCNS with a **minimum of 18,250 base units** (0.01825 MLCNS — a floor equal to the RewardDivisor, so the smallest valid stake still earns at least one whole reward unit per block) and a **90-day lock** (1,555,200 blocks). Rewards accrue per block as `staked / 18,250` (RewardDivisor), multiplied by an **engagement multiplier** and a **duration bonus** (0.1% per month staked). In the shipped code the engagement multiplier integer-divides `EngagementScore / 1000` and floors the result at 1, so it is effectively always 1× — the intended 0.5×–1.5× scaling is not realized (Appendix B, note 9). Rewards mint through the governed mint path — so staking payouts respect the supply cap and daily limit — and are forfeited if the daily limit is exhausted at claim time. Unstaking before unlock height is impossible; principal is returned directly.

### 7.2 Cross-chain bridge

`x/crosschain` escrows outbound tokens to a module account and forwards via IBC (`transfer` port, configurable per-chain in `Params.SupportedChains`). Completion requires **either** an IBC acknowledgment **or** validator attestation backed by an exact ICS-24 packet-commitment reconstruction plus an ICS-23 membership proof against the active light client — a deliberately strict two-path completion model. Timed-out transfers auto-refund; the module caps pending transfers at 10,000.

---

## 8. Smart Contracts: WASM and MGP-20

### 8.1 MGP-20

**Mallchain Proposal 20 (MGP-20)** is the network's fungible-token standard — an ERC-20 analogue implemented natively in the `x/mlcoin` keeper:

- `Balance`, `Allowance` (composite `owner|spender` key)
- `Approve`, `TransferFrom` with checks-effects-interactions ordering
- Exposed three ways: direct messages on `x/mlcoin`, gRPC queries, and from WASM contracts via the host ABI

### 8.2 The WASM VM

Contracts run on a **purpose-built wazero runtime**, not CosmWasm — a minimal lifecycle (`StoreCode`, `InstantiateContract`, `ExecuteContract`) with:

- an `env` host module exposing `db_read`, `db_write`, `get_balance`, `transfer` plus the MGP-20 surface,
- read-only execution mode for queries (write/transfer host calls blocked),
- SDK-native gas metering with per-opcode costs and `out of gas` enforcement.

Contracts reach the token through `x/wasmbridge` (`MsgExecuteAction` with JSON MGP-20 payloads), where every action is validated against the actual signer before delegating to the mlcoin keeper — contract code can never move tokens it wasn't approved to move.

---

## 9. Security, Custody, and Compliance

### 9.1 Custody model

- **Users are self-custodial.** Wallets are created at signup (24-word BIP39, ed25519 HD derivation), the recovery phrase is **PIN-encrypted at rest** in the client store, plaintext is never persisted, and every signing surface (send, stake, vote, escrow, convert) passes through an on-demand PIN challenge. The explicit UX contract: *"Mallchain cannot recover a lost password or recovery phrase."*
- **On-chain recovery vault.** `x/vault` stores a client-side-encrypted recovery blob (Argon2id + AES-GCM, minimum KDF parameters enforced by the chain itself). The backend is a read-only proxy; secrets never touch it.
- **Operator keys** (treasury, faucet, liquidity) live in **HashiCorp Vault KV v2** with AppRole auth in production; production refuses to enable treasury signing without it. The standalone wallet service derives addresses from public keys only.

### 9.2 Application security

ADR-036 arbitrary-signature verification (10-minute max age, single-use Redis nonce) guards sensitive endpoints; HMAC-SHA256 request signing and per-route rate limits protect the API; correlation IDs and OpenTelemetry span the stack.

### 9.3 Compliance gates

| Control | Value |
|---|---|
| Minimum withdrawal | KES 350 |
| Withdrawal frequency | 3 per rolling 7 days (failed/refunded attempts excluded) |
| AML review threshold | KES 2,500, with a 7-day structuring-detection window |
| Sell-side liquidity gate | Fails closed when pool reserves are insufficient or unreadable |
| Treasury payout caps | Opt-in per-transaction/per-day KES limits; production warns when auto-payout runs uncapped |
| KYC / AML administration | Dedicated admin shell (separate from the user OS) with KYC/AML, liquidity, treasury, and audit consoles |
| Faucet | Dev-only: max 10,000 MLCNS per request, 60 s cooldown, disabled in production |

The badge system doubles as progressive identity: an operator-issued badge (earned via a 7-day activity streak or KSh 17) unlocks privileged conversion windows and PoW bypass, with issuance failing closed to a configured hot wallet.

---

## 10. Governance and Consensus

Standard Cosmos governance with on-chain execution teeth:

- **Deployed parameters:** 2-day voting period (86400 s expedited), 33.4% quorum, 50% threshold, 33.4% veto with veto-burn enabled, minimum deposit 10,000,000 stake.
- **Weighted voting** (`Yes / No / Abstain / NoWithVeto`) with voting power from bonded stake; the OS renders delegation inline.
- **Executable penalty:** `MsgSlashValidator` (0–100%) is authority-gated and reachable **only** through a passed governance proposal — the community, not an operator, slashes.
- Module parameters across the economy (conversion bounds, emission caps, fees, bridge chains, issuers) are governed via `MsgUpdateParams` on each module.

---

## 11. The Product: Mallchain OS

Mallchain OS ("Mission Control") is the primary interface: React 19 + Vite + TypeScript, a hand-rolled reactive store, real CosmJS transaction signing, and a documented dark-glassmorphism design system (navy base, gold primary). Navigation is organized as a web3 "operating system": Home, Wallet (send/receive/swap/history), Marketplace, Staking, Governance, Mines, Creator Space, Validators, Explorer, and an Ecosystem group (messaging with live Socket.IO chat, EDU library, referrals, contracts, developer hub).

`mallchain-app` extends the same network to Electron desktops/TVs as a sovereign wallet + block explorer + dApp connector. A separate **admin shell** routes platform administrators to a control panel distinct from the user experience.

Every user-visible economic number — portfolio balances, emission halvings, treasury flows, pool reserves — is read live from chain and backend state, not hardcoded.

---

## 12. Roadmap

The 2026 enhancement roadmap (see `docs/2026_blockchain_enhancements.md`) extends the platform toward:

1. **Invisible UX** — smart accounts, gasless transactions, social recovery (the `x/vault` recovery primitive is the first step).
2. **Agent-ready infrastructure** — scoped spending keys and verifiable decision logs for autonomous AI agents.
3. **Modular scalability** — separated execution, settlement, and data-availability layers.
4. **Real-world asset tokenization** — custody-grade fractional ownership with compliance-by-design, settling in stablecoin rails.
5. **Cross-chain and payment interoperability** — deeper IBC reach through `x/crosschain` and backend-abstracted network details.
6. **Privacy + compliance** — zero-knowledge proofs, selective disclosure, and on-chain audit trails.

---

## 13. Conclusion

Mallchain's thesis is that a useful regional crypto economy does not need to choose between usability and soundness. The three-token split gives earners stability and the network scarcity simultaneously. Activity-priced, liquidity-bounded, circuit-broken — MLCNS cannot be pumped by a single wallet or printed past its 670 million cap. Every reward leaves an escrowed budget, passes staked human review, and lands in a wallet whose keys never touched a server. And by anchoring the entire loop to M-Pesa — the payment rail Kenya already trusts — Mallchain meets users where their money already lives.

---

## Appendix A — Parameter Summary

**Chain:** ID `mallchain-1` · prefix `mall` · Cosmos SDK v0.53.4 · CometBFT v0.38.21 · IBC v10.4.0 · 5 s blocks · 17,280 blocks/day · 100 max validators · 21-day unbonding · downtime slash 1% · double-sign slash 5% · gas price 0.01stake

**MLCNS:** 6 decimals · cap 670,000,000 · founder 160M (5-year lock) · team 90M · Orthopharm 3M · AFA 1.5M · emission reserve 415.5M · phase-1 3M/month, halving every 36 months · mint burn 1% · daily mint limit · buy 0.62 / sell 0.58 KES defaults · engagement-scored pricing (1 point per MLCN volume, 10 points per KES-cent above score 500) · 570,000 KES cumulative buy cap · price circuit breaker 10%/update · 1% fee split 50/50 stakers/treasury · P2P fee 0.0097%

**MLPTS:** peg KSh 2 · monthly issuance cap 10¹⁰ · PoW 16 zero bits (engagement) · conversion bounds [0.001, 100] MLCNS/MLPTS · reference rate 3.2 MLCNS/MLPTS · windows: day 15 (badge) / Dec 27 (non-badge)

**Staking (MLCNS):** min 18,250 base units (0.01825 MLCNS) · 90-day lock · rewards staked/18,250 per block × duration bonus (0.1%/month) · engagement multiplier currently inert (always 1×)

**Burns:** mint 1% · cash-out 30% static (dynamic schedule: ≥100M→10%, ≥200M→20%, ≥500M→30%; below 100M falls back to static 30%) · marketplace 2% · P2P transfer 1% · validator penalty 0–100%

**Compliance:** min withdrawal KES 350 · 3 withdrawals/week · AML KES 2,500 · liquidity cap 500,000 KES · direct-buy lock 500,000 KES · badge KSh 17

## Appendix B — Implementation Notes and Known Discrepancies

This whitepaper documents the codebase as it exists at the time of writing. For precision, the following gaps between design intent and shipped state are disclosed:

1. **Emission units.** Code defaults express the phase-one monthly emission in whole MLCN (3,000,000); the deployed genesis carries a monthly cap of 250,000 MLCN (expressed in micro units). The two figures have not been reconciled; the frontend Economy page displays the 3M/month schedule.
2. **Backend conversion settlement.** The backend settles MLPTS→MLCNS conversions via operator-signed `MsgTransferMallcoin` after debiting points, with the rate clamped to on-chain bounds — rather than broadcasting `MsgConvertToMallcoin` directly. The on-chain conversion message exists and enforces the same bounds and windows.
3. **Marketplace denomination.** OS marketplace escrow currently signs in the native `stake` (MALL) denom, not MLCNS — a documented simplification pending denom migration.
4. **`MsgSetCurrencyRate`** is implemented in the keeper but not registered in the proto Msg service; fiat-rate updates currently flow through governance-controlled parameter updates and the community-rate mechanism instead.
5. **M-Pesa callback authentication** uses a shared-secret URL token rather than HMAC signature verification; production hardening should add signature validation.
6. **Conversion-rate parameter comments** in `x/mlcoin` (0.1/10.0) disagree with their actual fixed-point values (0.001/100.0); the fixed-point values are authoritative.
7. **CosmWasm is not used** — contracts run on the custom wazero VM described in §8.2; claims of CosmWasm compatibility would be inaccurate.
8. **`x/mallcoin`** is a vestigial params-only module; the live token module is `x/mlcoin`.
9. **Staking engagement multiplier is inert.** The code comment describes a 0.5×–1.5× engagement scaling on MLCNS staking rewards, but the implementation integer-divides `EngagementScore / 1000` and floors the result at 1 — with the score capped at 1000, the multiplier is always exactly 1×.
