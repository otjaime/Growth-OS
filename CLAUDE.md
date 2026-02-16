# Growth OS — Claude Code Configuration

> **Purpose**: This file gives Claude Code deep context about this project so it can write production-quality code without repeated explanations. Read this FIRST before any task. Each package also has its own CLAUDE.md with implementation details.

---

## Project Overview

Growth OS is a **unified analytics platform for DTC/ecommerce growth teams**. It ingests data from 7 sources (Shopify, Meta Ads, Google Ads, GA4, TikTok Ads, Klaviyo, Stripe), transforms it through a 3-step ETL pipeline into a star schema, and serves an executive dashboard with automated alerts, Weekly Business Reviews, AI-powered suggestions, RFM customer segmentation, seasonal forecasting, and an experimentation system.

**Business Domain**: Ecommerce analytics, marketing attribution, unit economics, cohort analysis, funnel optimization, growth experimentation.

**Users**: Growth leads, marketing managers, ecommerce directors who need a single source of truth for cross-channel performance.

---

## Architecture

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Shopify  │ │ Meta Ads │ │Google Ads│ │   GA4    │ │ TikTok   │ │ Klaviyo  │ │ Stripe   │
│(GraphQL) │ │Marketing │ │   API    │ │ Data API │ │ Ads API  │ │Email API │ │Payments  │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
     └──────┬─────┴──────┬─────┴──────┬──────┘            │            │            │
            │            │            │                    │            │            │
            ┌────────────▼────────────▼────────────────────▼────────────▼────────────▼──┐
            │              packages/etl                                                  │
            │  connectors/ → pipeline/ (Raw→Staging→Marts) → kpis.ts                   │
            │  signals.ts → opportunities.ts → forecast.ts → segmentation.ts            │
            └──────────────────────────┬────────────────────────────────────────────────┘
                                       │
                              ┌────────▼────────┐
                              │   PostgreSQL 16  │
                              │   (Prisma ORM)   │
                              └────────┬─────────┘
                                       │
                    ┌──────────────────┬┴────────────────────┐
                    │                  │                      │
             ┌──────▼──────┐   ┌──────▼──────┐       ┌──────▼──────┐
             │  apps/api   │   │  Scheduler   │       │  apps/web   │
             │  Fastify    │   │  (periodic)  │       │  Next.js 14 │
             │  REST API   │   │              │       │  Dashboard  │
             │  port 4000  │   │              │       │  port 3000  │
             └─────────────┘   └──────────────┘       └─────────────┘
