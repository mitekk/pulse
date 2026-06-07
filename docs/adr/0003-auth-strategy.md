# ADR-0003: Auth Strategy — Short-Lived Access JWT in Memory + Rotating Refresh Token in httpOnly Cookie

- **Date**: 2026-06-07
- **Status**: Accepted
- **Deciders**: Lead architect, confirmed at Step 1 gate (email verification: log-only in dev)

## Context and Problem Statement

The platform requires stateful session management (spec §10 mandates session listing and revocation per device), argon2id password hashing, and JWT-based access control. The workspace security rules (`security.md`) explicitly forbid storing JWTs in `localStorage` due to XSS exposure. The spec simultaneously requires REST API access via Bearer tokens and WebSocket authentication via a handshake token. A naive cookie-only session approach cannot serve the WS handshake cleanly. A naive bearer-only approach with refresh tokens in the response body cannot satisfy the security rules. The solution must reconcile these constraints without compromising either. Additionally, the email verification flow must be built but cannot depend on an SMTP provider in the Docker dev environment — this was locked at the Step 1 gate.

## Decision Drivers

- `security.md` rule: JWT must not be stored in `localStorage` (XSS attack surface); it must be in an httpOnly cookie or client memory.
- Spec §10: sessions must be listable and revocable individually — a stateless JWT-only approach cannot support this without additional infrastructure.
- Spec §5 (WebSocket): the Socket.IO handshake requires an auth token that the client can pass in the `auth` object during `connect()` — httpOnly cookies are not accessible from JavaScript and cannot be read by the Socket.IO client for this purpose.
- Spec §C17: CSRF protection required on state-mutating cookie-backed routes.
- Reuse detection: a compromised refresh token must invalidate the entire session family (rotate-and-revoke pattern), not just the used token.
- Dev environment constraint: no SMTP provider; email verification token logged to console — locked at gate.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Short-lived access JWT in client memory + rotating refresh token in httpOnly cookie (hashed in `sessions` table) | Access token in memory satisfies security.md (no localStorage, no XSS risk); available to Socket.IO handshake auth object; httpOnly cookie for refresh satisfies XSS protection; hashing refresh token in sessions table enables revocation and reuse detection; session listing/deletion per spec §10 is trivially supported | Access token lost on page reload — requires a silent refresh on app boot; CSRF protection needed on the cookie-bearing refresh route; complexity of the rotate-and-revoke pattern in the sessions table | **Selected** |
| Bearer-only with refresh token in response body (localStorage storage) | Simpler client implementation; no cookie configuration; WS handshake trivial | Violates security.md explicitly (localStorage = XSS attack surface); forbidden by workspace rules | Rejected |
| Full httpOnly cookie session (no access JWT) | Maximum XSS protection; CSRF is the only attack surface | WS handshake cannot read httpOnly cookies from JavaScript — Socket.IO `auth` object cannot be populated; Bearer header for REST requires reading the cookie from JS, defeating the httpOnly purpose; breaks the dual HTTP/WS auth requirement | Rejected |
| OAuth2 / third-party auth only | Offloads credential management; standard flows | Spec §10 defines a first-party register/login/verify-email flow explicitly; delegating to an external provider is out of scope for v1 | Rejected |

## Decision Outcome

**Chosen**: argon2id for password hashing (cost factor ≥ 12). Access JWT (~15 minute expiry) held in client memory (Zustand auth store); issued on login and refresh. Refresh token: random 256-bit value, stored hashed (SHA-256) in the `sessions` table (Snowflake PK), delivered to the client in an `httpOnly + Secure + SameSite=Strict` cookie. Refresh route (`POST /api/v1/auth/refresh`) protected by CSRF double-submit cookie pattern. Refresh token rotation on every use; reuse detection invalidates the entire session. Email verification: flow and DB columns built; in dev/Docker the token is logged to the backend console (no SMTP).

**Rationale**: The access-JWT-in-memory pattern is the only approach that satisfies both `security.md`'s httpOnly-cookie requirement for long-lived credentials and the WebSocket handshake's need for a JavaScript-readable token. The short (~15m) access JWT lifetime limits the blast radius of a token leak to a narrow window — no server-side state is needed to invalidate it. The rotating refresh token in an httpOnly cookie prevents XSS exfiltration of the long-lived credential; storing it hashed in the `sessions` table (rather than as a raw JWT) enables the per-session revocation and listing that spec §10 mandates. Reuse detection (if the same refresh token hash appears twice, revoke the session family) is the standard mitigation for refresh token theft via network interception or compromised storage. The dev-only console logging for email tokens eliminates SMTP as a Docker Compose dependency without removing the verification flow from the codebase — a real provider slots in behind the same service interface later.

**Positive Consequences**:
- Session list (`GET /api/v1/auth/sessions`) and session revocation (`DELETE /api/v1/auth/sessions/:id`) work without additional infrastructure — the `sessions` table IS the session store.
- Socket.IO authentication uses the in-memory access JWT via the `auth` handshake object, which is independent of cookies — no special Socket.IO cookie forwarding required.
- The 15-minute access JWT window means the backend never needs a token blocklist for normal logout; the refresh token revocation in the sessions table is sufficient.

**Negative Consequences / Risks**:
- On page reload, the access JWT is lost; the app must silently attempt `POST /api/v1/auth/refresh` on boot and handle the case where the refresh cookie is absent or expired. This adds an async initialization step before any authenticated route can render.
- The CSRF double-submit pattern on the refresh route requires the frontend to read a CSRF token from a non-httpOnly cookie (or response header) and echo it as a request header — a correctly implemented pattern but one that must be kept in sync across frontend and backend.
- Hashing the refresh token (SHA-256) before storage means the raw token can never be recovered from the DB — lost tokens require re-login. This is the correct security posture but must be understood by anyone debugging session issues.
- argon2id at cost factor 12 is intentionally slow; the login endpoint's response time will be ~200–500ms under load. Rate limiting on auth endpoints (spec §15: 10 attempts / 10min / IP) is the companion control.

## Links

- Related: ADR-0002 (sessions table uses Snowflake PK)
- Implemented in: `apps/api/src/modules/auth/`, `apps/api/src/modules/auth/sessions.entity.ts`
