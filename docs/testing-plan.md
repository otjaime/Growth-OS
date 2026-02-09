# Growth OS — Testing Plan

> **Version:** 2.0 | **Updated:** 2024-06-10 | **Total Tests:** 200+
> Covers unit, integration, contract, E2E, golden-fixture regression, security, performance, and data quality.

---

## 1. Test Pyramid

```
             ┌──────────────┐
             │    E2E (28)   │  ← Playwright (slow, high confidence)
            ┌┴──────────────┴┐
            │ Integration (30)│  ← Fastify .inject() (fast, no network)
           ┌┴────────────────┴┐
           │ Contract Tests (6) │  ← Connector mocks (demo + live)
          ┌┴──────────────────┴┐
          │  Unit Tests (130+)  │  ← Pure functions, golden fixtures
          └────────────────────┘
```

---

## 2. Test Layers

### 2.1 Unit Tests (Vitest)

**Location:** `packages/etl/src/**/*.test.ts`

| Test File | Coverage | Count |
|-----------|----------|-------|
| `kpis.test.ts` | 18 KPI functions + 40+ golden fixture scenarios | 74+ |
| `alerts.test.ts` | All 7 alert rules, severity, composite, rule-7 totalOrders | 16+ |
| `pipeline/channel-mapping.test.ts` | UTM mapping, GA4 mapping, priority, fallback | 21+ |
| `connectors/demo-generator.test.ts` | Determinism (payload equality), shape, volume, entities | 16+ |

**Golden Fixture Files:**
| Fixture | Purpose | Entries |
|---------|---------|---------|
| `tests/fixtures/golden-kpis.json` | Hand-calculated KPI expectations with tolerances | 40+ |
| `tests/fixtures/golden-alerts.json` | Alert fire/don't-fire scenarios with baseInput + overrides | 12 |
| `tests/fixtures/golden-cohort.json` | Cohort invariants + synthetic retention scenarios | 7 |

**Run:** `pnpm --filter @growth-os/etl test`

### 2.2 Connector Contract Tests (Vitest)

**Location:** `packages/etl/src/connectors/connector-contracts.test.ts`

Tests each connector in both demo and live mode (mocked fetch):
- Shopify: demo mode returns records, 429 retry logic, error handling
- Meta: demo mode returns campaign insights
- Google Ads: demo mode returns campaign performance
- GA4: demo mode returns traffic records

**Run:** `pnpm --filter @growth-os/etl test`

### 2.3 API Integration Tests (Vitest + Fastify inject)

**Location:** `apps/api/src/api-routes.test.ts`

Tests using Fastify's `.inject()` method (no real HTTP, fast):

| Endpoint Group | Tests | Scenarios |
|----------------|-------|-----------|
| `GET /api/health` | 2 | Healthy + degraded (DB down) |
| `GET /api/metrics/summary` | 5 | Structure, default days, days=30, computed KPIs, empty data |
| `GET /api/metrics/timeseries` | 1 | Date-ordered array |
| `GET /api/metrics/channels` | 2 | Empty + populated |
| `GET /api/metrics/funnel` | 1 | CVR calculation |
| `GET /api/metrics/cohorts` | 1 | Retention arrays |
| `GET /api/metrics/unit-economics` | 1 | Margin decomposition |
| `GET /api/alerts` | 2 | Shape + field validation |
| `GET /api/wbr` | 2 | Narrative + sections |
| `GET /api/jobs` | 4 | List, limit, filter, 404 |
| Edge cases | 2 | Consistent structure, zero CVR |

**Run:** `pnpm --filter @growth-os/api test`

### 2.4 E2E Tests (Playwright)

**Location:** `apps/e2e/tests/dashboard.spec.ts`

Full-stack tests against the running dashboard (requires demo mode):

| Test Group | Tests | Key Assertions |
|------------|-------|----------------|
| Page navigation | 8 | All 8 pages load, title matches |
| KPI cards | 1 | ≥6 KPI cards visible |
| Date range | 1 | API re-fetched with correct days param |
| Channels table | 1 | Table rows rendered |
| Alerts | 1 | Severity badges present |
| WBR narrative | 2 | Content rendered, copy button works |
| Connections | 1 | Google OAuth form test |
| Jobs | 1 | Refresh triggers API call |
| Quality gates | 2 | No console errors, all APIs return 200 |

**Anti-patterns eliminated:** All `waitForTimeout` calls replaced with `waitForApiData()` helper that uses `page.waitForResponse()`.

**Run:** `pnpm test:e2e`

---

## 3. Test Strategy

### 3.1 What We Test

1. **Pure functions first** — KPIs, alerts, channel mapping have zero DB deps
2. **Golden fixtures** — Hand-calculated expected values for regression detection
3. **Contract tests** — Verify connector behavior against mock APIs
4. **Integration** — Fastify inject for HTTP layer without spinning up server
5. **E2E** — Full stack smoke + interaction tests with Playwright
6. **Data quality** — Invariants on retention bounds, FK integrity, determinism

### 3.2 What We Don't Test (and Why)

- **Prisma queries** — Tested implicitly through the pipeline; mocking SQL is fragile
- **External APIs** — Contract tests verify our handling; real APIs tested in staging
- **CSS rendering** — Visual regression is out of scope for v1
- **Load testing** — Deferred to post-MVP; k6 scripts recommended

### 3.3 Golden Fixture Methodology

Golden fixtures are **hand-calculated JSON files** stored in `packages/etl/tests/fixtures/`:

