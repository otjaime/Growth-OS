# apps/api — Claude Code Context

> **Scope**: Fastify REST API serving the dashboard, AI integrations, connector management, Meta Ads Autopilot, billing, and growth model.

---

## Architecture

- **Framework**: Fastify 4.26 with TypeScript
- **ORM**: Prisma (imported from `@growth-os/database`)
- **AI**: OpenAI (gpt-4o-mini default, configurable via `AI_MODEL` env)
- **Auth**: Clerk (optional, via `CLERK_SECRET_KEY`) or Bearer token (via `AUTH_SECRET`)
- **Billing**: Stripe (optional, via `STRIPE_SECRET_KEY`)
- **Notifications**: Slack webhooks
- **Port**: 4000 (configurable via `PORT` env var)
- **Multi-tenancy**: All routes scoped via `orgWhere()`/`orgData()` from `lib/tenant.ts`

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
│   ├── experiments.ts     # CRUD /api/experiments + status transitions + A/B stats
│   ├── suggestions.ts     # signals/detect, opportunities, suggestions, feedback, promote
│   ├── settings.ts        # GET/POST /api/settings/* (mode, google-oauth, slack, clear, seed)
│   ├── ask.ts             # GET /api/ask/status, POST /api/ask (SSE)
│   ├── pipeline.ts        # GET /api/pipeline/overview, GET /api/pipeline/quality
│   ├── autopilot.ts       # Meta Ads autopilot (sync, diagnose, actions, config, campaigns)
│   ├── billing.ts         # Stripe billing (checkout, portal, webhook, status)
│   ├── growth-model.ts    # Scenario planning (CRUD, compute, defaults, safe-spend)
│   └── clerk-webhooks.ts  # Clerk webhook handler (user/org sync via Svix)
├── lib/
│   ├── ai.ts              # OpenAI client singleton + AI generation functions
│   ├── suggestions.ts     # generateSuggestionsForOpportunity + demo fallback
│   ├── gather-metrics.ts  # gatherWeekOverWeekData() — shared metrics aggregation
│   ├── slack.ts           # Slack webhook integration
│   ├── auth.ts            # Bearer auth hook + login endpoint
│   ├── tenant.ts          # Multi-tenancy helpers (orgWhere, orgData, orgSqlParam, getOrgId)
│   ├── clerk.ts           # Clerk JWT verification + middleware
│   ├── stripe.ts          # Stripe integration (checkout, portal, webhooks, PLAN_CONFIGS)
│   ├── plan-guard.ts      # Feature gating by plan tier
│   ├── autopilot-analyzer.ts # AI-powered diagnosis analysis + rule-based insights
│   ├── copy-generator.ts  # AI ad copy generation for variants
│   ├── meta-executor.ts   # Execute actions via Meta Marketing API
│   ├── rule-tuner.ts      # Adjust diagnosis rule thresholds from feedback patterns
│   ├── ab-stats.ts        # Statistical functions for A/B test analysis
│   ├── proactive-ab-engine.ts # Proactive A/B test orchestration
│   ├── product-copy-generator.ts # Product-specific ad copy generation
│   ├── ad-image-manager.ts # Ad image upload and management
│   ├── campaign-reporter.ts # Campaign performance reporting
│   ├── build-connector-configs.ts # Build connector configs from credentials
│   ├── run-connector-sync.ts # Run connector sync operations
│   ├── shipping-zone-resolver.ts # Resolve shipping zones
│   └── google-oauth-config.ts # Google OAuth configuration
├── jobs/
│   ├── sync-meta-ads.ts   # Sync ad creative data from Meta API
│   ├── run-diagnosis.ts   # Run diagnosis rules on synced ads
│   ├── execute-action.ts  # Execute approved diagnosis actions
│   ├── rollback-action.ts # Undo previously executed actions
│   ├── enrich-diagnosis.ts # Add AI insights to diagnoses
│   ├── campaign-monitor.ts # Monitor campaign performance
│   ├── campaign-optimizer.ts # Auto-optimize campaigns
│   ├── forecast-aware-budget.ts # Forecast-informed budget decisions
│   ├── circuit-breaker.ts # Safety circuit breaker for auto-execution
│   ├── auto-execute.ts    # Auto-execute high-confidence diagnoses
│   ├── proactive-ad-pipeline.ts # Pipeline for proactive ad creation
│   └── weekly-marketing-analysis.ts # Weekly marketing report generation
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
export const AI_MODEL: string
export function getClient(): OpenAI
export async function generateWBRNarrative(context: WbrAIContext): Promise<AsyncIterable<string>>
export async function generateAlertExplanation(alert, metricsContext): Promise<string>
export async function answerDataQuestion(question, dataContext): Promise<AsyncIterable<string>>
```

**Rules**: ALWAYS use `getClient()` — never create new OpenAI instances.

### tenant.ts — Multi-Tenancy

```typescript
export function orgWhere(request: FastifyRequest): { organizationId?: string }
export function orgData(request: FastifyRequest): { organizationId?: string }
export function orgSqlParam(request: FastifyRequest, nextIndex: number): OrgSqlParam
export function getOrgId(request: FastifyRequest): string | undefined
```

**Rules**: ALWAYS scope queries with `orgWhere()` and creates with `orgData()`.

### suggestions.ts — AI Suggestion Generation

```typescript
export async function generateSuggestionsForOpportunity(opportunity, kpiContext, playbook, count?): Promise<SuggestionData[]>
export function getDemoSuggestions(opportunityType: string): SuggestionData[]
```

### gather-metrics.ts — Shared Metrics Aggregation

```typescript
export async function gatherWeekOverWeekData(): Promise<WoWMetrics>
```

### stripe.ts — Billing Integration

```typescript
export function isStripeConfigured(): boolean
export function createCheckoutSession(orgId, plan, successUrl, cancelUrl): Promise<Session>
export function createPortalSession(customerId, returnUrl): Promise<Session>
export function constructWebhookEvent(body, sig): Event
export function extractSubscriptionData(subscription): SubscriptionData
export const PLAN_CONFIGS: Record<Plan, PlanConfig>
```

### plan-guard.ts — Feature Gating

Guards features by organization plan tier. Use to restrict access to premium features.

### autopilot-analyzer.ts — Diagnosis Analysis

```typescript
export async function generateDiagnosisInsight(input: DiagnosisAnalyzerInput): Promise<AIInsight>
export function generateRuleBasedInsight(input: DiagnosisAnalyzerInput): AIInsight
```

### meta-executor.ts — Meta API Execution

Executes actions (pause, budget change, duplicate) via Meta Marketing API. All Meta API mutations go through this module.

### rule-tuner.ts — Adaptive Rule Tuning

```typescript
export function computeRuleHealth(ruleId, feedbackHistory): RuleHealth
```

Adjusts diagnosis rule thresholds based on approve/dismiss feedback patterns.

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
```

