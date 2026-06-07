# ============================================================
# PULSE Frontend — Production Dockerfile
#
# Multi-stage build:
#   builder  → node:22-alpine: npm ci + npm run build
#   runner   → nginx:alpine: serves static dist/ via nginx
#
# Build-time env vars (VITE_* are baked into the bundle at build time):
#   VITE_API_BASE_URL  — absolute URL or relative path for API calls
#                        (default: empty string → Vite proxy or same-origin)
#   VITE_WS_URL        — WebSocket server URL
#                        (default: empty string → same-origin /socket.io)
#
# Exposed port: 8080
# Healthcheck path: GET /healthz → 200 OK "ok"
#
# Usage:
#   docker build \
#     --build-arg VITE_API_BASE_URL=https://api.example.com \
#     --build-arg VITE_WS_URL=wss://api.example.com \
#     -t pulse-frontend .
# ============================================================

# ── Stage 1: builder ─────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install all deps (including devDeps needed for build)
RUN npm ci --prefer-offline

# Copy source
COPY . .

# Accept build-time env vars for VITE_* variables
# These are baked into the static bundle — not available at runtime
ARG VITE_API_BASE_URL=""
ARG VITE_WS_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

# Build the production bundle
RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Create non-root user for nginx worker processes
# (nginx master must run as root to bind port; workers run as appuser)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy compiled static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config with SPA fallback + healthcheck + security headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf.dpkg-new 2>/dev/null || true

# Set ownership of nginx html dir
RUN chown -R appuser:appgroup /usr/share/nginx/html \
    && chown -R appuser:appgroup /var/cache/nginx \
    && chown -R appuser:appgroup /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown appuser:appgroup /var/run/nginx.pid

USER appuser

EXPOSE 8080

# Healthcheck — matches /healthz location in nginx.conf
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ── Stage 3: dev ──────────────────────────────────────────────
# Used by docker-compose.override.yml for in-container Vite HMR.
# Source is bind-mounted over /app; an anonymous volume preserves node_modules.
FROM node:22-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
