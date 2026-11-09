# Frontend → backend handoff: what the UI cannot get today

Date: 2026-11-09. Source: `mallchain-os-v14` at `fix/stale-wallet-persistence`,
commits `a5d207ca` (dashboard pass) and `2f765202` (wallet credential integrity);
items 8–11 were added during the notifications, sessions and Profile & Settings
passes on the same branch.
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

## 8. Notifications: one account truth, three writers, and filters the API cannot answer

Source: `commit 4326febe`. Everything below was read out of `backend/src/routes/notifications.js`,
`services/notificationDispatcher.js`, `services/notificationEngine.js` and
`services/blockchainListener.js`, then reproduced against a local stub that mirrors them.

**a. A confirmed transaction writes two Notification rows.**
`blockchainListener.js:76` calls `notify(userId, …)` and `:82` calls
`notifyUser(user, …)` for the *same* status change — and `notifyUser` calls `notify`
itself (`notificationEngine.js:526`). Every confirmed or failed transfer therefore
lands twice in the inbox. Requested: one call, `notifyUser`, since it is the only one
that also fans out to email/SMS/WhatsApp.

**b. `notify()` ignores the global toggle and the category settings.**
`notificationEngine.js:495-501` writes the in-app row before `notifyUser` consults
`resolvePreferences` at `:528`, so a user who switched notifications off still
accumulates in-app rows through this path, while the dispatcher path
(`notificationDispatcher.js:126-150`) correctly skips them. Two entry points, two
answers to "does this user want this". Requested: `notify()` consult the same
preferences document, or route every in-app write through `dispatchNotification`.

**c. The socket payload and the REST payload are different shapes.**
`notificationDispatcher.js:222` emits `{ _id, type, title, message, data, read, createdAt }`;
`GET /api/notifications` returns the Mongo document with the same field names, while
the client's own type has spoken of `kind`/`body` since before this pass. The client
now normalises both in `src/services/notificationWire.ts`, so nothing is broken — but
the naming should be settled on one side. Requested: pick `type`/`message` and document
it, so the wire bridge can be deleted.

**d. A skipped send is reported in prose the UI has to print verbatim.**
`POST /api/notifications/send` answers `200` with `{ ok: false, skipped: true,
reason }`, and `reason` is `result.error` — a human sentence from the dispatcher
(`'Notifications disabled'`, `'Category disabled'`, `'Unsubscribed from category'`,
`'Do not disturb active'`). The feed shows it under the row as
"Not saved to your account — <reason>", so any rewording of those strings silently
changes user-facing copy. Requested: a stable `code`
(`notifications_disabled | category_disabled | unsubscribed | dnd_active`) alongside a
`message`; the client will display the message and key behaviour off the code.

**e. The page's filters cannot be answered by the API.**
`GET /api/notifications` accepts only `limit`, `offset` and `unreadOnly`. Searching by
text or by `type` is therefore computed over whatever pages have been pulled, which is
why the empty state says "None of your 50 **loaded** notifications match…" instead of a
count. Requested: `type` (repeatable) and `q` parameters, with `total` reflecting the
filtered count. Related: there is no way to list archived rows (`DELETE /:id` sets
`archived: true` and the row is gone from every query), and no un-read — a notification
can be marked read but never returned to unread. Requested: `archived=true` on the list
route and `PATCH /:id/unread`.

**f. Dead code in the notification path.**
`controllers/notificationsController.js` is referenced by nothing in `backend/src`
(grep for `notificationsController` returns only its own definition), and
`services/notificationManager.js` is a six-line stub whose only `send: () => Promise.resolve()`
is imported at `index.js:84` and never called. Both read as live notification systems
to anyone auditing delivery. Requested: delete them, or wire the manager into the
startup path it appears to describe.

## 9. The published `/downloads/node/` bundle shares this origin with the dev app

`storeSync.initialize()` (see `mallchain-os-v14/src/App.tsx:104`) broadcasts and accepts
whole-app snapshots across every tab on the same origin. The node-download landing pages
under `/downloads/node/` are served from that same origin and ship their own copy of the
app store. Observed live: a tab left open on `/downloads/node/#/auth` overwrote the signed-in
identity in the dev tab's `localStorage` — the bell and dashboard fell back to an empty,
unauthenticated session while `/api/auth/me` still reported the real user.

