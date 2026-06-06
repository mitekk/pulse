# Skill: debug

Structured triage for failures in the fullstack interview stack.

## Integration with Scaffold Flow

`/debug` is invoked at two explicit points in the scaffold workflow:

1. **After Step 4 (/review)** — for deep failures: Docker build broken, TypeScript errors, health check failing
2. **After Step 5 (QA)** — when `/test` reports unit, integration, or E2E failures

Always end a debug session with this structured output:
- **Root cause**: one sentence
- **Owning agent**: `backend` / `frontend` / `qa`
- **Recommended fix**: specific file or config change
- **Verification command**: exact command to confirm the fix worked

The scaffold flow uses this output to route the fix to the correct agent.

---

## When to Use

Invoke `/debug` when:
- `docker compose up` fails or a service is unhealthy
- Tests fail unexpectedly (unit, integration, or E2E)
- The frontend can't reach the backend API
- DB migrations error on startup
- CI is red but local is green (or vice versa)

## Triage Process

Work through these layers in order. Stop as soon as you locate the root cause.

### Layer 1: Identify the failing layer

Ask: where does the error originate?

| Symptom | Likely Layer |
|---------|-------------|
| Container won't start / exits immediately | Docker / app startup |
| Service starts but health check fails | Health endpoint / DB connection |
| `Cannot connect to database` | DB migration or connection string |
| API returns 5xx | Backend business logic or DB query |
| Frontend shows blank page or JS error | React render error or missing env var |
| E2E test timeout | Stack not running, wrong URL, or missing `data-testid` |
| CI red, local green | Missing env var in CI, different Node/Python version |

### Layer 2: Collect evidence

**Docker issues:**
```bash
docker compose logs <service>       # tail logs for a specific service
docker compose ps                   # check health status of all services
docker inspect <container_id>       # inspect exit code and env
```

**Backend issues:**
```bash
# Check the exact error from the backend logs
docker compose logs backend --tail=50

# Test health endpoint directly
curl -s http://localhost:3000/health | jq

# Test a specific API route
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password"}' | jq
```

**DB migration issues:**
```bash
# Node (e.g. with node-pg-migrate or similar)
docker compose run --rm backend npm run migrate

# Python (Alembic)
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic history
```

**Frontend issues:**
```bash
# Check browser console for JS errors (use Playwright MCP tool or browser devtools)
# Check that VITE_API_URL is set in .env
# Check Vite proxy config in vite.config.ts
```

**Test failures:**
```bash
# Run just the failing test file with verbose output
npx vitest run src/path/to/file.test.ts --reporter=verbose
pytest tests/path/to/test_file.py -v -s

# E2E: run a single spec with trace on
npx playwright test auth.spec.ts --trace=on
```

**CI vs local diff:**
```bash
# Compare Node/Python versions
node --version   # must match .nvmrc or engines in package.json
python --version # must match Dockerfile base image

# Check env vars — CI might be missing one
printenv | grep -i database
```

### Layer 3: Narrow to root cause

For each error message:
1. Read the full stack trace — the root cause is usually at the bottom, not the top
2. Check if it's a config/env issue (wrong URL, missing variable, wrong port)
3. Check if it's a code issue (null reference, wrong query, missing migration)
4. Check if it's a timing issue (service not ready, health check too fast)

### Layer 4: Fix and verify

1. Make the minimal change to fix the root cause
2. Restart only the affected service: `docker compose restart <service>`
3. Confirm the fix: re-run the failing command / test
4. Check for regressions: run the full test suite layer that was failing

## Common Fixes

| Problem | Fix |
|---------|-----|
| DB connection refused | Check `DATABASE_URL` in `.env`, ensure db service is healthy before app starts |
| Migration not applied | Add `depends_on: db: condition: service_healthy` + run migration on startup in dev |
| Port already in use | `lsof -i :3000` → kill the process, or change the port in `docker-compose.yml` |
| CORS error in browser | Check allowed origins in backend CORS config — must match frontend origin |
| E2E selector not found | Check `data-testid` attribute exists on the element; check Docker stack is running |
| 401 on all requests | JWT cookie not set (check `httpOnly` cookie config) or token expired |
| TypeScript errors in CI | Run `npm run typecheck` locally first; CI and local must use same `tsconfig.json` |
