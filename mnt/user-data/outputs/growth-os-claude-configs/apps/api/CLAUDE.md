# apps/api — Claude Code Context

> **Scope**: Fastify REST API serving the dashboard and external consumers.

---

## Architecture

- **Framework**: Fastify 4.26 with TypeScript
- **ORM**: Prisma (imported from `@growth-os/database`)
- **Queue**: BullMQ 5.1 on Redis 7
- **Port**: 4000 (configurable via `PORT` env var)

---

## File Map

```
src/
├── routes/
│   ├── health.ts          # GET /api/health — DB connectivity check
│   ├── metrics.ts         # GET /api/metrics/* — KPI endpoints (5 sub-routes)
│   ├── alerts.ts          # GET /api/alerts — Evaluated alert rules
│   ├── wbr.ts             # GET /api/wbr — Auto-generated narrative
│   ├── connections.ts     # CRUD /api/connections — Connector management
│   └── jobs.ts            # GET /api/jobs — Pipeline job history
├── scheduler.ts           # BullMQ job definitions: hourly sync, daily marts
└── index.ts               # Fastify server setup, plugin registration
```

---

## Rules for This App

### Route Conventions
- All routes under `/api/` prefix
- Use Fastify schema validation on all routes (request params, query, body, response)
- Return consistent shape: `{ data: T }` for success, `{ error: { code, message } }` for errors
- Use appropriate HTTP status codes: 200, 201, 400, 404, 500
- Add `Content-Type: application/json` header (Fastify default)

### Schema Validation
```typescript
// ALWAYS define schemas like this:
const schema = {
  querystring: {
    type: 'object',
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 365, default: 7 }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { /* ... */ }
      }
    }
  }
};
```

### Database Access
- Import Prisma from `@growth-os/database`, never from `@prisma/client`
- Use `select` to limit fields on large queries
- Add database error handling with meaningful messages
- Use transactions for multi-step operations

### Scheduler (BullMQ)
- Hourly: Sync all active connectors
- Daily (2am UTC): Rebuild marts, run data quality checks, evaluate alerts
- Jobs are idempotent — safe to retry
- Log job start, completion, and failure with duration

### Security
- Validate and sanitize all query parameters
- Connector credentials encrypted with AES-256-GCM before storage
- Never return decrypted credentials in API responses
- Rate limit connection test endpoint (prevent abuse)

### Performance
- Cache KPI responses for 5 minutes (they query aggregated data)
- Use database indices on date columns and foreign keys
- Paginate job history responses

---

## Adding a New Route

1. Create `src/routes/{name}.ts`
2. Export route registration function: `export async function registerRoutes(app: FastifyInstance)`
3. Define Fastify schemas for all params/body/response
4. Import and register in `index.ts`
5. Add integration tests
6. Update the API reference in root CLAUDE.md and docs/
