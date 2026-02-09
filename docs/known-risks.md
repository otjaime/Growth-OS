# Growth OS — Known Risks & Mitigations

> Comprehensive risk register for the Growth OS platform.
> Each risk includes severity, reproduction steps, current mitigation, and recommended hardening.
> Updated: 2025

---

## Severity Definitions

| Level | Impact | Action Required |
|-------|--------|----------------|
| 🔴 CRITICAL | Data loss, security breach, or incorrect executive metrics | Fix before any production use |
| 🟠 HIGH | Significant data quality or reliability issue | Fix in current sprint |
| 🟡 MEDIUM | Degraded experience or minor data quality concern | Fix in next sprint |
| 🟢 LOW | Cosmetic or edge case | Backlog |

---

## Risk Register

### RISK-001 🔴 ENCRYPTION_KEY Random Fallback
- **Component:** `apps/api/src/routes/connections.ts`
- **Description:** If `ENCRYPTION_KEY` env var is not set, a random key is generated at startup. After restart, all encrypted credentials become unrecoverable.
- **Reproduction:** 1. Start API without ENCRYPTION_KEY 2. Save a connection 3. Restart API 4. Attempt to list/test connections → decrypt fails
- **Mitigation (Applied):** Added startup warning log when ENCRYPTION_KEY is missing. The random fallback still works for dev/demo but warns loudly.
- **Recommended Hardening:** In production, throw at startup if ENCRYPTION_KEY is not set. Add to `.env.example` with generation instructions.

### RISK-002 🔴 Cohort Retention Over-Counting (FIXED)
- **Component:** `packages/etl/src/pipeline/step3-build-marts.ts` — `buildCohorts()`
- **Description:** Before fix, retention incremented a counter per repeat order, not per unique customer. A customer with 5 repeat orders within D30 would count as 5, inflating retention rates potentially > 100%.
- **Reproduction:** Run pipeline → inspect cohort.d30Retention → values could exceed 1.0
- **Mitigation (Applied):** Replaced counter variables with `Set<string>` to track unique customer IDs per retention window. Retention is now guaranteed in [0.0, 1.0].
- **Validation:** Golden cohort fixtures include invariant tests for bounded retention.

### RISK-003 🔴 Alert Rule 7 Hardcoded Denominator (FIXED)
- **Component:** `packages/etl/src/alerts.ts` — Rule 7 (new customer share)
- **Description:** Used `currentNewCustomers + 10` as total orders denominator. This made newCustomerShare ≈ 1.0 always, so the -8pp threshold never triggered.
- **Reproduction:** Pass any AlertInput to `evaluateAlerts()` → rule 7 never fires
- **Mitigation (Applied):** Added `currentTotalOrders` and `previousTotalOrders` to `AlertInput` interface. Rule 7 now computes share from actual order counts. Added "fires" test case.

### RISK-004 🔴 Demo Generator Test Entity Mismatches (FIXED)
- **Component:** `packages/etl/src/connectors/demo-generator.test.ts`
- **Description:** Tests asserted entity names `'order'`, `'customer'`, `'campaign_insight'` but actual generator produces `'orders'`, `'customers'`, `'insights'`, `'campaign_performance'`. 4 tests were guaranteed to fail.
- **Reproduction:** Run `pnpm --filter @growth-os/etl test` → 4 failures
- **Mitigation (Applied):** Fixed all entity assertions to match actual generator output. Fixed broken `records()` helper.

### RISK-005 🔴 Frontend Connections URL Mismatch (FIXED)
- **Component:** `apps/web/src/app/connections/page.tsx`
- **Description:** Frontend sent connection `id` (UUID) to test/delete endpoints, but API routes use `:type` (connectorType string like 'shopify'). Every test/delete operation would hit wrong endpoint.
- **Reproduction:** Open connections page → click "Test" → request goes to `/connections/<uuid>/test` → API finds no connector
- **Mitigation (Applied):** Changed `handleTest()` and `handleDelete()` to use `conn.source` (connectorType) instead of `conn.id`.

### RISK-006 🟠 Hardcoded Demo Date Without Production Fallback
- **Component:** All API routes in `apps/api/src/routes/metrics.ts`, `alerts.ts`, `wbr.ts`
- **Description:** `new Date('2026-02-09')` is hardcoded for demo determinism. In production, this means all queries are against a fixed future date, returning zero results.
- **Reproduction:** Set `DEMO_MODE=false` → all metric endpoints return empty data
- **Recommended Fix:** `const now = process.env.DEMO_MODE === 'true' ? new Date('2026-02-09') : new Date();`

### RISK-007 🟠 No API Input Validation
- **Component:** All API routes
- **Description:** Query parameters are parsed via `parseInt()` without validation. `?days=abc` results in `NaN`, causing unexpected behavior. No Fastify schema validation defined.
- **Reproduction:** `GET /api/metrics/summary?days=abc` → NaN propagates into date calculations
- **Recommended Fix:** Add Fastify JSON Schema validation for all route query params.

### RISK-008 🟠 Jobs 404 Returns 200 with Error Object
- **Component:** `apps/api/src/routes/jobs.ts`
- **Description:** When a job ID doesn't exist, the route returns `{ error: 'Job not found' }` with HTTP 200 instead of 404.
- **Reproduction:** `GET /api/jobs/non-existent` → 200 with error body
- **Recommended Fix:** `return reply.status(404).send({ error: 'Job not found' });`

