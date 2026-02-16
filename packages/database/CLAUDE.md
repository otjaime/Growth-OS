# packages/database — Claude Code Context

> **Scope**: Prisma schema, database client, seed, encryption, mode management. This is the data layer foundation.

---

## Package Info

- **Name**: `@growth-os/database`
- **Type**: ESM module
- **Exports**:
  - `.` -> `./src/index.ts` (barrel export)
  - `./client` -> `./src/client.ts` (direct Prisma client access)

---

## Source Files

### `src/index.ts` — Barrel Export

Re-exports everything the monorepo needs:

```typescript
// Runtime exports
export { prisma } from './client.js'
export { encrypt, decrypt } from './crypto.js'
export { isDemoMode, setMode, getAppSetting, setAppSetting } from './mode.js'

// Type re-exports from @prisma/client
export type {
  RawEvent, JobRun, JobStatus, ConnectorCredential,
  StgOrder, StgCustomer, StgSpend, StgTraffic,
  DimDate, DimChannel, DimCampaign, DimCustomer,
  FactOrder, FactSpend, FactTraffic,
  Cohort, Experiment, ExperimentStatus, ExperimentMetric,
  Opportunity, OpportunityType, OpportunityStatus,
  Suggestion, SuggestionType, SuggestionStatus,
  SuggestionFeedback, FeedbackAction,
  AppSetting, Prisma
} from '@prisma/client'
```

### `src/client.ts` — Singleton Prisma Client

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- **Pattern**: Global singleton prevents connection pool exhaustion during Next.js hot reloads
- **Logging**: All queries in dev, errors-only in prod

### `src/crypto.ts` — AES-256-GCM Encryption

```typescript
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string }
export function decrypt(encrypted: string, iv: string, authTag: string): string
```

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key**: `ENCRYPTION_KEY` env var (32 bytes as 64-char hex string)
- **Fallback**: Random key in dev (with console warning; credentials lost on restart)
- **IV**: Random 16 bytes per encryption (prevents ciphertext repetition)
- **Auth tag**: Detects tampering/corruption on decrypt
- **Storage**: ConnectorCredential stores `encrypted_data`, `iv`, `auth_tag` columns

### `src/mode.ts` — Demo/Live Mode Management

```typescript
export async function isDemoMode(): Promise<boolean>
export async function setMode(mode: 'demo' | 'live'): Promise<void>
export async function getAppSetting(key: string): Promise<string | null>
export async function setAppSetting(key: string, value: string): Promise<void>
```

- **isDemoMode**: Checks `app_settings` table for `demo_mode` key, falls back to `process.env.DEMO_MODE`
- **setMode**: Upserts into app_settings + updates `process.env.DEMO_MODE` in-memory
- **Error handling**: `isDemoMode` and `getAppSetting` silently catch DB errors (table may not exist before migration)
- **Table used**: `app_settings` (key-value store)

---

## Prisma Schema (20 models, 6 enums)

### Raw Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `RawEvent` | `raw_events` | source, entity, externalId, payloadJson, fetchedAt |
| `JobRun` | `job_runs` | jobName, status (JobStatus enum), startedAt, finishedAt, durationMs, errorJson, rowsLoaded |
| `ConnectorCredential` | `connector_credentials` | connectorType (unique), encryptedData, iv, authTag, metadata, lastSyncAt |

### Staging Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `StgOrder` | `stg_orders` | orderId (unique), orderDate, customerId, revenueGross/discounts/refunds/revenueNet (Decimal 12,2), UTM fields, channelRaw, isNewCustomer |
| `StgCustomer` | `stg_customers` | customerId (unique), firstOrderDate, acquisitionChannel, totalOrders, totalRevenue |
| `StgSpend` | `stg_spend` | date+source+campaignId (unique), spend/impressions/clicks/conversions/conversionValue |
| `StgTraffic` | `stg_traffic` | date+source+channelRaw (unique), sessions/pdpViews/addToCart/checkouts/purchases |

### Dimension Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `DimDate` | `dim_date` | date (PK), dayOfWeek, dayName, week, month, monthName, quarter, year, isWeekend |
| `DimChannel` | `dim_channel` | slug (unique: meta/google/email/organic/affiliate/direct/other), name |
| `DimCampaign` | `dim_campaign` | source+campaignId (unique), campaignName, channelId -> DimChannel |
| `DimCustomer` | `dim_customer` | customerId (unique), firstOrderDate, acquisitionChannel, cohortMonth (YYYY-MM), totalOrders, totalRevenue, ltv30/90/180, isNewCustomer |

