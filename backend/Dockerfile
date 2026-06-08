# ──────────────────────────────────────────────────────────────────────────────
# PULSE Backend — workspace-aware Dockerfile.
#
# Build context is the REPO ROOT (see docker-compose.yml: context: .), because
# the single source of truth is the root npm-workspaces lockfile. We install only
# the `backend` workspace subtree (lean image — no frontend deps, no root tooling).
#
# In-image layout (npm workspaces):
#   /app/node_modules        hoisted dependencies (shared resolution target)
#   /app/backend/dist        compiled output  → `node dist/main.js`
#   /app/backend/package.json, tsconfig.json, nest-cli.json (needed by the dev
#                            override's `nest start --watch`)
# Module resolution from /app/backend/dist walks /app/backend/node_modules → /app/node_modules.
# ──────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Manifests + single root lockfile first (layer-cached until deps change).
# All workspace package.json files must be present for `npm ci` to match the lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install only the backend workspace (incl. devDeps — the dev-override
# `nest start --watch` needs @nestjs/cli + the TS toolchain).
RUN npm ci --workspace=backend --include-workspace-root=false

# Copy backend source and compile (→ /app/backend/dist)
COPY backend ./backend
RUN npm run build --workspace=backend

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app/backend

# ffmpeg (video/GIF processing) + vips (sharp native libs) on Alpine
RUN apk add --no-cache ffmpeg vips

# Non-root user
RUN addgroup -S app && adduser -S app -G app

# Hoisted deps + compiled backend. We copy only dist + the manifests the dev
# override's `nest start --watch` needs (tsconfig.json, nest-cli.json) — source
# is bind-mounted in dev (docker-compose.override.yml), not baked into prod.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/tsconfig.json ./tsconfig.json
COPY --from=builder /app/backend/nest-cli.json ./nest-cli.json

# The dev override runs `nest start --watch` as the non-root app user, which
# recompiles into ./dist on every change — so app must own the workdir tree.
RUN chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
