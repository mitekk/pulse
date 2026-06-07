# ADR-0002: Database & ID Strategy — PostgreSQL 16 with TypeORM + Hybrid Snowflake/UUID IDs

- **Date**: 2026-06-07
- **Status**: Accepted
- **Deciders**: Lead architect, human confirmed UUID-for-users at Step 1 gate

## Context and Problem Statement

The platform requires a relational model with a follow graph, visibility joins (blocks, mutes, private accounts), cursor-based pagination at high throughput, full-text search, and case-insensitive handle/email lookups. Two independent decisions were forced simultaneously: which database engine and ORM to use, and how to generate primary keys for the platform's entities. The ID strategy is not incidental — it determines pagination semantics, JSON serialization safety in JavaScript, and the security posture of public-facing identifiers. The human locked one ID decision (UUID for `users.id`) at the Step 1 confirmation gate, making the hybrid approach binding.

## Decision Drivers

- Spec §1.3 explicitly names Snowflake IDs for time-ordered entities; cursor pagination (spec §1.4) requires IDs that sort lexicographically by creation time.
- Security rule: enumerable sequential integers on a public-facing user ID endpoint expose the user count and enable scraping; UUIDs for `users.id` are non-enumerable and were locked at the gate.
- JavaScript's `Number.MAX_SAFE_INTEGER` (2^53 - 1) is smaller than a 64-bit Snowflake; serializing as a raw JSON number silently corrupts the value in browser clients — IDs must be stringified.
- The follow graph, thread ancestors, and visibility filters require multi-table joins that a document database handles poorly without denormalization that would outpace the spec's update frequency.
- `citext` extension (case-insensitive text) and `pg_trgm` extension (trigram GIN for typeahead) are PostgreSQL-specific features the spec requires for handle lookup and user search.
- TypeORM is NestJS-native and avoids introducing a second ORM abstraction layer; however, its query builder is not suitable for keyset pagination SQL — raw `.query()` is required there.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| PostgreSQL 16 + TypeORM + hybrid IDs (Snowflake for time-ordered, UUID for users) | Snowflake provides time-ordered cursor keys natively; UUID for users avoids enumeration; `citext` + `pg_trgm` available; TypeORM integrates with NestJS DI; reversible migrations enforced | Two ID types in the same schema require discipline — joins must not mix them accidentally; BigInt serialization must be enforced in every DTO transformer; TypeORM's query builder is bypassed for cursor queries | **Selected** |
| All-UUID strategy | Single ID type across all tables; no serialization risk; built-in randomness prevents enumeration everywhere | UUIDs do not sort by creation time — cursor pagination must carry a separate `created_at` timestamp as the sort key, doubling index complexity; spec §1.3 explicitly names Snowflake for posts/messages | Rejected |
| All-Snowflake strategy | Single ID type; time-ordered everywhere; simpler serialization discipline | User IDs would be enumerable (Snowflake timestamps reveal account creation time, making sequential guessing trivial); the human locked UUID for `users.id` at the gate; violates security posture | Rejected |
| MongoDB | Flexible schema; ObjectId is time-ordered; native JSON | Follow graph requires graph traversal the aggregation pipeline handles poorly; complex visibility joins (blocks + mutes + private + deleted) become application-layer logic; `pg_trgm` not available; spec implies relational model throughout | Rejected |
| Prisma instead of TypeORM | Better type inference; cleaner migration DSL | Less mature NestJS integration; no native raw query escape hatch that TypeORM's `.query()` provides; switching cost vs. the existing TypeORM-on-NestJS pattern the spec assumes | Rejected |

## Decision Outcome

**Chosen**: PostgreSQL 16 with TypeORM (entity management + reversible migrations; `synchronize: false` enforced) and raw `.query()` for all cursor/keyset paths. ID strategy: Snowflake BIGINT (custom `SnowflakeUtil`: epoch + machineId + sequence) for posts, messages, notifications, sessions, media, conversations — serialized as `string` in all JSON responses via a TypeORM column transformer. UUID (`gen_random_uuid()`) for `users.id` — never exposed as an integer.

**Rationale**: The hybrid strategy is the direct consequence of two independent requirements that pull in opposite directions. Time-ordered IDs (Snowflake) are necessary for cursor-based pagination to work without a secondary sort column — a `WHERE id < :cursor ORDER BY id DESC` query is both simple and index-optimal. UUID for users is necessary to prevent account enumeration on the platform's most sensitive public-facing identifier. Combining them — Snowflake for event-like entities, UUID for user identity — satisfies both constraints with no workaround. TypeORM is chosen over Prisma because it is the NestJS-native ORM, avoids a second abstraction layer, and its raw `.query()` escape hatch is precisely what keyset pagination and full-text search require. PostgreSQL 16 is chosen over alternatives because `citext`, `pg_trgm`, and `tsvector` GIN indexes are features the spec depends on that have no equivalent in MySQL or MongoDB without significant workarounds.

**Positive Consequences**:
- Cursor pagination (`WHERE id < :cursor ORDER BY id DESC LIMIT n`) uses a single B-tree index scan — no offset, no count query, constant-time regardless of dataset size.
- `citext` extension makes handle and email lookups case-insensitive at the DB level without application-layer normalization.
- Snowflake IDs embed creation time, allowing `SnowflakeUtil.timestampOf(id)` without a DB round-trip — useful for cache TTL decisions and trend bucketing.

**Negative Consequences / Risks**:
- Every DTO that exposes a Snowflake ID must apply a `@Transform(() => String)` (or equivalent column transformer) — omitting this causes silent numeric precision loss in JavaScript clients handling IDs above 2^53. This must be enforced via a shared base entity class, not per-field discipline.
- `synchronize: true` is permanently disabled; every schema change requires a migration file. This is the correct posture but adds friction during early development.
- `citext` and `pg_trgm` extensions require the `CREATE EXTENSION` privilege; on some managed PostgreSQL hosts this requires superuser or a pre-provisioning step — documented in README.
- TypeORM migrations are bypassed for keyset/FTS queries; any team member not aware of this pattern may attempt ORM query-builder pagination and introduce offset-based queries silently.

## Links

- Related: ADR-0001 (NestJS/TypeORM integration rationale)
- Related: ADR-0003 (sessions table uses Snowflake PK)
- Implemented in: `apps/api/src/infra/database/`, `apps/api/src/infra/database/snowflake.util.ts`, `apps/api/src/infra/database/cursor.util.ts`
