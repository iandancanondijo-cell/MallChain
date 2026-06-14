# Mallchain Blockchain — Full Audit Report

> [!NOTE]
> This report covers all 9 custom modules (`crosschain`, `dex`, `governance`, `mallcoin`, `mallpoints`, `mlcoin`, `badge`, `vault`, `marketplace`) plus the app wiring layer. Findings are ranked by severity.

---

## 🔴 CRITICAL — Dysfunctional / Broken Code

### 1. Crosschain: Bridge `CompleteBridgeTransfer` has no sender-escrow or authorization

**Files:** x/crosschain/keeper/keeper.go

The `CompleteBridgeTransfer` handler calls `SendCoinsFromModuleToAccount` to mint tokens to the recipient, but:

- **No tokens are ever locked/escrowed** during `InitiateBridgeTransfer` — the sender's funds are never moved into the module account.
- **No authorization check** — *anyone* can call `CompleteBridgeTransfer` with any transfer ID and get free tokens minted.
- The `TODO: Validate proof` comment means the cryptographic verification is entirely missing.

Impact: This will panic or fail at runtime because the crosschain module account has no funds. Even if pre-funded, it's an infinite money exploit — anyone can complete any transfer.

Fix required:
- `InitiateBridgeTransfer` must escrow sender funds into the module account
- `CompleteBridgeTransfer` must validate the caller is an authorized relayer/validator
- Implement actual proof verification (multi-sig relay, merkle proof, etc.)

---

### 2. Crosschain: `GetParams()` panics if params not initialized

**File:** x/crosschain/keeper/keeper.go

```go
func (k Keeper) GetParams() types.Params {
    params, err := k.Params.Get(context.Background())
    if err != nil {
        panic(err)  // ❌ Panics on fresh chain before InitGenesis
    }
    return params
}
```

Uses `context.Background()` instead of the SDK context, and **panics** if the params haven't been set (e.g., during `GetAuthority()` which is called during `UpdateParams`).

---

### 3. Governance, Crosschain, DEX modules commented out of DI

**File:** app/app_config.go

These three modules are manually wired via `registerCustomModules()`, which **does work** — but means they're bypassing the depinject system entirely. While functional, this creates a fragile parallel wiring path that's easy to break during upgrades.

---

### 4. Staking in `mlcoin` is a dead stub — data is never persisted

**File:** x/mlcoin/keeper/staking.go

The `Stake()` function creates a `StakingInfo` struct but **never stores it**. The deduction from the wallet balance **does happen**, meaning users lose funds permanently with no way to unstake.

Impact: **Fund loss**. Users who stake will have their balance deducted with no record or recovery path.

---

### 5. Fee distribution in `mlcoin` is a no-op

**File:** x/mlcoin/keeper/end_blocker.go

The `DistributeFees` function calculates shares but **never sends any coins** — it just resets the accumulators to zero. The fees are effectively burned/lost.

---

### 6. Treasury execution is a no-op

**File:** x/governance/keeper/treasury_execution.go

Passed governance proposals are never executed, and the proposal status isn't even updated to "executed".

---

### 7. Validator slashing is a stub

**File:** x/governance/keeper/slashing.go

This is a standalone function (not a keeper method) that always returns an error. It's never called and doesn't integrate with the staking/slashing SDK modules.

---

## 🟠 HIGH — Security & Data Integrity Issues

### 8. `unsafe.Pointer` usage in signers.go is fragile

**File:** app/signers.go

All custom signer functions use `unsafe.Pointer` + `reflect` casts between `proto.Message` (google protobuf v2) and gogoproto types. This is **extremely fragile** — if memory layouts differ between the v1/v2 proto implementations, this will silently corrupt data or panic.

Fix: Use proper proto message casting via `proto.MessageV1()` / `proto.MessageV2()` converters.

---

### 9. Rate limiter in AnteHandler is global, not per-sender

**File:** app/app.go

The rate limiter uses a single global counter; after 10 total transactions per block, all further transactions are rejected. This will block legitimate users and pollutes another module's store namespace.

---

### 10. Replay protection never expires

**File:** app/app.go

Transaction hashes are stored forever with no cleanup. Over time, this will cause **unbounded state growth** in the KV store.

---

### 11. Vault uses `time.Now()` instead of block time

**File:** x/vault/keeper/keeper.go

Using `time.Now()` in a blockchain keeper produces **non-deterministic behavior** — must use `ctx.BlockTime()`.

---

