# Growth OS — Demo Script

> 5-7 minute executive walkthrough for portfolio presentations

---

## Setup (Before the Demo)

```bash
# 1. Start infrastructure
pnpm db:up

# 2. Run migrations + seed dimensions
pnpm db:migrate && pnpm db:seed

# 3. Run the demo pipeline (generates 180 days of data)
DEMO_MODE=true pnpm demo:pipeline

# 4. Start the API + Dashboard
pnpm demo:start
```

Open http://localhost:3000 in your browser.

---

## Script

### 1. The Problem (30 seconds)

> "Growth teams at DTC brands typically juggle 4+ dashboards — Shopify Admin, Google Ads, Meta Business Suite, and Google Analytics. They spend hours each week copying data into spreadsheets to answer basic questions like 'What's my real CAC?' or 'Which cohorts are actually profitable?'
>
> Growth OS solves this by automatically ingesting data from all four sources, transforming it into a unified model, and serving a real-time executive dashboard."

### 2. Executive Summary (60 seconds)

**Page: /** (Executive Summary)

Point out:
- **10 KPI cards** — Revenue, Orders, AOV, CM%, Blended CAC, MER, Sessions, Spend, New Customers
- **WoW deltas** — Each KPI shows week-over-week change with color coding
- **Sparklines** — Visual trend in each card
- **Revenue + Spend chart** — Shows the relationship between investment and returns

> "At a glance, leadership can see all growth metrics in one place. WoW deltas surface what changed without digging into spreadsheets."

Switch between **7D** and **30D** date ranges to show the picker working.

### 3. Channel Performance (60 seconds)

**Page: /channels**

Point out:
- Unified view of all channels: Meta, Google, Organic, Email, Affiliate, Direct
- **ROAS** and **CAC** per channel — click column headers to sort
- Spend allocation visible at a glance

> "This is the 'where should I put my next dollar?' view. You can instantly see which channels are efficient and which are burning cash."

### 4. Cohort Analysis (60 seconds)

**Page: /cohorts**

Point out:
- **Retention curves** — D7, D30, D60, D90 repeat purchase rates by cohort month
- **LTV curves** — Revenue per customer at 30/90/180 days
- **Cohort table** — Detailed breakdown with payback days

> "This answers the existential question: 'Are we acquiring customers who come back?' If D30 retention is declining, we know we have a product or experience problem, not just a media problem."

### 5. Unit Economics (45 seconds)

**Page: /unit-economics**

Point out:
- **Waterfall chart** — Shows how revenue decomposes into COGS, shipping, ops, and margin
- **Cost breakdown table** — Exact dollar amounts and percentages

> "Contribution margin is the real scoreboard. You can be growing revenue but losing money if your margins are deteriorating."

### 6. Alerts (45 seconds)

**Page: /alerts**

Point out:
- **Severity badges** — Critical (red), Warning (yellow), Info (blue)
- **Automated recommendations** — Each alert suggests next steps
- **7 built-in rules** — CAC spike, CM% decline, retention drop, MER deterioration, channel CAC, revenue decline, acquisition slowdown

> "Instead of hoping someone spots a problem in a weekly meeting, the system proactively surfaces issues with actionable recommendations."

### 7. Weekly Business Review (45 seconds)

**Page: /wbr**

Point out:
- **Auto-generated narrative** — What happened, key drivers, risks, priorities
- **Copy to clipboard** — One click to paste into Slack or a doc

> "This replaces the analyst spending 2 hours writing the WBR. The system generates the first draft automatically — the team just reviews and adds context."

### 8. Under the Hood (60 seconds)

**Page: /connections** — Show connector configuration UI

**Page: /jobs** — Show pipeline execution history

> "Under the hood, there's a full ETL pipeline with 4 connectors, a 3-step transformation pipeline, 10 automated data quality checks, and a BullMQ scheduler that runs hourly.
>
> Credentials are encrypted at rest with AES-256-GCM. The system supports both real API connections and the demo mode you're seeing now."

### 9. The Close (30 seconds)

> "Growth OS is a monorepo built with TypeScript end-to-end: Prisma for the data model, Fastify for the API, Next.js for the dashboard, and Recharts for visualization. It has 70+ automated tests across unit, integration, contract, and E2E layers.
>
> It's designed to be self-hosted and customizable — you can add new data sources, new KPIs, and new alert rules without touching the core architecture."

---

## FAQ Prep

**Q: How does it handle real API rate limits?**
A: Each connector has built-in retry logic with exponential backoff. Shopify connector handles 429s, Meta handles rate limit headers, Google Ads uses pagination.

**Q: What about data freshness?**
A: The BullMQ scheduler runs hourly syncs and daily mart rebuilds. Near-real-time is possible by reducing the interval.

**Q: How are credentials secured?**
A: AES-256-GCM encryption at rest. Encryption key is an environment variable, never in code. Google sources use OAuth2 flow.

**Q: Is the demo data realistic?**
A: Yes — seeded RNG produces growth curves with seasonality, weekend effects, and injected anomalies (spend spikes, traffic dips) to trigger alerts.
