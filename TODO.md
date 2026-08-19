# TODO - Audit Findings (Phased)

All phases below were verified against the current codebase and closed out.
Remaining production-readiness gaps are tracked in PRODUCTION.md and the
punch list the team maintains outside this file.

## Phase 1: Consensus-Critical Determinism Fixes
- [x] Repo-wide scan for `time.Now()` in `*.go` under `app/` and `x/`
- [x] Wall-clock usage confirmed limited to vault tests, testnet CLI, and
      `mlcoin/types/genesis.go`'s `DefaultGenesis()` (a one-time genesis-file
      generator, not consensus/replay code) — none affect determinism
- [x] `x/vault/keeper/keeper.go`, `x/mlcoin/keeper/end_blocker.go`,
      `x/mallpoints/keeper/msg_server_convert_to_mallcoin.go` verified clean

## Phase 2: Critical Fund-Loss & Exploit Fixes
- [x] Crosschain escrow: `InitiateBridgeTransfer` locks sender funds into
      the module account via `SendCoinsFromAccountToModule` before creating
      the transfer record
- [x] Crosschain completion: requires a real IBC light-client
      `VerifyMembership` proof plus a currently-bonded, non-jailed validator
- [x] Crosschain state growth: `PruneOldTransfers` existed but was never
      called — wired into `EndBlocker`, capped at 10,000 completed transfers
- [x] Crosschain querying: `GetAllBridgeTransfers` uses paginated collections

## Phase 3: Security & Integrity Fixes
- [x] `app/app.go` rate limiter key is per-sender
- [x] `app/app.go` replay protection has bounded, safely-pruned retention
- [x] `app/app.go` ante state store is properly registered/mounted (a real
      "store never existed" bug was fixed here)
- [x] DEX numeric safety: `integerSqrt` uses `big.Int` (overflow-safe);
      fixed a division-by-zero panic in `AddLiquidity` on a fully-drained pool
- [x] `app/signers.go` has zero `unsafe.Pointer` — uses reflection-based safe casting
- [x] Governance deposits pull funds via the bank keeper
- [x] Governance refunds fire on rejection and failed deposit period
- [x] Governance `hasQuorum` correctly rejects when the staking keeper is nil

## Phase 4: Stub Implementations & Module Completion
- [x] `x/mlcoin/keeper/end_blocker.go` `DistributeFees` was fully implemented
      but never called — wired into the emission-tick cadence
- [x] Governance treasury execution runs real proposal messages via the msg
      router and burns the deposit (old stub correctly removed)
- [x] Governance slashing is a real Keeper method wired to `stakingKeeper.Slash`
- [x] Removed two orphaned dead files (`x/mlcoin/keeper/account.go`,
      `bank_helpers.go` — malformed filenames, broken import path, never compiled)

## Phase 5: Module Registration & Wiring
- [x] Vault module properly registered as an `AppModule`
      (`depinject.go` was removed — its protobuf module extension was
      invalid and panicked `appconfig.Compose()` — replaced with manual
      wiring in `app/custom_modules.go` + `app/app_config.go`)

## Verification
- [x] `go build ./...`
- [x] `go vet ./...` (clean outside pre-existing, unrelated `x/dex`
      protobuf-lock-copy warnings that predate this audit)
- [x] `go test ./...`
