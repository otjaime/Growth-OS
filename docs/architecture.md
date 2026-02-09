# Growth OS — Architecture

## System Overview

Growth OS is a unified analytics platform that ingests data from multiple DTC marketing channels, transforms it into a consistent data model, and serves executive dashboards with automated alerts and Weekly Business Reviews.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  DATA SOURCES                                                            │
│                                                                          │
│   ┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────┐            │
│   │ Shopify  │  │   Meta   │  │  Google Ads  │  │   GA4    │            │
│   │ (Orders, │  │  (Ads    │  │  (Campaign   │  │(Sessions,│            │
│   │ Custs.)  │  │ Insights)│  │   Insights)  │  │ Traffic) │            │
│   └────┬─────┘  └────┬─────┘  └──────┬───────┘  └────┬─────┘            │
│        │              │               │               │                  │
└────────┼──────────────┼───────────────┼───────────────┼──────────────────┘
         │              │               │               │
         ▼              ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ETL PIPELINE (packages/etl)                                             │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────┐         │
│   │  Connectors (Shopify / Meta / Google Ads / GA4)            │         │
│   │  • Real API clients with pagination, rate-limit, retry     │         │
│   │  • Demo mode: seeded deterministic generator (seed=42)     │         │
│   └──────────────────────┬─────────────────────────────────────┘         │
│                          │                                               │
│   ┌──────────────────────▼─────────────────────────────────────┐         │
│   │  Step 1: Ingest Raw                                         │         │
│   │  raw_events → batch upsert (500/batch, idempotent)          │         │
│   └──────────────────────┬─────────────────────────────────────┘         │
│                          │                                               │
│   ┌──────────────────────▼─────────────────────────────────────┐         │
│   │  Step 2: Normalize Staging                                  │         │
│   │  raw_events → stg_orders, stg_customers, stg_spend,        │         │
│   │               stg_traffic                                   │         │
│   │  (UTM parsing, channel mapping, dedup)                      │         │
│   └──────────────────────┬─────────────────────────────────────┘         │
│                          │                                               │
│   ┌──────────────────────▼─────────────────────────────────────┐         │
│   │  Step 3: Build Marts                                        │         │
│   │  • dim_campaign, dim_customer (cohort assignment)           │         │
│   │  • fact_orders (COGS estimation via category margins)       │         │
│   │  • fact_spend, fact_traffic                                 │         │
│   │  • cohorts (retention, LTV, payback)                       │         │
│   └──────────────────────┬─────────────────────────────────────┘         │
│                          │                                               │
│   ┌──────────────────────▼─────────────────────────────────────┐         │
│   │  Validation (10 data quality checks)                        │         │
│   └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────┐         │
│   │  KPI Engine (18 functions) + Alert Engine (7 rules)         │         │
│   └────────────────────────────────────────────────────────────┘         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DATA LAYER (packages/database)                                          │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────┐           │
│   │  PostgreSQL 16 (via Prisma ORM)                           │           │
│   │                                                           │           │
│   │  Raw: raw_events, job_runs                                │           │
│   │  Staging: stg_orders, stg_customers, stg_spend, stg_traffic│          │
│   │  Dims: dim_date, dim_channel, dim_campaign, dim_customer  │           │
│   │  Facts: fact_orders, fact_spend, fact_traffic              │           │
│   │  Analytics: cohorts                                       │           │
│   │  Config: connector_credentials (AES-256-GCM encrypted)   │           │
│   └──────────────────────────────────────────────────────────┘           │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────┐           │
│   │  Redis 7 (BullMQ job queue)                               │           │
│   └──────────────────────────────────────────────────────────┘           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  API LAYER (apps/api)                                                    │
│                                                                          │
│   Fastify 4.26 — Port 4000                                              │
│                                                                          │
│   Routes:                                                                │
│   ├── /api/health          – Health check, DB status                    │
│   ├── /api/metrics/summary – KPIs with WoW deltas                      │
│   ├── /api/metrics/timeseries – Daily revenue/spend/traffic             │
│   ├── /api/metrics/channels – Per-channel performance                   │
│   ├── /api/metrics/funnel  – Funnel CVR                                 │
│   ├── /api/metrics/unit-economics – Margin decomposition                │
│   ├── /api/metrics/cohorts – Cohort retention + LTV                     │
│   ├── /api/alerts          – Evaluated alert rules                      │
│   ├── /api/wbr             – Auto-generated narrative                   │
│   ├── /api/connections     – CRUD + OAuth + test                        │
│   └── /api/jobs            – Job run history                            │
│                                                                          │
│   Scheduler: BullMQ (hourly sync + daily marts)                         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (apps/web)                                                     │
│                                                                          │
│   Next.js 14.1 (App Router) — Port 3000                                 │
│   Tailwind CSS 3.4 + Recharts 2.12 + Lucide Icons                       │
│                                                                          │
│   Pages:                                                                 │
│   ├── /                 – Executive Summary (10 KPIs + revenue chart)   │
│   ├── /channels         – Channel performance table (sortable)          │
│   ├── /cohorts          – Retention curves + LTV + cohort table         │
│   ├── /unit-economics   – Margin waterfall + cost breakdown             │
│   ├── /alerts           – Alert cards with severity + recommendations   │
│   ├── /wbr              – WBR narrative with copy-to-clipboard          │
│   ├── /connections      – Connector config + OAuth + test               │
│   └── /jobs             – Job run history table with filters            │
│                                                                          │
│   Components:                                                            │
│   ├── Sidebar (8-item nav + demo badge)                                 │
│   ├── KpiCard (value + sparkline + change indicator)                    │
│   ├── DateRangePicker (7/14/30/90 day presets)                          │
│   └── RevenueChart (ComposedChart: Area + Bar)                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

## Monorepo Structure

```
growth-os/
├── apps/
│   ├── api/          # Fastify REST API
│   ├── web/          # Next.js dashboard
│   └── e2e/          # Playwright end-to-end tests
├── packages/
│   ├── database/     # Prisma schema, client, seed
│   └── etl/          # Connectors, pipeline, KPIs, alerts
├── docs/             # Documentation
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json      # Root scripts
```

## Data Flow

1. **Ingest** — Connectors pull raw JSON from APIs (or generate deterministic demo data)
2. **Normalize** — Raw events parsed into typed staging tables with channel attribution
3. **Build Marts** — Staging → dimensional model (star schema) + cohort analytics
4. **Validate** — 10 automated quality checks run after every pipeline execution
5. **Serve** — Fastify API reads marts, computes KPIs on-the-fly with period comparisons
6. **Alert** — 7 rules evaluate KPIs against thresholds, surface warnings/criticals
7. **Render** — Next.js dashboard fetches API, renders charts and tables

## Security

- Connector credentials encrypted at rest with **AES-256-GCM**
- Encryption key via `ENCRYPTION_KEY` environment variable
- Google OAuth2 flow for Ads + GA4 (authorization code → token exchange)
- No secrets stored in code; all via environment variables

## Demo Mode

Set `DEMO_MODE=true` to run with synthetic data:
- Seeded RNG (seed=42) produces identical data every run
- 180 days of data, ~2400 customers, ~5400 orders
- Realistic growth curves, seasonality, and injected anomalies
- Fixed reference date: 2026-02-09
