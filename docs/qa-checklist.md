# Growth OS — QA Checklist

> **Version:** 2.0 | **130+ checkpoints** across 12 categories
> Covers pipeline, API, metrics, dashboard, security, performance, reliability, data quality, and documentation.

---

## 1. Pipeline QA

- [ ] `pnpm demo:pipeline` completes without errors
- [ ] `pnpm validate-data` shows all 10 checks passing
- [ ] Raw events: > 8,000 rows in `raw_events`
- [ ] Staging: `stg_orders`, `stg_customers`, `stg_spend`, `stg_traffic` all populated
- [ ] Marts: `fact_orders`, `fact_spend`, `fact_traffic` all populated
- [ ] Cohorts: `cohorts` table has monthly cohorts with retention + LTV
- [ ] Dimensions: `dim_channel` has 7 channels, `dim_date` spans 180+ days
- [ ] No negative spend values in `fact_spend`
- [ ] Revenue net ≤ revenue gross in all `fact_orders`
- [ ] No duplicate `external_order_id` in `fact_orders`
- [ ] Dates are continuous in `dim_date` (no gaps)
- [ ] Pipeline is idempotent: running twice produces same result
- [ ] Cohort retention uses `Set<string>` for unique customer counting (RISK-005 fix verified)

## 2. API QA

- [ ] `GET /api/health` returns `{ status: "healthy", db: "connected" }`
- [ ] `GET /api/health` returns `{ status: "degraded" }` when DB is down
- [ ] `GET /api/metrics/summary?days=7` returns 10+ KPIs with WoW deltas
- [ ] `GET /api/metrics/summary?days=30` returns correct 30-day aggregation
- [ ] `GET /api/metrics/summary` without days param defaults to 7
- [ ] `GET /api/metrics/summary?days=abc` does not return 500
- [ ] `GET /api/metrics/timeseries?days=30` returns 30 daily data points
- [ ] `GET /api/metrics/channels?days=7` returns channel breakdown
- [ ] `GET /api/metrics/channels` returns empty array when no data
- [ ] `GET /api/metrics/funnel` returns funnel stage CVRs
- [ ] `GET /api/metrics/funnel` returns 0 CVR (not NaN) when denominator is 0
- [ ] `GET /api/metrics/unit-economics` returns margin decomposition
- [ ] `GET /api/metrics/cohorts` returns cohort data with retention arrays
- [ ] `GET /api/alerts` returns evaluated alerts (or empty array)
- [ ] `GET /api/alerts` alert objects have rule, severity, message, recommendation
- [ ] `GET /api/wbr` returns markdown narrative string
- [ ] `GET /api/wbr` has all sections (executive, channels, cohorts, alerts, recommendations)
- [ ] `GET /api/jobs` returns job run history
- [ ] `GET /api/jobs?limit=5` respects limit parameter
- [ ] `GET /api/jobs?status=completed` filters by status
- [ ] `GET /api/jobs/:id` returns 404 message for non-existent job
- [ ] `POST /api/connections` creates a connection (encrypted credentials)
- [ ] `GET /api/connections` lists connections without raw credentials

## 3. Metric Accuracy QA

- [ ] Blended CAC = Total Spend / New Customers (verify manually)
- [ ] MER = Revenue / Spend (verify against timeseries totals)
- [ ] CM% = CM / Revenue Net (verify against unit-economics endpoint)
- [ ] ROAS per channel matches Channel Revenue / Channel Spend
- [ ] AOV = Revenue Net / Order Count
- [ ] WoW deltas are correct (current vs previous period)
- [ ] Payback days calculation: CAC / (daily CM per customer)
- [ ] Retention rates: cohort repeat buyers / cohort size
- [ ] New customer share: new_customers / total_orders (not hardcoded denominator)
- [ ] Alert rule 7 uses `currentTotalOrders` (RISK-004 fix verified)
- [ ] Golden KPI fixtures: all 40+ scenarios match expected values within tolerance
- [ ] Golden alert fixtures: all 12 scenarios fire/don't-fire as expected

## 4. Dashboard Visual QA

- [ ] **Executive Summary** — 10 KPI cards display with sparklines
- [ ] KPI change indicators show correct colors (green=good, red=bad)
- [ ] Revenue + Spend chart renders with proper axes
- [ ] Date range picker switches between 7D/14D/30D/90D
- [ ] **Channels** — Table renders with all channels
- [ ] Table is sortable by each column
- [ ] **Cohorts** — Retention curves chart renders
- [ ] LTV curves chart renders
- [ ] Cohort detail table has correct structure
- [ ] **Unit Economics** — Waterfall chart shows margin decomposition
- [ ] Cost breakdown table matches API data
- [ ] **Alerts** — Alert cards show severity badges (critical/warning/info)
- [ ] Recommendations are displayed
- [ ] Empty state shown when no alerts
- [ ] **WBR** — Narrative text renders as formatted sections
- [ ] Copy to Clipboard button works
- [ ] **Connections** — Add Connection form opens
- [ ] Source selector has all 4 options
- [ ] Google sources show OAuth button instead of token input
- [ ] Connection cards show status indicator
- [ ] Test connection button uses `conn.source` not `conn.id` (RISK-002 fix verified)
- [ ] Delete connection button uses `conn.source` not `conn.id`
- [ ] Response check uses `data.success` not `data.ok`
- [ ] **Jobs** — Job history table renders
- [ ] Status filter buttons work
- [ ] Refresh button works
- [ ] Table auto-refreshes

