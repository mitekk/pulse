# Skill: smoke-test

Runtime verification of the running application. Catches bugs that automated tests miss — stale UI state, data integrity issues, broken images, infrastructure problems.

## When to Use

- `/smoke-test` — invoked at scaffold Step 5.7 (after QA, after full review, before ship)
- Can also be invoked standalone any time the Docker stack is running and you want to verify behavior

## Prerequisites

Run these checks before delegating to the verifier. Fail fast if any are missing — do not proceed.

```bash
# 1. Confirm Docker stack is running and all services are healthy
docker compose ps
```

If any service is not running or unhealthy: stop and invoke `/debug` instead.

```bash
# 2. Confirm required docs exist
ls docs/prd/PRD-current.md docs/api-contract.md docs/architecture.md
```

If any file is missing: print the exact missing path and ask the user to provide it before proceeding. Do not run the smoke test against an incomplete spec — the verifier needs these docs to validate behavior.

The full Docker stack must be running:

```bash
docker compose up -d --wait
```

If the stack is not running, start it before proceeding. If it fails to start, invoke `/debug` instead.

## Execution

Delegate the entire smoke test to the `verifier` agent. Provide it with:
- The current PRD snapshot (`docs/prd/PRD-current.md`)
- The API contract (`docs/api-contract.md`)
- The architecture doc (`docs/architecture.md`)
- The app URL (typically `http://localhost:5173` for frontend, `http://localhost:3000` for backend)

The verifier agent runs 5 phases in order:
1. Infrastructure health (Docker, Redis, DB)
2. Data integrity (unique constraints, required fields, FK references)
3. API contract compliance (hit every endpoint, verify response shapes)
4. UI interaction testing (search, filter, navigation, forms, state consistency)
5. Cross-cutting concerns (loading states, error recovery, empty states)

## Interpreting Results

The verifier returns a structured report with PASS/FAIL per check and detailed issue descriptions.

### On PASS (all checks green)

Proceed to Step 5.9 (Retrospective) — which will be a no-op since nothing to fix.

### On FAIL (issues found)

Each issue includes an **owning agent** field. Route fixes accordingly:

| Owning Agent | Action |
|---|---|
| `backend` | Re-enter Step 2 with the specific issue as context |
| `frontend` | Re-enter Step 3 with the specific issue as context |
| `qa` | Fix directly in test files (e.g., shallow E2E tests flagged) |
| `infrastructure` | Fix in `docker-compose.yml`, Dockerfiles, or config |

**Fix protocol:**
1. Fix the specific issue only — no adjacent refactoring
2. Restart affected services: `docker compose restart <service>` or `docker compose up --build -d`
3. Re-run `/smoke-test` to verify the fix
4. Maximum 2 fix cycles; if still failing, escalate to the human

### Severity Guide

- **Critical**: App is broken for the user (wrong data shown, features don't work, data loss)
- **High**: Feature works incorrectly in edge cases (search count mismatch, stale state after navigation)
- **Medium**: UX issue (missing loading state, no error message on failure, broken image)

Critical and High issues block ship. Medium issues are documented and optionally fixed.

## Output to User

After the verifier completes, summarize:
1. Total checks run and pass rate
2. Critical/High issues (if any) with one-line descriptions
3. Recommended fix plan (which agents to re-enter)

Example:
```
Smoke test: 18/20 checks passed

FAIL (High): Search filters update count but not visible list — stale React Query cache
  → frontend agent: invalidate query on search param change

FAIL (Medium): Redis has no maxmemory set — will eventually fill disk
  → infrastructure: add maxmemory 256mb + allkeys-lru to compose
```
