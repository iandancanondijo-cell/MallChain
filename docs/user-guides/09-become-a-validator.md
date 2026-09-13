# How to Become a Validator

Run a node, bond `stake`, and earn commission on delegators' staking
rewards. This is a technical, operator-level task — nothing here happens
through the consumer wallet app's UI (compare `06-staking.md`, which is
about *delegating* to an existing validator from the app; this is about
*being* one).

## Prerequisites

- A machine that can run `marketplaced start` continuously (uptime is
  literally your product — a validator that's down doesn't earn, and past
  a threshold gets jailed).
- Enough `stake` to self-delegate. There's no fixed minimum enforced by
  this chain today beyond `min_self_delegation` (which you set yourself,
  see below) — in practice you want enough that you're not immediately
  outbid out of the active set.
- **A real funding source for that stake** — see
  `docs/runbooks/11-operator-stake-depleted.md`'s explanation of where
  `stake` actually comes from on this chain (`x/mint` inflation via
  delegation rewards) if you don't already have some.

## Two important gaps in `marketplaced` itself, worked around below

This binary is deliberately minimal — a node-runner only, no `tx`/`keys`/
`query` CLI (see `cmd/marketplaced/main.go`: the root command never wires
up a client codec context). Two consequences:

1. **There is no `marketplaced init` command.** Nothing in this repo
   currently regenerates a fresh `config/`+`data/` layout from scratch —
   the existing `blockchain_working/` directory was produced by an external
   tool once, not something you can re-run. If you're standing up a
   genuinely new node (not just reusing `blockchain_working/`), you'll
   need `ignite chain init` (already a project dependency — see `~/go/bin/
   ignite`) or CometBFT's own `init` from a standalone `cometbft` binary to
   produce a fresh `priv_validator_key.json` and node config.
2. **`marketplaced comet show-validator` panics** (nil pointer dereference
   — the same missing client-context issue). Read your consensus pubkey
   directly from `priv_validator_key.json`'s `pub_key.value` field instead
   — that's exactly what `backend/scripts/create-validator.js` does, so you
   never need the broken command at all.

Neither of these blocks you — the steps below route around both.

## Step-by-step

1. **Have a node running** with its own `priv_validator_key.json` (an
   existing synced node's `blockchain_working/config/priv_validator_key.json`,
   or a freshly-initialized one via `ignite`/`cometbft init`).

2. **Fund an account to self-delegate from.** This account's address IS
   your validator's operator address (just re-encoded with the
   `mallvaloper1...` prefix instead of `mall1...`) — see
   `FUND_TREASURY.sh`/`backend/scripts/fund-stake.js` for how funding a
   `stake` balance works if you're starting from zero.

3. **Register the validator:**
   ```
   ./CREATE_VALIDATOR.sh \
     --priv-validator-key-file=blockchain_working/config/priv_validator_key.json \
     --from-mnemonic-env=MY_VALIDATOR_MNEMONIC \
     --moniker="My Validator" \
     --amount=1000000
   ```
   `--from-mnemonic-env` names an env var in `backend/.env` holding the
   mnemonic — never pass a mnemonic on the command line itself (shell
   history, `ps` output). Optional flags: `--commission-rate=0.10
   --commission-max-rate=0.20 --commission-max-change-rate=0.01
   --min-self-delegation=1 --website=... --identity=... --details=...`.

   The script prints the derived validator address and consensus pubkey
   before broadcasting, and independently re-queries the chain afterward
   to confirm the delegation actually landed — don't just trust the
   broadcast response.

4. **Check your status:**
   ```
   curl "$CHAIN_REST/cosmos/staking/v1beta1/validators/<mallvaloper1...>"
   ```
   `status` will read `BOND_STATUS_UNBONDED` until the active set picks
   you up — immediately if the validator set isn't already full, otherwise
   only once your stake (plus delegations from others) is enough to outbid
   the current lowest-staked active validator.

5. **Keep it running.** Once bonded, missing blocks past this chain's
   configured downtime threshold gets you jailed (temporarily removed from
   the active set, no rewards) — repeated or severe enough misbehavior
   (double-signing, in particular) is **slashed**, a real, non-refundable
   loss of staked tokens. This is why `docs/disaster-recovery/
   validator-key-backup.md`'s warning about never running two copies of
   the same key matters — it's not a hypothetical.

## What you get

- **Commission** on every delegator's staking reward (the `commission-rate`
  you set in step 3), paid automatically as part of the same inflation
  mechanism described in `docs/runbooks/11-operator-stake-depleted.md`.
- Delegators can find and stake to you through the app's own
  `06-staking.md` flow (the "Validators" list there reads real on-chain
  data — moniker, commission %, uptime — so an accurate `description` and
  a genuinely reliable node are what actually attract delegators).

## One gotcha worth knowing if you ever build more tooling like this

`MsgCreateValidator`'s commission fields are `cosmossdk.io/math.LegacyDec`
at the Go/proto level, but the JS-side `cosmjs-types` package doesn't know
about that custom type — it treats them as plain strings and passes
whatever you give it straight through. `LegacyDec`'s real wire format is
its value **scaled by 10^18 and written as a plain integer** (e.g. `0.10`
→ `"100000000000000000"`), not the human-readable decimal string. Passing
`"0.10"` literally fails server-side with a `math/big` unmarshal error —
`create-validator.js`'s `toLegacyDecString()` helper does this scaling
correctly (string-based, no floating-point) so you don't have to think
about it, but if you ever hand-build a similar message yourself, this is
the mistake to watch for.
