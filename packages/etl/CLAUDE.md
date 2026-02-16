# packages/etl — Claude Code Context

> **Scope**: ETL pipeline, connectors, KPIs, alerts, forecasting, signal detection, opportunity classification. This is the data backbone of Growth OS.

---

## Package Exports (`src/index.ts`)

```typescript
// Pipeline
export { ingestRaw, normalizeStaging, buildMarts, validateData, mapChannelFromOrder, mapGA4ChannelToSlug }
  from './pipeline/index.js'

// Connectors
export { generateAllDemoData, fetchShopifyOrders, fetchShopifyCustomers, fetchMetaInsights,
         fetchGoogleAdsInsights, fetchGA4Traffic }
  from './connectors/index.js'

// KPIs (namespace export)
export * as kpis from './kpis.js'

// Alerts
export { evaluateAlerts } from './alerts.js'
export type { Alert, AlertInput } from './alerts.js'

// Validation
export type { ValidationResult } from './pipeline/validate.js'

// Types
export type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config, RawRecord } from './types.js'

// Forecasting
export { forecast } from './forecast.js'
export type { ForecastResult, ForecastConfig } from './forecast.js'

// Signal detection
export { detectSignals } from './signals.js'
export type { Signal, SignalInput, FunnelCvr } from './signals.js'

// Opportunity classification
export { classifyOpportunities } from './opportunities.js'
export type { OpportunityCandidate, OpportunityType } from './opportunities.js'
```

---

## Types (`src/types.ts`)

### Interfaces

```typescript
interface ConnectorConfig { source: string; isDemoMode: boolean }
interface ShopifyConfig extends ConnectorConfig { source: 'shopify'; shopDomain: string; accessToken: string }
interface MetaConfig extends ConnectorConfig { source: 'meta'; accessToken: string; adAccountId: string }
interface GoogleAdsConfig extends ConnectorConfig {
  source: 'google_ads'; accessToken: string; refreshToken: string;
  clientId: string; clientSecret: string; customerId: string;
  developerToken: string; managerAccountId?: string
}
interface GA4Config extends ConnectorConfig {
  source: 'ga4'; accessToken: string; refreshToken: string;
  clientId: string; clientSecret: string; propertyId: string
}
interface RawRecord { source: string; entity: string; externalId?: string; cursor?: string; payload: Record<string, unknown> }
interface SyncResult { source: string; entity: string; rowsLoaded: number; cursor?: string; errors: string[] }
interface ChannelMapping { slug: string; name: string }
```

### Constants

```typescript
CATEGORY_MARGINS: Record<string, number> = {
  apparel: 0.55, electronics: 0.30, beauty: 0.65, home: 0.50, food: 0.40, default: 0.45
}
SHIPPING_COST_RATE = 0.08
OPS_COST_RATE = 0.05
```

---

## KPI Engine (`src/kpis.ts`)

18 pure functions, all guard against division by zero. See root CLAUDE.md for the full table.

Key pattern: all functions are **pure** (no side effects, no DB access). They accept pre-aggregated numbers and return computed KPIs.

---

## Alert Engine (`src/alerts.ts`)

### AlertInput Interface

```typescript
interface AlertInput {
  currentRevenue: number; currentSpend: number; currentNewCustomers: number;
  currentTotalOrders: number; currentContributionMargin: number;
  currentRevenueNet: number; currentD30Retention: number;
  previousRevenue: number; previousSpend: number; previousNewCustomers: number;
  previousTotalOrders: number; previousContributionMargin: number;
  previousRevenueNet: number; previousD30Retention: number; baselineD30Retention: number;
  channels?: Array<{
    name: string; currentSpend: number; currentRevenue: number;
    previousSpend: number; previousRevenue: number;
    currentNewCustomers: number; previousNewCustomers: number;
  }>
}
```

### Alert Interface

