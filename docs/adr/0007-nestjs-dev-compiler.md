# ADR-0007: NestJS Dev-Container Compiler — nest start --watch Instead of tsx watch

- **Date**: 2026-06-08
- **Status**: Accepted
- **Deciders**: Smoke-test retrospective, lead architect

## Context and Problem Statement

The Step 5.7 smoke test found the backend in a crash-loop on `docker compose up` in the development override configuration. The `docker-compose.override.yml` was running `npx tsx watch src/index.ts` as the dev server command, following the project's docker rule default for Node services. NestJS, however, relies on TypeScript's `emitDecoratorMetadata` to power its dependency injection container (`@Injectable`, `@Inject`, class-transformer deserialization) and on `experimentalDecorators` for its module/controller/provider decorators. The tsx/esbuild transpiler strips this metadata at compile time — it does not call the TypeScript compiler and therefore does not emit the `Reflect.metadata` calls that `tsyringe`/`reflect-metadata` require. The result is a boot crash: NestJS cannot resolve injected dependencies and throws at startup. This is a hard incompatibility, not a configuration issue.

## Decision Drivers

- NestJS DI resolution requires `emitDecoratorMetadata: true` in `tsconfig.json`; tsx/esbuild does not honor this flag and silently strips metadata.
- The crash was a complete loss of the dev workflow; any alternative that cannot reliably boot the NestJS app is non-viable.
- The project's docker rule defaults (`npx tsx watch`) are written for generic Node/Fastify services. The rule exists for speed and simplicity, but it explicitly does not override framework-level requirements.
- Hot reload in the container must still work for developer experience — the override file's volume mount (`./backend/src:/app/src`) needs a watcher that actually recompiles on change.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `nest start --watch` (via `npm run dev`) — uses the NestJS CLI which calls `tsc` with full decorator-metadata emission | Boots the NestJS app correctly; hot recompile on save; official NestJS dev workflow; no configuration changes to tsconfig.json required | Slower cold-start than tsx (full tsc compilation vs. esbuild transpile); incremental watch rebuilds are slower than esbuild (~1–3s vs ~100ms) | **Selected** |
| `tsx watch` | Fast reload; zero configuration; project default | Does not emit decorator metadata; NestJS DI crashes at boot; not fixable without replacing the DI mechanism | Rejected |
| `ts-node-dev` with `--transpile-only false` | Runs real tsc; supports decorators | Deprecated; superseded by `tsx` and `nest start --watch`; no active maintenance | Rejected |
| SWC-based compilation via `@swc/core` + NestJS SWC plugin | Faster than tsc; supports decorator metadata via the SWC `@nestjs/swc-cli` plugin | Requires adding `@swc/core`, `@swc/cli`, and `@nestjs/swc-cli` to devDependencies and a `.swcrc` config; adds complexity; the NestJS SWC plugin is still experimental for some decorator patterns | Rejected |

## Decision Outcome

**Chosen**: `nest start --watch`

**Rationale**: `nest start --watch` is the correct and supported dev workflow for NestJS. It delegates to `tsc --watch` under the hood (governed by `nest-cli.json`), which means `emitDecoratorMetadata` and `experimentalDecorators` are honored from `tsconfig.json`. The performance penalty — incremental TypeScript compilation taking 1–3 seconds vs. sub-100ms esbuild — is acceptable in a developer inner loop where the bottleneck is typically writing and thinking, not waiting on recompile. The docker rule default (`tsx watch`) is a sensible baseline for Fastify/Express services and is not being changed globally; this deviation is specific to the NestJS backend and is documented as such in the override file comment. The Dockerfile's production build (`npm run build`, which also calls `tsc`) is unchanged.

**Positive Consequences**:
- Backend dev container boots successfully; `docker compose up` no longer crash-loops.
- The NestJS SWC path is still open as a future upgrade if compile times become a developer pain point.

**Negative Consequences / Risks**:
- Dev hot-reload latency is higher than it would be with esbuild-based tools (~1–3s incremental recompile). For a backend with 400+ unit tests and a reasonably large module graph, this is an acknowledged trade-off.
- Any future service added under the same `docker-compose.override.yml` must make an explicit choice between `tsx watch` and `nest start --watch`; the project rule default remains `tsx watch` for non-NestJS services.

## Links

- Related: ADR-0001 (NestJS chosen as the backend framework)
- Implemented in: `docker-compose.override.yml`, `backend/Dockerfile`