Requested on the backend/infra side: serve the published bundles from a separate origin
(subdomain or distinct port) so their `localStorage` namespace cannot collide with the
account app. Frontend will additionally harden `storeSync` so an inbound snapshot can
never replace a server-verified identity, only wallet-local hints — tracked with the
KYC-gate work in this branch.

## 10. API key scopes and per-key rate limits are recorded, not enforced

`middleware/apiKeyAuth.js:12` is `apiKeyAuth(requiredScopes = [])`, and all three
mounts pass nothing: `index.js:851` (`GET /metrics`), `mallwallet/routes/treasury.js:7`
and `:21` (`GET /api/mallwallet/treasury/metrics`, `GET /api/mallwallet/treasury/history`).
Those are the only endpoints that accept an API key at all. `requireScope()`
(`apiKeyAuth.js:113`) and `rateLimit()` (`apiKeyAuth.js:137`) are exported from the same
file and imported nowhere in `backend/src`.

Consequences today:

- a key minted with only `read:profile` reads treasury metrics and treasury history —
  the scope list cannot narrow a key, so it cannot be used to hand an integration a
  small grant;
- `rateLimitPerMinute` (accepted up to 10000 by `routes/apiKeys.js:44`) has no effect;
  only the global `apiLimiter` applies;
- what *is* enforced, and can be quoted to users honestly: expiry and revocation
  (`apiKeyAuth.js:45`) and the IP whitelist (`apiKeyAuth.js:57`).

Requested:
1. pass the required scope at each mount, e.g. `apiKeyAuth(['read:metrics'])` — note
   the enum in `models/apiKey.js:36` currently lists only the ten UI scopes, none of
   which names metrics or treasury, so it needs a value added (or the endpoints mapped
   onto existing ones);
2. mount `rateLimit()` behind those routes so the stored number means something;
3. either expose more endpoints to keys or retire the scopes that describe endpoints
   which cannot take one (`write:*`, `admin:*`) — keeping them in the picker invites
   users to believe they are granting least privilege.

The Settings panel now labels both fields as recorded-only and lists the three
endpoints a key actually opens; that wording should be reversed when 1 and 2 land.

## 11. Notification preferences: one merge now, four leftovers

`services/notificationPolicy.js` (new on this branch) is the single place the two
preference documents — `NotificationPreferences.channels.<channel>` and
`UserSettings.notifications.<channel>.<category>` — are combined. The template engine
(`notificationEngine.js`), the admin broadcast fan-out (`notificationDispatcher.js`) and
`GET /api/notification-preferences/effective` all call it, so the UI and the senders
cannot disagree any more. Four things still need a backend decision:

**a. `NotificationPreferences.channels.push` is dead.** Stored, was rendered as a
switch under "Notification Channels", and read by nothing: grepping `channels.push`
across `backend/src` (excluding tests) returns no reader. The in-app channel is
`channels.inApp`. Requested: delete the field (and its default) or wire it; the UI no
longer offers it.

**b. Quiet hours cannot suppress a templated event.** `notificationCatalogue.js:19`
sets `transactional: true` on every template built by `t()`, and
`notificationEngine.js:291` skips delivery on DND only when `!template.transactional`.
So `dndActive` is computed and then ignored for every catalogue event; only the
broadcast path in `notificationDispatcher.js` is actually suppressed. Requested: mark
genuinely transactional templates (withdrawal confirmed, 2FA, KYC decision) as such and
let the rest respect quiet hours — otherwise the Settings copy "alerts in the window are
skipped, not delivered later" is true for one of the two senders.

**c. `PATCH /channels` and `PATCH /frequency` replace whole subdocuments**
(`routes/notificationPreferences.js:71` and `:131` pass the body object straight into
`findOneAndUpdate`). A client that sends one key blanks the others to their schema
defaults. The panel works around this by reading the stored object and sending it back
with one key changed; requested: `$set` the individual keys (`channels.$set`, or a
merge) so a partial write is safe.

**d. `categoryToFrequencyKey('support')` returns `'system'`**, which is not one of the
six frequency keys, so support events always resolve to `immediate` and cannot be
paused. This is preserved as-is to avoid changing delivery under the merge refactor.
Requested: decide whether `support` is its own frequency key or maps to `security`.
