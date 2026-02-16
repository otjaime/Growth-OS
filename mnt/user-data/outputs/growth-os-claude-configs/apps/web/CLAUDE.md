# apps/web — Claude Code Context

> **Scope**: Next.js 14 executive dashboard with 8 pages.

---

## Architecture

- **Framework**: Next.js 14.1 with App Router
- **Styling**: Tailwind CSS 3.4 — no CSS modules, no styled-components
- **Charts**: Recharts 2.12 — all chart components use this library
- **Port**: 3000
- **Data fetching**: Server Components fetch from API (port 4000), Client Components use SWR or fetch

---

## File Map

```
src/
├── app/                        # App Router pages
│   ├── layout.tsx              # Root layout with Sidebar
│   ├── page.tsx                # / — Executive Summary (10 KPI cards + revenue chart)
│   ├── channels/page.tsx       # /channels — Sortable channel performance table
│   ├── cohorts/page.tsx        # /cohorts — Retention curves + LTV + cohort table
│   ├── unit-economics/page.tsx # /unit-economics — Waterfall chart + cost breakdown
│   ├── alerts/page.tsx         # /alerts — Alert cards with severity + recommendations
│   ├── wbr/page.tsx            # /wbr — Auto-generated narrative + copy button
│   ├── connections/page.tsx    # /connections — Connector config + OAuth + test
│   └── jobs/page.tsx           # /jobs — Job history with filters
├── components/
│   ├── Sidebar.tsx             # Navigation sidebar (always visible)
│   ├── KpiCard.tsx             # Metric card: value, delta, sparkline, trend arrow
│   ├── Sparkline.tsx           # Mini line chart for KPI cards
│   ├── charts/                 # Recharts wrappers for each chart type
│   └── ui/                     # Shared UI primitives (buttons, badges, tables)
└── lib/
    ├── api.ts                  # API client (typed fetch wrapper for localhost:4000)
    └── formatters.ts           # Number, currency, percentage, date formatters
```

---

## Rules for This App

### Component Patterns
- **Server Components by default** — only add `'use client'` when you need interactivity
- **Client Components** for: charts, interactive tables, forms, copy buttons
- **No default exports** except page.tsx and layout.tsx (Next.js requirement)
- **Props interfaces** defined above the component, exported separately
- **Component file = single component** — no multi-component files

### Styling
- **Tailwind only** — no inline styles, no CSS files, no CSS-in-JS
- **Design tokens** via Tailwind config (colors, spacing, fonts)
- **Responsive**: Mobile-first, but primary target is desktop (dashboard)
- **Color palette**:
  - Primary: Blue (#2563EB)
  - Success/positive: Green (#16A34A)
  - Danger/negative: Red (#DC2626)
  - Warning: Amber (#D97706)
  - Neutral: Slate grays
- **Dark mode**: Not implemented yet — don't add it unless asked

### Charts (Recharts)
- Use `ResponsiveContainer` wrapper on all charts
- Consistent color scheme across all charts
- Format axes with `formatters.ts` functions
- Include tooltips with formatted values
- No chart libraries other than Recharts

### Data Display
- **Currency**: `$X,XXX.XX` format (convert from cents at display layer)
- **Percentages**: `XX.X%` format
- **Large numbers**: Use compact notation (1.2K, 3.5M)
- **Deltas**: Green ▲ for positive, Red ▼ for negative (context-aware: for CAC, lower is better)
- **Dates**: `MMM DD, YYYY` or `MMM DD` for short
- **Empty states**: Always show a meaningful message, never blank page

### KPI Card Component
The KpiCard is the core UI element. When adding new KPIs:
```tsx
<KpiCard
  title="Revenue"
  value={formatCurrency(metrics.revenue)}
  delta={metrics.revenueWoW}        // WoW percentage change
  trend="up"                         // "up" | "down" | "neutral"
  trendIsGood={true}                // true = green when up, false = green when down (e.g., CAC)
  sparklineData={metrics.dailyRevenue}
/>
```

### API Client (lib/api.ts)
- Typed wrapper around fetch
- Base URL from `NEXT_PUBLIC_API_URL` env var (default: `http://localhost:4000`)
- Error handling with typed error responses
- All functions return typed data (no `any`)

### Performance
- Use `loading.tsx` for page-level suspense boundaries
- Use `Suspense` for component-level loading
- Lazy load heavy chart components
- Prefetch adjacent page data where possible

---

## Adding a New Dashboard Page

1. Create `src/app/{page-name}/page.tsx`
2. Add loading state: `src/app/{page-name}/loading.tsx`
3. Add API types and fetch function in `lib/api.ts`
4. Add navigation link in `Sidebar.tsx`
5. Create chart/table components in `components/`
6. Add Playwright E2E test in `apps/e2e/`
7. Verify responsive layout (minimum 1024px width)

---

## Adding a New KPI to the Dashboard

1. Verify KPI function exists in `packages/etl/src/kpis.ts`
2. Verify API endpoint returns the metric
3. Add formatter in `lib/formatters.ts` if needed
4. Add `<KpiCard>` to the relevant page
5. Determine `trendIsGood` direction (is up good or bad for this metric?)
6. Add to E2E tests
