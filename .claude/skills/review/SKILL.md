# Skill: review

Pre-submission checklist for interview coding challenges.

## When to Use

- `/review --static` — run at scaffold Step 4 (pre-QA). Fast static checks only; no running stack required. Gives QA a type-clean, lint-clean, API-correct baseline to write tests against.
- `/review` — run at scaffold Step 5.5 (post-QA). Full checklist: tests, Docker, E2E. All checks are meaningful only after QA has written the test suite.

## Static Checklist (`/review --static`)

Work through each item in order. Report pass/fail with specific details on failures.

### Types & Lint

- [ ] `npm run typecheck` (or `mypy`) exits 0 — no type errors
- [ ] `npm run lint` exits 0 — no lint errors or warnings

### API Conventions

> Standards defined in `.claude/rules/api.md` — check compliance before marking review passed.

- [ ] All API endpoints under `/api/v1/` prefix (no unversioned routes)
- [ ] Every error response uses the required shape: `{ error: { code, message, details } }`
- [ ] All list endpoints return the pagination envelope: `{ data, pagination: { page, limit, total, totalPages } }`
- [ ] No JWT or auth tokens stored in `localStorage` — `git grep -r "localStorage" -- 'frontend/src'` returns nothing auth-related
- [ ] CORS origin is an explicit allow-list — no `Access-Control-Allow-Origin: *` in backend config

### Security / Secrets

- [ ] No `.env` file committed (check `git status` and `git log`)
- [ ] `.env.example` exists with placeholder values for all required vars
- [ ] No hardcoded credentials, API keys, or secrets in source code
- [ ] `git grep -r "password\|secret\|api_key" -- '*.ts' '*.py' '*.js'` returns nothing sensitive
- [ ] Auth endpoints are rate-limited (login, register, password reset) — check backend route config
- [ ] Security headers set: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` — check backend middleware
- [ ] Passwords not exposed in API responses: `git grep -rn '"password"' -- 'tests/'` returns nothing

### PRD Traceability

- [ ] `docs/prd/PRD-current.md` exists and contains the current requirements snapshot
- [ ] `docs/prd/README.md` exists and includes version history (`v1`, `v2`, ...)
- [ ] `docs/.scaffold-state.json` has `prd_version` and `prd_path` fields aligned with the current PRD

### README

- [ ] README exists with: project description, prerequisites, setup steps, how to run tests, environment variables table
- [ ] README includes a "Local Development" section with Docker hot reload workflow and service ports

## Full Checklist (`/review`)

Run the static checklist above first, then continue with the sections below.

### Tests

- [ ] `npm test` (or `pytest`) exits 0 — all unit and integration tests pass
- [ ] Coverage is at or above 80% — check coverage report output
- [ ] No skipped or `.only` tests left in the codebase

### Docker

- [ ] `docker compose build` exits 0 — all images build successfully
- [ ] `docker compose up --wait` exits 0 — all services reach healthy state
- [ ] `GET /health` returns HTTP 200 `{ "status": "ok" }` on the running stack
- [ ] `docker-compose.override.yml` exists and enables backend/frontend hot reload without rebuild
- [ ] `docker compose down -v` cleans up without errors

### E2E

- [ ] `npx playwright test` passes against the Dockerized stack
- [ ] No flaky tests (run twice if unsure)

### Dependency Audit

- [ ] `npm audit --audit-level=high` exits 0 — no high or critical vulnerabilities
- [ ] (Python) `pip-audit` exits 0 — no known vulnerabilities in dependencies

## Output Format

Report results as a checklist with pass/fail status. For each failure, include:
- What failed
- The exact error or file location
- What needs to be fixed

Do not mark the review as passed until all applicable items are checked.
