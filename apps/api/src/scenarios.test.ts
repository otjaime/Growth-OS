// ──────────────────────────────────────────────────────────────
// Growth OS — Growth Model API Route Tests
// Tests CRUD, compute, and baseline endpoints
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ── Mock Prisma ──────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  growthScenario: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'gs-1', ...args.data, createdAt: new Date(), updatedAt: new Date() })
    ),
    update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'gs-1', ...args.data, updatedAt: new Date() })
    ),
    delete: vi.fn().mockResolvedValue({ id: 'gs-1' }),
  },
  factSpend: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0 } }),
  },
  factOrder: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { revenueNet: 0, cogs: 0 }, _count: { _all: 0 } }),
  },
  factTraffic: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { sessions: 0, purchases: 0 } }),
  },
  cohort: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  dimCustomer: {
    count: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
}));

import { growthModelRoutes } from './routes/growth-model.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  await app.register(growthModelRoutes, { prefix: '/api' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── LIST scenarios ───────────────────────────────────────────
describe('GET /api/growth-model/scenarios', () => {
  it('returns empty list when no scenarios', async () => {
    mockPrisma.growthScenario.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/growth-model/scenarios' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.scenarios).toEqual([]);
  });

  it('returns saved scenarios', async () => {
    mockPrisma.growthScenario.findMany.mockResolvedValueOnce([
      { id: 'gs-1', name: 'Test', projectedRevenue: 100000 },
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/growth-model/scenarios' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.scenarios).toHaveLength(1);
    expect(body.scenarios[0].name).toBe('Test');
  });
});

// ── CREATE scenario ──────────────────────────────────────────
describe('POST /api/growth-model/scenarios', () => {
  it('creates a scenario with valid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/growth-model/scenarios',
      payload: {
        name: 'Test Scenario',
        monthlyBudget: 10000,
        targetCac: 50,
        expectedCvr: 0.025,
        avgOrderValue: 100,
        cogsPercent: 0.40,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.growthScenario.create).toHaveBeenCalledOnce();
  });

  it('returns 400 when missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/growth-model/scenarios',
      payload: { name: 'Incomplete' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET single scenario ──────────────────────────────────────
describe('GET /api/growth-model/scenarios/:id', () => {
  it('returns 404 for non-existent scenario', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/growth-model/scenarios/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns scenario with monthly breakdown', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce({
      id: 'gs-1',
      name: 'Test',
      monthlyBudget: 10000,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 100,
      cogsPercent: 0.40,
      returnRate: 0,
      avgOrdersPerCustomer: 1.0,
      horizonMonths: 3,
      monthlyTraffic: null,
    });
    const res = await app.inject({ method: 'GET', url: '/api/growth-model/scenarios/gs-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.monthlyBreakdown).toHaveLength(3);
    expect(body.id).toBe('gs-1');
  });
});

// ── UPDATE scenario ──────────────────────────────────────────
describe('PUT /api/growth-model/scenarios/:id', () => {
  it('returns 404 for non-existent scenario', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/growth-model/scenarios/nonexistent',
      payload: { monthlyBudget: 20000 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('updates and recomputes outputs', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce({
      id: 'gs-1',
      name: 'Old',
      monthlyBudget: 10000,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 100,
      cogsPercent: 0.40,
      returnRate: 0,
      avgOrdersPerCustomer: 1.0,
      horizonMonths: 3,
      monthlyTraffic: null,
      isBaseline: false,
      description: null,
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/growth-model/scenarios/gs-1',
      payload: { monthlyBudget: 20000 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.growthScenario.update).toHaveBeenCalledOnce();
    const createCallData = mockPrisma.growthScenario.update.mock.calls[0]![0].data;
    expect(createCallData.monthlyBudget).toBe(20000);
  });
});

// ── DELETE scenario ──────────────────────────────────────────
describe('DELETE /api/growth-model/scenarios/:id', () => {
  it('returns 404 for non-existent scenario', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/api/growth-model/scenarios/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes existing scenario', async () => {
    mockPrisma.growthScenario.findUnique.mockResolvedValueOnce({ id: 'gs-1' });
    const res = await app.inject({ method: 'DELETE', url: '/api/growth-model/scenarios/gs-1' });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.growthScenario.delete).toHaveBeenCalledWith({ where: { id: 'gs-1' } });
  });
});

// ── COMPUTE (stateless) ──────────────────────────────────────
describe('POST /api/growth-model/compute', () => {
  it('returns computed projections without DB write', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/growth-model/compute',
      payload: {
        monthlyBudget: 10000,
        targetCac: 50,
        expectedCvr: 0.025,
        avgOrderValue: 100,
        cogsPercent: 0.40,
        horizonMonths: 3,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.projectedRevenue).toBeGreaterThan(0);
    expect(body.monthlyBreakdown).toHaveLength(3);
    // No DB write
    expect(mockPrisma.growthScenario.create).not.toHaveBeenCalled();
  });

  it('returns 400 when missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/growth-model/compute',
      payload: { monthlyBudget: 10000 },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── BASELINE ─────────────────────────────────────────────────
describe('GET /api/growth-model/baseline', () => {
  it('returns baseline with default values when no data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/growth-model/baseline' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.baseline).toBeDefined();
    expect(body.baseline.monthlyBudget).toBeGreaterThan(0);
    expect(body.monthlyBreakdown).toBeDefined();
  });
});
