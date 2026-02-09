# Growth OS — Acceptance Criteria

> 50+ Gherkin-style scenarios covering all user stories, data quality, security, and error handling.

---

## AC-01: Demo Mode Bootstrap

```gherkin
Feature: Demo Pipeline

  Scenario: Run demo mode from scratch
    Given Docker services (postgres, redis) are running
    And DEMO_MODE is set to "true"
    When I run `pnpm demo:pipeline`
    Then the pipeline generates demo data with seed 42
    And raw_events table has > 8000 rows
    And staging tables are populated
    And mart tables are populated
    And all 10 validation checks pass

  Scenario: Demo data is deterministic
    Given the demo pipeline has run once
    When I run the demo pipeline again with the same seed
    Then the row counts are identical
    And fact_orders revenue totals match
    And the first and last order payloads are byte-identical

  Scenario: Demo data idempotency
    Given the demo pipeline has run once
    When I run the demo pipeline a second time
    Then no duplicate rows are created in fact_orders
    And raw_events count does not increase
```

## AC-02: ETL Pipeline

```gherkin
Feature: ETL Pipeline Steps

  Scenario: Step 1 — Ingest Raw
    Given connector produces raw records
    When ingestRaw is called
    Then records are batch-upserted (500/batch)
    And duplicate records are updated, not duplicated
    And a job_run record is created with status "completed"

  Scenario: Step 2 — Normalize Staging
    Given raw_events has order records
    When normalizeStaging is called
    Then stg_orders are created with parsed UTM channels
    And stg_customers have unique emails
    And stg_spend has daily campaign-level rows
    And stg_traffic has daily channel-level rows

  Scenario: Step 3 — Build Marts
    Given staging tables are populated
    When buildMarts is called
    Then dim_campaign has unique campaigns
    And dim_customer has cohort months assigned
    And fact_orders has COGS, shipping, ops, CM calculated
    And fact_spend has daily spend per channel per campaign
    And fact_traffic has daily sessions per channel
    And cohorts have retention rates and LTV calculated
```

## AC-03: Data Validation

```gherkin
Feature: Data Quality Checks

  Scenario: All checks pass on clean data
    Given the demo pipeline has completed
    When validateData is called
    Then check "no_negative_spend" passes
    And check "revenue_net_lte_gross" passes
    And check "continuous_dates" passes
    And check "referential_integrity_orders" passes
    And check "referential_integrity_spend" passes
    And check "referential_integrity_traffic" passes
    And check "non_empty_fact_orders" passes
    And check "non_empty_fact_spend" passes
    And check "non_empty_fact_traffic" passes
    And check "no_duplicate_orders" passes
```

## AC-04: KPI Calculations

```gherkin
Feature: KPI Engine

  Scenario: Blended CAC
    Given total spend is $10,000 and new customers is 100
    When blendedCac is called
    Then the result is $100.00

  Scenario: CAC with zero new customers
    Given total spend is $10,000 and new customers is 0
    When blendedCac is called
    Then the result is 0 (no division by zero)

  Scenario: Contribution Margin %
    Given CM total is $30,000 and revenue net is $90,000
    When contributionMarginPct is called
    Then the result is 33.3%

  Scenario: MER calculation
    Given total revenue is $50,000 and total spend is $10,000
    When mer is called
    Then the result is 5.0x

  Scenario: Payback days
    Given CAC is $100, LTV30 is $150, CM% is 40%
    When paybackDays is called
    Then the result is 50 days

  Scenario: Funnel CVR
    Given 10,000 sessions, 4,000 PDP views, 1,000 ATC, 500 checkouts, 200 purchases
    When funnelCvr is called
    Then session-to-purchase is 2.0%
```

## AC-05: Alert Rules

```gherkin
Feature: Alert Engine

  Scenario: CAC increases > 15%
    Given current CAC is $133 and previous CAC is $100
    When evaluateAlerts is called
    Then a "cac_increase" alert fires with severity >= "warning"

  Scenario: CM% drops > 3pp
    Given current CM% is 27.8% and previous CM% is 33.3%
    When evaluateAlerts is called
    Then a "cm_decrease" alert fires

  Scenario: D30 retention drops > 5pp vs baseline
    Given baseline retention is 25% and current retention is 18%
    When evaluateAlerts is called
    Then a "retention_drop" alert fires

  Scenario: Revenue drops > 10%
    Given current revenue is $85,000 and previous is $100,000
    When evaluateAlerts is called
    Then a "revenue_decline" alert fires with severity "warning"

  Scenario: Revenue drops > 20% (critical)
    Given current revenue is $75,000 and previous is $100,000
    When evaluateAlerts is called
    Then a "revenue_decline" alert fires with severity "critical"

  Scenario: All metrics healthy
    Given all metrics are at previous period levels
    When evaluateAlerts is called
    Then no alerts are returned
```

## AC-06: API Endpoints

```gherkin
Feature: API Layer

  Scenario: Health check
    Given the API is running
    When I GET /api/health
    Then status is 200
    And body contains { status, timestamp, db, demoMode, version }

  Scenario: Executive summary
    Given mart data exists
    When I GET /api/metrics/summary?days=7
    Then body contains kpis with WoW deltas
    And kpis include revenueGross, revenueNet, orders, aov, cmPct, blendedCac, mer

  Scenario: Timeseries
    When I GET /api/metrics/timeseries?days=30
    Then body contains array of daily { date, revenue, spend, sessions }

  Scenario: Channel performance
    When I GET /api/metrics/channels?days=7
    Then body contains array of { channel, spend, revenue, roas, cac }

  Scenario: Alerts endpoint
    When I GET /api/alerts
    Then body contains array of alerts with { id, severity, title, description, recommendation }

  Scenario: WBR narrative
    When I GET /api/wbr
    Then body contains { narrative } as markdown string

  Scenario: Connections CRUD
    When I POST /api/connections with { source, label, credentials }
    Then a connection is created with encrypted credentials
    When I GET /api/connections
    Then the list includes the new connection (without raw credentials)
```

