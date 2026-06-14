# TODO - Fix All Audit Findings (Phased)

## Phase 1: Consensus-Critical Determinism Fixes
- [x] Repo-wide scan for `time.Now()` in `*.go` under `app/` and `x/` (grep fallback since ripgrep missing)
- [x] Found wall-clock usage only in vault tests + testnet CLI (excluded from consensus)
- [x] Confirmed runtime/keeper (non-test, non-cli) has no remaining `time.Now()` hits from the scan




- [ ] Replace each remaining `time.Now()` with `sdkCtx.BlockTime()` (or `sdk.UnwrapSDKContext(ctx).BlockTime()`)
- [ ] Verify targeted files: `x/vault/keeper/keeper.go`, `x/mlcoin/keeper/end_blocker.go`, `x/mallpoints/keeper/msg_server_convert_to_mallcoin.go`

## Phase 2: Critical Fund-Loss & Exploit Fixes
- [ ] Crosschain escrow: confirm `InitiateBridgeTransfer` locks sender funds into correct module account
- [ ] Crosschain completion: confirm caller authorization rule matches audit intent
- [ ] Crosschain state growth: verify completed transfers are pruned from `BridgeState.PendingTransfers`
- [ ] Crosschain querying: verify `GetAllBridgeTransfers` uses paginated Map collection (not blob)

## Phase 3: Security & Integrity Fixes
- [ ] `app/app.go`: rate limiter key must be per-sender (sender address included)
- [ ] `app/app.go`: replay protection TTL/pruning correctness + bounded retention
- [ ] `app/app.go`: ante state store isolation verification
- [ ] DEX numeric safety: integer sqrt, legacy fee math, overflow-safe liquidity calculations
- [ ] `app/signers.go`: remove `unsafe.Pointer` casts; use safe proto conversions/type assertions
- [ ] Governance escrow deposits: ensure deposits pull funds via bank keeper
- [ ] Governance refunds: implement refunds on rejection and at end of deposit period
- [ ] Governance end blocker: hasQuorum nil-staking keeper should reject

## Phase 4: Stub Implementations & Module Completion
- [ ] `x/mlcoin/keeper/end_blocker.go`: implement actual `DistributeFees` (bankKeeper sends)
- [ ] `x/governance/keeper/treasury_execution.go`: execute proposal messages or mark Executed
- [ ] `x/governance/keeper/slashing.go`: convert to Keeper method and integrate with staking keeper
- [ ] mlcoin duplicate file deletion: remove `account.go` and `bank_helpers.go` duplicates if unused in build

## Phase 5: Module Registration & Wiring
- [ ] `app/custom_modules.go`: register vault module as proper AppModule (stores/genesis/services)

## Verification
- [ ] `go build ./...`
- [ ] `go vet ./...`
- [ ] `go test ./x/... -v`