```

### Data Flow: 3-Step Transformation
1. **Raw** — Unmodified API responses stored as-is (`raw_events` table)
2. **Staging** — Cleaned, normalized, deduplicated (`stg_orders`, `stg_customers`, `stg_spend`, `stg_traffic`, `stg_email`)
3. **Marts** — Star schema dimensional model (`fact_orders`, `fact_spend`, `fact_traffic`, `fact_email` + `dim_*` + `cohorts`)

---

## Monorepo Structure

```
growth-os/
├── apps/
│   ├── api/                    # Fastify REST API (see apps/api/CLAUDE.md)
│   │   └── src/
│   │       ├── routes/         # health, metrics, alerts, wbr, connections, jobs,
│   │       │                   # experiments, suggestions, settings, ask, pipeline
│   │       ├── lib/            # ai.ts, suggestions.ts, gather-metrics.ts, slack.ts, auth.ts, crypto.ts
│   │       ├── scheduler.ts    # Periodic sync + daily marts
│   │       └── index.ts        # Server entry + plugin registration
│   ├── web/                    # Next.js 14 dashboard (see apps/web/CLAUDE.md)
│   │   └── src/
│   │       ├── app/            # App Router (16 pages)
│   │       ├── components/     # Sidebar, KpiCard, Sparkline, DateRangePicker, connection components
│   │       ├── contexts/       # FilterProvider (global channel filter)
│   │       └── lib/            # api.ts (fetch wrapper + auth), format.ts (formatters), export.ts (CSV)
│   └── e2e/                    # Playwright E2E tests
├── packages/
│   ├── database/               # Prisma schema, client, seed, crypto, mode (see packages/database/CLAUDE.md)
│   │   ├── src/                # index.ts, client.ts, crypto.ts, mode.ts
│   │   └── prisma/
│   │       ├── schema.prisma   # 22 models, 6 enums
│   │       └── seed.ts         # Seeds dim_channel (8) + dim_date (730 days)
│   └── etl/                    # ETL engine (see packages/etl/CLAUDE.md)
│       └── src/
│           ├── connectors/     # shopify.ts, meta.ts, google-ads.ts, ga4.ts, tiktok.ts, klaviyo.ts, stripe.ts, demo-generator.ts
│           ├── pipeline/       # step1-ingest-raw.ts, step2-normalize-staging.ts,
│           │                   # step3-build-marts.ts, validate.ts, channel-mapping.ts
│           ├── kpis.ts         # 18 KPI calculation functions
│           ├── alerts.ts       # 7 alert rules with severity + recommendations
│           ├── forecast.ts     # Holt-Winters double + triple exponential smoothing
│           ├── segmentation.ts # RFM customer segmentation (6 segments)
│           ├── signals.ts      # Signal detection (wraps alerts + metric deltas + funnel drops)
│           ├── opportunities.ts # Classify signals into opportunity types
│           ├── demo.ts         # Demo pipeline runner (seed=42, 180 days)
│           └── sync.ts         # Real sync runner
├── docs/                       # Architecture, KPI defs, acceptance criteria
├── .github/workflows/qa.yml    # CI: 5-stage QA pipeline
├── docker-compose.yml          # PostgreSQL 16 + Redis 7
└── pnpm-workspace.yaml
```

---

## Tech Stack & Versions (DO NOT upgrade without asking)

| Layer         | Technology                        | Version  |
|---------------|-----------------------------------|----------|
| Monorepo      | pnpm workspaces                   | >= 8     |
| Language      | TypeScript (strict mode)          | 5.3      |
| Database      | PostgreSQL + Prisma               | 16 / 5.10 |
| Queue         | Redis + BullMQ                    | 7 / 5.1  |
| Backend       | Fastify                           | 4.26     |
| Frontend      | Next.js (App Router) + Tailwind   | 14.1 / 3.4 |
| Charts        | Recharts                          | 2.12     |
| AI            | OpenAI (gpt-4o-mini default)      | via npm  |
| Unit Testing  | Vitest                            | 1.3      |
| E2E Testing   | Playwright                        | 1.42     |
| Infra         | Docker Compose                    | -        |

---

## Coding Standards — ALWAYS follow these

### TypeScript
- **Strict mode always**: `strict: true` in tsconfig.json. Never use `any` — use `unknown` + type guards
- **Explicit return types** on all exported functions
- **Prefer `interface` over `type`** for object shapes
- **Use `readonly` arrays and properties** where data shouldn't mutate
- **Barrel exports** via `index.ts` in each module folder
- **No default exports** except Next.js pages/layouts (App Router requirement)

### Naming
- **Files**: `kebab-case.ts` (e.g., `gather-metrics.ts`)
- **Types/Interfaces**: `PascalCase` (e.g., `MetricSummary`)
- **Functions/variables**: `camelCase` (e.g., `calculateRoas`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_LOOKBACK_DAYS`)
- **Database columns**: `snake_case` (Prisma maps to camelCase via `@map`)
- **API endpoints**: `/api/kebab-case` (e.g., `/api/unit-economics`)
- **React components**: `PascalCase.tsx` or `kebab-case.tsx` (e.g., `kpi-card.tsx`)

### Error Handling
- **Custom error classes** extending `Error` with error codes
- **Never swallow errors** — always log with context before re-throwing
- **Use Result pattern** for expected failures (e.g., API rate limits)
- **Fastify error handler** for consistent API error responses

### Database (Prisma)
- **Always use Prisma client** — never raw SQL unless absolutely necessary
- **Import from `@growth-os/database`** — never from `@prisma/client` directly
- **Transactions** for multi-table writes (timeout: 60s, wait: 30s)
- **Select only needed fields** — no `findMany()` without `select` on large tables
- **Batch operations**: 200-500 records per batch with `skipDuplicates: true`

### Testing
- **Co-locate tests**: `{module}.test.ts` next to source
- **Golden fixtures** for KPI regression: hand-calculated expected values
- **Mock external APIs** — never call real APIs in tests
- **API tests**: Use `vi.hoisted()` + `Fastify.inject()` pattern
- **Minimum coverage target**: functions in kpis.ts and alerts.ts must be 100%

---

## Database Schema Overview (22 models, 6 enums)

### Raw Layer
- `RawEvent` — Unmodified API responses (source, entity, externalId, payloadJson)
- `JobRun` — ETL job execution tracking (status: PENDING/RUNNING/SUCCESS/FAILED/RETRYING)
- `ConnectorCredential` — Encrypted API credentials (AES-256-GCM)

