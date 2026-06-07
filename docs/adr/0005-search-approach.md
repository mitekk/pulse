# ADR-0005: Search Approach — PostgreSQL FTS + pg_trgm Behind a SearchPort Interface

- **Date**: 2026-06-07
- **Status**: Accepted
- **Deciders**: Lead architect

## Context and Problem Statement

The spec (§8.1) requires post search (full-text, by keyword), user search (by handle and display name, including typeahead), and hashtag search. These are qualitatively different query types: FTS for posts requires relevance ranking and stemming; user typeahead requires sub-100ms prefix matching with fuzzy tolerance; hashtag lookup requires exact and prefix matching on a `citext` column. The decision is whether to introduce a dedicated search engine (e.g., OpenSearch, Meilisearch) from day one, or to build on PostgreSQL capabilities already present in the stack, while leaving the door open for future migration. The answer has infrastructure cost, operational complexity, and time-to-implement consequences that matter for a v1 delivery timeline.

## Decision Drivers

- The stack already includes PostgreSQL 16; `tsvector` GIN indexes for posts and `pg_trgm` GIN indexes for user handles are required by ADR-0002 regardless of which search engine is chosen — these indexes exist whether or not an external engine is added.
- Spec §8.1 does not require relevance ranking beyond "top" (engagement-ranked) and "latest" (chronological) — there is no machine-learning ranking, personalization, or synonym expansion in scope for v1.
- Adding an external search engine (OpenSearch, Meilisearch) introduces a new service in Docker Compose, a sync pipeline (index-on-write via BullMQ `search.index` job or change-data capture), and operational surface area that must be tested and maintained.
- The `SearchPort` interface pattern allows the underlying implementation to be swapped without touching the domain layer — this is a structural seam, not a runtime abstraction with overhead.
- User typeahead (`/search/suggest`) is latency-sensitive; `pg_trgm` GIN with a short `LIMIT` is consistently sub-20ms on warm indexes for the expected dataset size at v1.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| PostgreSQL FTS (`tsvector` GIN) + `pg_trgm` behind `SearchPort` interface | No new service; indexes already required by data model; `SearchPort` provides a clean swap seam; sufficient for v1 relevance requirements; `citext` + trigram covers user typeahead | No ML ranking; no synonym expansion; FTS performance degrades on very large post tables without partitioning (not a v1 concern); reindexing requires Postgres-level `UPDATE` rather than dedicated index API | **Selected** |
| OpenSearch / Elasticsearch from day one | Production-grade relevance ranking; dedicated index API; scales to billions of documents independently of the main DB | Second service in Docker Compose; sync pipeline complexity (BullMQ `search.index` must handle index lag, failure, and reindex); adds ~1GB memory overhead in dev; over-engineered for v1 spec requirements | Rejected |
| Meilisearch | Simpler API than OpenSearch; fast typo-tolerance out of the box; lighter resource footprint than OpenSearch | Still a second service requiring a sync pipeline; typo-tolerance is a NICE-to-have not required by §8.1; `pg_trgm` covers the typeahead case without it | Rejected |
| Application-layer search (LIKE / ILIKE) | Zero infrastructure | `LIKE '%query%'` forces full-table scans; does not use GIN indexes; unacceptable at any non-trivial row count | Rejected |

## Decision Outcome

**Chosen**: `PostgresSearchAdapter` implementing the `SearchPort` interface. Post search uses `tsvector` GIN full-text index (weighted `ts_rank` on title/body, sorted by rank DESC for "top", by post ID DESC for "latest"). User search uses `pg_trgm` GIN on `handle` and `display_name` with `similarity()` scoring for typeahead. Hashtag search uses `LIKE 'prefix%'` on the `citext`-indexed `hashtags.tag` column. The `search.index` BullMQ job updates `posts.search_vector` (a generated `tsvector` column) on post create/soft-delete. The `SearchPort` interface (`search(query, type, cursor): Promise<SearchResultPage>`) isolates the domain layer from the implementation — swapping to OpenSearch or Meilisearch later requires only a new adapter class registered in the NestJS DI container, with no changes to the `SearchModule` consumers.

**Rationale**: The Postgres FTS approach is the correct v1 choice because the required indexes already exist (mandated by ADR-0002 for follow-graph joins and handle lookups) and the spec's relevance requirements (top vs. latest, no personalization) are fully satisfiable with `ts_rank`. The `SearchPort` abstraction costs nothing at runtime — it is a TypeScript interface — but removes the "we can't swap search engines without rewriting the search module" risk from the project's future. The alternative of adding OpenSearch at v1 is disproportionate: it adds a new Docker service, a sync pipeline that can fall out of sync, and operational burden for no feature benefit beyond what Postgres already delivers at this data scale. When post volume reaches a scale where Postgres FTS degrades (hundreds of millions of rows), the `PostgresSearchAdapter` is replaced with an `OpenSearchAdapter` behind the same interface, with the BullMQ `search.index` job updated to push to OpenSearch instead.

**Positive Consequences**:
- No additional Docker Compose service for v1; the Docker Compose file and CI integration test configuration remain simpler.
- The `SearchPort` interface makes the search implementation swappable at a future milestone without touching `SearchModule` consumers or API routes.
- `pg_trgm` typeahead on `handle` + `display_name` provides fuzzy matching (e.g., "johndoe" matches "john_doe") without a dedicated search engine.

**Negative Consequences / Risks**:
- PostgreSQL FTS does not support stemming across languages by default — only the configured `text_search_config` language (English by default). Non-English posts will have lower recall. This is an accepted v1 limitation.
- The `search.index` job (BullMQ) introduces indexing lag: a post created during a queue backlog will not appear in FTS results until the job processes. This window is typically sub-second but is not zero. The "latest" tab (ID-ordered) is not affected — it queries directly from the `posts` table with a visibility filter, not the FTS index.
- At very high post volume (tens of millions of rows), `ts_rank` on a GIN index without additional partitioning will degrade. This is a future concern, not a v1 risk, and is the primary trigger for swapping to an external search engine via the `SearchPort` seam.

## Links

- Related: ADR-0002 (pg_trgm and citext extensions required; GIN indexes on posts and users defined there)
- Implemented in: `apps/api/src/modules/search/`, `apps/api/src/modules/search/adapters/postgres-search.adapter.ts`
