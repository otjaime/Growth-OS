# apps/api — Claude Code Context

> **Scope**: Fastify REST API serving the dashboard, AI integrations, and connector management.

---

## Architecture

- **Framework**: Fastify 4.26 with TypeScript
- **ORM**: Prisma (imported from `@growth-os/database`)
- **AI**: OpenAI (gpt-4o-mini default, configurable via `AI_MODEL` env)
- **Notifications**: Slack webhooks
- **Auth**: Optional Bearer token via `AUTH_SECRET` env var
- **Port**: 4000 (configurable via `PORT` env var)

---

## File Map

```
src/
├── routes/
│   ├── health.ts          # GET /api/health
│   ├── metrics.ts         # GET /api/metrics/* (8 sub-routes)
│   ├── alerts.ts          # GET /api/alerts, POST /api/alerts/explain
│   ├── wbr.ts             # GET /api/wbr, GET /api/wbr/ai (SSE)
│   ├── connections.ts     # CRUD /api/connections + OAuth + webhooks + CSV upload
│   ├── jobs.ts            # GET /api/jobs
│   ├── experiments.ts     # CRUD /api/experiments + status transitions
│   ├── suggestions.ts     # signals/detect, opportunities, suggestions, feedback, promote
│   ├── settings.ts        # GET/POST /api/settings/* (mode, google-oauth, slack, clear, seed)
│   ├── ask.ts             # GET /api/ask/status, POST /api/ask (SSE)
│   └── pipeline.ts        # GET /api/pipeline/overview, GET /api/pipeline/quality
├── lib/
│   ├── ai.ts              # OpenAI client singleton + AI generation functions
│   ├── suggestions.ts     # generateSuggestionsForOpportunity + demo fallback
│   ├── gather-metrics.ts  # gatherWeekOverWeekData() — shared metrics aggregation
│   ├── slack.ts           # Slack webhook integration
│   ├── auth.ts            # Bearer auth hook + login endpoint
│   └── crypto.ts          # Encryption helpers (if separate from database package)
├── scheduler.ts           # Periodic sync on configurable interval
└── index.ts               # Fastify server setup, CORS, plugin registration
```

---

## Route Registration Pattern

All routes are Fastify plugins:

```typescript
export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/metrics/summary', { schema }, async (req, reply) => { ... })
}
```

Registered in `index.ts` via `app.register(routeFunction)`.

---

## Library Functions (`src/lib/`)

### ai.ts — OpenAI Integration

```typescript
export function isAIConfigured(): boolean
// Returns true if OPENAI_API_KEY has length > 0

export const AI_MODEL: string
// process.env.AI_MODEL ?? 'gpt-4o-mini'

export function getClient(): OpenAI
// Lazy-initialized singleton — ALWAYS use this, never create new OpenAI()

export async function generateWBRNarrative(context: WbrAIContext): Promise<AsyncIterable<string>>
// Streams WBR narrative, temp 0.3, max 1500 tokens

export async function generateAlertExplanation(
  alert: { title: string; description: string; severity: string },
  metricsContext: string
): Promise<string>
// Returns root cause analysis, max 300 tokens

export async function answerDataQuestion(
  question: string, dataContext: string
): Promise<AsyncIterable<string>>
// Streams answer, temp 0.3, max 800 tokens
```

**WbrAIContext interface**:
```typescript
interface WbrAIContext {
  weekLabel: string
  current: { revenue, revenueNet, orders, newCustomers, spend, cac, mer, cmPct, aov, sessions: number }
  previous: { revenue, orders, newCustomers, spend, cac, cmPct: number }
  channels: Array<{ name, currentSpend, currentRevenue, previousSpend, previousRevenue, currentNewCustomers: number }>
  alerts: Array<{ severity, title, description, recommendation: string }>
  cohort: { ltvCacRatio, paybackDays, ltv90, d30Retention: number } | null
}
```

### suggestions.ts — AI Suggestion Generation

```typescript
export async function generateSuggestionsForOpportunity(
  opportunity: { type: string; title: string; description: string; signals: unknown },
  kpiContext: string,
  playbook: PlaybookEntry[],
  count?: number  // default 4
): Promise<SuggestionData[]>

export function getDemoSuggestions(opportunityType: string): SuggestionData[]
```