1. **Creation:** Each scenario has explicit inputs, expected outputs, and a tolerance (for floating-point)
2. **Maintenance:** When a KPI formula changes, update the golden file first, then the code (test-first)
3. **CI enforcement:** Golden tests run on every PR; any drift fails the build
4. **Benefits:** Catches rounding changes, formula regressions, and edge-case breakage
5. **Format:** `{ inputs: {...}, expected: number, tolerance: number, notes: string }`

---

## 4. Security Testing

### 4.1 Credential Exposure

| Check | Method | Expected |
|-------|--------|----------|
| ENCRYPTION_KEY missing | Start API without env var | Console warning logged |
| Credentials not in GET | `GET /api/connections` | No raw tokens in response |
| Connection URL params | Frontend network tab | Token not in URL path |

### 4.2 Input Validation

| Check | Method | Expected |
|-------|--------|----------|
| SQL injection in `days` param | `?days=1;DROP TABLE` | Parsed as NaN, safe default used |
| XSS in connection name | POST with `<script>` name | Sanitized or escaped |
| Auth header forwarding | Check connector calls | Bearer token in header, not URL |

### 4.3 Secrets Management

- [ ] `.env` is in `.gitignore`
- [ ] `docker-compose.yml` uses env vars, not hardcoded passwords
- [ ] No secrets committed in git history (`git log --all -p | grep -i secret`)
- [ ] ENCRYPTION_KEY is ≥ 32 bytes when set

---

## 5. Performance Testing

### 5.1 Thresholds

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Pipeline (180 days, ~5400 orders) | < 2 minutes | `time pnpm demo:pipeline` |
| `GET /api/metrics/summary` | < 500ms | Playwright `waitForResponse` timing |
| `GET /api/wbr` | < 1000ms | Complex aggregation + LLM-style formatting |
| Dashboard initial load | < 3 seconds | Playwright `load` event |
| Prisma queries | < 200ms each | Prisma query logging |

### 5.2 Known Performance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| N+1 in buildMarts LTV | Pipeline slowdown at scale | Batch customer lookup |
| No DB indexes on `fact_orders.order_date` | Slow timeseries queries | Add index migration |
| Full table scans in cohort queries | Degrades with data volume | Add composite indexes |
| No query result caching | Redundant DB hits per page load | Add Redis caching layer |

---

## 6. Data Quality Testing

### 6.1 Invariant Checks

| Invariant | Verification |
|-----------|-------------|
| Retention ∈ [0, 1] | Golden cohort fixture + pipeline validation |
| Retention monotonicity: d7 ≤ d30 ≤ d60 ≤ d90 | Golden cohort invariant test |
| LTV monotonicity: ltv30 ≤ ltv90 ≤ ltv180 | Golden cohort invariant test |
| No orphan FK references | `validate-data` step in pipeline |
| No duplicate external_order_id | Pipeline dedup + validation |
| Continuous dates in dim_date | SQL gap-check in validation |
| revenue_net ≤ revenue_gross | KPI golden fixture |
| Deterministic demo output (seed=42) | Demo generator payload equality test |

### 6.2 Negative Test Inventory

| Test | Input | Expected |
|------|-------|----------|
| Zero spend | spend=0 across channels | CAC=Infinity, MER=0 |
| Zero customers | new_customers=0 | CAC=Infinity, AOV=0 |
| Zero revenue | revenue=0 | CM%=NaN (handled), MER=0 |
| Negative margin | COGS > revenue | CM% < 0 (valid) |
| Future dates | order_date > today | Excluded from aggregation |
| Duplicate events | Same external_id twice | Deduplicated |

---

## 7. Running All Tests

```bash
# Unit + Contract + Integration (fast, no Docker needed)
pnpm test

# E2E (requires demo mode running)
pnpm demo:pipeline  # seed data first
pnpm test:e2e

# Full QA suite with coverage
pnpm test -- --coverage
```

---

## 8. CI Pipeline

```yaml
name: QA Pipeline
on: [push, pull_request]

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: growth
          POSTGRES_DB: growth_os
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: DEMO_MODE=true pnpm demo:pipeline
      - run: npx playwright install --with-deps
      - run: pnpm test:e2e
```

---

## 9. Coverage Targets

| Layer | Target | Current Estimate | Rationale |
|-------|--------|-----------------|-----------|
| KPI functions | 100% | ~100% | Pure functions, golden fixtures |
| Alert rules | 100% | ~100% | Business-critical logic |
| Channel mapping | 100% | ~100% | Attribution accuracy |
| Connectors | >80% | ~85% | Demo mode + error paths |
| API routes | >80% | ~85% | 30+ integration tests |
| E2E | Smoke+Interaction | ~90% pages | All pages + key flows |
| Golden regression | 100% scenarios | 100% | All fixture entries covered |

### Coverage Configuration (Vitest)

```typescript
// vitest.config.ts (recommended addition)
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});
```

---

## 10. Test Ownership & Frequency

| Test Layer | Owner | Frequency | Blocking? |
|------------|-------|-----------|-----------|
| Unit + Golden | Developer | Every commit | Yes — PR gate |
| Integration | Developer | Every commit | Yes — PR gate |
| Contract | Developer | Every commit | Yes — PR gate |
| E2E | QA/Developer | Every PR + nightly | Yes — merge gate |
| Performance | SRE | Weekly + release | No — advisory |
| Security | Security | Monthly + release | No — advisory |
