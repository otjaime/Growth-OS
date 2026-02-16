# apps/web — Claude Code Context

> **Scope**: Next.js 14 executive dashboard with 14 pages.

---

## Architecture

- **Framework**: Next.js 14.1 with App Router
- **Styling**: Tailwind CSS 3.4 — no CSS modules, no styled-components
- **Charts**: Recharts 2.12 — all chart components use this library
- **Icons**: Lucide React
- **Port**: 3000
- **Data fetching**: All pages are client components (`'use client'`) fetching from API via `apiFetch()`
- **State**: React hooks only (useState, useEffect, useCallback, useRef) — no Redux/Zustand

---

## File Map

```
src/
├── app/
│   ├── layout.tsx              # Root layout: AuthGate + Sidebar + main content area
│   ├── page.tsx                # / — Executive Summary
│   ├── channels/page.tsx       # /channels — Channel Performance table + pie chart
│   ├── cohorts/page.tsx        # /cohorts — Retention curves + LTV + cohort table
│   ├── unit-economics/page.tsx # /unit-economics — Margin decomposition + CAC vs LTV
│   ├── funnel/page.tsx         # /funnel — 5-step conversion funnel (GA4) or orders-only
│   ├── alerts/page.tsx         # /alerts — Alert cards with AI explanation
│   ├── wbr/page.tsx            # /wbr — Weekly Business Review + AI narrative (SSE)
│   ├── connections/page.tsx    # /connections — Connector management + CSV upload + OAuth
│   ├── jobs/page.tsx           # /jobs — Job history with auto-refresh (10s)
│   ├── experiments/page.tsx    # /experiments — CRUD + RICE scoring + status transitions
│   ├── suggestions/page.tsx    # /suggestions — AI opportunities + approve/reject/promote
│   ├── pipeline/page.tsx       # /pipeline — Data quality score + row counts + freshness
│   ├── ask/page.tsx            # /ask — Chat interface with AI (SSE streaming)
│   └── settings/page.tsx       # /settings — Demo/live toggle + Google OAuth + data management
├── components/
│   ├── sidebar.tsx             # Navigation sidebar (desktop fixed + mobile drawer)
│   ├── kpi-card.tsx            # Metric card: value, change%, sparkline
│   ├── sparkline.tsx           # Mini line chart (Recharts, 24x40px)
│   ├── date-range-picker.tsx   # 7/14/30/90 day preset buttons
│   └── connections/            # ConnectorCatalog, ConnectionCard, SetupWizard, CSVUpload
└── lib/
    ├── api.ts                  # API client (fetch wrapper + Bearer auth)
    └── format.ts               # Number, currency, percentage formatters
```

---

## Sidebar Navigation (sidebar.tsx)

