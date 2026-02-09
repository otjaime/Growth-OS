# Growth OS — Test Matrix

> Maps every feature to its risk profile, test types, and test locations.
> Updated: 2025

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Test exists and passes |
| 🔶 | Partial coverage |
| ❌ | No test coverage |
| U | Unit test |
| I | Integration test (Fastify inject) |
| E | E2E test (Playwright) |
| G | Golden fixture regression test |
| C | Contract test |

---

## Feature Matrix

| # | Feature | Risk | Test Types | Test File(s) | Test Count | Notes |
|---|---------|------|-----------|--------------|------------|-------|
| 1 | **KPI calculations (18 functions)** | HIGH — incorrect metrics mislead decisions | U, G | `kpis.test.ts` | 34 + 40 golden | Pure functions; golden fixtures verify hand-calculated values |
| 2 | **Alert engine (7 rules)** | HIGH — missed alerts = missed revenue drops | U, G | `alerts.test.ts` | 16 | Each rule has fires/doesn't-fire test; golden alerts fixtures |
| 3 | **Channel mapping** | MEDIUM — misattribution inflates/deflates channel metrics | U | `channel-mapping.test.ts` | 21 | UTM parsing, GA4 mapping, priority resolution |
| 4 | **Demo data generator** | MEDIUM — non-deterministic output breaks reproducibility | U | `demo-generator.test.ts` | 16 | Determinism (payload equality), entity names, field shape |
| 5 | **Connector contracts** | LOW — demo-only in v1 | C | `connector-contracts.test.ts` | 6 | Demo mode shape validation; live mode mocked |
| 6 | **ETL Step 1: Ingest Raw** | HIGH — duplicates corrupt downstream | — | — | — | Idempotency via upsert; tested via pipeline integration |
| 7 | **ETL Step 2: Normalize** | HIGH — bad staging = bad marts | — | — | — | Covered by pipeline end-to-end + validate-data |
| 8 | **ETL Step 3: Build Marts** | CRITICAL — cohort retention bug (FIXED) | — | — | — | Retention now uses Set for unique customer counting |
| 9 | **Data validation (10 checks)** | HIGH — catches FK violations, gaps, dupes | — | — | — | `validate-data` command; tested via pipeline QA |
| 10 | **API: /health** | LOW | I | `api-routes.test.ts` | 2 | DB connected + degraded states |
| 11 | **API: /metrics/summary** | HIGH — executive dashboard primary data | I | `api-routes.test.ts` | 5 | KPI structure, day params, empty data, computed values |
| 12 | **API: /metrics/timeseries** | MEDIUM | I | `api-routes.test.ts` | 1 | Structure validation |
| 13 | **API: /metrics/channels** | HIGH — channel allocation decisions | I | `api-routes.test.ts` | 2 | Empty + populated channel metrics |
| 14 | **API: /metrics/funnel** | MEDIUM | I | `api-routes.test.ts` | 1 | CVR calculation verification |
| 15 | **API: /metrics/cohorts** | MEDIUM | I | `api-routes.test.ts` | 1 | Cohort data shape |
| 16 | **API: /metrics/unit-economics** | HIGH — margin decomposition | I | `api-routes.test.ts` | 1 | Breakdown values + blended CAC |
| 17 | **API: /alerts** | HIGH | I | `api-routes.test.ts` | 2 | Shape + alert field validation |
| 18 | **API: /wbr** | MEDIUM | I | `api-routes.test.ts` | 2 | Narrative generation + content check |
| 19 | **API: /jobs** | LOW | I | `api-routes.test.ts` | 4 | CRUD, filtering, 404 handling |
| 20 | **API: /connections** | HIGH — credential security | I | `api-routes.test.ts` | — | ENCRYPTION_KEY warning + demo mode |
| 21 | **Dashboard: Exec Summary** | HIGH — first page users see | E | `dashboard.spec.ts` | 5 | Navigation, KPI cards, date range picker |
| 22 | **Dashboard: Channels** | MEDIUM | E | `dashboard.spec.ts` | 1 | Table rendering |
| 23 | **Dashboard: Alerts** | MEDIUM | E | `dashboard.spec.ts` | 2 | Cards + severity badges |
| 24 | **Dashboard: WBR** | MEDIUM | E | `dashboard.spec.ts` | 3 | Copy button, narrative content |
| 25 | **Dashboard: Connections** | MEDIUM | E | `dashboard.spec.ts` | 3 | Add form, OAuth flow, source selection |
| 26 | **Dashboard: Jobs** | LOW | E | `dashboard.spec.ts` | 3 | Filter, refresh, API re-fetch |
| 27 | **Sidebar / Navigation** | LOW | E | `dashboard.spec.ts` | 2 | Demo badge, active highlighting |
| 28 | **Cross-page stability** | MEDIUM | E | `dashboard.spec.ts` | 2 | Console errors, API 200s |

---

## Risk-Ordered Priority

| Risk Level | Features | Min Required Tests |
|-----------|----------|-------------------|
| CRITICAL | Cohort retention, ENCRYPTION_KEY | Bug fixed + invariant tests |
| HIGH | KPIs, Alerts, Channel mapping, Ingest idempotency, API metrics, Connections security | 90+ tests |
| MEDIUM | Demo generator, Funnel, WBR, Dashboard pages | 40+ tests |
| LOW | Health, Jobs, Sidebar, Connector contracts | 15+ tests |

---

## Test Execution Frequency

| Trigger | Tests Run | Expected Duration |
|---------|----------|-------------------|
| Every commit (pre-push) | Unit + Golden fixtures | < 10s |
| PR / CI pipeline | Unit + Integration + Contract | < 30s |
| Nightly / pre-release | Full suite including E2E | < 3 min |
| After schema migration | Pipeline + validate-data | < 2 min |

---

## Coverage Targets

| Layer | Current | Target | Gap |
|-------|---------|--------|-----|
| KPI functions | 100% | 100% | ✅ |
| Alert rules | 100% (7/7 rules) | 100% | ✅ |
| API routes | 15/17 endpoints | 17/17 | 🔶 connections CRUD |
| E2E pages | 8/8 pages | 8/8 | ✅ |
| Pipeline steps | Implicit | Explicit per-step | 🔶 |
