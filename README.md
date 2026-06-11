<p align="center">
  <img src="docs/assets/logo.png" alt="PULSE logo" width="96" />
</p>

<h1 align="center">PULSE</h1>

<p align="center">
  A real-time, Twitter-style microblogging platform — posts, threads, follows, DMs,
  search &amp; trends, all live over WebSockets.
</p>

<p align="center">
  <a href="https://github.com/mitekk/pulse/actions/workflows/ci.yml"><img src="https://github.com/mitekk/pulse/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-24-3C873A?logo=node.js&logoColor=white" alt="Node 24" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white" alt="Redis" />
</p>

---

**PULSE** is a full-featured microblogging platform built as a production-shaped reference
implementation: a NestJS modular monolith, a React/Vite single-page app, and real-time delivery
over WebSockets — the whole stack lifts with **one command** in Docker. It implements the social
mechanics you'd expect from a feed app (posts, replies, threads, reposts/quotes, follows, likes,
bookmarks, DMs, notifications, search, hashtags, trends) on top of a Redis fan-out timeline.

## ✨ What you can do

- **Post & reply** — share posts up to 280 characters; reply to anyone and read the whole conversation as a threaded view.
- **Repost & quote** — boost a post to your followers, or quote it with your own commentary.
- **Follow people — or lock your account** — build a follow graph, or set your account **private** so new followers need approval. Block and mute to curate what you see.
- **Like & bookmark** — react to posts and privately save them for later.
- **A timeline that updates live** — your home feed assembles from the people you follow, and a "N new posts" pill appears in real time as they post.
- **Direct messages** — 1:1 conversations with typing indicators and read receipts, delivered instantly.
- **Notifications** — likes, follows, replies, mentions, and reposts, aggregated, with a live unread badge.
- **Search & explore** — find posts and people across **Top / Latest / People / Media**, browse hashtag timelines, and see what's trending.
- **Profiles & media** — a customizable profile (avatar, banner, bio) and image/video attachments processed through a media pipeline.

## 🧱 Tech stack

- **Backend:** NestJS (Fastify adapter) · PostgreSQL 16 · Redis 7 · BullMQ · Socket.IO (Redis adapter) · TypeORM · MinIO/S3
- **Frontend:** React + Vite + TypeScript · TanStack Query · Zustand · React Router · Socket.IO client · Tailwind (token-based theming, light/dark)

## 🚀 Quick start (full stack)

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

## 💻 Local development (hot reload)

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

## ⚙️ Environment variables

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

## 🧪 Running tests

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

# SEO / quality benchmarks (Lighthouse + bundle-size)
npm run -w frontend size           # bundle-size budget (size-limit)
node scripts/seed-lighthouse.mjs   # seed a public profile + post (stack must be up)
npx lhci autorun                   # Lighthouse: SEO / a11y / best-practices / perf
```

Coverage is gated at **80% lines** in CI. The pipeline runs the layers in order —
`lint → unit → integration → e2e → build`, plus a **bundle-size** budget and a
**Lighthouse** gate (SEO 100, a11y/best-practices ≥ 90, performance reported) — see
[.github/workflows/ci.yml](.github/workflows/ci.yml) and [ADR-0011](docs/adr/0011-seo-benchmark-gates.md).

## 🗄️ Migrations

TypeORM migrations run against Postgres (never `synchronize`):

```bash
cd backend
npm run migration:run      # apply pending migrations
npm run migration:revert   # roll back the last migration
```

In Docker, migrations run on backend startup in dev.

## 🏗️ Technical highlights

The load-bearing engineering decisions are recorded as ADRs (see the [decision log](docs/adr/README.md)):

- **Time-ordered IDs + cursor pagination** — Snowflake-style 64-bit IDs make posts/messages/notifications chronologically sortable without a separate index; every list endpoint uses keyset/cursor pagination, never `OFFSET`. → [ADR-0002](docs/adr/0002-database-and-id-strategy.md)
- **Hybrid push/pull timeline fan-out** — home timelines are precomputed per user as capped Redis sorted sets (push), with a pull path for high-follower "celebrity" accounts above `CELEBRITY_FOLLOWER_THRESHOLD`. Fan-out runs async on BullMQ. → [ADR-0004](docs/adr/0004-caching-and-timeline-fanout.md)
- **Real-time over WebSockets** — a Socket.IO gateway with a Redis pub/sub adapter fans events (timeline pills, notifications, DMs, typing, read receipts, live counters) across instances into per-user rooms. → [ADR-0004](docs/adr/0004-caching-and-timeline-fanout.md)
- **Modular monolith with clean seams** — one deployable, organized by domain module; cross-module dependencies go through typed **ports/adapters** (`@Global` + `useExisting`) so modules stay decoupled and splittable later. → [ADR-0006](docs/adr/0006-nestjs-port-wiring-pattern.md)
- **Secure sessions** — a short-lived access JWT (in memory) plus a **rotating** refresh token in an httpOnly/Secure/SameSite cookie, with a Redis denylist enforced in the auth guard so logout revokes immediately. → [ADR-0003](docs/adr/0003-auth-strategy.md), [ADR-0009](docs/adr/0009-session-revocation-denylist.md)
- **Media pipeline** — presigned direct-to-storage uploads (MinIO/S3), async processing into variants, then attachment to posts.
- **Search without extra infrastructure** — PostgreSQL full-text search + `pg_trgm` fuzzy matching behind a `SearchPort`, swappable for a dedicated engine later. → [ADR-0005](docs/adr/0005-search-approach.md)
- **SEO without an SSR rewrite** — public profiles/posts are crawlable; nginx routes social scrapers (which don't run JS) to a backend **dynamic-rendering** layer that emits Open Graph / Twitter Card / JSON-LD, plus a DB-backed `sitemap.xml` and host-aware `robots.txt`. Per-route metadata for the human/Googlebot path uses **React 19 native metadata** (no extra dependency). → [ADR-0010](docs/adr/0010-seo-crawlability-and-dynamic-rendering.md)

## 📂 Project structure

```
backend/    NestJS modular monolith (modules: auth, users, posts, timeline, engagement,
            media, messaging, notifications, search, hashtags, realtime; common/, infra/)
frontend/   React SPA (app/, lib/{api,realtime,cache,auth}, features/, components/, hooks/)
docs/       PRD, architecture, API contract, ADRs, scaffold state, phase summaries
tests/      integration + e2e (Playwright)
.github/    CI workflows
```

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [Architecture](docs/architecture.md) | Topology, data stores, timeline fan-out, module layout |
| [API contract](docs/api-contract.md) | Every endpoint — method, path, request/response body, auth |
| [ADR index](docs/adr/README.md) | Decision records (stack, IDs, auth, caching, search, …) |
| [PRD](docs/prd/PRD-current.md) | Product requirements (v1 feature set) |
| [Known limitations](docs/known-limitations.md) | Honest status of intentionally-incomplete / out-of-scope areas |

## ✅ Status

Scaffold **complete** — `docker compose up --build` lifts a healthy stack, CI runs the full
`lint → unit → integration → e2e → build` pipeline, and the runtime smoke test found no
critical/high issues. See [known limitations](docs/known-limitations.md) for what's intentionally
out of scope for v1.

## 📄 License

[MIT](./LICENSE) © 2026 Mitya
