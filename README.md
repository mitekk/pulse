# PULSE — Microblogging Platform

A full-featured Twitter-style microblogging platform: posts, replies, reposts & quotes, threads,
follows (incl. private accounts), home timeline with Redis fan-out, likes/bookmarks, media,
direct messages, notifications, search/hashtags/trends — all real-time over WebSockets.

- **Backend:** NestJS (Fastify adapter) · PostgreSQL 16 · Redis 7 · BullMQ · Socket.IO (Redis adapter) · TypeORM · MinIO/S3
- **Frontend:** React + Vite + TypeScript · TanStack Query · Zustand · React Router · Socket.IO client · Tailwind (token-based theming, light/dark)

> Design docs: [docs/architecture.md](docs/architecture.md) · API: [docs/api-contract.md](docs/api-contract.md) · decisions: [docs/adr/](docs/adr/) · requirements: [docs/prd/PRD-current.md](docs/prd/PRD-current.md)

---

## Prerequisites

- Docker + Docker Compose
- Node.js 24 — pinned to an exact version in [.nvmrc](.nvmrc); run `nvm use` (only needed for running
  tests / Turbo / dev outside Docker). The same version is used by the containers and CI.

This is an **npm-workspaces + Turborepo** monorepo (`frontend`, `backend`, and the root e2e package)
with a **single root `package-lock.json`**. Install once at the root; run `make help` for all tasks.
To change a dependency, edit that package's `package.json` and run `npm install` at the root to refresh
the single lockfile.

## Quick start (full stack)

```bash
cp .env.example .env        # dev placeholders work out of the box
docker compose up --build   # builds + lifts the whole stack
```

| Service  | URL / Port                         | Notes                              |
|----------|------------------------------------|------------------------------------|
| Frontend | http://localhost:8080              | nginx serving the SPA; proxies `/api` + `/socket.io` to the backend |
| Backend  | http://localhost:3000/api/v1       | REST + WebSocket gateway; `GET /health` |
| Postgres | localhost:5432                     | data in the `db_data` volume       |
| Redis    | localhost:6379                     | cache · home zsets · pub/sub · BullMQ |
| MinIO    | http://localhost:9000 (console 9001) | object storage for media           |

Open **http://localhost:8080**, register an account, and post.

## Local development (hot reload)

`docker compose up` automatically loads [docker-compose.override.yml](docker-compose.override.yml),
which runs both apps with hot reload — **no rebuild on code change**:

- **Backend** — `nest start --watch` on a `./backend/src` volume mount (port 3000).
- **Frontend** — Vite dev server with HMR (port **5173**), proxying `/api` + `/socket.io` to the backend container.

```bash
make dev                     # = docker compose up --build (backend hot reload + Vite HMR at :5173)
docker compose -f docker-compose.yml up --build   # prod-like: nginx frontend at http://localhost:8080
```

Or run on the host (install once at the root, then start each package):

```bash
npm install                  # installs all workspaces (single root lockfile)
npm run dev -w backend       # http://localhost:3000
npm run dev -w frontend      # http://localhost:5173 (proxies to localhost:3000)
```

## Environment variables

Copy [.env.example](.env.example) to `.env`. Key variables:

| Variable | Purpose | Dev default |
|---|---|---|
| `DATABASE_URL` | Postgres connection | `postgresql://tweeter:tweeter@db:5432/tweeter` |
| `DATABASE_SSL` | Require TLS to Postgres (set `true` for managed providers) | `false` |
| `REDIS_URL` | Redis connection | `redis://redis:6379` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | token signing | `change_me_*` |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | token lifetimes | `15m` / `30d` |
| `WEB_ORIGIN` | CORS allow-list (served frontend origin) | `http://localhost:8080` (`:5173` in dev) |
| `MINIO_*` | object storage endpoint/keys/bucket | `minioadmin` / `tweeter-media` |
| `CELEBRITY_FOLLOWER_THRESHOLD` | fan-out push/pull cutover | `10000` |
| `VITE_API_BASE_URL` / `VITE_WS_URL` | frontend API/WS base (build-time) | `/api/v1` / same-origin |

Email verification logs the token to the backend console in dev (no SMTP required).
**Never commit a real `.env`** — only `.env.example` is tracked.

## Running tests

```bash
# All packages via Turborepo (run from the repo root)
make test                # unit tests, all packages   (= turbo run test)
make lint                # = turbo run lint
make typecheck           # = turbo run typecheck

# Backend integration tests (host-run vs dockerized db/redis on 5433/6380)
make test-integration

# End-to-end (Playwright) against the dockerized stack
make test-e2e            # boots the stack, runs migrations, runs Playwright, tears down

# Per-package, if you prefer:
npm run test -w backend            # npm run test:coverage -w backend for coverage
npm run test -w frontend
```

## Migrations

TypeORM migrations run against Postgres (never `synchronize`):

```bash
cd backend
npm run migration:run      # apply pending migrations
npm run migration:revert   # roll back the last migration
```

In Docker, migrations run on backend startup in dev.

## Project structure

```
backend/    NestJS modular monolith (modules: auth, users, posts, timeline, engagement,
            media, messaging, notifications, search, hashtags, realtime; common/, infra/)
frontend/   React SPA (app/, lib/{api,realtime,cache,auth}, features/, components/, hooks/)
docs/       PRD, architecture, API contract, ADRs, scaffold state, phase summaries
tests/      integration + e2e (Playwright)
.github/    CI workflows
```

## Features

Auth (JWT access + rotating httpOnly-cookie refresh, sessions) · profiles & follow graph
(public + private/requests, blocks, mutes) · posts/replies/reposts/quotes/threads with entity
extraction · likes & bookmarks with denormalized counters · home timeline (hybrid Redis fan-out)
+ user/replies/media/likes tabs + hashtag timelines · media pipeline (presigned upload → process →
variants) · real-time (timeline pills, notifications, DMs, typing, read receipts, live counters) ·
notifications (aggregated, unread badge) · search (Top/Latest/People/Media) · trends · reports ·
per-route rate limiting.