### RISK-009 🟠 N+1 Query Pattern in Cohort LTV Calculation
- **Component:** `packages/etl/src/pipeline/step3-build-marts.ts` — `buildCohorts()` LTV section
- **Description:** For each customer in each cohort, a separate `prisma.factOrder.findMany()` is executed. With 2400 customers across 6 cohorts, this generates ~14,400 individual queries.
- **Reproduction:** Run pipeline with DB query logging → observe thousands of `SELECT` statements
- **Recommended Fix:** Batch-fetch all orders for cohort customer IDs in a single query, then compute LTV in memory.

### RISK-010 🟠 Fact Spend 'unknown' Campaign FK
- **Component:** `packages/etl/src/pipeline/step3-build-marts.ts` — `buildFactSpend()`
- **Description:** When campaign lookup fails, `campaign?.id ?? 'unknown'` is used as the compound unique key. `'unknown'` is not a valid `DimCampaign` ID, creating phantom foreign key references.
- **Reproduction:** Inspect `fact_spend` for rows with `campaign_id = 'unknown'` → FK violation on strict DBs
- **Recommended Fix:** Use a dedicated "Unmapped" campaign record created during dimension build.

### RISK-011 🟠 Meta Access Token in URL (Security)
- **Component:** `apps/api/src/routes/connections.ts` — Meta test connection
- **Description:** `fetch(\`https://graph.facebook.com/v19.0/me?access_token=${creds.accessToken}\`)` passes the access token as a query parameter, which may be logged in server access logs, browser history, or intermediate proxies.
- **Reproduction:** Test a Meta connection → access token visible in URL
- **Recommended Fix:** Use `Authorization: Bearer ${creds.accessToken}` header instead.

### RISK-012 🟡 OAuth Callback Stores clientSecret in Encrypted Payload
- **Component:** `apps/api/src/routes/connections.ts` — Google OAuth callback
- **Description:** The `clientSecret` (already available via env var) is redundantly stored inside the encrypted credential payload.
- **Reproduction:** Inspect encrypted data after OAuth flow
- **Recommended Fix:** Remove `clientSecret` from the encrypted payload; always read from env.

### RISK-013 🟡 Unused Decimal.js Import
- **Component:** `packages/etl/src/kpis.ts`
- **Description:** `import Decimal from 'decimal.js'` is declared but never used. All financial calculations use native JS `number` type, which has IEEE 754 floating-point precision issues.
- **Impact:** Bundle size (minor); financial precision risk at scale (accumulation errors on large sums).
- **Recommended Fix:** Either use Decimal for financial calcs or remove the import to avoid confusion.

### RISK-014 🟡 Payback Days Hardcoded 35% Margin
- **Component:** `packages/etl/src/pipeline/step3-build-marts.ts` — `buildCohorts()`
- **Description:** `const dailyContrib = ltv30 > 0 ? (ltv30 * 0.35) / 30 : 1;` uses a hardcoded 35% margin estimate instead of the actual contribution margin percentage from the data.
- **Reproduction:** Compare paybackDays in cohort table vs manual calculation using actual CM%
- **Recommended Fix:** Calculate actual CM% from the cohort's orders.

### RISK-015 🟡 Step 1 Idempotency Fragile for Null externalId
- **Component:** `packages/etl/src/pipeline/step1-ingest-raw.ts`
- **Description:** When `externalId` is null, records are always `CREATE`d (never upserted). Re-running the pipeline will duplicate these records.
- **Entities affected:** Any records without external IDs (rare in current generators but possible with real APIs).
- **Recommended Fix:** Generate a deterministic hash from payload as synthetic externalId.

### RISK-016 🟡 No Error Boundaries in Frontend
- **Component:** `apps/web/src/app/**`
- **Description:** No React Error Boundaries are implemented. A rendering error in any component crashes the entire page with a white screen.
- **Recommended Fix:** Add `error.tsx` files per Next.js App Router convention.

### RISK-017 🟢 Frontend Hardcoded API URL
- **Component:** `apps/web/src/app/connections/page.tsx` (and likely other pages)
- **Description:** `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'` — works for dev but needs env config for production.
- **Impact:** Low — expected for demo/portfolio project.

### RISK-018 🟢 No Rate Limiting on API
- **Component:** `apps/api`
- **Description:** No rate limiting configured. In production, endpoints could be abused.
- **Impact:** Low for demo; would need `@fastify/rate-limit` for production.

---

## Risk Heatmap

```
           LOW IMPACT ←──────────────→ HIGH IMPACT
HIGH PROB │ R007, R008   │ R006, R009     │
          │              │                │
MED PROB  │ R013, R017   │ R010, R011     │
          │              │                │
LOW PROB  │ R012, R018   │ R015, R016     │
          │              │ R014           │
          └──────────────┴────────────────┘
```

## Fixed Risks Summary

| Risk | Status | Fix Applied In |
|------|--------|---------------|
| RISK-001 | ⚠️ Warned | `connections.ts` — startup warning |
| RISK-002 | ✅ Fixed | `step3-build-marts.ts` — Set-based counting |
| RISK-003 | ✅ Fixed | `alerts.ts` — actual totalOrders |
| RISK-004 | ✅ Fixed | `demo-generator.test.ts` — correct entity names |
| RISK-005 | ✅ Fixed | `connections/page.tsx` — use connectorType |