```typescript
interface SuggestionData {
  title: string; hypothesis: string; channel: string | null;
  metric: string; targetLift: number; impact: number;
  confidence: number; effort: number; risk: number; reasoning: string
}
```

- Uses OpenAI (temp 0.4, max 2000 tokens)
- Falls back to `getDemoSuggestions()` if AI parsing fails
- Demo suggestions exist for all 7 opportunity types

### gather-metrics.ts — Shared Metrics Aggregation

```typescript
export async function gatherWeekOverWeekData(): Promise<WoWMetrics>
```

Builds complete 7-day WoW metrics used by alerts, suggestions, WBR, and ask routes. Includes:
- Order aggregates (revenue, CM, new customers)
- Spend aggregates
- Traffic + funnel data
- Channel breakdowns
- Cohort D30 retention (current + baseline)
- Formatted `kpiContext` string for LLM prompts

### slack.ts — Slack Integration

```typescript
export function isSlackConfigured(): boolean
export async function sendAlertToSlack(alerts: SlackAlert[], dashboardUrl?: string): Promise<boolean>
export async function sendTestSlackMessage(): Promise<boolean>
```

Uses Slack Block Kit. Fires on critical/warning alerts (fire-and-forget pattern).

### auth.ts — Authentication

```typescript
export async function authRoutes(app: FastifyInstance): Promise<void>
// POST /auth/login — password auth, returns Bearer token

export function registerAuthHook(app: FastifyInstance): void
// Attaches onRequest hook; skips public paths

export function isPublicPath(url: string): boolean
// /api/health, /api/auth/*, /api/webhooks/* are public
```

- Skipped if `AUTH_SECRET` not configured (dev mode)
- Timing-safe comparison via SHA256 hash

---

## Key Route Details

### experiments.ts — Status State Machine

```typescript
const TRANSITIONS: Record<string, string[]> = {
  IDEA: ['BACKLOG', 'ARCHIVED'],
  BACKLOG: ['RUNNING', 'IDEA', 'ARCHIVED'],
  RUNNING: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['IDEA'],
}

function computeRice(reach?: number, impact?: number, confidence?: number, effort?: number): number | null
// Returns ((reach * impact * confidence) / effort) * 100, or null if effort=0 or any field missing
```

### suggestions.ts — Promote Flow

When promoting a suggestion to an experiment:
1. `reach` is set to `null` (user fills in after)
2. `impact`, `confidence`, `effort` come from the suggestion
3. RICE score computed with null reach -> null
4. Experiment created with status IDEA
5. Suggestion status -> PROMOTED
6. Opportunity status -> ACTED

### connections.ts — Connector Catalog

12 supported connectors: Shopify, WooCommerce, Meta Ads, Google Ads, TikTok Ads, GA4, HubSpot, Klaviyo, Mailchimp, Stripe, Custom Webhook, CSV Upload.

Each has: fields (with `sensitive` flag), setup guide steps, auth type, category.

### metrics.ts — Cohort Projections

Decay ratios computed from mature cohorts. Projections **clamped with `Math.min(1, ...)`** to prevent exceeding 100%.

### wbr.ts — SSE Streaming

Both `/api/wbr/ai` and `/api/ask` use SSE format:
```
data: {"text": "chunk..."}
data: {"text": "more..."}
data: {"done": true}
```

### settings.ts — clearAllData()

Deletes all tables in a single transaction, ordered for referential integrity:
```typescript
prisma.$transaction([
  prisma.suggestionFeedback.deleteMany(),
  prisma.suggestion.deleteMany(),
  prisma.opportunity.deleteMany(),
  prisma.experimentMetric.deleteMany(),
  prisma.experiment.deleteMany(),
  // ... staging, facts, dimensions, raw_events
])
```

---

## Rules for This App

- **Route plugins**: `async function nameRoutes(app: FastifyInstance): Promise<void>`
- **OpenAI singleton**: Always use `getClient()` from ai.ts, never create new instances
- **Metrics helper**: Use `gatherWeekOverWeekData()` for WoW data, don't duplicate queries
- **Slack fire-and-forget**: `.catch(() => {})` — never block on notifications
- **Background tasks**: Pipeline rebuilds, syncs run without awaiting
- **Error responses**: `{ error: { code: string, message: string } }` with appropriate HTTP status
- **SSE streaming**: Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- **CORS**: `FRONTEND_URL` env var or `http://localhost:3000`