```typescript
interface Alert {
  id: string; severity: 'critical' | 'warning' | 'info';
  title: string; description: string; impactedSegment: string;
  recommendation: string; metricValue: number; threshold: number
}
```

### Function

```typescript
export function evaluateAlerts(input: AlertInput): Alert[]
```

7 rules — see root CLAUDE.md for rule IDs and thresholds.

---

## Forecast Engine (`src/forecast.ts`)

Implements **Holt-Winters Double Exponential Smoothing** without external dependencies.

```typescript
export function forecast(data: number[], config?: Partial<ForecastConfig>): ForecastResult | null
export function holtSmooth(data: number[], alpha: number, beta: number): { level: number[]; trend: number[] }
export function holtForecast(level: number, trend: number, steps: number): number[]
export function computeMSE(actual: number[], predicted: number[]): number
```

```typescript
interface ForecastConfig { horizon: number; holdoutPct: number; gridSteps: number }
// Defaults: { horizon: 30, holdoutPct: 0.2, gridSteps: 10 }

interface ForecastResult {
  forecast: number[]; lower80: number[]; upper80: number[];
  lower95: number[]; upper95: number[];
  alpha: number; beta: number; mse: number
}
```

- Returns `null` if < 14 data points
- Grid search for optimal alpha/beta parameters
- Confidence intervals: 80% and 95%

---

## Signal Detection (`src/signals.ts`)

```typescript
export function detectSignals(input: SignalInput): Signal[]
```

```typescript
interface Signal {
  id: string; type: 'alert' | 'metric_delta' | 'funnel_drop';
  sourceMetric: string; currentValue: number; previousValue: number;
  changePercent: number; severity: 'critical' | 'warning' | 'info';
  title: string; description: string
}

interface FunnelCvr {
  sessionToPdp: number; pdpToAtc: number;
  atcToCheckout: number; checkoutToPurchase: number
}

interface SignalInput extends AlertInput {
  currentAOV?: number; previousAOV?: number;
  currentSessions?: number; previousSessions?: number;
  funnelCurrent?: FunnelCvr; funnelPrevious?: FunnelCvr
}
```

Detects:
1. **Alert signals** — wraps all `evaluateAlerts()` results
2. **AOV delta** — change >10% (warning if >20%)
3. **Sessions drop** — decline >15% (warning if >30%)
4. **Funnel drops** — any stage decline >15%

---

## Opportunity Classification (`src/opportunities.ts`)

```typescript
export function classifyOpportunities(signals: Signal[]): OpportunityCandidate[]
```

```typescript
type OpportunityType = 'EFFICIENCY_DROP' | 'CAC_SPIKE' | 'RETENTION_DECLINE' |
  'FUNNEL_LEAK' | 'GROWTH_PLATEAU' | 'CHANNEL_IMBALANCE' | 'QUICK_WIN'

interface OpportunityCandidate {
  type: OpportunityType; title: string; description: string;
  priority: number; signals: Signal[]
}
```

Classification rules (by priority):
1. **EFFICIENCY_DROP** (85) — MER deterioration alert
2. **CAC_SPIKE** (80) — blended or channel CAC increase
3. **CHANNEL_IMBALANCE** (60) — multiple channel CAC alerts
4. **RETENTION_DECLINE** (75) — D30 retention drop
5. **FUNNEL_LEAK** (70) — any funnel_drop signal
6. **GROWTH_PLATEAU** (65) — revenue decline without CAC issue
7. **QUICK_WIN** (40) — unused info-level signals

Priority boosted: +10 for critical, +5 for warning (capped at 100).

---

## Connectors

### Shopify (`src/connectors/shopify.ts`)

```typescript
export async function fetchShopifyOrders(config: ShopifyConfig, afterCursor?: string):
  Promise<{ records: RawRecord[]; nextCursor?: string }>

export async function fetchShopifyCustomers(config: ShopifyConfig):
  Promise<{ records: RawRecord[] }>
```

