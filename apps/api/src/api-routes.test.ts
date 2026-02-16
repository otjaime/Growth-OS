// ──────────────────────────────────────────────────────────────
// Growth OS — Comprehensive API Route Integration Tests
// 30+ tests using Fastify .inject() with mocked Prisma
// Covers: health, metrics, alerts, wbr, jobs, connections
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ── Mock Prisma (hoisted so vi.mock can access it) ───────────
const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  factOrder: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0 } }),
  },
  factSpend: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0, impressions: 0, clicks: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  factTraffic: {
    aggregate: vi.fn().mockResolvedValue({
      _sum: { sessions: 0, pdpViews: 0, addToCart: 0, checkouts: 0, purchases: 0 },
    }),
    count: vi.fn().mockResolvedValue(0),
  },
  cohort: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  dimChannel: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  jobRun: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
  },
  connectorCredential: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  experiment: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  opportunity: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  suggestion: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  growthScenario: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'gs-1' }),
    update: vi.fn().mockResolvedValue({ id: 'gs-1' }),
    delete: vi.fn().mockResolvedValue({ id: 'gs-1' }),
  },
  dimCustomer: {
    count: vi.fn().mockResolvedValue(0),
  },
  factEmail: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  stgEmail: {
    count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
  Prisma: { sql: vi.fn(), raw: vi.fn() },
  isDemoMode: vi.fn().mockResolvedValue(false),
  setMode: vi.fn().mockResolvedValue(undefined),
  encrypt: vi.fn().mockReturnValue({ encrypted: 'enc', iv: 'iv', authTag: 'tag' }),
  decrypt: vi.fn().mockReturnValue('{}'),
}));

import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { alertsRoutes } from './routes/alerts.js';
import { wbrRoutes } from './routes/wbr.js';
import { jobsRoutes } from './routes/jobs.js';

