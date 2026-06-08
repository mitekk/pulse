# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached until package.json changes)
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY . .
RUN npm run build

# ─── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install ffmpeg (for video/GIF processing) and sharp runtime native libs
# vips-dev is required for sharp @napi-rs/canvas bindings on Alpine
RUN apk add --no-cache ffmpeg vips

# Create a non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy only what's needed
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# tsconfig.json + nest-cli.json are needed at runtime by the dev override
# (`nest start --watch`), which recompiles via tsc so decorator metadata
# (required by NestJS DI and class-transformer coercion) is emitted correctly.
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/nest-cli.json ./nest-cli.json

# The dev override runs `nest start --watch` as the non-root app user, which
# recompiles into ./dist on every change — so app must own the workdir.
RUN chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
