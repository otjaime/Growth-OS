# apps/web — Claude Code Context

> **Scope**: Next.js 14 executive dashboard with 19 pages (17 dashboard + 2 marketing).

---

## Architecture

- **Framework**: Next.js 14.1 with App Router
- **Styling**: Tailwind CSS 3.4 — no CSS modules, no styled-components
- **Charts**: Recharts 2.12 — all chart components use this library
- **Icons**: Lucide React
- **Auth**: Clerk (optional) or simple Bearer token via AuthGate component
- **Port**: 3000
- **Data fetching**: All pages are client components (`'use client'`) fetching from API via `apiFetch()`
- **State**: React hooks only (useState, useEffect, useCallback, useRef) — no Redux/Zustand

---

## File Map

```
src/
├── app/
│   ├── layout.tsx                    # Root layout: ClerkProviderWrapper + AuthGate + Sidebar
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx        # /dashboard — Executive Summary
│   │   ├── channels/page.tsx         # /channels — Channel Performance table + pie chart
│   │   ├── cohorts/page.tsx          # /cohorts — Retention curves + LTV + cohort table
│   │   ├── unit-economics/page.tsx   # /unit-economics — Margin decomposition + CAC vs LTV
│   │   ├── funnel/page.tsx           # /funnel — 5-step conversion funnel (GA4) or orders-only
│   │   ├── alerts/page.tsx           # /alerts — Alert cards with AI explanation
│   │   ├── wbr/page.tsx              # /wbr — Weekly Business Review + AI narrative (SSE)
│   │   ├── connections/page.tsx      # /connections — Connector management + CSV upload + OAuth
│   │   ├── jobs/page.tsx             # /jobs — Job history with auto-refresh (10s)
│   │   ├── experiments/page.tsx      # /experiments — CRUD + ICE scoring + A/B stats + kanban
│   │   ├── suggestions/page.tsx      # /suggestions — AI opportunities + approve/reject/promote
│   │   ├── pipeline/page.tsx         # /pipeline — Data quality score + row counts + freshness
│   │   ├── ask/page.tsx              # /ask — Chat interface with AI (SSE streaming)
│   │   ├── settings/page.tsx         # /settings — Demo/live toggle + Google OAuth + data mgmt
│   │   ├── email/page.tsx            # /email — Email campaign performance
│   │   ├── autopilot/page.tsx        # /autopilot — Meta Ads autopilot (tabs: overview/campaigns/products)
│   │   └── growth-model/page.tsx     # /growth-model — Scenario planning with projections
│   └── (marketing)/
│       ├── page.tsx                  # Landing page
│       └── setup/page.tsx            # Setup wizard
├── components/
│   ├── sidebar.tsx             # Navigation sidebar (desktop fixed + mobile drawer)
│   ├── kpi-card.tsx            # Metric card: value, change%, sparkline
│   ├── sparkline.tsx           # Mini line chart (Recharts, 24x40px)
│   ├── date-range-picker.tsx   # 7/14/30/90 day preset buttons
│   ├── auth-gate.tsx           # Auth wrapper (Clerk or Bearer token)
│   ├── clerk-provider-wrapper.tsx  # Clerk provider conditional wrapper
│   ├── clerk-token-sync.tsx    # Sync Clerk tokens to API
│   ├── demo-banner.tsx         # Demo mode indicator banner
│   ├── skeleton.tsx            # Loading skeleton component
│   ├── tooltip.tsx             # Tooltip component
│   ├── revenue-chart.tsx       # Revenue trend chart
│   ├── forecast-chart.tsx      # Forecast chart with confidence intervals
│   ├── autopilot/             # 35+ components for Meta Ads autopilot
│   │   ├── overview-tab.tsx    # Main overview with diagnosis list + summary cards
│   │   ├── campaigns-tab.tsx   # Campaign-level performance view
│   │   ├── products-tab.tsx    # Product performance + ad fitness scoring
│   │   ├── diagnosis-list.tsx  # List of diagnoses by severity
│   │   ├── diagnosis-detail.tsx # Detailed diagnosis view with AI insight
│   │   ├── action-card.tsx     # Action approval/execution card
│   │   ├── ai-insight-card.tsx # AI-generated insight display
│   │   ├── ads-table.tsx       # Ad-level data table
│   │   ├── ad-detail-sheet.tsx # Ad detail slideout panel
│   │   ├── budget-view.tsx     # Budget optimization view
│   │   ├── campaign-health-view.tsx # Campaign health scores
│   │   ├── config-panel.tsx    # Autopilot settings configuration
│   │   ├── settings-slideout.tsx # Autopilot settings slideout
│   │   ├── confirmation-modal.tsx # Action confirmation dialog
│   │   ├── emergency-stop.tsx  # Emergency stop button
│   │   ├── history-table.tsx   # Action history / audit log
│   │   ├── severity-badge.tsx  # Severity indicator badge
│   │   ├── confidence-badge.tsx # Confidence score badge
│   │   ├── confidence-breakdown.tsx # Detailed confidence breakdown
│   │   ├── variant-performance.tsx # Ad variant performance comparison
│   │   ├── health-banner.tsx   # System health status banner
│   │   ├── impact-summary.tsx  # Impact summary for actions
│   │   ├── execution-status.tsx # Execution status indicator
│   │   ├── expiry-countdown.tsx # Diagnosis expiry countdown
│   │   ├── forecast-widget.tsx # Budget forecast widget
│   │   ├── help-drawer.tsx     # Help documentation drawer
│   │   ├── metric-tooltip.tsx  # Metric tooltip with details
│   │   ├── reasoning-pills.tsx # Rule reasoning pills
│   │   ├── rule-health.tsx     # Rule health indicators
│   │   ├── severity-group.tsx  # Diagnoses grouped by severity
│   │   ├── summary-cards.tsx   # Overview summary cards
│   │   ├── tab-bar.tsx         # Tab navigation for autopilot
│   │   ├── trend-arrow.tsx     # Trend direction indicator
│   │   ├── trust-indicator.tsx # Trust/confidence indicator
│   │   ├── undo-toast.tsx      # Undo action toast notification
│   │   ├── ad-thumbnail.tsx    # Ad creative thumbnail
│   │   ├── ads-search-bar.tsx  # Search/filter bar for ads
│   │   ├── bulk-actions-bar.tsx # Bulk action controls
│   │   ├── proactive-confirm-modal.tsx # Proactive ad creation confirmation
│   │   └── proactive-job-card.tsx # Proactive ad job status card
│   ├── connections/            # Connector management components
│   │   ├── connector-catalog.tsx
│   │   ├── connection-card.tsx
│   │   ├── setup-wizard.tsx
│   │   ├── csv-upload.tsx
│   │   └── connector-icon.tsx
│   ├── experiments/            # Experiment management components
│   │   ├── experiment-row.tsx
│   │   ├── create-modal.tsx
│   │   ├── edit-modal.tsx
│   │   ├── create-from-alert-modal.tsx
│   │   ├── ab-results.tsx      # A/B test statistical results display
│   │   ├── experiment-metric-chart.tsx
│   │   ├── kanban-board.tsx    # Kanban view for experiments
│   │   ├── kanban-card.tsx
│   │   ├── scorecard.tsx       # ICE scorecard
│   │   ├── search-bar.tsx
│   │   ├── summary-cards.tsx
│   │   └── view-toggle.tsx     # List/Kanban view toggle
│   └── ui/                     # Shared UI components
│       ├── animated-list.tsx
│       ├── counter-ticker.tsx
│       ├── count-up.tsx
│       ├── dock.tsx
│       ├── glass-surface.tsx
│       ├── mesh-gradient-bg.tsx
│       ├── reflective-card.tsx
│       └── spotlight-card.tsx
└── lib/
    ├── api.ts                  # API client (fetch wrapper + Bearer auth + Clerk token)
    ├── format.ts               # Number, currency, percentage formatters
    └── export.ts               # CSV export utility
```

