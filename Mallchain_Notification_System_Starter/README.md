# Mallchain Notification System — Starter Code

This is a source-controlled starter package for Mallchain's unified notifications. It contains:
- Typed event definitions and notification envelope
- A catalogue of notification templates for account, wallet, MLCNS, MLPTS, mining, marketplace, security, governance, blockchain and infrastructure
- A renderer with required-variable validation and HTML escaping
- A preference-aware channel policy
- Idempotency helper and queue/adapter interfaces
- An in-memory demo adapter and Node test suite

## Important scope

This is an integration-ready **starter**, not a claim that live email/SMS/push delivery is already configured. It does not connect to Mallchain's real database, blockchain RPC, authentication service, Redis/BullMQ, email/SMS provider, or frontend. Integrate it with the real repository and use authoritative events from those systems.

Never put passwords, private keys, recovery phrases, or OTP values in logs. Do not mark transactions successful until the authoritative transaction service confirms the required state.

## Requirements

- Node.js 20+
- TypeScript 5+
- `npm install` (dev dependencies only)

## Quick start

```bash
npm install
npm test
npm run demo
```

## Integration outline

1. Import `createNotification` and `dispatchNotification` from `src/engine.ts`.
2. Emit events from real business services only after validating the authoritative state.
3. Connect `NotificationRepository` to a durable database.
4. Connect `NotificationQueue` to BullMQ/Redis or the queue already used by Mallchain.
5. Implement `DeliveryAdapter` with configured email/SMS/push/in-app providers.
6. Persist idempotency keys with a unique database constraint; in-memory deduplication is only for demos/tests.
7. Add an outbox or equivalent reliable publication mechanism for DB changes + queued events.
8. Add integration tests against the actual Mallchain APIs and chain event listener.
9. Configure secrets through the deployment secret manager, never source control.

## Event lifecycle

Recommended status vocabulary:
`requested`, `pending`, `broadcast`, `included`, `confirmed`, `finalized`, `failed`, `rejected`, `cancelled`.

The actual allowed states depend on the Mallchain chain and service. Avoid using `completed` unless its meaning is defined per event.

## Environment

See `.env.example`. Values are placeholders. No credentials are included.
