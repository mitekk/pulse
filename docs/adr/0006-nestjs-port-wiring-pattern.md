# ADR-0006: NestJS Port-Wiring Pattern — @Global + useExisting for Cross-Module Port Tokens

- **Date**: 2026-06-08
- **Status**: Accepted
- **Deciders**: Smoke-test retrospective, lead architect

## Context and Problem Statement

The Step 5.7 smoke test surfaced that three cross-module port tokens — `POSTS_NOTIFICATION_PORT`, `VIEWER_FLAGS_PORT`, and `MEDIA_ATTACH_PORT` — were being injected as noop stubs in production, even though the real implementations existed. The root cause was a widely-assumed but incorrect "AppModule override" pattern: adding a provider at `AppModule` scope was expected to shadow a token bound locally in a child module. NestJS does not work this way. It resolves an injection token within the *consumer module's* scope, so an `AppModule`-level provider is invisible to any module that has already bound the same token locally. The pattern failed silently — no startup error, no log warning — meaning the noops shipped to the dockerized stack and the smoke test was the first runtime signal. The same DI resolution semantics govern `REALTIME_PUBLISHER_PORT`, which was wired in the follow-up commit `770ef3d`.

## Decision Drivers

- NestJS resolves tokens at the consumer module's scope, not globally; a child module's local binding wins unconditionally over any parent-scope binding. The AppModule-override pattern is architecturally invalid.
- Circular DI loops (`posts ↔ engagement`, `notifications ↔ posts/users`) prevented naive "just import the real module" fixes, forcing a deliberate resolution strategy.
- `useClass` for a port alias creates a second, independent instance of the service — this broke `REALTIME_PUBLISHER_PORT` (the gateway had called `setServer()` on the first instance; the second had no socket server attached, so all publishes silently no-oped).
- Integration tests were bootstrapping the app with explicit port overrides, meaning the test suite was not exercising the production DI graph; real wiring bugs could persist undetected until runtime smoke testing.
- The pattern needed to be consistent and forward-compatible: `MEDIA_ATTACH_PORT` and `REALTIME_PUBLISHER_PORT` were still unwired at the time of the `6eee1bf` fix; the chosen pattern had to scale to them without new circular dependencies.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `@Global` module exports the singleton; consumers bind the port token via `useExisting` (no local import of the global module required) | Eliminates circular imports; `useExisting` aliases the *same* singleton instance (not a second one); `@Global` declaration at the provider module means the token is resolvable everywhere without explicit imports; the pattern was already in use for `ConfigModule` and `TypeOrmModule` so it follows NestJS idiom | All implementations that export cross-module ports must be explicitly marked `@Global`; the global scope is a larger blast radius if naming collides; requires discipline not to drift back to local noops | **Selected** |
| `forwardRef(() => Module)` on both sides of a circular import | Can break circular loops without restructuring; standard NestJS escape hatch | Forward references are fragile: resolution order is nondeterministic, the pattern is discouraged in the NestJS docs for anything beyond simple two-module cycles, and it does not solve the "AppModule can't override child bindings" problem | Rejected |
| Restructure module imports to eliminate cycles and then do plain `imports: [RealModule]` in the consumer | Clean, explicit dependency graph; no global scope required | Requires non-trivial refactoring of entity ownership and service boundaries; `notifications ↔ posts/users` cycle exists because notifications need User and Post repos, not just services — breaking it cleanly would mean splitting entity modules from service modules, a large change | Rejected |
| AppModule-level provider override (the pattern that was already in place) | Minimal code change; conceptually appealing | Does not work: NestJS resolves tokens in consumer module scope, so the child module's local binding wins; the pattern fails silently with no error or warning; definitively rejected | Rejected |

## Decision Outcome

**Chosen**: `@Global` module + `useExisting` aliasing.

**Rationale**: The `@Global` + `useExisting` pattern is the only approach that simultaneously (a) avoids circular imports — the consumer resolves the token from the global scope without needing to import the provider's module — and (b) guarantees a single shared instance (critical for stateful services like `RealtimePublisherService` where `setServer()` must be called on the same object that other callers use to `publish()`). `useClass` was explicitly ruled out because it silently creates a second instance that bypasses any initialization performed on the first. The pattern generalizes cleanly: `MediaModule`, `NotificationsModule`, and `RealtimeModule` are each marked `@Global` and export their real implementations; consuming modules (`PostsModule`, `MessagingModule`, `TimelineModule`) bind the port tokens via `useExisting` without importing the provider module at all. As evidence that the pattern is durable: `MEDIA_ATTACH_PORT` (commit `27daeae`) and `REALTIME_PUBLISHER_PORT` (commit `770ef3d`) were wired following exactly this pattern after the fact, with no module restructuring required.

**Positive Consequences**:
- All cross-module port tokens now resolve to their real implementations in the production DI graph; noop stubs are no longer present at runtime.
- The pattern is uniform across the codebase — future ports follow the same recipe (`@Global` export + `useExisting` in the consumer), documented in module JSDoc comments.
- No circular imports: `NotificationsModule` does not import `PostsModule`; it binds only the Post entity repo it needs via `TypeOrmModule.forFeature([Post])`.

**Negative Consequences / Risks**:
- A proliferation of `@Global` modules reduces the explicit dependency graph that NestJS module imports normally provide. Any new `@Global` module must be reviewed to ensure its exported tokens do not collide with other modules' bindings.
- Integration tests that override ports for isolation must now *explicitly* remove or override the `@Global` binding rather than relying on module-scoped overrides. The integration bootstrap (`tests/integration/helpers/app.ts`) was updated in `770ef3d` to remove redundant overrides; future test changes must be consistent.
- The pattern masks its own bugs: if a `@Global` module is not imported into `AppModule`, the exported tokens are not in the global scope and the consumer fails at runtime, not at compile time. `@Global` modules must be registered in `AppModule.imports[]`.

**Process Lesson**: Integration tests that bootstrap the app with explicit port overrides do not exercise the real DI wiring, meaning this class of bug — a noop stub shipping to production — is invisible until a live smoke test. The fix to `tests/integration/helpers/app.ts` (removing port overrides so tests use the real graph) is as important as the module changes.

## Links

- Related: ADR-0001 (NestJS modular monolith architecture)
- Related: ADR-0005 (SearchPort uses a similar seam pattern)
- Amended by context: commits `6eee1bf`, `27daeae`, `770ef3d`
- Implemented in: `backend/src/modules/notifications/notifications.module.ts`, `backend/src/modules/posts/posts.module.ts`, `backend/src/modules/realtime/realtime.module.ts`, `backend/src/modules/media/`
