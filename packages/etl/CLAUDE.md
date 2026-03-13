# packages/etl — Claude Code Context

> **Scope**: ETL pipeline, connectors, KPIs, alerts, forecasting, signal detection, opportunity classification, growth model, ad diagnosis, budget optimization, campaign health, anomaly detection, product scoring, and proactive ad intelligence. This is the data backbone of Growth OS.

---

## Package Exports (`src/index.ts`)

```typescript
// Pipeline
export { ingestRaw, normalizeStaging, buildMarts, buildProductPerformance, validateData,
         mapChannelFromOrder, mapGA4ChannelToSlug } from './pipeline/index.js'

// Connectors
export { generateAllDemoData, fetchShopifyOrders, fetchShopifyCustomers, fetchShopifyProducts,
         fetchMetaInsights, fetchGoogleAdsInsights, fetchGA4Traffic, fetchTikTokInsights,
         fetchKlaviyoCampaigns, fetchKlaviyoFlows, fetchStripeCharges, fetchStripeRefunds,
         generateShopifyProducts, fetchMetaAdCreatives, generateDemoMetaAds, getCurrencyOffset
       } from './connectors/index.js'

// KPIs
export * as kpis from './kpis.js'

// Alerts
export { evaluateAlerts } from './alerts.js'

// Forecasting
export { forecast, forecastSeasonal } from './forecast.js'

// Signals & Opportunities
export { detectSignals } from './signals.js'
export { classifyOpportunities } from './opportunities.js'

// Growth Model
export { computeGrowthModel, computeMonthlyBreakdown, computeSafeSpendRange, DEMO_SCENARIOS } from './growth-model.js'

// Segmentation
export { computeRFMScores, classifySegment, getSegmentDistribution } from './segmentation.js'

// Demo seeders
export { seedDemoExperiments } from './demo-experiments.js'
export { seedDemoAutopilot } from './demo-autopilot.js'
export { seedDemoOpportunities } from './demo-opportunities.js'

// Diagnosis & Autopilot
export { evaluateDiagnosisRules } from './diagnosis-rules.js'
export { computeDynamicThresholds } from './dynamic-thresholds.js'
export { optimizeBudgetAllocation } from './budget-optimizer.js'
export { analyzeCreativeDecay, linearRegression } from './creative-decay.js'
export { scoreCampaignHealth } from './campaign-health.js'
export { detectAnomalies } from './anomaly-detection.js'

// Product Intelligence
export { scoreAdFitness } from './product-scoring.js'
export { scoreDtcProduct } from './product-scoring-v2.js'
export { evaluateProactiveRules } from './proactive-rules.js'
export { generateCampaignSuggestions } from './campaign-suggestions.js'
export { getUpcomingEvents, matchProductsToEvent, DEFAULT_SEASONAL_EVENTS } from './seasonal-calendar.js'
export { allocateBudget } from './budget-allocator.js'
```

---

## Types (`src/types.ts`)

### Connector Configs

