# packages/etl — Claude Code Context

> **Scope**: ETL pipeline, connectors, KPIs, alerts, data quality. This is the data backbone of Growth OS.

---

## What This Package Does

This package handles the entire data lifecycle:
1. **Extract** — Pull data from 4 external APIs via connectors
2. **Transform** — 3-step pipeline: Raw → Staging → Marts (star schema)
3. **Load** — Write dimensional model to PostgreSQL via Prisma
4. **Calculate** — 18 KPI functions that query the marts
5. **Alert** — 7 rules that detect anomalies and generate recommendations
6. **Validate** — 10 data quality checks after every pipeline run

---

## File Map

```
src/
├── connectors/
│   ├── shopify.ts       # Shopify GraphQL Admin API — orders, customers, products
│   ├── meta.ts          # Meta Marketing API — campaigns, ad sets, ads, insights
│   ├── googleAds.ts     # Google Ads API — campaigns, keywords, metrics
│   ├── ga4.ts           # GA4 Data API — sessions, events, channel groups
│   └── demo.ts          # Deterministic mock generator (seed=42, 180 days)
├── pipeline/
│   ├── raw.ts           # Step 1: Store unmodified API responses
│   ├── staging.ts       # Step 2: Clean, normalize, deduplicate
│   ├── marts.ts         # Step 3: Build star schema (facts + dimensions)
│   └── validate.ts      # 10 data quality checks
├── kpis.ts              # 18 KPI calculation functions
├── alerts.ts            # 7 alert rules with severity levels
├── demo.ts              # Demo pipeline orchestrator
├── sync.ts              # Real pipeline orchestrator
└── index.ts             # Package exports
```

---

## Critical Rules for This Package

### Connectors
- Every connector must implement the `Connector` interface
- Every connector must respect `DEMO_MODE` env var — return mock data when true
- Rate limit all API calls: Shopify (2/sec), Meta (200/hour), Google (15k/day), GA4 (10/min)
- Use exponential backoff with jitter on retryable errors (429, 500, 503)
- Log every API call with: source, endpoint, status, duration, record count
- Store raw responses before any transformation
- Handle pagination exhaustively — never assume single-page responses

### Pipeline
- **Raw step**: Store exactly what the API returns. No transformations. Include metadata (fetched_at, source, api_version)
- **Staging step**: Deduplicate by source + external_id. Normalize currency to cents. Normalize dates to UTC. Validate required fields
- **Marts step**: Build star schema. Fact tables reference dimension keys (not source IDs). Aggregate at daily grain minimum
- **Validate**: Run all 10 checks after every pipeline run. Fail loudly on critical checks (referential integrity, null revenue)

### KPIs (kpis.ts)
- **NEVER use floating point for money**. All monetary values are integers (cents)
- **Division by zero**: Always guard with fallback to 0 or null
- **Date ranges**: All KPI functions accept `startDate` and `endDate` params. Default lookback is 7 days
- **WoW comparison**: Current period vs same-length previous period
- **Percentages**: Return as decimals (0.15 = 15%), format at API/UI layer
- Each KPI function must be pure — no side effects, no database writes
- Each KPI function must have golden fixture tests with hand-calculated expected values

### Alerts (alerts.ts)
- Each rule has: `id`, `name`, `severity` (critical/warning/info), `condition` function, `recommendation` string
- Evaluate against trailing 7 days vs previous 7 days
- Critical: Revenue drop > 30%, ROAS below 1.0
- Warning: CAC increase > 25%, CTR drop > 20%
- Include actionable recommendations in every alert

### Demo Mode
- Seed = 42 for deterministic data
- 180 days of historical data
- ~5,400 orders, ~2,400 customers
- 4 Meta campaigns, 4 Google Ads campaigns, 6 GA4 channel groups
- Must produce realistic patterns: seasonality, weekday/weekend variance, growth trends

---

## Adding a New Connector

If I ask you to add a new data source (e.g., TikTok, Klaviyo):

1. Create `src/connectors/{source}.ts` implementing `Connector` interface
2. Add demo data generator in demo mode
3. Add staging transformations for the new source
4. Update marts to incorporate new data
5. Add relevant KPIs if the source introduces new metrics
6. Add tests with golden fixtures
7. Update the API connections endpoints
8. Update the dashboard Connections page

---

## Testing Strategy

- **Unit tests**: Each KPI function, each alert rule, each pipeline step
- **Golden fixtures**: Hand-calculated scenarios stored as JSON, compared against function output
- **Integration tests**: Full pipeline run with demo data, verify mart output
- **Data quality tests**: Edge cases — empty datasets, single day, duplicate records, null values
- **Contract tests**: Connector response shapes match expected interfaces

Run: `pnpm test` from package root or monorepo root.
