# Architecture Decision Records

One file per significant decision (MADR format). Produced by the `adr` agent during `/scaffold`.

| ID | Title | Status | Deciders | Date |
|----|-------|--------|----------|------|
| [ADR-0001](0001-stack-selection.md) | Stack Selection — NestJS Modular Monolith with Fastify Adapter + React/Vite Frontend | Accepted | Lead architect, human gate | 2026-06-07 |
| [ADR-0002](0002-database-and-id-strategy.md) | Database & ID Strategy — PostgreSQL 16 with TypeORM + Hybrid Snowflake/UUID IDs | Accepted | Lead architect, human gate | 2026-06-07 |
| [ADR-0003](0003-auth-strategy.md) | Auth Strategy — Short-Lived Access JWT in Memory + Rotating Refresh Token in httpOnly Cookie | Accepted | Lead architect, human gate | 2026-06-07 |
| [ADR-0004](0004-caching-and-timeline-fanout.md) | Caching & Home-Timeline Fan-out — Redis 7 with Hybrid Push/Pull Fan-out and BullMQ | Accepted | Lead architect, human gate | 2026-06-07 |
| [ADR-0005](0005-search-approach.md) | Search Approach — PostgreSQL FTS + pg_trgm Behind a SearchPort Interface | Accepted | Lead architect | 2026-06-07 |
