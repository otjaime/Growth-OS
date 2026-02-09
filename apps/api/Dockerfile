# ──────────────────────────────────────────────────────────────
# Growth OS — API Dockerfile (Railway)
# Multi-stage build for the Fastify API service
# ──────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ── Install dependencies ─────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/package.json
COPY packages/etl/package.json ./packages/etl/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --frozen-lockfile --prod=false

# ── Build ────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @growth-os/database db:generate

# ── Production ───────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app

EXPOSE 4000

# Run migrations + seed demo data + start API
CMD ["sh", "-c", "pnpm --filter @growth-os/database db:push && DEMO_MODE=true pnpm --filter @growth-os/etl demo && pnpm --filter @growth-os/api start"]