### Staging Layer
- `StgOrder` — Normalized orders (revenue, UTM, channel, line items, paymentMethod, paymentStatus)
- `StgCustomer` — Customer profiles (firstOrderDate, acquisitionChannel, totalRevenue)
- `StgSpend` — Ad spend by date/campaign (meta, google_ads, tiktok)
- `StgTraffic` — GA4 traffic (sessions, pdpViews, addToCart, checkouts, purchases)
- `StgEmail` — Email campaign metrics (sends, opens, clicks, bounces, conversions, revenue)

### Mart Layer (Star Schema)
- **Dimensions**: `DimDate`, `DimChannel` (8 slugs), `DimCampaign`, `DimCustomer` (with cohortMonth, LTV, RFM scores, segment)
- **Facts**: `FactOrder` (with paymentMethod, paymentStatus), `FactSpend`, `FactTraffic`, `FactEmail`
- **Aggregate**: `Cohort` (d7/d30/d60/d90 retention, ltv30/90/180, paybackDays, avgCac)

### Feature Tables
- `Experiment` — RICE scoring, status (IDEA/BACKLOG/RUNNING/COMPLETED/ARCHIVED)
- `ExperimentMetric` — Time-series data per experiment
- `Opportunity` — AI-detected growth opportunities (7 types)
- `Suggestion` — AI recommendations per opportunity (3 types: AI_GENERATED/PLAYBOOK_MATCH/RULE_BASED)
- `SuggestionFeedback` — User actions (APPROVE/REJECT/MODIFY/PROMOTE)
- `AppSetting` — Key-value store (demo_mode, google OAuth config)

---

## KPI Functions (kpis.ts)

| Function | Signature | Notes |
|----------|-----------|-------|
| `revenueGross` | `(orders: {revenueGross: number}[]) => number` | Sum of gross revenue |
| `revenueNet` | `(orders: {revenueNet: number}[]) => number` | Sum of net revenue |
| `contributionMarginTotal` | `(orders: {contributionMargin: number}[]) => number` | Sum of CM |
| `contributionMarginPct` | `(totalCM: number, totalRevenueNet: number) => number` | CM% ratio |
| `aov` | `(totalRevenue: number, orderCount: number) => number` | Guards /0 |
| `blendedCac` | `(totalSpend: number, newCustomers: number) => number` | Guards /0 |
| `channelCac` | `(channelSpend: number, channelNewCustomers: number) => number` | Per-channel |
| `mer` | `(totalRevenue: number, totalSpend: number) => number` | Guards /0 |
| `roas` | `(channelRevenue: number, channelSpend: number) => number` | Guards /0 |
| `ltvAtDays` | `(totalCohortRevenue: number, cohortSize: number) => number` | Guards /0 |
| `paybackDays` | `(cac: number, ltv30: number, cmPct: number) => number\|null` | Null if impossible |
| `retentionRate` | `(repeatCustomers: number, cohortSize: number) => number` | Guards /0 |
| `funnelCvr` | `(traffic: {...}) => {sessionToPdp, pdpToAtc, atcToCheckout, checkoutToPurchase, overall}` | 5-step funnel |
| `percentChange` | `(current: number, previous: number) => number` | WoW delta |
| `percentagePointChange` | `(currentPct: number, previousPct: number) => number` | For CM% etc |
| `newCustomerShare` | `(newOrders: number, totalOrders: number) => number` | Guards /0 |
| `cpc` | `(spend: number, clicks: number) => number` | Guards /0 |
| `cpm` | `(spend: number, impressions: number) => number` | ×1000 |
| `ctr` | `(clicks: number, impressions: number) => number` | Guards /0 |

---

## Alert Rules (7 rules in alerts.ts)

| Rule ID | Severity | Condition |
|---------|----------|-----------|
| `cac_increase` | critical/warning | CAC up >15% WoW (critical if >30%) |
| `cm_decrease` | critical/warning | CM% down >3pp WoW (critical if >6pp) |
| `retention_drop` | critical/warning | D30 retention down >5pp vs baseline (critical >10pp) |
| `mer_deterioration` | warning | Spend up >10%, revenue <5% growth, MER down >10% |
| `channel_cac_*` | warning | Per-channel CAC spike >25% and spend >$500 |
| `revenue_decline` | critical/warning | Revenue down >10% (critical if >20%) |
| `new_customer_decline` | warning | New customer share down >8pp |

Interface: `evaluateAlerts(input: AlertInput): Alert[]`

---

## Customer Segmentation (segmentation.ts)