### Fact Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `FactOrder` | `fact_orders` | orderId (unique), orderDate, customerId -> DimCustomer, channelId -> DimChannel, campaignId -> DimCampaign, revenueGross/discounts/refunds/revenueNet/cogs/shippingCost/opsCost/contributionMargin, isNewCustomer |
| `FactSpend` | `fact_spend` | date+channelId+campaignId (unique), spend, impressions, clicks |
| `FactTraffic` | `fact_traffic` | date+channelId (unique), sessions, pdpViews, addToCart, checkouts, purchases |
| `Cohort` | `cohorts` | cohortMonth (unique), cohortSize, d7/d30/d60/d90Retention (Decimal 5,4), ltv30/90/180, paybackDays, avgCac |

### Feature Tables
| Model | Table | Key Fields |
|-------|-------|------------|
| `Experiment` | `experiments` | name, hypothesis, status (ExperimentStatus), channel, primaryMetric, RICE fields (reach/impact/confidence/effort/riceScore), startDate, endDate, result, learnings, nextSteps |
| `ExperimentMetric` | `experiment_metrics` | experimentId+date+metricName (unique), value, notes |
| `Opportunity` | `opportunities` | type (OpportunityType), title, description, priority, status (OpportunityStatus), signalsJson |
| `Suggestion` | `suggestions` | opportunityId -> Opportunity, type (SuggestionType), title, hypothesis, impact/confidence/effort/riskScore, status (SuggestionStatus), reasoning, playbookRef |
| `SuggestionFeedback` | `suggestion_feedback` | suggestionId -> Suggestion, action (FeedbackAction), notes, promotedExperimentId |
| `AppSetting` | `app_settings` | key (PK), value |

### Enums
- `JobStatus`: PENDING, RUNNING, SUCCESS, FAILED, RETRYING
- `ExperimentStatus`: IDEA, BACKLOG, RUNNING, COMPLETED, ARCHIVED
- `OpportunityType`: EFFICIENCY_DROP, CAC_SPIKE, RETENTION_DECLINE, FUNNEL_LEAK, GROWTH_PLATEAU, CHANNEL_IMBALANCE, QUICK_WIN
- `OpportunityStatus`: NEW, REVIEWED, ACTED, DISMISSED
- `SuggestionType`: AI_GENERATED, PLAYBOOK_MATCH, RULE_BASED
- `SuggestionStatus`: PENDING, APPROVED, REJECTED, PROMOTED
- `FeedbackAction`: APPROVE, REJECT, MODIFY, PROMOTE

---

## Seed Script (`prisma/seed.ts`)

Seeds two dimension tables:

1. **dim_channel** (7 rows via upsert):
   - meta -> "Meta Ads", google -> "Google Ads", email -> "Email", organic -> "Organic", affiliate -> "Affiliate", direct -> "Direct", other -> "Other"

2. **dim_date** (730 rows: 2025-01-01 to 2026-12-31):
   - Uses `getWeekNumber(date)` helper for ISO 8601 week numbering
   - Populates: dayOfWeek (0=Sun), dayName, week, month, monthName, quarter, year, isWeekend

Run: `pnpm db:seed`

---

## Scripts

| Script | Command |
|--------|---------|
| `db:migrate` | `prisma migrate dev` |
| `db:generate` | `prisma generate` |
| `db:push` | `prisma db push` (no migration file) |
| `db:seed` | `tsx prisma/seed.ts` |
| `db:reset` | `prisma migrate reset --force` |
| `db:studio` | `prisma studio` |
| `build` | `tsc` |
| `typecheck` | `tsc --noEmit` |

---

## Rules for This Package

- **Never import `@prisma/client` in other packages** — always use `@growth-os/database`
- Seeds must be **idempotent** (safe to run multiple times via upsert)
- **ENCRYPTION_KEY** must be set in production (64-char hex = 32 bytes)
- Schema changes require `pnpm db:migrate` followed by `pnpm typecheck` across the monorepo
- All monetary fields use `Decimal(12, 2)` — **never float**
- Retention fields use `Decimal(5, 4)` — stores values like 0.1234 (12.34%)
