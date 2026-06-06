---
name: plan
description: Run interview intake and architecture planning as a standalone step. Use when you have a PRD or spec and need to produce the architecture plan and API contract before scaffolding. Delegates to the planner agent. Triggers on "plan this", "plan the architecture", "run intake", "architecture planning", or any request to analyze a spec and produce a task list before writing code.
---

# /plan

Runs the full planning workflow as a standalone session — intake, architecture, API contract — without launching the full `/scaffold` sequence.

## When to use

- You have a `docs/prd/PRD-current.md` and want to plan before committing to scaffold
- You want to iterate on architecture before dispatching implementation agents
- You need `docs/architecture.md` and `docs/api-contract.md` to exist before calling `/scaffold`
- You want to run `/plan` and review the output, then call `/scaffold` to resume from Step 2

## What this produces

1. `docs/architecture.md` — components, data flow, ASCII diagram, architecture decisions
2. `docs/api-contract.md` — complete endpoint table (method, path, request, response, auth)
3. Task list with [MVP]/[NICE] tags and time budget
4. Open questions and risks surfaced before implementation begins

## Execution

Delegate immediately to the `planner` agent with the following context:

1. **Read** `docs/prd/PRD-current.md` — this is the source of truth. Note the PRD version from `docs/prd/README.md` if present.
2. **Check** for an existing codebase (run `ls` at project root). If files exist beyond docs/, inspect stack choices, existing routes, DB schema, and auth setup before proposing architecture.
3. **Run intake**: ask the 5 clarifying questions (auth, real-time, DB, caching, existing code) — skip any clearly answered by the PRD.
4. **Produce** the architecture plan and API contract per `planner.md` output format.
5. **Present** the Architecture Confirmation Protocol checklist and wait for explicit confirmation before declaring planning complete.

## Output artifacts

Both files must exist and be committed before dispatching backend/frontend agents:

- `docs/architecture.md`
- `docs/api-contract.md`

## After planning

Once confirmed, you can either:
- Run `/scaffold` — it will detect existing planning artifacts and resume from Step 2 (backend dispatch)
- Run `/resume` — same effect if scaffold state was initialized

## Notes

- Do not modify `docs/.scaffold-state.json` during `/plan` — that is scaffold's responsibility
- If `docs/prd/PRD-current.md` does not exist, prompt the user to paste the spec and offer to create it first