RFM (Recency, Frequency, Monetary) scoring with quintile-based classification into 6 segments:

| Segment | Criteria | Description |
|---------|----------|-------------|
| Champions | R>=4, F>=4, M>=4 | Best customers, high value and recent |
| Loyal | R>=3, F>=3, M>=3 | Consistent, engaged customers |
| Potential | R>=3, F<=3, M<=3 | Recent but low frequency, room to grow |
| At Risk | R<=2, F>=3, M>=3 | Previously valuable but becoming inactive |
| Dormant | R<=2, F<=2 | Low engagement, slipping away |
| Lost | R=1, F=1 | Churned customers |

Key functions:
- `computeRFMScores(customers, referenceDate?)` — compute quintile-based RFM scores
- `classifySegment(scores: RFMScores)` — map RFM scores to segment
- `getSegmentDistribution(rfmData)` — aggregate counts and revenue by segment

---

## Seasonal Forecasting (forecast.ts)

Two forecasting modes:
- **Double Exponential** (`forecast()`) — Holt-Winters with alpha/beta grid search, min 14 data points
- **Triple Exponential** (`forecastSeasonal()`) — Holt-Winters with alpha/beta/gamma + seasonal factors, min 2× seasonal period

Both return `ForecastResult` with: `forecast[]`, `lower80[]`, `upper80[]`, `lower95[]`, `upper95[]`, `alpha`, `beta`, `mse`.
Seasonal adds: `gamma`, `seasonalFactors[]`.

---

## API Endpoints Reference (Complete)

### Metrics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with DB/Redis status |
| GET | `/api/metrics/summary?days=7` | 16 KPIs with WoW deltas |
| GET | `/api/metrics/timeseries?days=30` | Daily revenue/spend/traffic/margin arrays |
| GET | `/api/metrics/channels?days=7` | Per-channel performance (spend, revenue, CAC, ROAS, CM) |
| GET | `/api/metrics/funnel?days=7` | Orders summary + GA4 funnel (sessions→purchases) |
| GET | `/api/metrics/unit-economics?days=30` | Margin decomposition (COGS, shipping, ops, CM) |
| GET | `/api/metrics/cohorts` | Cohort retention + LTV table |
| GET | `/api/metrics/cohort-projections` | Projections with decay ratios (clamped 0-1) |
| GET | `/api/metrics/cohort-snapshot` | Latest cohort summary for dashboard cards |
| GET | `/api/metrics/forecast?metric=revenue&horizon=30` | Holt-Winters forecast with confidence intervals |
| GET | `/api/metrics/segments` | RFM customer segments (segment, count, revenue, avgOrders) |
| GET | `/api/metrics/email` | Email campaign/flow performance (sends, opens, clicks, revenue) |

### Alerts & WBR
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | Evaluated alert rules (fires Slack if critical) |
| POST | `/api/alerts/explain` | AI root-cause analysis for an alert |
| GET | `/api/wbr` | Template-based WBR narrative + summary |
| GET | `/api/wbr/ai` | SSE stream: AI-generated WBR via OpenAI |

### Connections & Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/connectors/catalog` | List all 12 supported connectors |
| GET | `/api/connections` | List saved connections with status |
| POST | `/api/connections` | Save connection (encrypts credentials) |
| POST | `/api/connections/:type/test` | Test connection (connector-specific) |
| POST | `/api/connections/:type/sync` | Trigger sync for connector |
| DELETE | `/api/connections/:type` | Remove connector |
| POST | `/api/connections/csv/upload` | Upload CSV/TSV data |
| POST | `/api/connections/rebuild-marts` | Re-run staging + marts pipeline |
| GET | `/api/connections/debug/pipeline` | Pipeline diagnostics |
| GET | `/api/connections/debug/attribution` | Attribution sample check |

### Experiments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/experiments` | List experiments (filter by status/channel) |
| POST | `/api/experiments` | Create experiment with RICE scoring |
| GET | `/api/experiments/:id` | Get experiment with metrics |
| PATCH | `/api/experiments/:id` | Update experiment fields |
| DELETE | `/api/experiments/:id` | Delete experiment |
| PATCH | `/api/experiments/:id/status` | Transition status (validated state machine) |

### AI Suggestions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signals/detect` | Detect signals from current metrics |
| GET | `/api/opportunities` | List opportunities with suggestions |
| POST | `/api/opportunities/generate` | Full pipeline: signals→opportunities→suggestions |
| GET | `/api/suggestions` | List suggestions (filter by status/opportunity) |
| POST | `/api/suggestions/:id/feedback` | Approve/reject/modify suggestion |
| POST | `/api/suggestions/:id/promote` | Promote suggestion to experiment |

