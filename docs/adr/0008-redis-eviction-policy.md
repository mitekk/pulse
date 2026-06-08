# ADR-0008: Redis Eviction Policy — noeviction Instead of allkeys-lru

- **Date**: 2026-06-08
- **Status**: Accepted
- **Deciders**: Smoke-test retrospective, lead architect

## Context and Problem Statement

The Step 5.7 smoke test revealed that the Redis instance was configured with no explicit eviction policy, leaving Docker's default (also `noeviction`, but undocumented). The project's docker rule specifies `allkeys-lru` as the safe default for caching workloads. This project's Redis instance is not a pure cache. It backs BullMQ job queues, home-timeline sorted sets (`home:{userId}`), counter hashes (`counters:{postId}`), and the Socket.IO pub/sub adapter — all of which carry durable operational state. The eviction policy decision must be made explicitly, because the wrong choice leads to silent data loss rather than a visible error. BullMQ itself requires `noeviction` or `allkeys-lru` eviction is an explicit breaking violation per its documentation. This ADR records why this project deviates from the `allkeys-lru` project default and references ADR-0004 where the Redis data model is defined.

## Decision Drivers

- BullMQ's documentation explicitly states it requires Redis to be configured with `maxmemory-policy noeviction`; LRU eviction of a queue key causes the job to be silently dropped, which is undetectable without external monitoring.
- Timeline sorted sets (`home:{userId}`) and counter hashes (`counters:{postId}`) are semi-durable: losing them requires a rebuild from Postgres, which is expensive and causes visible user-facing inconsistency (empty timelines, reset counters).
- The `allkeys-lru` policy evicts *any* key under memory pressure, with no distinction between a disposable cache entry and a BullMQ queue key. The project has no separation of Redis databases or cluster shards that would allow selective eviction per key type.
- `noeviction` under memory pressure returns a write error to the caller, which surfaces as an exception in the application layer — observable and alertable — rather than silent data loss.
- Redis RDB snapshots (`BGSAVE`) are disabled (`--save ""`) in the dev/CI configuration to avoid "No space left on device" errors on constrained environments; `noeviction` compensates by refusing to lose data silently.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `noeviction` | Write errors are explicit and observable; BullMQ-compatible per docs; no silent job or feed entry loss; correct for semi-durable data | Under sustained memory pressure the application receives write errors and must handle them; the Redis instance requires capacity planning (currently capped at 512 MB) | **Selected** |
| `allkeys-lru` (project docker rule default) | Prevents OOM; appropriate for pure caches; matches the project's generic docker rule | Silently evicts BullMQ queue keys and feed sorted sets under pressure; explicitly prohibited by BullMQ; wrong data model fit | Rejected |
| `volatile-lru` (evict only keys with a TTL set) | Protects keys without TTL (BullMQ queue keys have no TTL) from eviction | BullMQ uses internal TTL on some metadata keys — the policy boundary is not clean; requires deep BullMQ knowledge of which keys carry TTLs; adds ongoing maintenance burden | Rejected |
| Separate Redis instances: one for caching (allkeys-lru), one for BullMQ + feeds (noeviction) | Clean policy separation; each instance can be sized independently | Doubles the Redis operational footprint; out of scope for a single-stack v1; the compose file would need two Redis services and the application would need two Redis connections routed by use case | Rejected |

## Decision Outcome

**Chosen**: `noeviction` with `maxmemory 512mb` and `--save ""` (RDB snapshots disabled).

**Rationale**: Every active Redis use case in this project — BullMQ queues, home-timeline zsets, counter hashes, pub/sub channels — represents state that must not be silently discarded. `allkeys-lru` is the correct policy when Redis is used as a read-through cache fronting a durable source of truth; in that role, eviction is safe because a miss simply re-fetches from the backing store. That is not this project's model. Here, Redis is a primary write path for fan-out jobs and a time-ordered feed store; an evicted BullMQ key is a permanently lost job, and an evicted timeline zset forces a cold rebuild from Postgres. `noeviction` makes memory exhaustion a loud, immediately observable failure (ENOMEM returned to the writer) rather than a quiet inconsistency that accumulates undetected. The `512mb` cap with capacity monitoring is the appropriate companion control.

**Positive Consequences**:
- BullMQ operates correctly; no queue entries are silently dropped under memory pressure.
- Timeline and counter state is not silently discarded; any memory-pressure failure surfaces immediately in application logs.
- The policy is consistent with how Redis is actually used in the architecture (per ADR-0004).

**Negative Consequences / Risks**:
- Under sustained memory pressure, write operations will fail with Redis errors. The application must handle these gracefully (BullMQ has built-in retry logic; application-level error handling must not assume Redis writes always succeed).
- Without RDB persistence (`--save ""`), a Redis restart loses all in-memory state: active BullMQ jobs, timeline zsets, counter deltas, and denylist entries. In production this is addressed by enabling AOF or RDB persistence and using a persistent volume; in dev/CI the transient loss is acceptable.
- The `512mb` cap requires monitoring; if the instance approaches the limit, write failures will begin before any operator intervention. A Redis memory alert at ~70% capacity is the operational control.

## Links

- Related: ADR-0004 (defines the Redis data model — BullMQ queues, home-timeline zsets, counters, pub/sub; the data model is what drove this policy)
- Implemented in: `docker-compose.yml` (Redis `command:` block)
