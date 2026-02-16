# Growth OS

> Unified analytics platform for DTC/ecommerce growth teams. Ingests data from **Shopify**, **Google Ads**, **GA4**, and **Meta Ads**, transforms it into a unified analytics model, and serves an executive dashboard with automated alerts and Weekly Business Review.

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Next.js](https://img.shields.io/badge/Next.js-14.1-black)
![Fastify](https://img.shields.io/badge/Fastify-4.26-white)
![Prisma](https://img.shields.io/badge/Prisma-5.10-2D3748)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)

---

## Features

- **4-Source ETL Pipeline** — Shopify (GraphQL), Meta Marketing API, Google Ads API, GA4 Data API
- **3-Step Transformation** — Raw → Staging → Dimensional Marts (star schema)
- **18 KPI Functions** — Revenue, CAC, MER, ROAS, LTV, Retention, Funnel CVR, and more
- **7 Alert Rules** — Automated anomaly detection with severity levels and contextual recommendations
- **14-Page Dashboard** — Executive summary, channels, cohorts, unit economics, alerts, WBR, connections, jobs, experiments, AI suggestions, funnel, forecast, settings, ask AI
- **Growth Experiments** — RICE-scored experiment tracking with full lifecycle (IDEA → RUNNING → COMPLETED)
- **AI Suggestion Engine** — Signal detection → opportunity classification → experiment suggestions (OpenAI-powered or rule-based fallback)
- **Auto-Generated WBR** — Weekly Business Review narrative with experiments/suggestions integration, AI-enhanced option, copy-to-clipboard
- **Demo Mode** — Full deterministic mock data (seed=42, 180 days) with trailing anomalies for AI triggers — no API credentials needed
- **Acronym Tooltips** — Hover definitions for all business acronyms (CAC, MER, AOV, LTV, etc.)
- **DTC Benchmarks** — Industry reference ranges displayed on key KPI cards
- **10 Data Quality Checks** — Automated validation after every pipeline run
- **AES-256-GCM Encryption** — Connector credentials encrypted at rest
- **280+ Automated Tests** — Unit, golden fixtures, integration, contract, E2E (Playwright)
- **CI/CD Pipeline** — GitHub Actions workflow with 5 QA stages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Language | TypeScript 5.3 (strict) |
| Database | PostgreSQL 16 + Prisma 5.10 |
| Queue | Redis 7 + BullMQ 5.1 |
| Backend | Fastify 4.26 |
| Frontend | Next.js 14.1 (App Router) + Tailwind 3.4 + Recharts 2.12 |
| Testing | Vitest 1.3 + Playwright 1.42 |
| Infrastructure | Docker Compose |

## Quick Start (Demo Mode)

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 8 (`npm install -g pnpm`)
- **Docker** + Docker Compose

### 1. Clone & Install

```bash
git clone https://github.com/your-username/growth-os.git
cd growth-os
pnpm install
```

### 2. Start Infrastructure

```bash
pnpm db:up          # Starts PostgreSQL 16 + Redis 7
```

### 3. Set Up Database

```bash
cp .env.example .env  # Copy and customize if needed
pnpm db:migrate       # Run Prisma migrations
pnpm db:seed          # Seed dimensions (channels + dates)
```

### 4. Run Demo Pipeline

```bash
DEMO_MODE=true pnpm demo:pipeline
```

This generates 180 days of deterministic mock data (~5,400 orders, ~2,400 customers, 4 Meta campaigns, 4 Google Ads campaigns, 6 GA4 channel groups) and processes it through the full ETL pipeline.

### 5. Start the Dashboard

```bash
pnpm demo:start
```

Open **http://localhost:3000** — the full dashboard with all 8 pages.

API available at **http://localhost:4000/api/health**.

### All-in-One

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm demo
```

## Project Structure

```
growth-os/
├── apps/
│   ├── api/                 # Fastify REST API (port 4000)
│   │   └── src/
│   │       ├── routes/      # health, metrics, alerts, wbr, connections, jobs,
│   │       │                # experiments, suggestions, settings, pipeline, ask
│   │       ├── scheduler.ts # BullMQ hourly sync + daily marts
│   │       └── index.ts     # Server entry point
│   ├── web/                 # Next.js dashboard (port 3000)
│   │   └── src/
│   │       ├── app/         # App Router pages (14 pages)
│   │       ├── components/  # Sidebar, KpiCard, Sparkline, Charts, Tooltip
│   │       └── lib/         # API client, formatters
│   └── e2e/                 # Playwright end-to-end tests
├── packages/
│   ├── database/            # Prisma schema, client, seed
│   │   └── prisma/
│   │       └── schema.prisma  # Full data model
│   └── etl/                 # ETL pipeline
│       └── src/
│           ├── connectors/  # 4 API connectors + demo generator
│           ├── pipeline/    # 3-step transformation + validation
│           ├── kpis.ts      # 18 KPI calculation functions
│           ├── alerts.ts    # 7 alert rules with context
│           ├── signals.ts   # Signal detection engine
│           ├── opportunities.ts # Opportunity classification
│           ├── forecast.ts  # Holt-Winters forecasting
│           ├── demo.ts      # Demo pipeline runner
│           └── sync.ts      # Real sync runner
├── docs/                    # Architecture, KPI defs, acceptance criteria
├── docker-compose.yml       # PostgreSQL 16 + Redis 7
├── pnpm-workspace.yaml
└── package.json             # Root scripts
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm demo` | Run full demo (pipeline + start servers) |
| `pnpm demo:pipeline` | Generate and process demo data only |
| `pnpm demo:start` | Start API + Dashboard in demo mode |
| `pnpm dev` | Start API + Dashboard (real mode) |
| `pnpm sync` | Run one-time sync from all connectors |
| `pnpm sync:watch` | Start BullMQ scheduler (hourly sync) |
| `pnpm test` | Run all unit + integration tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm validate-data` | Run 10 data quality checks |
| `pnpm db:up` | Start PostgreSQL + Redis |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed dimension tables |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm format` | Format code with Prettier |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with DB status |
| GET | `/api/metrics/summary?days=7` | KPIs with WoW deltas |
| GET | `/api/metrics/timeseries?days=30` | Daily revenue/spend/traffic |
| GET | `/api/metrics/channels?days=7` | Per-channel performance |
| GET | `/api/metrics/funnel` | Funnel conversion rates |
| GET | `/api/metrics/unit-economics` | Margin decomposition |
| GET | `/api/metrics/cohorts` | Cohort retention + LTV |
| GET | `/api/alerts` | Evaluated alert rules |
| GET | `/api/wbr` | Auto-generated WBR narrative |
| GET | `/api/jobs` | Job run history |
| GET | `/api/connections` | List connections |
| POST | `/api/connections` | Add connection |
| POST | `/api/connections/:id/test` | Test connection |
| DELETE | `/api/connections/:id` | Remove connection |
| GET | `/api/connections/oauth/:source` | Start OAuth flow |
| GET | `/api/experiments` | List experiments |
| POST | `/api/experiments` | Create experiment with RICE |
| PATCH | `/api/experiments/:id/status` | Transition experiment status |
| POST | `/api/opportunities/generate` | Detect signals → generate suggestions |
| GET | `/api/opportunities` | List opportunities with suggestions |
| POST | `/api/suggestions/:id/feedback` | Approve/reject suggestion |
| POST | `/api/suggestions/:id/promote` | Promote suggestion to experiment |

## Dashboard Pages

| Page | URL | Description |
|------|-----|-------------|
| Executive Summary | `/` | 10+ KPI cards with tooltips + benchmarks + revenue chart + forecast |
| Channels | `/channels` | Sortable channel performance table |
| Cohorts | `/cohorts` | Retention curves + LTV + cohort table |
| Unit Economics | `/unit-economics` | Waterfall chart + cost breakdown |
| Funnel | `/funnel` | GA4 funnel conversion rates |
| Alerts | `/alerts` | Alert cards with severity + contextual recommendations |
| WBR | `/wbr` | Auto-generated narrative + experiments + AI insights |
| Experiments | `/experiments` | RICE-scored experiment board with lifecycle |
| AI Suggestions | `/suggestions` | Signal detection + opportunity + suggestion management |
| Connections | `/connections` | Connector config + OAuth + test |
| Jobs | `/jobs` | Job history with filters |
| Settings | `/settings` | Demo/live mode, data management |
| Ask AI | `/ask` | Natural language data Q&A |
| Forecast | `/` (section) | Holt-Winters forecast with configurable horizon |

## Real Mode Setup

To use with real data sources, configure these environment variables:

```env
DEMO_MODE=false

# Shopify
SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx

# Meta Ads
META_ACCESS_TOKEN=EAAxxx
META_AD_ACCOUNT_ID=act_xxxxx

# Google Ads
GOOGLE_ADS_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=xxxxx
GOOGLE_ADS_REFRESH_TOKEN=xxxxx
GOOGLE_ADS_DEVELOPER_TOKEN=xxxxx
GOOGLE_ADS_CUSTOMER_ID=1234567890

# GA4
GA4_CLIENT_ID=xxxxx.apps.googleusercontent.com
GA4_CLIENT_SECRET=xxxxx
GA4_REFRESH_TOKEN=xxxxx
GA4_PROPERTY_ID=123456789

# Security
ENCRYPTION_KEY=your-32-byte-hex-key
```

## Troubleshooting

### Docker containers won't start
```bash
docker compose down -v  # Remove volumes
pnpm db:up              # Restart fresh
```

### Prisma migration fails
```bash
pnpm db:reset  # Drop DB + re-migrate + re-seed
```

### Port already in use
```bash
lsof -ti:4000 | xargs kill  # Kill API process
lsof -ti:3000 | xargs kill  # Kill web process
```

### Demo data doesn't look right
```bash
# Reset everything and re-run
pnpm db:reset
DEMO_MODE=true pnpm demo:pipeline
```

### Tests fail
```bash
pnpm db:up              # Ensure DB is running
pnpm db:migrate         # Ensure schema is current
pnpm test               # Re-run
```

## Documentation

- [Architecture](docs/architecture.md) — System overview with data flow diagram
- [KPI Definitions](docs/kpi-definitions.md) — All 18 metric formulas
- [Experiments](docs/experiments.md) — RICE scoring, lifecycle, API reference
- [AI Suggestions](docs/ai-suggestions.md) — Signal detection, opportunity classification, suggestion pipeline
- [Acceptance Criteria](docs/acceptance-criteria.md) — 50+ Gherkin scenarios
- [Testing Plan](docs/testing-plan.md) — Test strategy, golden fixtures, security & performance testing
- [QA Checklist](docs/qa-checklist.md) — 130+ checkpoint comprehensive QA guide
- [Test Matrix](docs/test-matrix.md) — 28-feature risk-ordered coverage matrix
- [Known Risks](docs/known-risks.md) — 18 documented risks with mitigations
- [Demo Script](docs/demo-script.md) — 5-7 minute presentation walkthrough
- [Screenshots List](docs/screenshots-list.md) — Portfolio screenshot guide

## QA Gates

Run the full QA suite locally:

```bash
# All unit + integration + golden fixture tests
pnpm test

# Golden fixture regression only
pnpm test:golden

# Data quality edge-case tests
pnpm test:quality

# E2E (requires demo mode running)
pnpm test:e2e

# Full QA (tests + data validation)
pnpm qa

# Tests with coverage report
pnpm test:coverage
```

CI pipeline (`.github/workflows/qa.yml`) runs 5 stages automatically:
1. **Lint & Type Check** — TypeScript strict mode
2. **Unit & Integration** — 160+ tests with coverage
3. **Golden Regression** — 50+ hand-calculated fixture scenarios
4. **E2E** — 28 Playwright tests against full stack
5. **Security** — Dependency audit + secrets check

## Verification Checklist

After setup, verify everything works:

- [ ] `pnpm db:up` — Docker services running
- [ ] `pnpm db:migrate` — Migrations applied
- [ ] `curl http://localhost:4000/api/health` — Returns `{ status: "healthy" }`
- [ ] `http://localhost:3000` — Dashboard loads with data
- [ ] `pnpm validate-data` — All 10 checks pass
- [ ] `pnpm test` — All 200+ tests pass
- [ ] `pnpm test:golden` — Golden fixture regression passes
- [ ] `pnpm test:e2e` — All Playwright tests pass

## License

MIT
