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
  Organization, User,
  RawEvent, JobRun, JobStatus, ConnectorCredential,
  StgOrder, StgCustomer, StgSpend, StgTraffic, StgEmail,
  DimDate, DimChannel, DimCampaign, DimCustomer,
  FactOrder, FactSpend, FactTraffic, FactEmail,
  Cohort, GrowthScenario,
  Experiment, ExperimentMetric,
  Opportunity, Suggestion, SuggestionFeedback,
  MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd,
  Diagnosis, AdVariant, CampaignStrategy
} from '@prisma/client'

// Enum re-exports
export {
  Prisma, Plan, UserRole, ExperimentStatus, ExperimentType,
  OpportunityType, OpportunityStatus, SuggestionType, SuggestionStatus, FeedbackAction,
  MetaAdStatus, DiagnosisAction, DiagnosisStatus, DiagnosisSeverity,
  VariantStatus, CampaignStrategyType, CampaignStrategyStatus
} from '@prisma/client'
```

### `src/client.ts` — Singleton Prisma Client

```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ ... })
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

### `src/mode.ts` — Demo/Live Mode Management

```typescript
export async function isDemoMode(): Promise<boolean>
export async function setMode(mode: 'demo' | 'live'): Promise<void>
export async function getAppSetting(key: string): Promise<string | null>
export async function setAppSetting(key: string, value: string): Promise<void>
```

---

## Prisma Schema (38+ models, 16+ enums)

### Multi-Tenancy
| Model | Table | Key Fields |
|-------|-------|------------|
| `Organization` | `organizations` | name, clerkOrgId (unique), plan (Plan enum), stripeCustomerId, stripeSubscriptionId, trialEndsAt |
| `User` | `users` | clerkUserId (unique), email (unique), name, role (UserRole), organizationId |

### Raw Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `RawEvent` | `raw_events` | source, entity, externalId, payloadJson, fetchedAt, organizationId |
| `JobRun` | `job_runs` | jobName, status (JobStatus), startedAt, finishedAt, durationMs, errorJson, rowsLoaded, organizationId |
| `ConnectorCredential` | `connector_credentials` | connectorType (unique), encryptedData, iv, authTag, metadata, lastSyncAt, organizationId |

### Staging Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `StgOrder` | `stg_orders` | orderId (unique), orderDate, customerId, revenueGross/discounts/refunds/revenueNet (Decimal 12,2), UTM fields, channelRaw, isNewCustomer, organizationId |
| `StgCustomer` | `stg_customers` | customerId (unique), firstOrderDate, acquisitionChannel, totalOrders, totalRevenue, organizationId |
| `StgSpend` | `stg_spend` | date+source+campaignId (unique), spend/impressions/clicks/conversions/conversionValue, organizationId |
| `StgTraffic` | `stg_traffic` | date+source+channelRaw (unique), sessions/pdpViews/addToCart/checkouts/purchases, organizationId |
| `StgEmail` | `stg_email` | Email campaign metrics, organizationId |

### Dimension Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `DimDate` | `dim_date` | date (PK), dayOfWeek, dayName, week, month, monthName, quarter, year, isWeekend |
| `DimChannel` | `dim_channel` | slug (unique: meta/google/email/organic/affiliate/direct/other), name |
| `DimCampaign` | `dim_campaign` | source+campaignId (unique), campaignName, channelId -> DimChannel, organizationId |
| `DimCustomer` | `dim_customer` | customerId (unique), firstOrderDate, acquisitionChannel, cohortMonth (YYYY-MM), LTV fields, RFM scores, segment, organizationId |

### Fact Layer
| Model | Table | Key Fields |
|-------|-------|------------|
| `FactOrder` | `fact_orders` | orderId (unique), orderDate, customerId, channelId, campaignId, revenue/cost/margin fields, organizationId |
| `FactSpend` | `fact_spend` | date+channelId+campaignId (unique), spend, impressions, clicks, organizationId |
| `FactTraffic` | `fact_traffic` | date+channelId (unique), sessions, pdpViews, addToCart, checkouts, purchases, organizationId |
| `FactEmail` | `fact_email` | date+channelId+campaignId (unique), sends, opens, clicks, bounces, revenue, organizationId |
| `Cohort` | `cohorts` | cohortMonth (unique), cohortSize, d7/d30/d60/d90Retention, ltv30/90/180, paybackDays, avgCac, organizationId |

