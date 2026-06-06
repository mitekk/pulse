# Architecture Decision Records

One file per significant decision (MADR format). Produced by the `adr` agent during `/scaffold`.

| ADR | Title | Status |
|---|---|---|
| _(pending)_ | Stack selection (NestJS modular monolith) | proposed |
| _(pending)_ | Database choice + ID strategy (PostgreSQL, Snowflake BIGINT) | proposed |
| _(pending)_ | Auth strategy (access JWT + httpOnly-cookie rotating refresh) | proposed |
| _(pending)_ | Caching + home-timeline fan-out (Redis cache/zset/pub-sub) | proposed |
| _(pending)_ | Search approach (Postgres FTS behind a SearchPort seam) | proposed |

See the spec-vs-template reconciliations in the approved plan; these become the strategic ADRs written at the end of Step 1.
