# ADR-0009: Session Revocation on Logout — Redis Denylist Checked in AuthGuard

- **Date**: 2026-06-08
- **Status**: Accepted
- **Deciders**: Smoke-test retrospective, lead architect

## Context and Problem Statement

The Step 5.7 smoke test found that access tokens remained valid after logout. A client could call `POST /api/v1/auth/logout`, receive a 200, and then continue making authenticated API requests using the same Bearer token until it naturally expired. ADR-0003 consciously chose short-lived (15-minute) access JWTs held in client memory, and noted: "The 15-minute access JWT window means the backend never needs a token blocklist for normal logout; the refresh token revocation in the sessions table is sufficient." That assumption held for the *authorization model* but failed the smoke test's behavioral check: a verifier agent could log out and immediately confirm the token was still accepted. The gap is that the refresh token is revoked (the session row is deleted), but the access token — already issued, cryptographically valid, and 15 minutes from expiry — continues to be accepted by AuthGuard because AuthGuard only verified the JWT signature. This ADR records the decision to add a bounded server-side revocation check, which partially amends ADR-0003's rationale.

## Decision Drivers

- The smoke test's post-logout token check is a reasonable security expectation: a user who logs out should not have a reusable credential window of up to 15 minutes.
- ADR-0003's "no blocklist needed" rationale held in theory (short lifetime bounds blast radius) but was inadequate for the security contract an interactive logout implies.
- The fix must not reintroduce the stateful-session model that ADR-0003 rejected: a full token blocklist containing every issued access JWT would be unbounded and expensive. The solution must be bounded to the access-token lifetime.
- Redis is already in the stack (ADR-0004); a lightweight key-per-session-revocation is a low-overhead addition compared to the existing Redis usage.
- The `isSessionRevoked` check must fail open: if Redis is unavailable, the check should not take down authentication — the access token still expires naturally within 15 minutes.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Redis denylist keyed by `sessionId` with TTL equal to access token lifetime — checked in AuthGuard on every request | Bounded storage (one key per active logout, auto-expires when the access token would have expired anyway); per-request check is a single Redis `EXISTS` command (~1ms round-trip); fail-open on Redis errors preserves auth availability; `sessionId` is already in the JWT payload so no schema changes | Adds a Redis call to every authenticated request; the denylist keys are transient but accumulate during peak logout activity | **Selected** |
| Full access-token blocklist (store every issued JWT's `jti` until expiry) | Complete revocation guarantee for any token | Unbounded storage: one entry per issued token, not per session; every login+refresh issues new tokens; at scale this is O(tokens_per_hour × TTL_minutes) entries; defeats the "stateless JWT" design goal | Rejected |
| Reduce access token lifetime further (e.g. 1–2 minutes) | Reduces the post-logout window without server-side state | 1–2 minute tokens require more frequent refresh cycles; increases client complexity and refresh endpoint load; does not eliminate the window, only shrinks it; fails the smoke test's behavioral expectation (token should be invalid immediately after logout) | Rejected |
| Accept the gap and document it (tokens valid until expiry post-logout) | No code change; true stateless JWT | Fails the smoke test check; violates the user's reasonable expectation that logout invalidates the session immediately; the gap was originally accepted in theory but was not acceptable in practice once verified | Rejected |

## Decision Outcome

**Chosen**: Redis denylist keyed by `auth:revoked-session:{sessionId}` with TTL equal to `JWT_ACCESS_EXPIRY` (default 900s / 15 minutes), checked in `AuthGuard.canActivate()` after signature verification.

**Rationale**: The `sessionId` claim is already embedded in the access JWT payload (it was placed there for session listing, per ADR-0003). This means the denylist key is per-session, not per-token: one Redis key covers all access tokens issued for that session (there is only ever one live access token per session because refresh rotation replaces the previous one). The result is a bounded denylist: keys are automatically removed when the access token they're denylist-guarding would have expired anyway. The per-request cost is a single `EXISTS` command, which is a constant-time Redis operation — negligible relative to the Postgres queries that most authenticated handlers perform. Fail-open behavior on Redis errors is the correct availability trade-off: if the denylist check fails, the access token still expires within 15 minutes, which is the original blast-radius bound from ADR-0003. The implementation does not change the stateless JWT model for the common case (no revocation); it adds a targeted override only for the session IDs that have been explicitly revoked.

This decision partially amends ADR-0003. The original rationale's claim — "the backend never needs a token blocklist for normal logout" — is superseded by this finding. The underlying design remains unchanged; the amendment is a behavioral addition, not a model change.

**Positive Consequences**:
- Logout immediately invalidates the access token for the revoked session; no 15-minute replay window remains.
- Denylist keys are bounded and self-cleaning: they expire at the same TTL as the access token, so the Redis keyspace does not grow without bound.
- Session revocation (`DELETE /api/v1/auth/sessions/:id`) now provides an immediate guarantee as well, not just a "will expire soon" one.

**Negative Consequences / Risks**:
- Every authenticated request now incurs one additional Redis round-trip (`EXISTS auth:revoked-session:{sessionId}`). At ~1ms per call, this is negligible against typical handler latency (20–100ms) but is a new constant overhead per request.
- Fail-open behavior means a Redis outage restores the original 15-minute replay window. This is the correct availability trade-off but must be documented so it is not surprising in an incident.
- The denylist TTL is set to `JWT_ACCESS_EXPIRY` seconds at the moment `denylistSession` is called. If the expiry config changes between logout and the guard check, the TTL and the token lifetime diverge briefly. This edge case is harmless in practice (the token's JWT `exp` claim is authoritative) but is worth noting for anyone debugging stale denylist keys.

## Links

- Related: ADR-0003 (Auth strategy — this ADR partially amends ADR-0003's "no blocklist needed" claim)
- Related: ADR-0004 (Redis is already in the stack; the denylist uses the same `RedisService.client` connection)
- Implemented in: `backend/src/modules/auth/auth.service.ts` (`denylistSession`, `isSessionRevoked`), `backend/src/common/guards/auth.guard.ts`
