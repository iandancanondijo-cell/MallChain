# Runbook: Operator wallet stake depleted

The operator wallet is the one key that signs badge issuance, Mallpoints
awards, and EDU chain anchoring (`backend/src/services/badgeTxBuilder.js`,
`eduTxBuilder.js`). Every transaction it signs spends a little `stake` (this
chain's gas/fee denom — **not** mlc/mallcoin, a completely separate token).
Left unattended, ordinary usage drains it to zero and all three features
start failing together, with the same generic "account does not exist" /
insufficient-funds error that has nothing to do with any of them
individually.

`backend/src/jobs/operatorStakeWatcher.js` exists specifically to prevent
this: on a schedule (`OPERATOR_STAKE_WATCH_CRON`, default every 15 minutes)
it checks the operator's balance and, if it's below
`OPERATOR_STAKE_LOW_THRESHOLD`, sends a top-up from the treasury wallet.
This runbook is for the one thing that automation *can't* fix by itself:
**the treasury running dry too.**

## Detect
- `OperatorWalletStakeLow` fired — operator balance is low; the watcher
  should self-heal this automatically on its next run. If it doesn't, look
  at the next two alerts.
- `TreasuryWalletStakeLow` fired — the funding source itself is running
  low. This is the early warning: nothing is broken yet, but it will be
  soon.
- `OperatorStakeTopUpFailed` fired — the watcher tried to top up and
  failed. Check the `status` label:
  - `treasury_insufficient` — the treasury doesn't have enough to cover
    one top-up. **This is the real emergency; go to Mitigate below.**
  - `treasury_unavailable` / `treasury_mnemonic_unavailable` — the
    treasury mnemonic isn't configured/reachable, a config problem, not a
    money problem.
  - `broadcast_failed` / `treasury_balance_query_failed` — likely a chain
    RPC issue (see runbook 04, chain node down) rather than a funds issue.

## Diagnose
1. Check current balances directly against the chain's REST API:
   ```
   curl "$CHAIN_REST/cosmos/bank/v1beta1/balances/<operator-address>/by_denom?denom=stake"
   curl "$CHAIN_REST/cosmos/bank/v1beta1/balances/<treasury-address>/by_denom?denom=stake"
   ```
   (Addresses are public — safe to look up, log, or share. The
   *mnemonics* behind them are the only secret part.)
2. If the operator is low but the treasury has plenty, this should resolve
   itself within one `OPERATOR_STAKE_WATCH_CRON` interval — no action
   needed, just confirm it actually happens (`operator_stake_topup_total`
   should show a `success` increment, and the operator's balance should
   rise).
3. If the treasury is the one that's low or empty, someone has to add more
   — this is the scenario the rest of this runbook is for.

## Mitigate — refilling the treasury
There is **no faucet in production** (it's hard-disabled — see
`services/faucetService.js`'s `isFaucetEnabled()`). Getting more `stake`
into the treasury means an already-funded account sends it some, the same
`MsgSend` mechanism as any transfer on this chain. In practice:

1. Identify an account that already holds a real `stake` balance and is
   authorized to fund the treasury (in production, this should be a
   deliberate, audited funding source — not an ad-hoc personal wallet).
2. Use `backend/scripts/fund-stake.js` to send from it:
   ```
   node scripts/fund-stake.js --from-mnemonic-env=<ENV_VAR_HOLDING_THE_SENDER_MNEMONIC> --to=<treasury-address> --amount=<amount>
   ```
   Never put a mnemonic directly on the command line — always reference it
   by the name of an env var, never the phrase itself (shell history and
   `ps` output are not secret).
3. Confirm the transfer landed by re-checking the treasury's balance (step
   1 of Diagnose).
4. The watcher's next scheduled run (within `OPERATOR_STAKE_WATCH_CRON`,
   default 15 minutes) will pick this up automatically and top up the
   operator on its own — no need to trigger it manually, though you can by
   running `node -e "require('./src/jobs/operatorStakeWatcher').runOperatorStakeWatch().then(console.log)"`
   from `backend/` if you want to confirm it immediately rather than wait.

## Verify recovery
- `operator_stake_balance{wallet="operator"}` is back above
  `OPERATOR_STAKE_LOW_THRESHOLD` on the metrics dashboard.
- `operator_stake_topup_total{status="success"}` incremented.
- A real badge issuance / Mallpoints award / EDU upload succeeds
  end-to-end (its `chain.status` should read `registered`, not `failed`).

## Why this matters long-term
This whole chain of automation — watcher job, metrics, alerts — exists so
that a depleted operator wallet becomes a visible, self-describing alert
with a fix documented right here, instead of a mysterious multi-feature
outage that requires someone who remembers how all of this fits together
to diagnose from scratch. If you're reading this without that context: the
short version is in `backend/src/jobs/operatorStakeWatcher.js`'s own
header comment, and the three ideas that matter are (1) `stake` pays gas,
it isn't the app's mallcoin token, (2) a wallet holds nothing until an
already-funded wallet sends it something, and (3) the automation refills
the operator from the treasury on its own — it only ever needs a human
when the treasury itself runs out.
