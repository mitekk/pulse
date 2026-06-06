# Skill: resume

Recover an interrupted scaffold workflow using the committed marker file.

## When to Use

Invoke `/resume` when a `/scaffold` run was interrupted (context cleared, session ended, or handoff to another session) and you need a deterministic re-entry step.

Scope: scaffold workflow only.

## Source of Truth

Use only `docs/.scaffold-state.json`.

No fallback inference from:
- `git log`
- commit message patterns
- ad hoc artifact guesses

If the marker file is missing, fail with:
- `Resume unavailable: docs/.scaffold-state.json is missing. Start with /scaffold to initialize workflow state.`

## Validation

Validate the marker before any recommendation:

1. JSON is valid
2. `workflow === "scaffold"`
3. `schema_version === 1`
4. `status` is one of: `in_progress`, `blocked`, `completed`
5. `last_completed_step` is one of: `0, 1, 2, 3, 3.5, 4, 5, 5.5, 5.7, 5.9, 6`
6. `next_step` is one of: `1, 2, 3, 3.5, 4, 5, 5.5, 5.7, 5.9, 6`
7. `updated_at` is an ISO-8601 UTC timestamp
8. `blockers` (if present) is an array of strings
9. `last_commit` (if present) is a non-empty string
10. `prd_version` (if present) matches `v[0-9]+`
11. `prd_path` (if present) is a non-empty string
12. `parallel_pending_steps` (if present) is an array containing only `2` and/or `3`

If validation fails, stop and return:
- exactly which field is invalid
- the expected values/shape
- repair action: update `docs/.scaffold-state.json`, then run `/resume` again

**Corruption recovery** — if the file is unparseable JSON or has unrecoverable structure:
1. Print the raw file contents so the user can inspect it
2. Run `git log --oneline -10` and look for the last commit message matching a scaffold checkpoint pattern (e.g., `docs: add architecture`, `feat(backend)`, `feat(frontend)`, `test:`, `chore: verify ship`)
3. Infer `next_step` from the last checkpoint found and tell the user: "Based on git history, you appear to be at step N. To resume, manually set `next_step` to N in `docs/.scaffold-state.json` and re-run `/resume`."
4. If git log is also unhelpful, list the artifact check table above and ask the user which artifacts exist to determine the likely step.

## Required Artifact Checks by `next_step`

Before producing final guidance, validate artifacts for the marker `next_step`.

| next_step | Required artifacts |
|---:|---|
| 1 | `docs/prd/PRD-current.md`, `docs/prd/README.md` |
| 2 | `docs/prd/PRD-current.md`, `docs/architecture.md`, `docs/api-contract.md` |
| 3 | `docs/prd/PRD-current.md`, `docs/architecture.md`, `docs/api-contract.md` |
| 3.5 | `docs/prd/PRD-current.md`, `frontend/Dockerfile`, `docs/api-contract.md`, `docker-compose.yml` |
| 4 | `docs/prd/PRD-current.md`, `docs/api-contract.md` |
| 5 | `docs/prd/PRD-current.md`, `docs/architecture.md`, `docs/api-contract.md` |
| 5.5 | `docs/prd/PRD-current.md`, `.github/workflows/ci.yml` |
| 5.7 | `docs/prd/PRD-current.md`, `.github/workflows/ci.yml`, `tests/e2e/` |
| 5.9 | none |
| 6 | `README.md` |

If any required artifact is missing:
- keep the same `next_step`
- mark result as blocked in report output
- list exact missing path(s)
- recommend creating/fixing missing artifacts first

## Resume Report Output

Always output this structure:

```markdown
## Resume Report
- Workflow: scaffold
- Status: <in_progress|blocked|completed>
- Last completed step: <value>
- Next step: <value>
- Updated at: <timestamp>
- Last commit: <hash|not set>
- PRD version: <vN|not set>
- PRD path: <path|not set>
- Parallel pending steps: <[2,3]|[]>

### Artifact Check
- PASS: <path>
- FAIL: <path> (missing)

### Required Context for Re-entry
- <exact docs/files to pass to the next agent or command>

### Recommended Next Action
<exact command or delegation payload>
```

## Next Action Mapping

Use this mapping for the final recommendation:

| next_step | Recommended next action |
|---:|---|
| 1 | Run `/scaffold`, capture/update PRD snapshot in `docs/prd/`, and start Step 1 intake from `docs/prd/PRD-current.md` |
| 2 | Delegate Step 2 to `backend` with `docs/architecture.md` + backend-tagged tasks |
| 3 | Delegate Step 3 to `frontend` with `docs/architecture.md` + `docs/api-contract.md` |
| 3.5 | Run Step 3.5 compose assembly + API contract reconciliation |
| 4 | Run `/review --static` |
| 5 | Delegate Step 5 to `qa` with architecture + API contract context |
| 5.5 | Run `/review` |
| 5.7 | Run `/smoke-test` |
| 5.9 | Run retrospective: ADR updates for smoke findings, then checkpoint commit if needed |
| 6 | Run ship verification with `committer` |

Completed workflow rule:
- If `status` is `completed` and `last_completed_step` is `6`, output: `No actionable resume path: scaffold workflow is complete.`

## Behavior Constraints

- Recommendation-only: never auto-dispatch agents
- Never mutate files during `/resume`
- Stop after guidance and wait for user action