### Experimentation
| Model | Table | Key Fields |
|-------|-------|------------|
| `Experiment` | `experiments` | name, hypothesis, status (ExperimentStatus), type (ExperimentType), ICE scoring (impact/confidence/ease/iceScore), A/B test fields (control/variant samples, conversions, rates, pValue, isSignificant), organizationId |
| `ExperimentMetric` | `experiment_metrics` | experimentId+date+metricName (unique), value, notes |

### AI Suggestions
| Model | Table | Key Fields |
|-------|-------|------------|
| `Opportunity` | `opportunities` | type (OpportunityType), title, description, priority, status, signalsJson, organizationId |
| `Suggestion` | `suggestions` | opportunityId, type, title, hypothesis, impact/confidence/effort/riskScore, driverAnalysis, actionsJson, status |
| `SuggestionFeedback` | `suggestion_feedback` | suggestionId, action (FeedbackAction), notes, promotedExperimentId |

### Growth Model
| Model | Table | Key Fields |
|-------|-------|------------|
| `GrowthScenario` | `growth_scenarios` | name, isBaseline, input assumptions (monthlyBudget, targetCac, expectedCvr, avgOrderValue, cogsPercent, etc.), computed outputs (projectedRevenue, projectedOrders, breakEvenMonth, etc.), organizationId |

### Meta Ads
| Model | Table | Key Fields |
|-------|-------|------------|
| `MetaAdAccount` | `meta_ad_accounts` | organizationId+adAccountId (unique), name, currency, timezone, status |
| `MetaCampaign` | `meta_campaigns` | organizationId+campaignId (unique), accountId, name, status, objective, dailyBudget |
| `MetaAdSet` | `meta_ad_sets` | organizationId+adSetId (unique), campaignId, name, status, dailyBudget, targetingJson |
| `MetaAd` | `meta_ads` | organizationId+adId (unique), creative fields (headline, primaryText, imageUrl, creativeType), 7d/14d metrics (spend, impressions, clicks, conversions, revenue, roas, ctr, cpc, frequency) |
| `MetaAdSnapshot` | `meta_ad_snapshots` | organizationId+adId+date (unique), daily metrics for trend analysis |

### Autopilot
| Model | Table | Key Fields |
|-------|-------|------------|
| `Diagnosis` | `diagnoses` | organizationId+adId+ruleId (unique), severity, title, message, actionType, status, suggestedValue, confidence, aiInsight, expiresAt |
| `AdVariant` | `ad_variants` | diagnosisId, adId, angle, headline, primaryText, status (VariantStatus), performance tracking |
| `CopyVariant` | `copy_variants` | organizationId, diagnosisId, originalAdId, angle, headline, primaryText, status, performance |
| `AutopilotConfig` | `autopilot_configs` | organizationId (unique), mode (monitor/suggest/auto), targets (targetRoas, maxCpa, dailyBudgetCap), safety limits, circuit breaker settings, proactive settings |
| `AutopilotActionLog` | `autopilot_action_logs` | organizationId, diagnosisId, actionType, triggeredBy, target info, before/after values, success, rollback tracking |
| `DiagnosisFeedback` | `diagnosis_feedback` | organizationId, ruleId, action, diagnosisId, confidence |

### Product Intelligence
| Model | Table | Key Fields |
|-------|-------|------------|
| `ProductPerformance` | `product_performance` | organizationId+productTitle+productType (unique), unitsSold30d, revenue30d, avgPrice, estimatedMargin, adFitnessScore, trends, cross-sell, lifecycle, ad history |
| `ProactiveAdJob` | `proactive_ad_jobs` | organizationId, productTitle, productType, adFitnessScore, status (ProactiveAdStatus), copyVariants, imageHash, metaAdIds, testRound |
| `CampaignStrategy` | `campaign_strategies` | organizationId, name, type (CampaignStrategyType), status, productTitles, budget, targetAudience, creativeDirection, estimatedRoas, rationale, Meta integration fields |

### Settings
| Model | Table | Key Fields |
|-------|-------|------------|
| `AppSetting` | `app_settings` | key (PK), value |

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
- All data tables have optional `organizationId` for multi-tenancy
- Meta ad metric fields use `Decimal(8, 4)` for ROAS/frequency and `Decimal(8, 6)` for CTR
