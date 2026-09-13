# Game Day: failover drill checklist (DR3)

A scheduled, deliberate exercise — simulate a real failure on purpose,
in a non-production environment, and time how the team actually responds
against the DR plan's RTO targets. Not a tabletop discussion; actually pull
the plug and watch what happens.

## Before the drill

- [ ] Scheduled with the team, not a surprise to whoever's on call that week
      (a surprise drill tests alerting; this checklist is about testing the
      *procedure*, which needs people paying attention to learn from it)
- [ ] Running against a staging/drill environment, never production
- [ ] A real, recent backup exists (`scripts/backup.sh` run within the last
      24h) so the restore step in the drill isn't itself testing a stale backup
- [ ] `scripts/smoke-test.sh` run once beforehand against the target
      environment to confirm it's healthy before you break it on purpose

## Drill scenarios (pick one or more per session)

### 1. MongoDB loss
- [ ] Stop the Mongo instance (or revoke the backend's DB credentials)
- [ ] Time how long until `/api/health` reflects `database: {status: "error"}`
- [ ] Time how long until an alert fires (`monitoring/prometheus/alert_rules.yml`)
- [ ] Run `scripts/restore.sh` against a fresh instance
- [ ] Time to full recovery — compare against the RPO/RTO targets in
      `docs/disaster-recovery/disaster-recovery-plan.md`
- [ ] Note anything that took longer than expected, or any manual step that
      wasn't actually documented anywhere until someone had to improvise it

### 2. Redis loss
- [ ] Stop Redis
- [ ] Confirm the backend stays up and responds (fail-open behavior — see
      the DR plan's "why Redis has no backup" section) rather than crashing
- [ ] Confirm `/api/health` reports `redis: {status: "error"}` correctly
- [ ] Restart Redis, confirm the backend reconnects on its own without a
      restart (or note that it needs one — that's a real finding, not
      something to assume)

### 3. Chain node down
- [ ] Stop `marketplaced`
- [ ] Confirm `/api/ready` correctly reports not-ready (blockchain_unavailable)
- [ ] Confirm the backend does NOT silently accept writes it can't actually
      settle on-chain during this window
- [ ] Restart the node, time to chain re-sync + `/api/ready` going green again

### 4. Full regional/host outage
- [ ] Simulate by stopping every service at once
- [ ] Walk the full recovery procedure in
      `docs/disaster-recovery/disaster-recovery-plan.md` end to end
- [ ] Time the whole thing against the stated RTO

## After the drill

- [ ] Fill out `docs/runbooks/post-incident-review-template.md` — a drill
      finding a real gap is exactly as valuable as a real incident finding one
- [ ] File a follow-up for anything that took longer than the documented RTO,
      or that needed an undocumented manual step
- [ ] Update the DR plan / relevant runbook if the drill revealed it was wrong
      or incomplete, not just the finding written down and left there