## AC-07: Dashboard Pages

```gherkin
Feature: Frontend Dashboard

  Scenario: Executive Summary
    Given the dashboard is loaded
    When I visit /
    Then I see 10 KPI cards with sparklines
    And I see a revenue + spend chart
    And I can switch date range (7D / 14D / 30D / 90D)

  Scenario: Channels page
    When I visit /channels
    Then I see a sortable table with per-channel metrics
    And columns include Channel, Spend, Revenue, ROAS, CAC, CPC

  Scenario: Cohorts page
    When I visit /cohorts
    Then I see retention curve charts (D7 / D30 / D60 / D90)
    And I see LTV curve charts
    And I see a cohort detail table

  Scenario: Unit Economics page
    When I visit /unit-economics
    Then I see AOV, CM%, CAC, Orders KPI cards
    And I see a waterfall chart for margin decomposition
    And I see a cost breakdown table

  Scenario: Alerts page
    When I visit /alerts
    Then I see alert cards with severity badges
    And each alert shows a recommendation

  Scenario: WBR page
    When I visit /wbr
    Then I see formatted WBR narrative
    And I can copy to clipboard

  Scenario: Connections page
    When I visit /connections
    Then I see configured connections with status indicators
    And I can add a new connection
    And I can test a connection
    And Google OAuth shows "Connect with Google" button

  Scenario: Jobs page
    When I visit /jobs
    Then I see job run history table
    And I can filter by status (all/running/completed/failed)
    And table auto-refreshes every 10 seconds
```

## AC-08: Sidebar Navigation

```gherkin
Feature: Sidebar

  Scenario: Navigation
    Given the dashboard is loaded
    When I click a sidebar link
    Then the corresponding page loads
    And the link is highlighted as active

  Scenario: Demo mode indicator
    Given DEMO_MODE is true
    When the dashboard loads
    Then the sidebar shows a "DEMO" badge
```

## AC-09: Data Quality Invariants

```gherkin
Feature: Data Quality

  Scenario: Cohort retention rates are bounded
    Given the pipeline has completed
    When I query the cohorts table
    Then all d7_retention values are between 0.0 and 1.0
    And all d30_retention values are between 0.0 and 1.0
    And all d60_retention values are between 0.0 and 1.0
    And all d90_retention values are between 0.0 and 1.0

  Scenario: Retention monotonicity
    Given the pipeline has completed
    When I inspect each cohort
    Then d7 <= d30 <= d60 <= d90 for retention rates
    And ltv30 <= ltv90 <= ltv180 for LTV values

  Scenario: No negative financial values
    Given the pipeline has completed
    When I query fact_spend
    Then no spend values are negative
    When I query fact_orders
    Then no revenue_net values are negative

  Scenario: Referential integrity holds
    Given the pipeline has completed
    When I run validate-data
    Then all FK checks pass (orders→channel, spend→channel, traffic→channel)
    And no orphan records exist

  Scenario: New customer share calculation uses actual totals
    Given current period has 200 new customers out of 500 total orders
    And previous period has 200 new customers out of 500 total orders
    When evaluateAlerts is called
    Then new customer share is computed as 200/500 = 40%
    And the alert does NOT use a hardcoded denominator
```

## AC-10: Security

```gherkin
Feature: Security

  Scenario: ENCRYPTION_KEY warning
    Given ENCRYPTION_KEY environment variable is not set
    When the API server starts
    Then a warning is logged about missing ENCRYPTION_KEY
    And credentials are still encrypted (but with ephemeral key)

  Scenario: Credentials are not exposed via API
    Given a connection is saved with credentials
    When I GET /api/connections
    Then the response does NOT contain raw access tokens
    And encrypted data fields are NOT returned

  Scenario: Connection test uses connectorType not UUID
    Given I have a Shopify connection saved
    When the frontend sends a test request
    Then the URL path contains the connector type (e.g., "shopify")
    And not the connection UUID
```

## AC-11: Error Handling

```gherkin
Feature: Error Handling

  Scenario: API health when database is down
    Given the PostgreSQL service is stopped
    When I GET /api/health
    Then status code is 200
    And body contains { status: "degraded", db: "disconnected" }

  Scenario: Job not found
    Given no job with ID "non-existent" exists
    When I GET /api/jobs/non-existent
    Then the response contains an error message

  Scenario: Empty data returns zero metrics
    Given no mart data exists
    When I GET /api/metrics/summary?days=7
    Then all KPI values are 0
    And no division-by-zero errors occur
    And the response structure is complete

  Scenario: Invalid days parameter
    Given the API is running
    When I GET /api/metrics/summary?days=abc
    Then the API handles gracefully (no 500 error)
```

## AC-12: Test Suite

```gherkin
Feature: Test Suite Quality

  Scenario: All unit tests pass
    When I run `pnpm test`
    Then all KPI tests pass (34+ unit + 40+ golden)
    And all alert tests pass (16+)
    And all channel mapping tests pass (21+)
    And all demo generator tests pass (16+)
    And all connector contract tests pass (6+)
    And all API integration tests pass (30+)

  Scenario: E2E tests pass
    Given demo mode is running
    When I run `pnpm test:e2e`
    Then all 25+ Playwright tests pass
    And no tests use waitForTimeout

  Scenario: Golden fixture regression
    When I run unit tests
    Then all golden-kpis.json scenarios produce expected values
    And all golden-alerts.json scenarios fire/don't-fire correctly
    And cohort invariants from golden-cohort.json are verified
```
