# ADR-0001: Stack Selection — NestJS Modular Monolith with Fastify Adapter + React/Vite Frontend

- **Date**: 2026-06-07
- **Status**: Accepted
- **Deciders**: Lead architect, confirmed by human at Step 1 gate

## Context and Problem Statement

The project is a full-featured microblogging platform (posts, follow graph, timelines, DMs, notifications, search, media, real-time) built from a clean slate. The CLAUDE.md workspace template defaults to Fastify/Express for the backend and React + Vite for the frontend. The PRD spec explicitly mandates NestJS as the backend framework, creating a deliberate deviation from the template default. The framework choice has downstream consequences on module organization, dependency injection, testing patterns, and the path to service extraction — decisions that cannot easily be reversed once implementation begins.

## Decision Drivers

- PRD spec §1.1 mandates NestJS and defines 11 named domain modules (auth, users, posts, timeline, engagement, media, messaging, notifications, search, hashtags, realtime); the framework must enforce clean module boundaries to honor this.
- The spec's domain model maps directly to NestJS modules with injected providers — a flat Fastify app would require inventing equivalent structure manually and without framework enforcement.
- Real-time requirements (Socket.IO gateway) are first-class in `@nestjs/platform-socket.io`; wiring Socket.IO into bare Fastify/Express requires manual integration.
- Throughput matters: the spec includes rate-limiting, fan-out jobs, and a read-heavy timeline path that benefits from Fastify's lower per-request overhead vs. Express.
- The CLAUDE.md template default (Fastify) would conflict with the spec mandate if left unchanged; the decision must be explicit and documented.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| NestJS modular monolith (Fastify adapter) — the chosen stack | Module system enforces domain boundaries the spec mandates; DI container reduces boilerplate for guards/interceptors/pipes; `@nestjs/websockets` integrates Socket.IO natively; Fastify adapter preserves throughput advantage; future module-to-service extraction is a seam that already exists | NestJS adds framework overhead (decorators, metadata reflection); steeper onboarding than bare Fastify; Fastify adapter has minor behavioral differences from Express adapter (e.g., reply object shape) | **Selected** |
| Bare Fastify (template default) | Minimal overhead; full control over request lifecycle; team familiar with it from template | No enforced module system — 11 domain modules would need manual organization; Socket.IO integration is non-trivial; guards/pipes/interceptors require custom middleware chains; defeats the spec's stated framework preference | Rejected |
| Express + NestJS (Express adapter) | Broader plugin ecosystem; most NestJS examples use it | Lower throughput than Fastify; no performance advantage vs. the Fastify adapter; spec does not require Express | Rejected |
| Microservices from day one | Domain boundaries enforced at the network level | Massively increases infrastructure complexity for a v1 interview challenge; latency for cross-service calls; the spec's "modular monolith" phrasing explicitly defers splitting | Rejected |

## Decision Outcome

**Chosen**: NestJS modular monolith with the Fastify adapter (`@nestjs/platform-fastify`), and React + Vite + TypeScript for the frontend.

**Rationale**: The spec mandates NestJS and defines 11 named domain modules — this is not a framework preference to be weighed against the template default, it is a hard requirement. The Fastify *adapter* (rather than Express) is chosen within that constraint because the platform delivers meaningfully lower per-request latency and higher throughput on a read-heavy timeline workload, without requiring any changes to NestJS application code. The module boundary enforcement NestJS provides maps precisely to the spec's domain decomposition, reducing the architectural discipline burden on individual contributors. React + Vite + TypeScript is retained from the workspace template because the spec Part II confirms it and no alternative was proposed.

**Positive Consequences**:
- Domain modules (auth, posts, timeline, etc.) are enforced by the framework's module system, not by convention — a future developer cannot accidentally import across domain boundaries without making the dependency explicit.
- Socket.IO gateway integration is first-class via `@nestjs/websockets`; global guards, interceptors, and pipes apply uniformly to both HTTP and WS handlers.
- The Fastify adapter delivers ~2x the throughput of Express at equivalent concurrency — relevant for the fan-out read path where hundreds of cache fetches per timeline request compound.

**Negative Consequences / Risks**:
- NestJS's decorator-heavy API (reflect-metadata, `@Injectable`, `@Controller`) adds compilation complexity and can be opaque to contributors unfamiliar with the framework.
- The Fastify adapter has subtle behavioral differences from the Express adapter (e.g., `reply.send()` vs. `res.json()`); any third-party Fastify plugin must be registered via `app.register()`, not the Express middleware pattern.
- The modular monolith approach means all domains share a single process and database connection pool — a runaway query in one module can starve others. This is acceptable for v1 but must be revisited before production scale.

## Links

- Related: ADR-0002 (database choice made in context of NestJS/TypeORM integration)
- Implemented in: `apps/api/src/modules/`, `apps/api/src/app.module.ts`