- GraphQL Admin API v2024-01, 250 orders/page
- Includes `customerJourneySummary` for attribution
- Rate limiting: max 5 retries with Retry-After header
- Demo mode returns seeded mock data

### Meta Ads (`src/connectors/meta.ts`)

```typescript
export async function fetchMetaInsights(config: MetaConfig, dateRange?: { since: string; until: string }):
  Promise<{ records: RawRecord[] }>
```

- Marketing API v21.0, campaign-level daily insights
- Fields: campaign_id, campaign_name, spend, impressions, clicks, actions, action_values
- ExternalId: `${campaign_id}_${date_start}`

### Google Ads (`src/connectors/google-ads.ts`)

```typescript
export async function fetchGoogleAdsInsights(config: GoogleAdsConfig, dateRange?: { startDate: string; endDate: string }):
  Promise<{ records: RawRecord[] }>
```

- GAQL query for campaign performance (cost_micros, impressions, clicks, conversions)
- Supports MCC (manager accounts): auto-discovers child accounts
- Adds `_customerId` to payload for multi-account

### GA4 (`src/connectors/ga4.ts`)

```typescript
export async function fetchGA4Traffic(config: GA4Config, dateRange?: { startDate: string; endDate: string }):
  Promise<{ records: RawRecord[] }>
```

- Data API v1beta runReport
- Dimensions: date, sessionDefaultChannelGroup
- Metrics: sessions, itemViews, addToCarts, checkouts, ecommercePurchases

### Demo Generator (`src/connectors/demo-generator.ts`)

```typescript
export function generateShopifyOrders(ctx?: DemoContext): RawRecord[]
export function generateShopifyCustomers(ctx?: DemoContext): RawRecord[]
export function generateMetaInsights(ctx?: DemoContext): RawRecord[]
export function generateGoogleAdsInsights(ctx?: DemoContext): RawRecord[]
export function generateGA4Traffic(ctx?: DemoContext): RawRecord[]
export function generateAllDemoData(): {
  orders: RawRecord[]; customers: RawRecord[];
  metaInsights: RawRecord[]; googleAdsInsights: RawRecord[]; ga4Traffic: RawRecord[]
}
```

- **Seed**: `process.env.DEMO_SEED ?? '42'` (seeded RNG via `seedrandom`)
- **Duration**: `process.env.DEMO_DAYS ?? '180'` days
- **Customers**: 2400 with weighted channels (meta 30%, google 25%, organic 20%, email 10%, direct 10%, affiliate 5%)
- **Orders**: ~30/day base with growth trend (40%), weekend boost (1.15x), anomalies (spike weeks 19-21, dip week 8)
- **Customer filtering**: Only picks from customers whose `firstOrderDate <= date` (prevents pre-acquisition orders)

---

## Pipeline

### Step 1: Ingest Raw (`src/pipeline/step1-ingest-raw.ts`)

```typescript
export async function ingestRaw(records: RawRecord[]): Promise<number>
```

- Upserts into `raw_events` in batches of 200
- Idempotent via (source, entity, externalId) uniqueness
- Transaction timeout: 60s, wait: 30s

### Step 2: Normalize Staging (`src/pipeline/step2-normalize-staging.ts`)

```typescript
export async function normalizeStaging(): Promise<{ orders: number; customers: number; spend: number; traffic: number }>
```

Internal functions:
- `normalizeOrders()` — Parses Shopify GraphQL + demo format, extracts UTM, maps channels
- `normalizeCustomers()` — Builds customer master with firstOrderDate
- `normalizeSpend()` — Meta + Google Ads spend by date/campaign
- `normalizeTraffic()` — GA4 traffic by channel
- `parseUtmParams(url: string)` — Extracts UTM params from landing site URL

### Step 3: Build Marts (`src/pipeline/step3-build-marts.ts`)

