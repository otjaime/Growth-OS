# Growth Model / Scenario Planning

Interactive scenario planning tool: input business assumptions and see projected outcomes over a configurable horizon.

## Purpose

Helps growth teams answer "what if" questions:
- What happens if we double the Meta budget?
- How does improving CAC from $35 to $26 change the break-even timeline?
- What repeat rate do we need for profitability at current spend levels?

## Input Assumptions

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Monthly Budget | $1K–$200K | $25K | Total monthly marketing spend |
| Target CAC | $5–$200 | $50 | Cost to acquire one new customer |
| Expected CVR | 0.5%–10% | 2.5% | Session-to-purchase conversion rate |
| AOV | $10–$500 | $85 | Average order value |
| COGS % | 10%–80% | 45% | Cost of goods as percentage of revenue |
| Repeat Rate | 0%–60% | 20% | Monthly return rate for existing customers |
| Avg Orders/Customer | 1.0–5.0 | 1.3 | Average orders per new customer |
| Horizon | 3, 6, 9, 12 months | 6 | Projection timeframe |

## Computation Logic

Per month (1..horizon):

```
newCustomers = floor(monthlyBudget / targetCac)
returningCustomers = floor(cumulativePriorCustomers * returnRate)
orders = round(newCustomers * avgOrdersPerCustomer) + returningCustomers
revenue = orders * avgOrderValue
cogs = revenue * cogsPercent
contributionMargin = revenue - cogs - monthlyBudget
```

Summary KPIs:
- **Projected Revenue**: Sum of monthly revenues
- **ROAS**: totalRevenue / totalSpend
- **LTV**: totalRevenue / totalNewCustomers
- **Break-Even Month**: First month where cumulativeProfit >= 0

## Baseline

The "Load Baseline" button derives assumptions from actual mart data:
- `monthlyBudget` = avg last 90 days spend / 3
- `targetCac` = monthly budget / new customers (last 30 days)
- `expectedCvr` = purchases / sessions (last 30 days)
- `avgOrderValue` = net revenue / orders (last 30 days)
- `cogsPercent` = COGS / revenue (last 30 days)
- `returnRate` = latest cohort D30 retention

## Scenario Comparison

Save scenarios and compare two side-by-side:
- Overlay revenue and cumulative profit curves on the same chart
- Compare KPI cards between current inputs and a saved scenario

## Demo Mode

Three pre-built scenarios are seeded during demo pipeline:
1. **Current Baseline** — $45K/mo, $32 CAC, 2.8% CVR
2. **Scale Meta 2x** — $90K/mo, $35 CAC, 2.5% CVR
3. **Optimize CAC** — $45K/mo, $26 CAC, 3.5% CVR

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/growth-model/scenarios` | List saved scenarios |
| POST | `/api/growth-model/scenarios` | Create scenario (computes + stores) |
| GET | `/api/growth-model/scenarios/:id` | Get scenario with monthly breakdown |
| PUT | `/api/growth-model/scenarios/:id` | Update inputs, recompute outputs |
| DELETE | `/api/growth-model/scenarios/:id` | Delete scenario |
| POST | `/api/growth-model/compute` | Stateless compute (no DB write) |
| GET | `/api/growth-model/baseline` | Derive baseline from mart data |

## Architecture

```
packages/etl/src/growth-model.ts     — Pure computation (computeGrowthModel, DEMO_SCENARIOS)
apps/api/src/routes/growth-model.ts  — 7 REST endpoints
apps/web/src/app/growth-model/page.tsx — Interactive slider UI + charts
```