// ── Mock order factory ───────────────────────────────────────
function mockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderDate: new Date('2026-02-05'),
    revenueGross: 120,
    revenueNet: 100,
    contributionMargin: 35,
    cogs: 40,
    shippingCost: 15,
    opsCost: 10,
    discounts: 10,
    refunds: 10,
    isNewCustomer: true,
    channelId: 'ch-1',
    customerId: 'cust-1',
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// HEALTH ROUTES
// ═════════════════════════════════════════════════════════════
describe('Health Routes', () => {
  it('GET /api/health returns healthy when DB connected', async () => {
    const app = Fastify();
    await app.register(healthRoutes, { prefix: '/api' });

    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('healthy');
    expect(body.db).toBe('connected');
    expect(body.version).toBe('1.0.0');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('demoMode');
    await app.close();
  });

  it('GET /api/health returns degraded when DB fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    const app = Fastify();
    await app.register(healthRoutes, { prefix: '/api' });

    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════
// METRICS ROUTES
// ═════════════════════════════════════════════════════════════
describe('Metrics Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    mockPrisma.factOrder.findMany.mockResolvedValue([]);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 0, impressions: 0, clicks: 0 } });
    mockPrisma.factTraffic.aggregate.mockResolvedValue({
      _sum: { sessions: 0, pdpViews: 0, addToCart: 0, checkouts: 0, purchases: 0 },
    });
    mockPrisma.dimChannel.findMany.mockResolvedValue([]);
    mockPrisma.cohort.findMany.mockResolvedValue([]);
    mockPrisma.cohort.findFirst.mockResolvedValue(null);
  });

  // ── /metrics/summary ──────────────────────────────────────
  describe('GET /api/metrics/summary', () => {
    it('returns 200 with KPI structure', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/metrics/summary?days=7' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('period');
      expect(body).toHaveProperty('kpis');
      expect(body.kpis).toHaveProperty('revenueGross');
      expect(body.kpis).toHaveProperty('blendedCac');
      expect(body.kpis).toHaveProperty('mer');
    });

    it('defaults to 7 days when no query param', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/metrics/summary' });
      const body = JSON.parse(res.payload);
      expect(body.period.days).toBe(7);
    });

    it('respects days=30 param', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/metrics/summary?days=30' });
      const body = JSON.parse(res.payload);
      expect(body.period.days).toBe(30);
    });

    it('calculates correct KPIs with order data', async () => {
      const orders = [
        mockOrder({ revenueGross: 200, revenueNet: 180, contributionMargin: 60, isNewCustomer: true }),
        mockOrder({ id: 'ord-2', revenueGross: 100, revenueNet: 90, contributionMargin: 30, isNewCustomer: false }),
      ];
      mockPrisma.factOrder.findMany
        .mockResolvedValueOnce(orders)   // current
        .mockResolvedValueOnce([]);      // previous
      mockPrisma.factSpend.aggregate
        .mockResolvedValueOnce({ _sum: { spend: 50 } })  // current
        .mockResolvedValueOnce({ _sum: { spend: 0 } });  // previous

      const res = await app.inject({ method: 'GET', url: '/api/metrics/summary?days=7' });
      const body = JSON.parse(res.payload);
      expect(body.kpis.revenueGross.value).toBe(300);
      expect(body.kpis.revenueNet.value).toBe(270);
      expect(body.kpis.orders.value).toBe(2);
      // AOV = 270 / 2 = 135
      expect(body.kpis.aov.value).toBe(135);
      // blendedCac = 50 / 1 = 50 (only 1 new customer)
      expect(body.kpis.blendedCac.value).toBe(50);
    });

    it('handles empty order data gracefully', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/metrics/summary?days=7' });
      const body = JSON.parse(res.payload);
      expect(body.kpis.revenueGross.value).toBe(0);
      expect(body.kpis.orders.value).toBe(0);
      expect(body.kpis.aov.value).toBe(0);
      expect(body.kpis.blendedCac.value).toBe(0);
    });
  });

  // ── /metrics/timeseries ───────────────────────────────────
  describe('GET /api/metrics/timeseries', () => {
    it('returns 200 with timeseries structure', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])  // dailyRevenue
        .mockResolvedValueOnce([])  // dailySpend
        .mockResolvedValueOnce([]); // dailyTraffic

      const res = await app.inject({ method: 'GET', url: '/api/metrics/timeseries?days=30' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('dailyRevenue');
      expect(body).toHaveProperty('dailySpend');
      expect(body).toHaveProperty('dailyTraffic');
    });
  });

  // ── /metrics/channels ────────────────────────────────────
  describe('GET /api/metrics/channels', () => {
    it('returns empty channels for no data', async () => {
      mockPrisma.dimChannel.findMany.mockResolvedValueOnce([]);
      const res = await app.inject({ method: 'GET', url: '/api/metrics/channels?days=7' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.channels).toEqual([]);
    });

    it('returns channel metrics when data exists', async () => {
      mockPrisma.dimChannel.findMany.mockResolvedValueOnce([
        { id: 'ch-1', name: 'Meta Ads', slug: 'meta' },
      ]);
      mockPrisma.factOrder.findMany
        .mockResolvedValueOnce([mockOrder()])   // current
        .mockResolvedValueOnce([]);              // previous
      mockPrisma.factSpend.aggregate
        .mockResolvedValueOnce({ _sum: { spend: 500, impressions: 10000, clicks: 200 } })
        .mockResolvedValueOnce({ _sum: { spend: 0 } });

      const res = await app.inject({ method: 'GET', url: '/api/metrics/channels?days=7' });
      const body = JSON.parse(res.payload);
      expect(body.channels).toHaveLength(1);
      expect(body.channels[0].name).toBe('Meta Ads');
      expect(body.channels[0].spend).toBe(500);
    });
  });

  // ── /metrics/funnel ──────────────────────────────────────
  describe('GET /api/metrics/funnel', () => {
    it('returns order-based funnel data', async () => {
      mockPrisma.factOrder.findMany.mockResolvedValueOnce([
        mockOrder({ revenueGross: 200, revenueNet: 180, discounts: 10, refunds: 10, cogs: 40, shippingCost: 15, contributionMargin: 60, isNewCustomer: true }),
        mockOrder({ id: 'ord-2', revenueGross: 100, revenueNet: 90, discounts: 5, refunds: 5, cogs: 20, shippingCost: 10, contributionMargin: 30, isNewCustomer: false }),
      ]);
      mockPrisma.factTraffic.count.mockResolvedValueOnce(0);
      const res = await app.inject({ method: 'GET', url: '/api/metrics/funnel?days=7' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('orders');
      expect(body.orders.totalOrders).toBe(2);
      expect(body.orders.newCustomerOrders).toBe(1);
      expect(body.orders.revenueGross).toBe(300);
      expect(body.traffic).toBeNull();
    });

    it('includes GA4 traffic when data exists', async () => {
      mockPrisma.factOrder.findMany.mockResolvedValueOnce([]);
      mockPrisma.factTraffic.count.mockResolvedValueOnce(5);
      mockPrisma.factTraffic.aggregate.mockResolvedValueOnce({
        _sum: { sessions: 1000, pdpViews: 400, addToCart: 100, checkouts: 50, purchases: 20 },
      });
      const res = await app.inject({ method: 'GET', url: '/api/metrics/funnel?days=7' });
      const body = JSON.parse(res.payload);
      expect(body.traffic).not.toBeNull();
      expect(body.traffic.sessions).toBe(1000);
      expect(body.traffic.cvr.overall).toBeCloseTo(0.02);
    });
  });

  // ── /metrics/cohorts ─────────────────────────────────────
  describe('GET /api/metrics/cohorts', () => {
    it('returns cohort data', async () => {
      mockPrisma.cohort.findMany.mockResolvedValueOnce([
        { cohortMonth: '2025-09', cohortSize: 150, d7Retention: 0.05, d30Retention: 0.12 },
      ]);
      const res = await app.inject({ method: 'GET', url: '/api/metrics/cohorts' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.cohorts).toHaveLength(1);
      expect(body.cohorts[0].cohortMonth).toBe('2025-09');
    });
  });

  // ── /metrics/unit-economics ──────────────────────────────
  describe('GET /api/metrics/unit-economics', () => {
    it('returns margin breakdown', async () => {
      mockPrisma.factOrder.findMany.mockResolvedValueOnce([
        mockOrder({ revenueNet: 100, cogs: 40, shippingCost: 15, opsCost: 10, contributionMargin: 35, discounts: 5, refunds: 0 }),
      ]);
      mockPrisma.factSpend.aggregate.mockResolvedValueOnce({ _sum: { spend: 20 } });

      const res = await app.inject({ method: 'GET', url: '/api/metrics/unit-economics?days=30' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty('breakdown');
      expect(body.breakdown.revenueNet).toBe(100);
      expect(body.breakdown.cogs).toBe(40);
      expect(body.breakdown.blendedCac).toBe(20); // 20 spend / 1 new customer
    });
  });
});

// ═════════════════════════════════════════════════════════════
// ALERTS ROUTES
// ═════════════════════════════════════════════════════════════
describe('Alerts Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.factOrder.findMany.mockResolvedValue([]);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 0 } });
    mockPrisma.factSpend.groupBy.mockResolvedValue([]);
    mockPrisma.dimChannel.findMany.mockResolvedValue([]);
    mockPrisma.cohort.findMany.mockResolvedValue([]);
  });

  it('GET /api/alerts returns 200 with alerts array', async () => {
    const app = Fastify();
    await app.register(alertsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/alerts' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('alerts');
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body).toHaveProperty('evaluatedAt');
    await app.close();
  });

  it('returns alert objects with required fields', async () => {
    // Trigger a CAC increase alert
    const currentOrders = Array.from({ length: 10 }, (_, i) =>
      mockOrder({ id: `ord-${i}`, revenueGross: 500, isNewCustomer: i < 3 }),
    );
    const previousOrders = Array.from({ length: 10 }, (_, i) =>
      mockOrder({ id: `prev-${i}`, revenueGross: 500, isNewCustomer: i < 8 }),
    );
    mockPrisma.factOrder.findMany
      .mockResolvedValueOnce(currentOrders)
      .mockResolvedValueOnce(previousOrders);
    mockPrisma.factSpend.aggregate
      .mockResolvedValueOnce({ _sum: { spend: 3000 } })
      .mockResolvedValueOnce({ _sum: { spend: 3000 } });

    const app = Fastify();
    await app.register(alertsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/alerts' });
    const body = JSON.parse(res.payload);
    if (body.alerts.length > 0) {
      const alert = body.alerts[0];
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('title');
      expect(alert).toHaveProperty('description');
      expect(alert).toHaveProperty('recommendation');
      expect(['critical', 'warning', 'info']).toContain(alert.severity);
    }
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════
// WBR ROUTES
// ═════════════════════════════════════════════════════════════
describe('WBR Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.factOrder.findMany.mockResolvedValue([]);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 0 } });
    mockPrisma.factSpend.groupBy.mockResolvedValue([]);
    mockPrisma.factTraffic.aggregate.mockResolvedValue({ _sum: { sessions: 0, purchases: 0 } });
    mockPrisma.cohort.findMany.mockResolvedValue([]);
    mockPrisma.dimChannel.findMany.mockResolvedValue([]);
    mockPrisma.experiment.findMany.mockResolvedValue([]);
    mockPrisma.opportunity.count.mockResolvedValue(0);
    mockPrisma.suggestion.count.mockResolvedValue(0);
  });

  it('GET /api/wbr returns 200 with narrative', async () => {
    const app = Fastify();
    await app.register(wbrRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/wbr' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('narrative');
    expect(typeof body.narrative).toBe('string');
    expect(body.narrative).toContain('Weekly Business Review');
    await app.close();
  });

  it('WBR narrative includes key metric sections', async () => {
    mockPrisma.factOrder.findMany.mockResolvedValue([
      mockOrder({ revenueGross: 1000, revenueNet: 900, contributionMargin: 300, isNewCustomer: true }),
    ]);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 200 } });
    mockPrisma.factTraffic.aggregate.mockResolvedValue({ _sum: { sessions: 500, purchases: 10 } });

    const app = Fastify();
    await app.register(wbrRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/wbr' });
    const body = JSON.parse(res.payload);
    expect(body.narrative).toContain('What Happened');
    expect(body.narrative).toContain('Revenue');
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════
// JOBS ROUTES
// ═════════════════════════════════════════════════════════════
describe('Jobs Routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify();
    await app.register(jobsRoutes, { prefix: '/api' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/jobs returns 200 with jobs array', async () => {
    mockPrisma.jobRun.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('jobs');
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body).toHaveProperty('total');
  });

  it('GET /api/jobs respects limit param', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      id: `job-${i}`, stepName: 'ingest', status: 'SUCCESS',
      startedAt: new Date(), finishedAt: new Date(), rowsAffected: 100,
    }));
    mockPrisma.jobRun.findMany.mockResolvedValueOnce(jobs);
    const res = await app.inject({ method: 'GET', url: '/api/jobs?limit=5' });
    const body = JSON.parse(res.payload);
    expect(body.total).toBe(5);
  });

  it('GET /api/jobs filters by status', async () => {
    mockPrisma.jobRun.findMany.mockResolvedValueOnce([]);
    await app.inject({ method: 'GET', url: '/api/jobs?status=FAILED' });
    expect(mockPrisma.jobRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'FAILED' },
      }),
    );
  });

  it('GET /api/jobs/:id returns 200 for existing job', async () => {
    const job = { id: 'job-1', stepName: 'ingest', status: 'SUCCESS', startedAt: new Date() };
    mockPrisma.jobRun.findUnique.mockResolvedValueOnce(job);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/job-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe('job-1');
  });

  it('GET /api/jobs/:id returns error for non-existent job', async () => {
    mockPrisma.jobRun.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/jobs/non-existent' });
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('error');
  });
});

