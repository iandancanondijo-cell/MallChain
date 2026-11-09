# Frontend → backend handoff: what the UI cannot get today

Date: 2026-11-09. Source: `mallchain-os-v14` at `fix/stale-wallet-persistence`,
commits `a5d207ca` (dashboard pass) and `2f765202` (wallet credential integrity).
Every item below was observed against the real route handlers in
`mallchain-frontend/backend/src`, not inferred from the UI.

This is a request list, not a critique of the client: the frontend workarounds
mentioned here are deliberately conservative and each should be deleted once the
endpoint exists.

## 1. `/api/market/price` cannot produce a 7-day series

`history` is capped with `history.slice(-500)` (15s sampling ≈ 2 hours), while
`aggregates['7d']` is never null because `aggregateChangeForRange` falls back to
`priceHistory[0]` when there is no sample inside the window. A client therefore
cannot distinguish "the price is flat over a week" from "there are only two hours
of data" — and the latter currently reports a change computed over minutes under a
`7d` label.

Requested: a `?window=7d` (or `?from`/`to`) parameter returning downsampled points
across the whole window, plus `aggregateChangeForRange` returning `null` — not the
oldest sample — when the window is not covered.

Frontend today: the dashboard draws 7 days of *wallet flow* (which it can get) and
labels the trend chip with the sample span it actually received.

## 2. No market-cap or circulating-supply endpoint

The price card can show a unit price but has no honest source for a total/supply
figure, so it shows none. Requested: `GET /api/market/cap` → `{ circulatingSupply,
totalSupply, marketCap, asOfHeight, asOf }`, derived from the chain rather than a
hard-coded constant.

## 3. `/api/tx/history` shape

- `timestamp` is an ISO string. `Number(iso)` is `NaN`, which previously made every
  chain row render (and export) as "the current time". Parsed on the client now;
  epoch seconds or milliseconds would be simpler for every consumer.
- `tx_type` has no published taxonomy. The client matches on message `@type`
  fragments and falls back to a generic label, so a new module's transactions
  silently land in "Other". Requested: a documented enum, or the `@type` string
  itself alongside the label.
- There is no cross-source earnings series by date. "What did I earn this week"
  needs staking rewards, mining payouts, Mallpoints, marketplace settlement and
  transfers joined client-side from four endpoints with three different time
  semantics. Requested: `GET /api/earnings?address&from&to&bucket=day` returning
  `{ bucketStart, source, amountBaseUnits, asset }`.

## 4. Wallet secret verification: two shapes share one status

`POST /api/wallet/pin/verify-pin` answers a wrong secret with `401` +
`{ valid: false, attemptsRemaining }`, and `middleware/requireAuth.js` answers an
expired session with `401` + `{ error: 'invalid token' }`. A client cannot tell
"your cipher is wrong" from "you are logged out" by status alone, and mislabelling
the second one costs the user a strike against a credential that was never checked.
The frontend currently discriminates on the presence of `valid`/`attemptsRemaining`,
which is inference, not contract.

Requested: `code: 'invalid_secret'` on the wrong-secret 401 (mirroring the existing
`code: 'no_pin_set'`), and `401` + `code: 'session_expired'` from the middleware.

Related, and working as intended but worth knowing: the third failure returns
`401` carrying **both** `locked: true` and `attemptsRemaining: 0`. The client treats
that as the third strike and drops the wallet's key material from the device (this
is the product behaviour the owner asked for: three wrong verifications ⇒ reconnect
from the recovery phrase). A correct cipher submitted inside the following 5 minutes
gets `429` + `locked: true`, which the client surfaces as a wait rather than a
strike. If `PinAttempt.MAX_ATTEMPTS` is ever raised above 3, tell the frontend — the
device-side bound is the stricter of the two numbers.

## 5. Chain identity

`GET /api/blockchain/health` is the only endpoint that can name the chain
(`chainId`, and `latestHeight`/`latestBlockTime`). There is no `/api/network` and
`VITE_NETWORK` defaults to `testnet` when unset, which is how mainnet got mislabelled
in the header before `a5d207ca`. Requested: either keep health as the single documented
source (and say so in the API docs) or add `GET /api/network` returning
`{ chainId, networkName, bech32Prefix, decimals, explorer }` so clients stop
reconstructing it.

## 6. KYC verdict for the dashboard banner

`kycController.getKYCStatus` is what the dashboard now trusts, and `notes` proved
usable for the admin's rejection reason. Two asks:

- A stable machine-readable verdict field (`'verified' | 'rejected' | 'pending' |
  'not_submitted'`) rather than a combination of `status`/`kycLevel`/`reviewedAt`.
- Confirm the unauthenticated redaction from H4 also covers any status list that
  embeds KYC records, so the reviewer queue and the account endpoint cannot disagree
  about what is public.

## 7. Two crypto stacks in the client, one of which the backend cannot verify

`mallchain-os-v14/src/services/security.ts` (PBKDF2-SHA256 250k + AES-GCM, bcrypt
10 for the hash) is what `pinHash`/`pinEncryptedMnemonic` are built from and what
`/verify-pin` bcrypt-compares. `src/features/wallet/walletCrypto.ts` is a second,
parallel PBKDF2 + `VaultEntry` stack used only for the device-local encrypted phrase
copy under `mallchain_vault`. It never touches the server, which is correct, but it
means two key-derivation parameters exist in the product. Backend action: none —
informational, and relevant to anyone writing recovery tooling or a support runbook.