### 12. Conversion windows use `time.Now()` instead of block time

**Files:** x/mallpoints/keeper/msg_server_convert_to_mallcoin.go, x/mlcoin/keeper/end_blocker.go

Both use `time.Now()` which breaks consensus; replace with block time.

---

### 13. DEX `CreatePool` uses float64 for liquidity calculation

**File:** x/dex/keeper/keeper.go

`math.Sqrt(float64(...))` introduces rounding errors, can overflow, and is non-deterministic. Use integer-only Newton's method sqrt on `math.Int`.

---

### 14. DEX AMM fee calculation uses float64

**File:** x/dex/keeper/keeper.go

Round-tripping via `float64` causes precision loss. Use `LegacyDec` exclusively.

---

### 15. Governance deposits aren't actually transferred

**File:** x/governance/keeper/keeper.go

`AddDeposit()` tracks deposit amounts in storage but **never calls `bankKeeper.SendCoins`** to actually escrow the depositor's funds.

---

### 16. BridgeState grows unboundedly

**File:** x/crosschain/keeper/keeper.go

Completed transfers are **never pruned** from BridgeState. This will grow without limit and cause serialization issues.

---

## 🟡 MEDIUM — Design & Architecture Flaws

### 17. mlcoin Keeper uses `sync.Mutex` in a blockchain context

**File:** x/mlcoin/keeper/keeper.go

Mutexes are meaningless in a single-thread blockchain context; this pattern is not a security boundary.

---

### 18. Governance doesn't refund deposits on rejected proposals

Process functions update proposal status but **never return deposits** to depositors on rejection.

---

### 19. Governance `hasQuorum` falls back to "pass" when staking keeper is nil

**File:** x/governance/keeper/end_blocker.go

If the staking keeper isn't injected, quorum always passes.

---

### 20. `GetAllBridgeTransfers` only returns pending, ignores pagination

**File:** x/crosschain/keeper/keeper.go

Pagination and completed transfers are not handled.

---

### 21. Duplicate files in mlcoin keeper directory

There are duplicate files with trailing whitespace; remove merge artifacts.

---

### 22. `marketplace` module under `x/` is nearly empty

The module appears to be a placeholder and is not implemented.

---

### 23. `badge` module has no module.go-level HasBeginBlocker/HasEndBlocker

Check module hooks vs app_config declarations.

---

### 24. Governance module not in BeginBlockers

Inconsistency between Begin/End blocker listings.

---

### 25. Vault module not registered as an AppModule

No genesis import/export, no gRPC services registered.

---

## 🟢 ENHANCEMENTS NEEDED

### 26. DEX: No slippage protection beyond `minTokenOut`

### 27. DEX: No pool pausing/emergency shutdown

### 28. Crosschain: Should integrate with actual IBC

### 29. Missing unit tests for critical paths

### 30. No upgrade handler defined

### 31. Governance should support proposal execution

### 32. mlcoin: Dynamic pricing has no bounds/circuit breaker

### 33. mallpoints: Conversion rate is hardcoded 1:1

### 34. Proto files should have `cosmos.msg.v1.signer` annotations

### 35. Simulation framework is stubbed out

---

## Summary Matrix

| Module | Status | Critical Issues | Key Enhancement |
|--------|--------|----------------|-----------------|
| **crosschain** | ⛔ Broken | No escrow, no auth, no proof | Integrate real IBC |
| **dex** | ⚠️ Fragile | Float64 math, overflow risk | Integer-only AMM |
| **governance** | ⚠️ Fragile | No deposit transfer, no execution | Execute passed proposals |
| **mallcoin** | ✅ Basic | — | More tests |
| **mallpoints** | ⚠️ Non-deterministic | `time.Now()` usage | Use block time |
| **mlcoin** | ⛔ Partially broken | Staking loses funds, fees no-op | Implement staking storage |
| **badge** | ✅ Basic | — | Richer badge types |
| **vault** | ⚠️ Non-deterministic | `time.Now()`, not registered | Register as AppModule |
| **marketplace** | ⛔ Empty | Not implemented | Build the module |
| **app wiring** | ⚠️ Fragile | Rate limiter global, unsafe.Pointer | Fix ante handler |

> **Top 3 priorities**:
> 1. **Fix the crosschain bridge** — it's an exploit vector that can mint unlimited tokens
> 2. **Fix mlcoin staking** — users currently lose funds when staking
> 3. **Replace all `time.Now()` calls** with `ctx.BlockTime()` — consensus will break otherwise