---

## API Client (`lib/api.ts`)

```typescript
export const API: string
export function getAuthToken(): string | null
export function setAuthToken(token: string): void
export function clearAuthToken(): void
export function apiFetch(path: string, opts?: RequestInit): Promise<Response>
```

- Auth token stored in `sessionStorage`
- `apiFetch` auto-injects `Authorization: Bearer <token>` header
- Supports Clerk token sync via `clerk-token-sync.tsx`

---

## Formatters (`lib/format.ts`)

```typescript
export function formatCurrency(value: number): string    // $XXM, $XXXK, or $XXX
export function formatPercent(value: number): string     // XX.X%
export function formatNumber(value: number): string      // Localized with thousand separators
export function formatPercentChange(value: number): string // +XX.X% or -XX.X%
export function changeColor(value: number, invert?: boolean): string
export function formatDays(value: number | null): string   // "XXd" or "--"
export function formatMultiplier(value: number): string    // "X.Xx" or "--"
```

---

## Key Pages

### Executive Summary (`/dashboard`)
API calls: summary, timeseries, cohort-snapshot, channels, forecast. Revenue/margin trends, forecast, customer economics, channel overview.

### Autopilot (`/autopilot`)
Three-tab interface:
1. **Overview** — Diagnosis list grouped by severity, summary cards, action approval flow
2. **Campaigns** — Campaign-level health scores, budget views, performance metrics
3. **Products** — Product performance table, ad fitness scores, proactive ad creation

Features: AI-powered diagnoses with confidence scores, one-click approve/execute/rollback, auto-execute mode, copy variant generation, emergency stop, circuit breaker status.

### Growth Model (`/growth-model`)
Scenario planning with interactive inputs (budget, CAC, CVR, AOV, COGS). Side-by-side scenario comparison. Monthly projection charts. Break-even analysis.

### Experiments (`/experiments`)
Two views: List and Kanban board. ICE scoring. A/B test statistical analysis with p-values and confidence intervals. Create from alert modal.

### Channels, Cohorts, Unit Economics, Funnel, Alerts, WBR, Ask, Connections, Pipeline, Jobs, Settings, Suggestions, Email
See previous documentation for details on these pages.

---

## Rules for This App

- **All pages are client components** (`'use client'`) — server components only for layout
- **Tailwind only** — no inline styles, no CSS files, no CSS-in-JS
- **Dark theme**: Slate/gray palette with blue/green/red accents
- **Recharts** for all charts with `ResponsiveContainer` wrapper
- **Error states**: Always show a meaningful message, never blank page
- **Loading states**: Spinner with Loader2 icon or Skeleton components
- **Auto-refresh**: Jobs (10s), Pipeline (15s), Sidebar health (60s), Autopilot diagnoses (30s)
- **Currency display**: Convert from cents to dollars at display layer only
- **Percentages**: Display as `XX.X%` (value x 100 done in formatPercent)
- **Cost metrics**: Use `invertColor=true` on KpiCard (CAC, CPC — down is green)
- **SSE responses**: Parse `data: {json}` format, look for `{done: true}` terminator
- **Auth**: Clerk provider wraps app when configured, falls back to Bearer token
- **Autopilot components**: All in `components/autopilot/` directory, follow existing patterns