```typescript
interface ConnectorConfig { source: string; isDemoMode: boolean }
interface ShopifyConfig extends ConnectorConfig { source: 'shopify'; shopDomain: string; accessToken: string }
interface MetaConfig extends ConnectorConfig { source: 'meta'; accessToken: string; adAccountId: string }
interface GoogleAdsConfig extends ConnectorConfig { source: 'google_ads'; accessToken: string; refreshToken: string; clientId: string; clientSecret: string; customerId: string; developerToken: string; managerAccountId?: string }
interface GA4Config extends ConnectorConfig { source: 'ga4'; accessToken: string; refreshToken: string; clientId: string; clientSecret: string; propertyId: string }
interface TikTokConfig extends ConnectorConfig { source: 'tiktok'; accessToken: string; advertiserId: string }
interface KlaviyoConfig extends ConnectorConfig { source: 'klaviyo'; apiKey: string }
interface StripeConfig extends ConnectorConfig { source: 'stripe'; secretKey: string }
interface RawRecord { source: string; entity: string; externalId?: string; cursor?: string; payload: Record<string, unknown> }
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

7 rules — see root CLAUDE.md for rule IDs and thresholds.

```typescript
export function evaluateAlerts(input: AlertInput): Alert[]
```

---

## Forecast Engine (`src/forecast.ts`)

- **Double Exponential** (`forecast()`) — Holt-Winters, min 14 data points
- **Triple Exponential** (`forecastSeasonal()`) — Holt-Winters with seasonal factors, min 2x period

Returns `null` if insufficient data. Grid search for optimal parameters. Confidence intervals: 80% and 95%.

---

## Growth Model (`src/growth-model.ts`)

```typescript
export function computeGrowthModel(input: GrowthModelInput): GrowthModelOutput
export function computeMonthlyBreakdown(input: GrowthModelInput): MonthlyProjection[]
export function computeSafeSpendRange(constraints: SafeSpendConstraints): SafeSpendRange
export const DEMO_SCENARIOS: DemoScenario[]
```

Pure computation. Monthly projections: customers, orders, revenue, COGS, CM, cumulative P&L, break-even month.

---

## Diagnosis Rules Engine (`src/diagnosis-rules.ts`)

```typescript
export function evaluateDiagnosisRules(input: DiagnosisRuleInput): DiagnosisResult[]
```

Evaluates ad-level performance data against configurable rules (creative fatigue, ROAS negative, CTR drop, budget waste, etc.). Returns diagnosis results with severity, recommended action, and confidence score.

---

## Budget Optimizer (`src/budget-optimizer.ts`)

```typescript
export function optimizeBudgetAllocation(adSets: AdSetMetrics[], config?: BudgetOptimizerConfig): PortfolioOptimization
```

Portfolio-level budget optimization across ad sets based on efficiency metrics (ROAS, CPA). Returns reallocation recommendations.

---

## Campaign Health (`src/campaign-health.ts`)

```typescript
export function scoreCampaignHealth(campaigns: CampaignMetrics[], config?: CampaignHealthConfig): CampaignHealthScore[]
```

Aggregate health scoring for campaigns based on underlying ad set performance.

---

## Anomaly Detection (`src/anomaly-detection.ts`)

```typescript
export function detectAnomalies(series: MetricSeries[], config?: AnomalyDetectionConfig): AnomalyResult[]
```

Statistical anomaly detection on metric time series using z-score and trend analysis.

---

## Creative Decay (`src/creative-decay.ts`)

```typescript
export function analyzeCreativeDecay(snapshots: DailySnapshot[]): CreativeDecayAnalysis
export function linearRegression(data: number[]): LinearRegressionResult
```

Detects creative fatigue via linear regression on CTR/ROAS trend data. Returns decay rate and recommended action.

---

## Dynamic Thresholds (`src/dynamic-thresholds.ts`)

```typescript
export function computeDynamicThresholds(metrics: AdMetricsForThresholds[]): DynamicThresholds
```

Computes adaptive thresholds from historical ad metric distributions for diagnosis rules.

---

## Product Scoring (`src/product-scoring.ts`, `src/product-scoring-v2.ts`)

```typescript
export function scoreAdFitness(input: AdFitnessInput): AdFitnessResult
export function scoreDtcProduct(input: DtcScoreInput): DtcScoreResult
```

Score products for advertising fitness based on margin, velocity, repeat rate, and historical ad performance. V2 includes DTC-specific scoring with campaign recommendations.

---

## Proactive Rules (`src/proactive-rules.ts`)

```typescript
export function evaluateProactiveRules(input: ProactiveRulesInput): ProactiveRecommendation[]
```

Rules for when to proactively create new ads based on product performance data.

---

## Campaign Suggestions (`src/campaign-suggestions.ts`)

```typescript
export function generateCampaignSuggestions(input: CampaignSuggestionInput): CampaignSuggestion[]
```

Generate multi-product campaign suggestions based on product affinity, seasonality, and performance.

---

## Seasonal Calendar (`src/seasonal-calendar.ts`)

```typescript
export function getUpcomingEvents(referenceDate?, horizonDays?): SeasonalEvent[]
export function matchProductsToEvent(event, products): ProductMatch[]
export const DEFAULT_SEASONAL_EVENTS: SeasonalEvent[]
```

Match products to upcoming seasonal events for timely campaign creation.

---

## Budget Allocator (`src/budget-allocator.ts`)

```typescript
export function allocateBudget(input: BudgetAllocationInput): CampaignBudgetAllocation[]
```

Allocate budget across campaigns based on performance and goals.

---

## Signal Detection (`src/signals.ts`)

```typescript
export function detectSignals(input: SignalInput): Signal[]
```

Detects: alert signals, AOV delta (>10%), sessions drop (>15%), funnel drops (>15% per stage).

---

## Opportunity Classification (`src/opportunities.ts`)

```typescript
export function classifyOpportunities(signals: Signal[]): OpportunityCandidate[]
```

7 types by priority: EFFICIENCY_DROP (85), CAC_SPIKE (80), RETENTION_DECLINE (75), FUNNEL_LEAK (70), GROWTH_PLATEAU (65), CHANNEL_IMBALANCE (60), QUICK_WIN (40).

---

## Connectors

### Real Connectors
- **shopify.ts** — GraphQL Admin API (orders, customers, products)
- **meta.ts** — Marketing API (campaign insights)
- **meta-ads-creative.ts** — Marketing API (ad-level creative data + metrics)
- **google-ads.ts** — GAQL (campaign performance, MCC support)
- **ga4.ts** — Data API v1beta (traffic by channel)
- **tiktok.ts** — TikTok Business API (campaign insights)
- **klaviyo.ts** — Klaviyo API (campaigns + flows)
- **stripe.ts** — Stripe API (charges + refunds)

### Demo Generators
- **demo-generator.ts** — Orders, customers, Meta/Google/GA4 data (seed=42, 180 days)
- **demo-meta-ads.ts** — Demo Meta ad accounts, campaigns, ad sets, ads with metrics
- **demo-klaviyo.ts** — Demo Klaviyo email data
- **demo-stripe.ts** — Demo Stripe charge/refund data
- **demo-tiktok.ts** — Demo TikTok ad data
- **demo-products.ts** — Demo Shopify products

---

## Pipeline

### Steps
1. **ingestRaw** — Upserts raw_events (batch 200, idempotent)
2. **normalizeStaging** — Parses raw -> staging tables (orders, customers, spend, traffic)
3. **buildMarts** — Builds star schema (dimensions, facts, cohorts)
4. **buildProductPerformance** — Aggregates product-level analytics
5. **validateData** — 10 data quality checks

### Channel Mapping
- `mapChannelFromOrder(input)` — Priority: gclid/fbclid -> journey summary -> UTM -> referrer -> source -> 'direct'
- `mapGA4ChannelToSlug(ga4Channel)` — Maps GA4 channel groups to dim_channel slugs

---

## Demo Seeders

- `seedDemoExperiments` — Seeds demo experiments with various statuses and A/B test data
- `seedDemoAutopilot` — Seeds demo Meta ads, diagnoses, and autopilot config
- `seedDemoOpportunities` — Seeds demo opportunities and suggestions

---

## Logging

Uses **Pino** with structured logging. Each module creates a logger via `createLogger(name)` with random 8-char correlation ID.

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
- Diagnosis rules must return confidence scores (0-100)
- Budget optimizer must respect safety constraints (max increase %, min spend thresholds)
- Product scoring functions must be pure — no DB access
