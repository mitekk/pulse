# Backend Phase 1 — Foundation Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented and verified (typecheck ✓, lint ✓, build ✓, tests ✓)

---

## What Was Built

### 1. NestJS 11 + Fastify Bootstrap

- `backend/src/main.ts` — App factory: `NestFastifyApplication`, `@fastify/helmet`, CORS from `WEB_ORIGIN`, global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), global prefix `api/v1` (health excluded), trust proxy.
- `backend/src/app.module.ts` — Root module wiring all infra modules, global `AllExceptionsFilter` and `LoggingInterceptor` via `APP_FILTER`/`APP_INTERCEPTOR`.
- `backend/src/core/config.ts` — `EnvironmentVariables` class with `class-validator` + `plainToInstance` validation. Fails fast on boot if required vars are missing.

### 2. TypeORM + Database

- `backend/src/infra/database/database.module.ts` — `TypeOrmModule.forRootAsync`, `synchronize: false`, SSL gated on `NODE_ENV=production`.
- `backend/src/infra/database/data-source.ts` — Standalone `DataSource` for the TypeORM CLI (`migration:generate/run/revert`).
- `backend/src/infra/database/migrations/1704067200000-baseline.ts` — Reversible migration enabling `citext` + `pg_trgm` extensions.

### 3. Redis Module

- `backend/src/infra/redis/redis.module.ts` — `@Global()` module so `RedisService` is injectable everywhere.
- `backend/src/infra/redis/redis.service.ts` — Two ioredis connections: `client` (general) + `subscriber` (dedicated pub/sub). Health-check ping method.

### 4. BullMQ Queue Module

- `backend/src/infra/queue/queue.module.ts` — `BullModule.forRootAsync` with shared Redis connection, exponential backoff defaults, dead-letter via removeOnFail. Individual queues (fanout, media, etc.) registered in their owning domain modules in Phase 2+.

### 5. Object Storage

- `backend/src/infra/storage/storage.port.ts` — `StoragePort` interface + `STORAGE_PORT` injection token.
- `backend/src/infra/storage/minio-storage.service.ts` — Full `StoragePort` implementation: presigned PUT/GET, delete, exists check, auto-create bucket on init.
- `backend/src/infra/storage/storage.module.ts` — Provides `STORAGE_PORT` bound to `MinioStorageService`.

### 6. Common Layer

- `backend/src/common/utils/snowflake.util.ts` — 64-bit Snowflake ID generator (41-bit ms timestamp + 10-bit machineId + 12-bit sequence). Always returns `string`. Handles clock drift. Singleton via `SnowflakeUtil.instance`.
- `backend/src/common/utils/cursor.util.ts` — Opaque base64url cursor with `v1:` version prefix. Supports `{type:'id', id}` and `{type:'score_id', score, id}` payloads. Tamper-rejects on unknown version, bad JSON, wrong shape.
- `backend/src/common/filters/all-exceptions.filter.ts` — Maps all exceptions to `{error:{code,message,details}}` envelope. No stack traces exposed. Programmer errors logged at error level with request ID.
- `backend/src/common/interceptors/logging.interceptor.ts` — Attaches request ID, logs method + URL + status + duration.
- `backend/src/common/decorators/current-user.decorator.ts` — Param decorator skeleton (populated by AuthGuard in Phase 2).
- `backend/src/common/decorators/public.decorator.ts` — `@Public()` metadata decorator for AuthGuard bypass.
- `backend/src/common/decorators/rate-limit.decorator.ts` — `@RateLimit({max, windowSecs, keyPrefix})` metadata decorator.
- `backend/src/common/guards/rate-limit.guard.ts` — Redis sliding-window token-bucket guard. Keyed by `userId` (authed) or `ip` (anon). No-op when no `@RateLimit()` on route.

### 7. Health Endpoint

- `backend/src/health/health.controller.ts` — `GET /health` (excluded from `api/v1` prefix). Pings DB (`SELECT 1`) and Redis (`PING`). Returns `{status, db, redis}`.

### 8. Unit Tests (Vitest)

- `backend/tests/unit/snowflake.util.spec.ts` — 15 tests: string output, monotonicity, 10k no-collision, machineId validation, timestamp extraction, cross-machine uniqueness.
- `backend/tests/unit/cursor.util.spec.ts` — 16 tests: round-trip (ID + score_id + convenience helpers), base64url encoding, version prefix, tamper rejection (5 error cases), edge cases (large IDs, UUIDs).
- **31 tests, all passing.**

### 9. Docker

- `backend/Dockerfile` — Multi-stage (builder + runner), `node:22-alpine`, non-root `app` user, `EXPOSE 3000`, `CMD node dist/main.js`.
- `docker-compose.yml` (root) — `db` (postgres:16-alpine, shm_size 256mb, named volume, healthcheck), `redis` (7-alpine, maxmemory 256mb + allkeys-lru + no save, healthcheck), `minio` (with healthcheck), `createbuckets` (one-shot mc init), `backend` (depends_on all healthy, env from `.env`, log rotation).
- `docker-compose.override.yml` (root) — backend volume mount `./backend/src:/app/src` + `npx tsx watch src/main.ts` for hot reload.

