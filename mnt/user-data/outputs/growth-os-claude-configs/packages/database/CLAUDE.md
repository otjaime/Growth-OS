# packages/database — Claude Code Context

> **Scope**: Prisma schema, database client, seeds, migrations.

---

## Key Rules

### Schema Design (Star Schema)
- **Fact tables**: Store measurable events (orders, ad_impressions, sessions) at daily grain
- **Dimension tables**: Store descriptive attributes (dim_date, dim_channel, dim_customer)
- **Naming**: Fact tables prefixed `fact_`, dimensions prefixed `dim_`
- **Keys**: All facts reference dimension IDs (integers), not source-specific IDs
- **Dates**: Use `dim_date` table — facts reference `date_id`, never store raw dates in facts

### Prisma Usage
- Export client from this package: `import { prisma } from '@growth-os/database'`
- **Never import from `@prisma/client` in other packages**
- Run `pnpm db:migrate` after any schema change (creates migration file)
- Run `pnpm db:seed` to populate dimension tables
- Use `prisma.tableName.createMany()` for bulk inserts with `skipDuplicates: true`

### Migrations
- Always use descriptive migration names: `pnpm prisma migrate dev --name add_tiktok_source`
- Never edit existing migration files
- Test migrations on a fresh database before committing

### Seed Data
- `dim_date`: Pre-populate 2 years of dates with day_of_week, month, quarter, year, is_weekend
- `dim_channel`: All marketing channels (organic, paid_search, paid_social, email, direct, referral)
- Seeds must be idempotent (safe to run multiple times)

### Connection Management
- Connection credentials stored encrypted (AES-256-GCM) in `connections` table
- Encryption key from `ENCRYPTION_KEY` env var
- Never store plaintext tokens/keys

---

## Schema Change Checklist

When modifying the Prisma schema:

1. Edit `prisma/schema.prisma`
2. Run `pnpm prisma migrate dev --name descriptive_name`
3. Update seed if new dimensions are needed
4. Update ETL pipeline if new fact/staging tables
5. Update API if new queryable data
6. Run `pnpm typecheck` (Prisma generates new types)
7. Run `pnpm test` to verify nothing breaks