```typescript
const NAV_ITEMS = [
  { href: '/', label: 'Executive Summary', icon: LayoutDashboard },
  { href: '/channels', label: 'Channel Performance', icon: Megaphone },
  { href: '/funnel', label: 'Conversion Funnel', icon: Filter },
  { href: '/cohorts', label: 'Cohorts & Retention', icon: Users },
  { href: '/unit-economics', label: 'Unit Economics', icon: DollarSign },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/wbr', label: 'Weekly Review', icon: FileText },
  { href: '/ask', label: 'Ask Your Data', icon: Sparkles },
  { href: '/experiments', label: 'Experiments', icon: FlaskConical },
  { href: '/suggestions', label: 'AI Suggestions', icon: Lightbulb },
  { href: '/connections', label: 'Data Connections', icon: Cable },
  { href: '/pipeline', label: 'Pipeline Health', icon: Gauge },
  { href: '/jobs', label: 'Job Runs', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

Features:
- Desktop: fixed 64px sidebar
- Mobile: slide-out drawer with overlay
- Health status indicator (pulsing dot: red/purple/green)
- Last sync timestamp
- Logout button (clears auth token)
- Auto-closes on route change
- API health check every 60 seconds

---

## API Client (`lib/api.ts`)

```typescript
export const API: string
// process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export function getAuthToken(): string | null
export function setAuthToken(token: string): void
export function clearAuthToken(): void
export function apiFetch(path: string, opts?: RequestInit): Promise<Response>
```

- Auth token stored in `sessionStorage`
- `apiFetch` auto-injects `Authorization: Bearer <token>` header
- Supports absolute URLs (http/https prefix)

---

## Formatters (`lib/format.ts`)

```typescript
export function formatCurrency(value: number): string    // $XXM, $XXXK, or $XXX
export function formatPercent(value: number): string     // XX.X%
export function formatNumber(value: number): string      // Localized with thousand separators
export function formatPercentChange(value: number): string // +XX.X% or -XX.X%
export function changeColor(value: number, invert?: boolean): string
// Returns: 'kpi-positive' | 'kpi-negative' | 'kpi-neutral'
// invert=true reverses logic (for cost metrics like CAC)
export function formatDays(value: number | null): string   // "XXd" or "--"
export function formatMultiplier(value: number): string    // "X.Xx" or "--"
```

---

## Shared Components

### KpiCard (`kpi-card.tsx`)

```typescript
interface KpiCardProps {
  title: string
  value: number
  change?: number           // WoW percentage change
  format?: 'currency' | 'percent' | 'number' | 'multiplier'
  invertColor?: boolean     // true for cost metrics (CAC, CPC) where down is good
  sparkData?: number[]      // Mini sparkline data points
}
```

### Sparkline (`sparkline.tsx`)

```typescript
interface MiniSparklineProps {
  data: number[]
  color?: string   // Default: blue
}
```

Recharts LineChart, 24x40px, no axes, no dots.

### DateRangePicker (`date-range-picker.tsx`)

```typescript
interface DateRangePickerProps {
  onChange: (days: number) => void
  defaultDays?: number
}
// Presets: 7, 14, 30, 90 days
```

---

## Page Details

### Executive Summary (`/`)

API calls: summary, timeseries, cohort-snapshot, channels, forecast

Sections:
1. Revenue & Profitability (4 KPI cards)
2. Revenue & Margin Trend (line chart)
3. Revenue Forecast (30-day, metric toggle: revenue/orders/spend)
4. Customer Economics (CAC, LTV, LTV:CAC, Payback)
5. Retention & Acquisition (D30, new customers, MER)
6. Channel Overview (top 5 table)

### Channels (`/channels`)

Sortable table with 11 columns. Revenue Mix donut (PieChart). Totals footer row.

Channel colors: meta=#3b82f6, google=#22c55e, email=#f59e0b, organic=#8b5cf6, affiliate=#ec4899, direct=#64748b, other=#94a3b8

### Cohorts (`/cohorts`)

Retention curves chart (D7 green, D30 blue, D60 amber, D90 red). LTV curves chart. Detailed table with ProjectedCell component (italic for projected values).

### Unit Economics (`/unit-economics`)

4 KPI cards + contribution margin decomposition (horizontal bar chart) + cost breakdown table + CAC vs LTV comparison.

### Funnel (`/funnel`)

Two modes: `TrafficFunnel` (5-step with GA4 data) and `NoTrafficFunnel` (orders-only with GA4 connect prompt).

### Alerts (`/alerts`)

AlertCard sub-component with expandable AI explanation (fetched on demand via POST /api/alerts/explain).

### WBR (`/wbr`)

Markdown narrative rendering + SSE AI streaming + copy-to-clipboard + print/PDF. KPI summary row.

### Experiments (`/experiments`)

SummaryCards + CreateModal (RICE sliders) + EditModal (results/learnings/nextSteps) + ExperimentRow (expandable with status transitions).

Status state machine: IDEA -> BACKLOG -> RUNNING -> COMPLETED -> ARCHIVED (with back-transitions).

### Suggestions (`/suggestions`)

OpportunityCard (collapsible with signals) + SuggestionRow (approve/reject/promote actions) + PromoteModal + DemoBanner (auto-detected via RULE_BASED type).

### Pipeline (`/pipeline`)

Stats cards + quality score + data layer row counts + connector freshness table + run history. Auto-refresh every 15 seconds.

### Ask (`/ask`)

Chat interface with message history. SSE streaming. Suggestion chips for first-time UX. ReactMarkdown rendering.

### Settings (`/settings`)

Demo/live mode toggle + Google OAuth config (client ID/secret) + data overview (row counts) + seed demo / clear all data buttons.

---

## Rules for This App

- **All pages are client components** (`'use client'`) — server components only for layout
- **Tailwind only** — no inline styles, no CSS files, no CSS-in-JS
- **Dark theme**: Slate/gray palette with blue/green/red accents
- **Recharts** for all charts with `ResponsiveContainer` wrapper
- **Error states**: Always show a meaningful message, never blank page
- **Loading states**: Spinner with Loader2 icon
- **Auto-refresh**: Jobs (10s), Pipeline (15s), Sidebar health (60s)
- **Currency display**: Convert from cents to dollars at display layer only
- **Percentages**: Display as `XX.X%` (value × 100 done in formatPercent)
- **Cost metrics**: Use `invertColor=true` on KpiCard (CAC, CPC — down is green)
- **SSE responses**: Parse `data: {json}` format, look for `{done: true}` terminator