## 5. Cross-Cutting QA

- [ ] Dark theme consistent across all pages
- [ ] Sidebar navigation highlights active page
- [ ] Demo mode badge visible in sidebar
- [ ] No console errors in browser dev tools (E2E test enforced)
- [ ] API CORS allows frontend origin
- [ ] Loading spinners show while data fetches
- [ ] Responsive layout works on 1024px+ width
- [ ] All number formatting (currency, %, integers) is correct
- [ ] All API endpoints return 200 during cross-page navigation

## 6. Security QA

- [ ] `.env` is in `.gitignore`
- [ ] `docker-compose.yml` uses env vars, not hardcoded passwords
- [ ] No secrets committed in git history
- [ ] ENCRYPTION_KEY missing → warning logged at startup (RISK-003 fix verified)
- [ ] `GET /api/connections` does NOT return raw access tokens
- [ ] Meta access token is in header, not URL query param
- [ ] OAuth flow for Google sources does not expose client secret in frontend
- [ ] `?days=1;DROP TABLE` does not cause SQL injection (parameterized queries)
- [ ] Connection names with `<script>` tags are sanitized/escaped

## 7. Performance QA

- [ ] `pnpm demo:pipeline` completes in < 2 minutes
- [ ] `GET /api/metrics/summary` responds in < 500ms
- [ ] `GET /api/wbr` responds in < 1000ms
- [ ] Dashboard initial load (LCP) < 3 seconds
- [ ] No N+1 query warnings in Prisma logs during pipeline run
- [ ] Database has indexes on frequently queried columns (order_date, channel_id)
- [ ] No full table scans visible in `EXPLAIN ANALYZE` for key queries

## 8. Reliability QA

- [ ] Pipeline is idempotent: running twice produces identical mart data
- [ ] API gracefully degrades when DB is unreachable (returns degraded status)
- [ ] API returns structured error (not 500 stack trace) for invalid inputs
- [ ] Frontend shows loading/error states, not blank pages
- [ ] Demo data is deterministic (seed=42): running twice produces same raw events
- [ ] Two consecutive demo runs produce byte-identical first-record payloads
- [ ] Two consecutive demo runs produce byte-identical last-record payloads

## 9. Data Quality QA

- [ ] All cohort retention values ∈ [0.0, 1.0]
- [ ] Retention monotonicity: d7 ≤ d30 ≤ d60 ≤ d90 for each cohort
- [ ] LTV monotonicity: ltv30 ≤ ltv90 ≤ ltv180 for each cohort
- [ ] Cohort size > 0 for every cohort row
- [ ] No orphan records (all FKs reference valid dimension keys)
- [ ] No negative financial values in fact tables
- [ ] revenue_net ≤ revenue_gross for all orders
- [ ] Channel dimension covers all expected channels (7 channels)
- [ ] Date dimension has no gaps (continuous calendar)
- [ ] Unique customer count uses `Set<string>` (not counter increment)
- [ ] Golden cohort invariants pass (5 invariants from golden-cohort.json)

## 10. Test Suite QA

- [ ] `pnpm test` — All unit + integration tests pass
- [ ] `pnpm test:e2e` — All Playwright tests pass (with demo running)
- [ ] KPI test count ≥ 74 (34 unit + 40 golden)
- [ ] Alert test count ≥ 16
- [ ] Channel mapping test count ≥ 21
- [ ] Demo generator test count ≥ 16
- [ ] Connector contract test count ≥ 6
- [ ] API integration test count ≥ 30
- [ ] E2E test count ≥ 25
- [ ] No tests use `waitForTimeout` (anti-pattern eliminated)
- [ ] All golden fixture scenarios are covered
- [ ] Test coverage report generates without errors

## 11. Bug Fix Verification (RISK Register)

- [ ] **RISK-001** (CRITICAL → WARNED): ENCRYPTION_KEY warning logged at startup
- [ ] **RISK-002** (CRITICAL → FIXED): Connections page uses `conn.source` not `conn.id`
- [ ] **RISK-003** (CRITICAL → FIXED): Response field is `data.success` not `data.ok`
- [ ] **RISK-004** (CRITICAL → FIXED): Alert rule 7 uses `currentTotalOrders`/`previousTotalOrders`
- [ ] **RISK-005** (CRITICAL → FIXED): Cohort retention uses `Set<string>` for unique counting
- [ ] **RISK-006** (HIGH → FIXED): Demo generator entity names match Prisma table names
- [ ] All 5 critical fixes confirmed via automated tests

## 12. Documentation QA

- [ ] README.md has clear setup instructions
- [ ] Architecture diagram matches actual code structure
- [ ] KPI definitions match implementation
- [ ] Acceptance criteria cover all features (50+ scenarios)
- [ ] Testing plan describes all test layers (200+ tests)
- [ ] Test matrix covers 28 features with risk levels
- [ ] Known risks document lists 18 risks with mitigations
- [ ] QA checklist has 130+ checkpoints
- [ ] Demo script provides 5-7 minute walkthrough
