# Project Instructions

## What This Is

Fullstack interview coding challenge workspace. Requirements arrive as specs; output is a working fullstack app, ready to run and reviewed against a Definition of Done.

## Stack

| Layer | Default choices |
|-------|----------------|
| Frontend | React + Vite + TypeScript |
| Backend | Node/Fastify + TypeScript **or** Python/FastAPI |
| Database | PostgreSQL **or** MongoDB |
| Cache | Redis (when needed) |
| Infrastructure | Docker Compose |
| CI | GitHub Actions |

## Key Directories

```
frontend/        React app
backend/         API server
docs/
  prd/
    PRD-current.md     Latest accepted PRD snapshot (source for planning/resume)
    README.md          PRD version history
  model-routing-policy.md  Model profile + escalation gates for cost/quality balance
  architecture.md   Architecture plan (produced by planner, consumed by backend/frontend/qa)
  api-contract.md   API contract (planner → backend updates → frontend, qa)
  .scaffold-state.json  Scaffold workflow checkpoint marker (source of truth for /resume)
  adr/              Architecture Decision Records (one per significant decision)
    README.md       ADR index
tests/
  integration/   Integration tests
  e2e/           Playwright end-to-end tests
.github/
  workflows/     CI pipelines
```

## Golden Commands

```bash
docker compose up --build    # Lift full stack
npm run dev                  # Frontend dev server
npm run test                 # Unit + integration tests
npm run test:coverage        # With coverage report
npx playwright test          # E2E suite
npm run lint                 # Lint check
npm run typecheck            # TypeScript check
```

## Interview Workflow

1. Run `/prd` first — turn raw requirements (MD, PDF, text) into a versioned PRD snapshot (`docs/prd/PRD-vN.md`) and initialize workflow state.
2. Run `/scaffold` — orchestrates the full sequence (intake → backend → frontend → review → QA → smoke test → retrospective → ship). See `.claude/skills/scaffold/SKILL.md` for the authoritative steps and commit sequence.
If the workflow is interrupted, run `/resume` to get the exact re-entry step from `docs/.scaffold-state.json`.
For PRD-driven delivery, keep `docs/prd/PRD-current.md` updated and versioned in `docs/prd/README.md`.

## Definition of Done

- [ ] All unit and integration tests pass
- [ ] TypeScript compiles / Python types valid (`mypy --strict`)
- [ ] Lint clean (no errors)
- [ ] `docker compose up --build` succeeds and stack is healthy
- [ ] E2E suite passes against dockerized stack
- [ ] No `.env` committed; `.env.example` provided
- [ ] No secrets or credentials in source code
- [ ] `npm audit --audit-level=high` (or `pip-audit`) passes — no high/critical CVEs
- [ ] README has: setup steps, env vars, how to run tests
- [ ] Smoke test passes — verifier agent finds no critical/high issues
- [ ] Data integrity verified — unique constraints, no NULLs in required fields
- [ ] Hot reload works in Docker (docker-compose.override.yml provided)

## Time-Boxing

Managed by the `planner` agent. See [`.claude/agents/planner.md`](.claude/agents/planner.md) for the [MVP]/[NICE] protocol, the 3-hour default, and the execution sequence.

## Model Routing

Use [docs/model-routing-policy.md](docs/model-routing-policy.md) as the default routing and escalation policy to balance reliability, cost, and turnaround time.

## Skills

| Invoke | Use when |
|--------|----------|
| `/prd` | Turn raw requirements (MD, PDF, text) into a versioned PRD snapshot — run before `/scaffold` |
| `/scaffold` | Starting a new challenge — intake, architecture, full stack setup |
| `/plan` | Run intake + architecture planning standalone (reads PRD, produces architecture + API contract) |
| `/resume` | Resume an interrupted scaffold workflow from the committed marker state |
| `/review` | Pre-submission DoD checklist |
| `/test` | Full test suite run with layered failure report |
| `/debug` | Stack won't start, tests fail unexpectedly, CI is red |
| `/smoke-test` | Runtime verification — boot the app, interact with it, find bugs tests missed |
| `/adr` | Document an architecture decision as a MADR file (callable at any point) |
| `/commit` | Stage, draft, and create a conventional commit (project-aware checkpoint sequence) |

## Skill Priority (Superpowers vs Local)

For this project, local skills take precedence over superpowers equivalents where they overlap:
- `/prd` > any generic PRD creation approach — local versions the file, updates state, and prepares the exact artifact scaffold expects
- `/debug` > `superpowers:systematic-debugging` — local routes failures to the correct scaffold step and owning agent
- `/plan` > `superpowers:writing-plans` — local reads `docs/prd/PRD-current.md` and runs the Architecture Confirmation Protocol
- `/review` > `superpowers:requesting-code-review` — local checks the project's specific Definition of Done

All other superpowers skills have no local equivalent and should be used freely: `brainstorming`, `using-git-worktrees`, `receiving-code-review`, `subagent-driven-development`, `verification-before-completion`, `finishing-a-development-branch`.

## Agents

Delegate tasks to the appropriate specialist agent:

| Agent | Use when |
|-------|----------|
| `frontend` | Building any web UI — pages, components, dashboards, forms, web apps, HTML/CSS/JS |
| `backend` | APIs, databases, auth, business logic, data models, migrations, infrastructure |
| `qa` | Writing tests, finding bugs, reviewing code for correctness, auditing coverage |
| `planner` | Planning features, designing architecture, breaking down tasks, evaluating approaches |
| `committer` | Documenting completed work, staging files, writing conventional commits with context |
| `adr` | Documenting architecture decisions — stack selection, auth strategy, key trade-offs |
| `verifier` | Runtime smoke testing — adversarial user interaction via Playwright MCP |
