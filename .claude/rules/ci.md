# CI Rules

Applies to all GitHub Actions workflow authoring (`.github/workflows/`).

## Required Workflow: `ci.yml`

Every project must have a single `ci.yml` that runs on every push and pull request to `main`/`master`.

## Job Order

Jobs must run in this sequence (each depends on the previous):

```
lint → unit-test → integration-test → e2e → build
```

Rationale: fast feedback first (lint/unit), then slower checks. Never skip a stage.

## Standard `ci.yml` Structure

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  unit-test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/

  integration-test:
    needs: unit-test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379

  e2e:
    needs: integration-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: docker compose up -d --wait
      - run: npx playwright test --reporter=github
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  build:
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose build
```

## Key Rules

- `fail-fast: false` on matrix jobs — collect all failures before stopping
- Always cache `node_modules` via `actions/setup-node` `cache: npm`
- Upload test artifacts (`coverage/`, `playwright-report/`) on failure for debugging
- Use `--wait` with `docker compose up` in e2e to ensure health checks pass before tests run
- Pin action versions (`@v4`) — never use `@latest`

---

## Python Stack CI

For Python (FastAPI) projects, replace the Node.js job steps with these equivalents. The job sequence (lint → unit → integration → e2e → build) stays the same.

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt
      - run: ruff check .          # linting
      - run: mypy . --strict       # type checking

  unit-test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt
      - run: pytest tests/unit/ --cov=app --cov-report=term-missing --cov-fail-under=80
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: htmlcov/

  integration-test:
    needs: unit-test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt
      - run: alembic upgrade head
      - run: pytest tests/integration/ -v
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
          REDIS_URL: redis://localhost:6379
```

**Security audit step** — add to `unit-test` job after installing deps:
```yaml
      - run: pip-audit --requirement requirements.txt
```

**Key differences from Node.js CI:**
- Use `actions/setup-python@v5` with `cache: pip`
- `ruff` for linting (fast), `mypy --strict` for types
- `alembic upgrade head` before integration tests to apply migrations
- `pip-audit` for dependency CVE scanning
- Coverage via `pytest-cov`; gate with `--cov-fail-under=80`