```typescript
export async function buildMarts(): Promise<{
  campaigns: number; customers: number; orders: number;
  spend: number; traffic: number; cohorts: number
}>
```

Internal builders:
1. `seedChannels()` — Upserts 7 standard channels
2. `buildDimCampaign()` — From stg_spend unique campaigns
3. `buildDimCustomer()` — With `firstOrderDate = MIN(order_date)`, cohortMonth, acquisition channel
4. `buildFactOrders()` — COGS from `CATEGORY_MARGINS[product_type]`, shipping (8%), ops (5%), contribution margin
5. `buildFactSpend()` — Daily spend by campaign+channel
6. `buildFactTraffic()` — Daily traffic aggregated by `mapGA4ChannelToSlug()`
7. `buildCohorts()` — Monthly cohorts: retention (D7/D30/D60/D90 via Sets), LTV (30/90/180), CAC, payback days

**COGS formula**: `lineItems.forEach(item => cogs += price * qty * (1 - CATEGORY_MARGINS[type]))`. Fallback: `revenueGross * 0.55`
**CM formula**: `revenueNet - cogs - (revenueNet * 0.08) - (revenueNet * 0.05)`

### Validation (`src/pipeline/validate.ts`)

```typescript
export function validateData(): Promise<ValidationResult[]>
```

```typescript
interface ValidationResult { check: string; passed: boolean; message: string }
```

10 checks:
1. `no_negative_spend` — spend >= 0
2. `revenue_net_lte_gross` — revenue_net <= revenue_gross
3. `continuous_dates` — dim_date has no gaps
4. `fk_orders_channel` — fact_orders.channel_id refs valid dim_channel
5. `fk_spend_channel` — fact_spend.channel_id refs valid dim_channel
6. `orders_not_empty` — fact_orders row count > 0
7. `spend_not_empty` — fact_spend row count > 0
8. `traffic_not_empty` — fact_traffic row count > 0
9. `cohorts_not_empty` — cohorts row count > 0
10. `no_duplicate_orders` — no duplicate order_ids in fact_orders

### Channel Mapping (`src/pipeline/channel-mapping.ts`)

```typescript
export function mapChannelFromOrder(input: OrderChannelInput): string
export function mapGA4ChannelToSlug(ga4Channel: string): string
```

**mapChannelFromOrder priority**:
1. gclid/fbclid -> 'google'/'meta'
2. Shopify customerJourneySummary source+sourceType
3. UTM source/medium
4. Referring site domain
5. Source name ('pos' -> direct)
6. Fallback: 'direct'

**mapGA4ChannelToSlug**: 'Paid Social' -> meta, 'Paid Search'/'Paid Shopping' -> google, 'Organic *' -> organic, 'Email' -> email, 'Referral' -> affiliate, 'Direct' -> direct, default -> other

---

## Runners

### Demo (`src/demo.ts`)
Script that runs `runDemo()`: seeds dimensions -> generates all demo data -> ingestRaw -> normalizeStaging -> buildMarts -> validateData

### Sync (`src/sync.ts`)
Script that runs `runSync()`: creates JobRun -> fetches from enabled connectors -> ingestRaw -> normalizeStaging -> buildMarts -> updates JobRun

---

## Logging

Uses **Pino** with structured logging. Each module creates a logger via `createLogger(name)` with:
- Random 8-char correlation ID per instance
- Log level from `LOG_LEVEL` env var (default: 'info')
- Pretty transport in development

---

## Rules for This Package

- All KPI functions must be **pure** (no side effects, no DB writes)
- All KPI functions must guard against division by zero
- **Never use floating point for monetary calculations** in KPIs
- All connectors must respect `isDemoMode` — return mock data when true
- All connectors use max 5 retries with exponential backoff
- Pipeline steps use transactions with 60s timeout
- Batch sizes: 200-500 records per transaction
- Demo data is deterministic (seeded RNG) — changing the seed changes all data
