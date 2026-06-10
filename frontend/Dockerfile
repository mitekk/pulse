# ============================================================
# PULSE Frontend — workspace-aware Dockerfile.
#
# Build context is the REPO ROOT (see docker-compose.yml: context: .) so the
# single root npm-workspaces lockfile drives the install. Only the `frontend`
# workspace subtree is installed (lean image — no backend deps, no root tooling).
#
# Multi-stage:
#   builder  → node:24-alpine: npm ci (frontend) + vite build → /app/frontend/dist
#   runner   → nginx:alpine: serves the static bundle
#   dev      → node:24-alpine: Vite HMR (used by docker-compose.override.yml)
#
# Build-time env (VITE_* are baked into the bundle):
#   VITE_API_BASE_URL  — absolute URL or relative path for API calls
#   VITE_WS_URL        — WebSocket server URL
#
# Exposed port: 8080 (runner) / 5173 (dev). Healthcheck: GET /healthz → 200.
# ============================================================

# Pinned Node version — single source of truth is .nvmrc. Compose/Makefile/CI
# feed it from .nvmrc; the default keeps a bare `docker build` locked too.
ARG NODE_VERSION=24.16.0

# ── Stage 1: builder ─────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Manifests + single root lockfile first (layer-cache). All workspace
# package.json files must be present for `npm ci` to match the lockfile.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# Install only the frontend workspace subtree (incl. devDeps for the build)
RUN npm ci --workspace=frontend --include-workspace-root=false

# Copy source
COPY frontend ./frontend

# VITE_* build args are baked into the static bundle — not available at runtime
ARG VITE_API_BASE_URL=""
ARG VITE_WS_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

# Build the production bundle (→ /app/frontend/dist)
RUN npm run build --workspace=frontend

# ── Stage 2: runner ───────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Non-root user for nginx worker processes
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Compiled static files
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Custom nginx config with SPA fallback + healthcheck + security headers
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/conf.d/default.conf.dpkg-new 2>/dev/null || true

RUN chown -R appuser:appgroup /usr/share/nginx/html \
    && chown -R appuser:appgroup /var/cache/nginx \
    && chown -R appuser:appgroup /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown appuser:appgroup /var/run/nginx.pid

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ── Stage 3: dev ──────────────────────────────────────────────
# Used by docker-compose.override.yml for in-container Vite HMR.
# The override bind-mounts ./frontend over /app/frontend with an anonymous
# volume for /app/frontend/node_modules; hoisted deps at /app/node_modules
# (baked into this stage) are not shadowed and remain resolvable.
FROM node:${NODE_VERSION}-alpine AS dev

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci --workspace=frontend --include-workspace-root=false
COPY frontend ./frontend

WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
