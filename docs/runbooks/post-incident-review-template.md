# Post-incident review template (OPS4)

Copy this for every real incident (and every Game Day drill —
`docs/disaster-recovery/game-day-checklist.md`). Fill it out once things are
stable, not during the incident itself.

## Summary

- **Date/time (start → resolved):**
- **Severity:**
- **Runbook(s) used:** (link the specific file(s) under `docs/runbooks/`)
- **One-sentence summary:**

## Timeline

| Time (UTC) | Event |
|---|---|
| | First alert / first report |
| | Acknowledged by |
| | Root cause identified |
| | Mitigation applied |
| | Confirmed resolved |

## Impact

- Who/what was affected (users, specific feature, financial impact if any)?
- Duration of user-visible impact (not the same as total incident duration —
  note both).
- Did any maintenance-mode scope get activated? Was it deactivated
  afterward? (Runbook 09 explicitly warns about forgetting this step —
  confirm it here.)

## Root cause

Not "what broke" (that's the summary above) — *why* it broke. Keep asking
"why" past the first obvious answer.

## What went well

Don't skip this section — a genuinely fast, correct response is worth
recording as much as a gap, so the team knows what to keep doing.

## What could have gone better

- Did the relevant runbook (if one existed) actually match what really
  happened, or did the team have to improvise a step it didn't cover?
- Did an alert fire when it should have? Too late? Not at all
  (check whether `monitoring/prometheus/alert_rules.yml` actually covers
  this failure mode)?
- Did the RTO/RPO targets in `docs/disaster-recovery/disaster-recovery-plan.md`
  hold up, or were they optimistic?

## Action items

| Action | Owner | Due | Status |
|---|---|---|---|
| | | | |

Every item here should be something concrete enough to close, not "be more
careful" — if the finding was "no runbook existed for X," the action item
is "write `docs/runbooks/NN-x.md`," not a vague intention.
