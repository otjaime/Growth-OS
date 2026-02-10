# ──────────────────────────────────────────────────────────────
# Growth OS — Dockerfile (Railway)
# Single-container deployment: API + Demo Pipeline
# ──────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
# Prisma requires OpenSSL libs on Alpine
RUN apk add --no-cache openssl openssl-dev libc6-compat
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# ── Install dependencies ─────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/etl/package.json ./packages/etl/
COPY apps/api/package.json ./apps/api/
# Tell Prisma to download the linux-musl binary (Alpine)
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
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

CMD ["sh", "-c", "pnpm --filter @growth-os/database db:push || echo 'db:push failed, starting anyway'; exec pnpm --filter @growth-os/api start"]