### 10. Environment

- `.env.example` (root) — Extended with `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `SNOWFLAKE_MACHINE_ID`, `PORT`. All existing planner vars retained.

### 11. Tooling

- `backend/package.json` — All npm scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `migration:generate/run/revert`.
- `backend/tsconfig.json` — Strict TypeScript, `emitDecoratorMetadata`, `experimentalDecorators`, `paths: @/* → src/*`.
- `backend/nest-cli.json` — NestJS CLI config.
- `backend/eslint.config.mjs` — ESLint flat config with `typescript-eslint` + prettier.
- `backend/vitest.config.ts` — Vitest with 80% coverage gate, `@` alias.

---

## Key File Paths

| What | Where |
|------|-------|
| App bootstrap | `backend/src/main.ts` |
| Root module | `backend/src/app.module.ts` |
| Env config schema | `backend/src/core/config.ts` |
| Snowflake util | `backend/src/common/utils/snowflake.util.ts` |
| Cursor util | `backend/src/common/utils/cursor.util.ts` |
| Exception filter | `backend/src/common/filters/all-exceptions.filter.ts` |
| Rate-limit guard | `backend/src/common/guards/rate-limit.guard.ts` |
| Redis service | `backend/src/infra/redis/redis.service.ts` |
| BullMQ module | `backend/src/infra/queue/queue.module.ts` |
| Storage port | `backend/src/infra/storage/storage.port.ts` |
| MinIO impl | `backend/src/infra/storage/minio-storage.service.ts` |
| DB data source (CLI) | `backend/src/infra/database/data-source.ts` |
| Baseline migration | `backend/src/infra/database/migrations/1704067200000-baseline.ts` |
| Health endpoint | `backend/src/health/health.controller.ts` |
| Docker compose | `docker-compose.yml` (root) |
| Dev override | `docker-compose.override.yml` (root) |
| Backend Dockerfile | `backend/Dockerfile` |

---

## Env Vars Added

| Var | Default | Notes |
|-----|---------|-------|
| `DATABASE_URL` | — | Required |
| `REDIS_URL` | — | Required |
| `WEB_ORIGIN` | — | Required; CORS allow-list |
| `MINIO_ENDPOINT` | `localhost` | |
| `MINIO_PORT` | `9000` | |
| `MINIO_USE_SSL` | `false` | |
| `MINIO_ACCESS_KEY` | — | Required |
| `MINIO_SECRET_KEY` | — | Required |
| `MINIO_BUCKET` | `tweeter-media` | |
| `SNOWFLAKE_MACHINE_ID` | `0` | 0–1023; change per replica |
| `JWT_ACCESS_SECRET` | — | Seam for Phase 2 |
| `JWT_REFRESH_SECRET` | — | Seam for Phase 2 |
| `JWT_ACCESS_EXPIRY` | `15m` | |
| `JWT_REFRESH_EXPIRY` | `30d` | |
| `CELEBRITY_FOLLOWER_THRESHOLD` | `10000` | |
| `PORT` | `3000` | |

---

## How to Run

```bash
# Install deps
cd backend && npm install

# Dev (no docker)
npm run dev

# Typecheck
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Tests
npm test

# Migrations (once DB is up)
npm run migration:run
```

---

## What Phase 2 (Auth + Users + Follow) Can Build On

1. **SnowflakeUtil.instance.generate()** — call for sessions, posts, notifications IDs.
2. **CursorUtil.encodeId() / encodeScoreId() / decode()** — use for all paginated list endpoints.
3. **RedisService.client** — available for injection anywhere; use for token-bucket rate limiting in AuthGuard, session storage, and cache.
4. **RedisService.subscriber** — for pub/sub subscriptions in RealtimeModule (Phase 7).
5. **StoragePort (STORAGE_PORT token)** — inject for presigned upload URLs in MediaModule (Phase 6).
6. **AllExceptionsFilter** — all unhandled errors already map to `{error:{code,message}}` envelope. Phase 2 can throw `HttpException` directly.
7. **ValidationPipe** — already global; Phase 2 just needs `class-validator` decorators on DTOs.
8. **RateLimitGuard + @RateLimit()** — apply to `POST /auth/login`, `POST /auth/register`, etc. in Phase 2.
9. **@Public()** — mark auth routes (`/auth/login`, `/auth/register`, `/auth/refresh`) so Phase 2's `AuthGuard` skips them.
10. **@CurrentUser()** — Phase 2 AuthGuard populates `request.user`; the decorator extracts it.
11. **BullModule** — re-export `BullModule` from `QueueModule`; Phase 2+ domain modules call `BullModule.registerQueue(...)` locally.
12. **Domain module slot** — add `AuthModule`, `UsersModule` etc. to the imports array in `app.module.ts`.
13. **DatabaseModule** — `TypeOrmModule.forFeature([Entity])` in each domain module registers entities; migrations in `src/infra/database/migrations/`.
