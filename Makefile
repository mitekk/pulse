# Makefile — PULSE monorepo workflows. Run `make help` for the target list.
#
# The integration/E2E targets mirror .github/workflows/ci.yml exactly (same
# compose files, ports, env, migration command) so local runs and CI cannot drift.

.DEFAULT_GOAL := help
.PHONY: help install dev up down logs build lint typecheck test \
        test-integration test-e2e migrate migrate-generate clean verify ship

# ── CI-parity knobs (keep in sync with .github/workflows/ci.yml) ──────────────
COMPOSE            := docker compose
E2E_FILES          := -f docker-compose.yml -f docker-compose.e2e.yml
TEST_FILES         := -f docker-compose.yml -f docker-compose.test.yml
FRONTEND_PORT      ?= 18080
WEB_ORIGIN         ?= http://localhost:18080
JWT_ACCESS_SECRET  ?= e2e_local_access_secret_32chars_long
JWT_REFRESH_SECRET ?= e2e_local_refresh_secret_32chars_long
BACKEND_CONTAINER  ?= tweeter-backend-1
TEST_DB_URL        := postgresql://tweeter:tweeter@localhost:5433/tweeter_test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n",$$1,$$2}'

install: ## Install all workspace deps (root npm install — hoists frontend+backend)
	npm install

dev: ## Run the full stack with hot reload (compose + override, foreground)
	$(COMPOSE) up --build

up: ## Start the full stack detached (compose + override)
	$(COMPOSE) up -d --build

down: ## Stop the stack
	$(COMPOSE) down

logs: ## Tail stack logs
	$(COMPOSE) logs -f

build: ## Build all packages (Turbo, cached)
	npx turbo run build

lint: ## Lint all packages (Turbo)
	npx turbo run lint

typecheck: ## Typecheck all packages (Turbo)
	npx turbo run typecheck

test: ## Unit tests for all packages (Turbo)
	npx turbo run test

test-integration: ## Backend integration tests (host-run vs dockerized db/redis on 5433/6380)
	$(COMPOSE) $(TEST_FILES) up -d db redis
	@echo "Waiting for Postgres to be healthy..."
	@until $(COMPOSE) $(TEST_FILES) exec -T db pg_isready -U tweeter >/dev/null 2>&1; do sleep 1; done
	-$(COMPOSE) $(TEST_FILES) exec -T db psql -U tweeter -d tweeter -c "CREATE DATABASE tweeter_test;" 2>/dev/null
	cd backend && DATABASE_URL=$(TEST_DB_URL) npm run migration:run
	cd backend && npm run test:integration
	$(COMPOSE) $(TEST_FILES) down

test-e2e: ## Full dockerized Playwright E2E (mirrors the CI e2e job)
	FRONTEND_PORT=$(FRONTEND_PORT) WEB_ORIGIN=$(WEB_ORIGIN) \
	JWT_ACCESS_SECRET=$(JWT_ACCESS_SECRET) JWT_REFRESH_SECRET=$(JWT_REFRESH_SECRET) \
	  $(COMPOSE) $(E2E_FILES) up -d --build --wait
	docker exec -w /app/backend $(BACKEND_CONTAINER) \
	  npx typeorm migration:run -d dist/infra/database/data-source.js
	PLAYWRIGHT_BASE_URL=$(WEB_ORIGIN) npx playwright test
	$(COMPOSE) $(E2E_FILES) down -v

migrate: ## Run TypeORM migrations against the local dev DB
	cd backend && npm run migration:run

migrate-generate: ## Generate a migration: make migrate-generate NAME=AddFoo
	cd backend && npm run migration:generate -- src/infra/database/migrations/$(NAME)

clean: ## Tear down volumes and remove dist/.turbo/node_modules
	-$(COMPOSE) down -v
	rm -rf .turbo node_modules \
	       frontend/dist frontend/.turbo frontend/node_modules \
	       backend/dist  backend/.turbo  backend/node_modules

verify: ## Pre-ship gate: lint + typecheck + unit + docker build + e2e
	npx turbo run lint typecheck test
	$(COMPOSE) build
	$(MAKE) test-e2e

ship: verify ## Run the full verify gate (run before the Step 6 ship commit)
	@echo "verify passed — safe to ship"