Now uses ICE scoring (Impact, Confidence, Ease) instead of RICE. Includes A/B test statistical analysis (control/variant rates, p-value, confidence level, significance).

### autopilot.ts — Meta Ads Autopilot

Key flows:
1. **Sync**: `POST /api/autopilot/sync` -> `syncMetaAds()` -> fetches ad-level data from Meta API
2. **Diagnose**: `POST /api/autopilot/diagnose` -> `runDiagnosis()` -> evaluates rules, creates Diagnosis records
3. **Action**: Approve -> Execute -> (optional Rollback) with full audit logging
4. **Auto-execute**: High-confidence diagnoses executed automatically in auto mode
5. **Proactive**: Score products -> generate copy -> create ads -> A/B test -> pick winner

### billing.ts — Stripe Billing

- `GET /billing/status` — Current plan + trial info
- `POST /billing/checkout` — Create Stripe checkout session
- `POST /billing/portal` — Customer portal for plan management
- `POST /billing/webhook` — Handle Stripe events (subscription updates)

### growth-model.ts — Scenario Planning

CRUD for growth scenarios with on-the-fly projection computation. Default inputs derived from current data (last 30 days avg AOV, CAC, etc.).

### clerk-webhooks.ts — User/Org Sync

Handles Clerk webhook events:
- `organization.created` / `organization.updated` — Upsert Organization
- `user.created` / `user.updated` — Upsert User with org membership

Svix signature verification via `CLERK_WEBHOOK_SECRET`.

---

## Rules for This App

- **Route plugins**: `async function nameRoutes(app: FastifyInstance): Promise<void>`
- **OpenAI singleton**: Always use `getClient()` from ai.ts, never create new instances
- **Metrics helper**: Use `gatherWeekOverWeekData()` for WoW data, don't duplicate queries
- **Multi-tenancy**: Always scope queries with `orgWhere(request)` and creates with `orgData(request)`
- **Slack fire-and-forget**: `.catch(() => {})` — never block on notifications
- **Background tasks**: Pipeline rebuilds, syncs, diagnoses run without awaiting
- **Error responses**: `{ error: { code: string, message: string } }` with appropriate HTTP status
- **SSE streaming**: Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`
- **CORS**: `FRONTEND_URL` env var or `http://localhost:3000`
- **Meta API**: All mutations through `meta-executor.ts` — never call Meta API directly
- **Autopilot safety**: Respect circuit breaker, daily limits, confidence thresholds
- **Plan gating**: Check plan tier via `plan-guard.ts` for premium features
