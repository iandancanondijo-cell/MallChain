# Runbook: Emergency maintenance mode activation

Use when a money-moving feature needs to be paused fast — an active
incident, a suspected exploit, an upstream (Safaricom/chain) outage where
letting requests through just produces confusing failures instead of a
clear "paused" message.

## How it actually works

Backend: `MaintenanceMode` singleton document (one collection-wide record),
enforced by `maintenanceGuard(scope)` middleware already wrapped around
every money-moving route group in `index.js` (`vault`, `send`, `marketplace`,
`payment`, `buy`, `badge`, `withdraw`, `staking`, `key-vault`, `dex`).

Frontend: a real, live banner (`services/maintenanceApi.ts`'s
`useMaintenanceStatus()`, polled every 60s) shows the actual state to every
user — this is not the old per-browser fake toggle that used to exist here.

## Activate

```
POST /api/admin/maintenance
Authorization: (superadmin session)
{ "global": true, "reason": "Investigating a payment processing issue — cash-out and purchases are paused." }
```

Or pause one scope only, leaving the rest of the platform working:

```
POST /api/admin/maintenance
{ "scope": "withdraw", "paused": true, "reason": "..." }
```

Valid scopes: `send`, `withdraw`, `buy`, `payment`, `marketplace`, `staking`,
`vault`, `key-vault`, `badge`, `dex` (`MAINTENANCE_SCOPES` in
`routes/adminPanel.js`).

Requires superadmin — the same bar as user role changes/deletes
(`requireSuperAdmin`). The `reason` field is what users actually see in the
banner — write it for them, not just for the audit log.

## Check current state (no auth needed)
```
GET /api/maintenance
```
This is what the frontend banner itself polls — use it to confirm the
toggle actually took effect from the user's point of view, not just that
the POST returned 200.

## Deactivate
Same endpoint, `paused: false` / `global: false`. **Don't forget this step**
— nothing times out or auto-clears; a maintenance flag left on after an
incident is resolved is itself now an incident.

## Every toggle is audited
`auditLog('maintenance_mode_change', req.user, {...})` — check `AuditLog`
for who flipped what and when if there's ever a question about it.