### Infrastructure
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | Job run history (filter by status) |
| GET | `/api/jobs/:id` | Single job detail |
| GET | `/api/pipeline/overview` | Row counts, freshness, stats |
| GET | `/api/pipeline/quality` | 10 data quality checks with score |
| GET | `/api/settings/mode` | Current mode (demo/live) + data counts |
| POST | `/api/settings/mode` | Switch mode (clears data on demo→live) |
| POST | `/api/settings/clear-data` | Delete all data |
| POST | `/api/settings/seed-demo` | Run demo pipeline |
| GET/POST | `/api/settings/google-oauth` | Google OAuth client configuration |
| POST | `/api/settings/slack/test` | Test Slack webhook |
| POST | `/api/ask` | SSE stream: AI answers data questions |
| GET | `/api/ask/status` | Check if AI is configured |
| POST | `/auth/login` | Password-based auth (returns Bearer token) |
| GET | `/api/auth/google` | Initiate Google OAuth flow |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/auth/shopify` | Initiate Shopify OAuth flow |
| GET | `/api/auth/shopify/callback` | Shopify OAuth callback |
| POST | `/api/webhooks/:id` | Receive webhook data (HMAC validated) |

---

## Security Rules

- **AES-256-GCM** encryption for connector credentials at rest (`packages/database/src/crypto.ts`)
- **Bearer token auth**: Optional via `AUTH_SECRET` env var; timing-safe comparison
- **OAuth flows**: Google (Ads + GA4) and Shopify with token exchange
- **HMAC-SHA256**: Webhook signature validation
- **Never log** API keys, tokens, or credentials
- **Never commit** `.env` files — use `.env.example` as template
- **Validate all inputs** at API layer with Fastify schemas
- **Rate limit** external API calls to respect provider limits (max 5 retries with exponential backoff)

---

## Commands Cheat Sheet

```bash
# Development
pnpm dev                  # Start API + Dashboard (real mode)
pnpm demo                 # Full demo: pipeline + servers
pnpm demo:pipeline        # Generate demo data only
pnpm demo:start           # Start servers in demo mode

# Database
pnpm db:up                # Start PostgreSQL + Redis (Docker)
pnpm db:migrate           # Run Prisma migrations
pnpm db:seed              # Seed dimension tables (8 channels + 730 days)
pnpm db:reset             # Drop DB + re-migrate + re-seed

# Testing
pnpm test                 # All unit + integration tests
pnpm test:golden          # Golden fixture regression only
pnpm test:quality         # Data quality edge-case tests
pnpm test:e2e             # Playwright E2E (requires running servers)
pnpm test:coverage        # Tests with coverage report
pnpm qa                   # Full QA suite

# Quality
pnpm typecheck            # TypeScript strict check
pnpm format               # Prettier formatting
pnpm validate-data        # 10 data quality checks
pnpm build                # Build all packages

# Sync
pnpm sync                 # One-time sync from all connectors
pnpm sync:watch           # Start periodic scheduler
```

---

## Task Delegation Rules

When I give you a complex task, break it down and use subagents:

1. **Planning subagent**: Analyze the codebase, identify affected files, propose approach
2. **Implementation subagent**: Write the actual code changes
3. **Testing subagent**: Write/update tests, verify with `pnpm test`
4. **Review subagent**: Check for type errors (`pnpm typecheck`), formatting, edge cases

### Before making ANY change:
1. Read the relevant existing code first
2. Check existing tests to understand expected behavior
3. Verify your change doesn't break the 18 KPI formulas
4. Run `pnpm typecheck` after changes
5. Run `pnpm test` after changes

### Common mistakes to avoid:
- Don't import from `@prisma/client` directly — use `@growth-os/database`
- Don't use `fetch()` in API routes — use the connector classes
- Don't add dependencies without checking if one already exists in the monorepo
- Don't forget to handle DEMO_MODE in new connectors
- Don't use `Math.round()` for money — use integer arithmetic
- Don't create new API routes without Fastify schema validation
- Don't create new OpenAI clients — use `getClient()` from `apps/api/src/lib/ai.ts`
- Don't forget `Math.min(1, ...)` when computing retention projections

---

## PR / Commit Standards

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- **Scope in parens**: `feat(etl): add TikTok connector`
- **Present tense**: "add feature" not "added feature"
- **Reference issues**: `fix(web): resolve chart overflow (#42)`
