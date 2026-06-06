# Model Routing Policy

Purpose: keep quality high while controlling token cost and turnaround time.

## Profiles

| Profile | Planner | Backend | Frontend | QA | Verifier | Committer | When to use |
|---|---|---|---|---|---|---|---|
| Lean | sonnet | sonnet | sonnet | sonnet | sonnet | haiku | Early exploration, throwaway spikes |
| Balanced (default) | sonnet | sonnet | sonnet | sonnet | opus | haiku | Standard delivery for PRD implementation |
| Deep | opus | sonnet | sonnet | opus | opus | haiku | High-risk releases, severe incidents, complex architecture pivots |

## Escalation Rules

Escalate a step from `sonnet` to `opus` when any of these is true:

- PRD ambiguity remains after one clarification round
- Security-critical or data-integrity-critical change
- Two consecutive rollback cycles on the same step
- Smoke test reports any Critical issue
- Final pre-ship signoff for complex workflows

De-escalate back to `sonnet` after the blocking issue is resolved.

## Reliability Gates

A scaffold run is considered reliable only if all are true:

- `/review` passes with no unresolved failures
- `/smoke-test` has zero Critical/High findings
- Rollback cycles are `<= 1`
- Resume marker remains valid throughout (`docs/.scaffold-state.json`)
- PRD traceability is complete (`docs/prd` current + history)

## Cost/Time Metrics

Track metrics per run:

| Run ID | PRD Version | Profile | Total Tokens | Wall Time (min) | Rollbacks | Smoke Critical/High | Outcome |
|---|---|---|---:|---:|---:|---:|---|
| YYYYMMDD-01 | v1 | Balanced |  |  |  |  |  |

## Decision Rule

Choose the cheapest profile that still meets the reliability gates.

If two consecutive runs fail gates under `Balanced`, switch the next run to `Deep` for planning + QA + verifier phases.
