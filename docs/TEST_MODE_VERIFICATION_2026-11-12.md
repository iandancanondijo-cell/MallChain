# TEST_MODE verification — 2026-11-12

`backend/.env` now carries `TEST_MODE=false`. This is the evidence behind that
change, and the note the env file points here for.

## Why it had to be checked

`config/index.js:352` refuses to boot a production process with the flag on:

```js
if (String(process.env.TEST_MODE).toLowerCase() === 'true') {
  throw new Error('TEST_MODE must not be enabled in production (NODE_ENV=production): it bypasses Vault-backed treasury signing.');
}
```

So every behaviour the local stack only has *with* the flag is a behaviour
production does not have. Running the platform with it on locally means testing
a system that cannot be deployed. The point of this pass was to find out what
actually changes.

## The five gates

| Site | What the flag does |
|---|---|
| `middleware/inputValidation.js:32` | `emailOptions()` returns `{ tlds: false }`, so Joi stops checking that the domain's TLD is real |
| `routes/mallpoints.js:202` | skips the ADR-036 replay guard (`SET NX` on `adr036_consumed:convert:<sig>`) in front of `POST /convert` |
| `controllers/authController.js:602` | the same guard for `POST /link-wallet` (`adr036_consumed:link:<sig>`) |
| `utils/keyManager.js:116,128,140` | allows a plaintext `*_MNEMONIC` env var in place of Vault |
| `services/faucetService.js:79` | last-resort resolution of the faucet signer straight to `TREASURY_MNEMONIC` |
| `config/index.js:352` | the production refusal itself |

`middleware/tokenDenylist.js` and `middleware/authCache.js` key off
`NODE_ENV === 'test'`, not `TEST_MODE`, so they are unaffected.

## A/B probe

`/tmp/probe-no-test-mode.js` (throwaway; not committed) exercises only paths
that cannot write state: a login for an address with no account, and a Mallpoints
conversion signed by a freshly generated key whose address holds no points. The
same script, same stack, backend restarted between runs.

| Probe | `TEST_MODE=true` | `TEST_MODE=false` |
|---|---|---|
| `POST /api/auth/login` — `strictprobe@example.zzznotatld` | 400 `invalid credentials` (validation passed, controller answered) | 400 `validation_failed` — `"email" must be a valid email` |
| `POST /api/auth/login` — real TLD, no account | 400 `invalid credentials` | 400 `invalid credentials` |
| `POST /api/mallpoints/convert` — fresh ADR-036 signature | 400 `no mallpoints to convert` | 400 `no mallpoints to convert` |
| `POST /api/mallpoints/convert` — **same signature again** | 400 `no mallpoints to convert` (guard skipped — a replay is accepted) | **401 `signature already used — please sign a fresh message`** |
| `keyManager.getTreasuryMnemonic()` | throws `Failed to authenticate to Vault` | throws the same |
| `keyManager.getOperatorMnemonic()` | throws | throws |
| `keyManager.getFaucetMnemonic()` | throws | throws |

Read the last three rows together: with `VAULT_ADDR` pointed at a Vault that is
not answering, `_fromVaultOrThrow` throws *before* the `TEST_MODE` branch is
ever reached. On this machine the vault binary is not installed
(`/home/elle_bryson/.local/mallchain-vault` has the config and data dir, nothing
in `~/.local/bin` or `/usr/local/bin` is the executable), so the env fallback the
flag documents has been dead code here — `TEST_MODE=true` was buying nothing at
all on the mnemonic side.

## What the flag off costs a real user

Nothing observed. The stricter email rule rejects domains that do not exist;
`name@gmail.com`, `name@example.co.ke` and every other real address validate the
same as before. The replay guards reject only a *repeated* signature, and the
client signs a fresh timestamp per attempt (`services/auth.ts:364`,
`linkWalletMessage(address, timestamp)`), so a normal user cannot hit it. Both
guards fail open when Redis is unreachable, which is the documented behaviour
(`mallwallet/queue/redis`), and Redis is up.

Browser pass against the strict backend, all requests 200:

- `#/landing` renders the live status table (block 339,377, MLCNS KSh 0.60, MLPTS KSh 2.00, node `mallchain-1`).
- `#/auth` sign-in as superadmin → `#/admin` shell with all ten windows; then `#/` dashboard with the realtime **Connected** badge, block 339,413, live notifications and on-chain recent transactions.
- 62 network requests, zero 4xx/5xx, no console errors beyond a socket warning emitted while the page was navigating.

## keyManager change that came out of this

`utils/keyManager.js` gained `_vaultMnemonic()`: a Vault *failure* is downgraded
to "no Vault secret" **only when `TEST_MODE=true`**, which is what makes the
documented env fallback reachable on a dev box whose Vault is stopped. With the
flag off — and in production, which cannot have it on — the Vault error still
escapes, so a dead Vault cannot silently start signing with an environment key.
`src/__tests__/keyManager.test.js` covers both directions (17 tests, all green).

`backend/.env`'s comment claimed keyManager "falls back to the plaintext
`*_MNEMONIC` vars if Vault is unreachable". That was not true before this change
and is still only true with `TEST_MODE=true`; the comment now says so.

## What this pass does NOT prove

- **The Vault path itself.** No Vault is running here, so nothing in this
  session verified a real `approle/login` + KV read end to end. The unit tests
  mock axios.
- **The deployed configuration.** This is the local stack's env. What
  `api.mallchain.network` actually runs was not inspected from here, and
  `config/index.js` additionally requires `TRUST_PROXY`, `VAULT_ADDR` and
  `VAULT_TOKEN` in production — a deployment that satisfies them is a separate
  check.
- **`/api/auth/link-wallet` live.** Its guard is the same code shape as
  `/convert`'s and was verified by reading, not by a signed request; the browser
  could not sign because this device holds no wallet keys (the app says so
  honestly in the "No wallet keys on this device" dialog).
- **The treasury-funded jobs.** `jobs/treasuryRewardsSweeper.js:40`,
  `jobs/operatorStakeWatcher.js:97` and `jobs/auditChainAnchor.js:120` read
  `process.env.TREASURY_MNEMONIC` / `OPERATOR_MNEMONIC` **directly**, with no
  Vault lookup and no `TEST_MODE` gate. They are the flows that actually move
  value, and they behave identically in both modes. That also means the claim in
  `config/index.js:449-451` — "TREASURY_MNEMONIC is never a valid production
  path" — is not true for them: a production box with an env mnemonic set and no
  Vault would run those jobs off the env key. Changing them to go through
  keyManager would make them fail closed where they currently work, on live
  money flows, so it is left as an owner decision rather than done here.
