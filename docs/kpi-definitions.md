# Growth OS — KPI Definitions

All metrics are calculated in `packages/etl/src/kpis.ts`. This document provides business-facing definitions.

---

## Revenue Metrics

| KPI | Definition | Formula | Good Direction |
|-----|-----------|---------|----------------|
| **Revenue Gross** | Total revenue before refunds/discounts | `Σ order.revenueGross` | ↑ Higher |
| **Revenue Net** | Revenue after refunds and discounts | `Σ order.revenueNet` | ↑ Higher |
| **AOV** | Average Order Value | `Revenue Net / Order Count` | ↑ Higher |

## Profitability Metrics

| KPI | Definition | Formula | Good Direction |
|-----|-----------|---------|----------------|
| **Contribution Margin ($)** | Revenue minus COGS, shipping, ops costs | `Σ order.contributionMargin` | ↑ Higher |
| **Contribution Margin (%)** | CM as percentage of net revenue | `CM$ / Revenue Net` | ↑ Higher |

### COGS Estimation Model

Since Shopify doesn't provide COGS, we estimate using category margin assumptions:

| Category | Assumed Margin |
|----------|---------------|
| Apparel | 55% |
| Electronics | 30% |
| Beauty | 65% |
| Home | 50% |
| Food | 40% |
| Default | 45% |

Additional cost rates:
- **Shipping**: 8% of revenue
- **Ops (fulfillment/packaging)**: 5% of revenue

```
COGS = Revenue × (1 - Category Margin)
Shipping = Revenue × 0.08
Ops = Revenue × 0.05
CM = Revenue - COGS - Shipping - Ops
```

## Acquisition Metrics

| KPI | Definition | Formula | Good Direction |
|-----|-----------|---------|----------------|
| **Blended CAC** | Cost to acquire one new customer (all channels) | `Total Marketing Spend / New Customers` | ↓ Lower |
| **Channel CAC** | Cost to acquire via specific channel | `Channel Spend / Channel New Customers` | ↓ Lower |
| **New Customer Share** | % of orders from first-time buyers | `New Customer Orders / Total Orders` | Context-dependent |

## Efficiency Metrics

| KPI | Definition | Formula | Good Direction |
|-----|-----------|---------|----------------|
| **MER** | Marketing Efficiency Ratio (a.k.a. Blended ROAS) | `Total Revenue / Total Marketing Spend` | ↑ Higher |
| **ROAS** | Channel-level Return on Ad Spend | `Channel Revenue / Channel Spend` | ↑ Higher |
| **CPC** | Cost Per Click | `Spend / Clicks` | ↓ Lower |
| **CPM** | Cost Per Thousand Impressions | `(Spend / Impressions) × 1000` | ↓ Lower |
| **CTR** | Click-Through Rate | `Clicks / Impressions` | ↑ Higher |

## Retention & LTV Metrics

| KPI | Definition | Formula | Good Direction |
|-----|-----------|---------|----------------|
| **D-N Retention** | % of cohort with repeat purchase within N days | `Repeat Customers / Cohort Size` | ↑ Higher |
| **LTV at N Days** | Average lifetime value per customer at day N | `Cohort Revenue within N Days / Cohort Size` | ↑ Higher |
| **Payback Days** | Days to recover CAC from contribution margin | `CAC / (LTV₃₀ × CM% / 30)` | ↓ Lower |

### Retention Notes (E-commerce)

In ecommerce, "retention" means **repeat purchase rate** (not login/session retention like SaaS). A customer is "retained" if they make a second purchase within the lookback window.

Typical D30 retention for DTC brands: **15-30%**

## Funnel Metrics

| KPI | Definition | Formula |
|-----|-----------|---------|
| **Session → PDP** | Product detail page view rate | `PDP Views / Sessions` |
| **PDP → ATC** | Add-to-cart rate | `Add to Carts / PDP Views` |
| **ATC → Checkout** | Checkout initiation rate | `Checkouts / Add to Carts` |
| **Checkout → Purchase** | Checkout completion rate | `Purchases / Checkouts` |
| **Session → Purchase** | End-to-end conversion rate | `Purchases / Sessions` |

## Period Comparison

| KPI | Definition | Formula |
|-----|-----------|---------|
| **Percent Change** | Relative change vs previous period | `(Current - Previous) / Previous` |
| **Percentage Point Change** | Absolute change in a percentage | `Current% - Previous%` |

### WoW = Week-over-Week

Default comparison period is 7 days. The dashboard supports 7, 14, 30, and 90-day windows, always comparing to the equivalent prior period.