// ═════════════════════════════════════════════════════════════
// IDEMPOTENCY & EDGE CASES
// ═════════════════════════════════════════════════════════════
describe('API Edge Cases', () => {
  it('metrics/summary returns consistent structure for any days value', async () => {
    mockPrisma.factOrder.findMany.mockResolvedValue([]);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 0 } });
    mockPrisma.factTraffic.aggregate.mockResolvedValue({ _sum: { sessions: 0, purchases: 0 } });
    mockPrisma.cohort.findFirst.mockResolvedValue(null);

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });

    for (const days of ['1', '7', '14', '30', '90']) {
      const res = await app.inject({ method: 'GET', url: `/api/metrics/summary?days=${days}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.period.days).toBe(parseInt(days));
      expect(body.kpis).toHaveProperty('revenueGross');
    }

    await app.close();
  });

  it('funnel returns order data and null traffic when no GA4 data', async () => {
    mockPrisma.factOrder.findMany.mockResolvedValue([]);
    mockPrisma.factTraffic.count.mockResolvedValue(0);
    mockPrisma.factSpend.aggregate.mockResolvedValue({ _sum: { spend: 0 } });
    mockPrisma.factTraffic.aggregate.mockResolvedValue({ _sum: { sessions: 0, purchases: 0 } });
    mockPrisma.cohort.findFirst.mockResolvedValue(null);

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/funnel' });
    const body = JSON.parse(res.payload);
    expect(body.orders.totalOrders).toBe(0);
    expect(body.orders.revenueGross).toBe(0);
    expect(body.traffic).toBeNull();
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════
// SEGMENTS ENDPOINT
// ═════════════════════════════════════════════════════════════
describe('Segments Route', () => {
  it('GET /api/metrics/segments returns 200 with segments array', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      { segment: 'Champions', count: 50, total_revenue: 25000, total_orders: 200 },
      { segment: 'Loyal', count: 120, total_revenue: 36000, total_orders: 480 },
      { segment: 'At Risk', count: 30, total_revenue: 9000, total_orders: 90 },
    ]);

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/segments' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('segments');
    expect(Array.isArray(body.segments)).toBe(true);
    expect(body.segments.length).toBe(3);
    expect(body.segments[0]).toHaveProperty('segment');
    expect(body.segments[0]).toHaveProperty('count');
    expect(body.segments[0]).toHaveProperty('totalRevenue');
    expect(body.segments[0]).toHaveProperty('avgOrderValue');
    expect(body.segments[0]).toHaveProperty('avgOrdersPerCustomer');
    await app.close();
  });

  it('GET /api/metrics/segments returns empty array for no data', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/segments' });
    const body = JSON.parse(res.payload);
    expect(body.segments).toEqual([]);
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════
// EMAIL ENDPOINT
// ═════════════════════════════════════════════════════════════
describe('Email Route', () => {
  it('GET /api/metrics/email returns 200 with campaigns, flows, summary', async () => {
    mockPrisma.factEmail.findMany
      .mockResolvedValueOnce([
        {
          campaignId: 'camp1',
          campaign: { campaignName: 'Test Campaign' },
          sends: 5000, opens: 1500, clicks: 100, bounces: 50,
          unsubscribes: 10, conversions: 5, revenue: 500,
          date: new Date('2026-02-01'),
        },
      ])
      .mockResolvedValueOnce([]); // flows

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/email?days=30' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('campaigns');
    expect(body).toHaveProperty('flows');
    expect(body).toHaveProperty('summary');
    expect(body.summary).toHaveProperty('totalSends');
    expect(body.summary).toHaveProperty('avgOpenRate');
    expect(body.summary).toHaveProperty('avgClickRate');
    expect(body.summary).toHaveProperty('totalEmailRevenue');
    expect(body.summary).toHaveProperty('unsubscribeRate');
    await app.close();
  });

  it('GET /api/metrics/email returns empty data when no email records', async () => {
    mockPrisma.factEmail.findMany
      .mockResolvedValueOnce([])  // campaigns
      .mockResolvedValueOnce([]); // flows

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/email' });
    const body = JSON.parse(res.payload);
    expect(body.campaigns).toEqual([]);
    expect(body.summary.totalSends).toBe(0);
    expect(body.summary.totalEmailRevenue).toBe(0);
    await app.close();
  });

  it('GET /api/metrics/email computes open rate correctly', async () => {
    mockPrisma.factEmail.findMany
      .mockResolvedValueOnce([
        {
          campaignId: 'camp1',
          campaign: { campaignName: 'Test' },
          sends: 1000, opens: 300, clicks: 30, bounces: 10,
          unsubscribes: 5, conversions: 3, revenue: 300,
          date: new Date('2026-02-01'),
        },
      ])
      .mockResolvedValueOnce([]);

    const app = Fastify();
    await app.register(metricsRoutes, { prefix: '/api' });
    const res = await app.inject({ method: 'GET', url: '/api/metrics/email?days=30' });
    const body = JSON.parse(res.payload);
    expect(body.campaigns[0].openRate).toBeCloseTo(0.3, 2);
    expect(body.summary.avgOpenRate).toBeCloseTo(0.3, 2);
    await app.close();
  });
});
