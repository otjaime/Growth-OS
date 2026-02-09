# ──────────────────────────────────────────────────────────────
# Growth OS — Dockerfile (Railway)
# Single-container deployment: API + Demo Pipeline
# ──────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ── Install dependencies ─────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/etl/package.json ./packages/etl/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile

# ── Build ────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @growth-os/database db:generate

# ── Production ───────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./

EXPOSE 4000

CMD ["sh", "-c", "pnpm --filter @growth-os/database db:push && DEMO_MODE=true pnpm --filter @growth-os/etl demo && pnpm --filter @growth-os/api start"]
