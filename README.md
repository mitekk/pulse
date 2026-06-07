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
- Node.js 22+ (only for running tests / dev outside Docker)

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

- **Backend** — `tsx watch` on a `./backend/src` volume mount (port 3000).
- **Frontend** — Vite dev server with HMR (port **5173**), proxying `/api` + `/socket.io` to the backend container.

```bash
docker compose up            # dev: backend hot reload + Vite HMR at http://localhost:5173
docker compose -f docker-compose.yml up --build   # prod-like: nginx frontend at http://localhost:8080
```

Or run a package directly on the host:

```bash
cd backend  && npm install && npm run dev    # http://localhost:3000
cd frontend && npm install && npm run dev    # http://localhost:5173 (proxies to localhost:3000)
```

## Environment variables

Copy [.env.example](.env.example) to `.env`. Key variables:

| Variable | Purpose | Dev default |
|---|---|---|
| `DATABASE_URL` | Postgres connection | `postgresql://tweeter:tweeter@db:5432/tweeter` |
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
# Backend — unit + integration (Vitest), with coverage
cd backend  && npm test            # npm run test:coverage for the coverage report

# Frontend — unit/component (Vitest + Testing Library)
cd frontend && npm test            # npm run test:coverage

# Type + lint gates (both packages)
npm run typecheck && npm run lint

# End-to-end (Playwright) — runs against the dockerized stack
docker compose up -d --wait
npx playwright test
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
