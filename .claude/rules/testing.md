# Testing Rules

Applies to all code in this project.

## TDD Cycle

Write the failing test first, then make it pass, then refactor. Never write implementation code without a corresponding test. The red → green → refactor loop is non-negotiable.

## Test Layers

| Layer | Location | Scope | Speed |
|-------|----------|-------|-------|
| Unit | Alongside source (`*.test.ts`) | Single function/class, all dependencies mocked | <1ms each |
| Integration | `tests/integration/` | Multiple modules + real DB, no external HTTP | <100ms each |
| E2E | `tests/e2e/` | Full stack via browser (Playwright) | <10s each |

## Coverage Gate

80% line coverage minimum. CI fails below this threshold. Track coverage trends — a drop needs a justification.

## What to Always Test

- Happy path
- Validation errors (missing fields, wrong types, out-of-range values)
- Auth/permission failures (unauthenticated, unauthorized role)
- Not-found cases
- Boundary values (empty list, single item, max page size)

## Playwright Conventions

- Selectors: `data-testid` attributes only — no CSS classes, no text matchers, no XPath
- Structure: page object model; one class per page in `tests/e2e/pages/`
- Scope: cover only critical user journeys (auth, primary CRUD, key error states)
- Environment: run against the full Dockerized stack, not a dev server
- Config: `playwright.config.ts` at project root; `webServer` points to Docker app URL

## Naming

Test names are specifications. Use the pattern: `it('returns 404 when user does not exist')` not `it('works')`. Group related tests with `describe` blocks matching the module name.
