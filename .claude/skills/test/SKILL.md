# Skill: test

Run the full test suite and surface a structured summary of results.

## When to Use

Invoke `/test` to get a complete picture of test health across all layers. Useful after making changes, before `/review`, or to diagnose a failing CI build.

## Execution

Run each layer in order and collect results. Do not stop on failure — run all layers and report everything.

### 1. Unit Tests + Coverage

```bash
npm test -- --coverage
# or
pytest --cov=. --cov-report=term-missing
```

Capture:
- Total tests: passed / failed / skipped
- Coverage percentage (lines)
- Names of any failing tests with their error messages

### 2. Integration Tests

```bash
npm run test:integration
# or
pytest tests/integration/
```

Capture:
- Total tests: passed / failed / skipped
- Names of any failing tests
- Whether DB/Redis connectivity was the cause of any failures

### 3. E2E (Playwright)

Ensure the stack is running first (`docker compose up -d --wait`), then:

```bash
npx playwright test
```

Capture:
- Total specs: passed / failed / skipped
- Names of failing specs and the step that failed
- Screenshots or traces available (check `playwright-report/`)

## Output Format

Report results grouped by layer:

```
## Unit Tests
- Passed: 42 | Failed: 2 | Skipped: 0
- Coverage: 83%
- FAILED: user.service.test.ts > createUser > throws on duplicate email
  Error: Expected 409, got 500

## Integration Tests
- Passed: 8 | Failed: 0 | Skipped: 0

## E2E Tests
- Passed: 5 | Failed: 1 | Skipped: 0
- FAILED: auth.spec.ts > login flow > shows error on wrong password
  Step: click submit button
  Error: Timeout waiting for getByTestId('error-message')

## Summary
Unit: FAIL | Integration: PASS | E2E: FAIL
Action needed: fix 2 unit tests, 1 e2e spec
```

After reporting, suggest the most likely root cause for each failure and the next debugging step.
