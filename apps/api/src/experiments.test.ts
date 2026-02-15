// ──────────────────────────────────────────────────────────────
// Growth OS — Experiments Route Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';

const mockPrisma = vi.hoisted(() => ({
  experiment: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  experimentMetric: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
}));

import { experimentsRoutes } from './routes/experiments.js';

function mockExperiment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    name: 'Test UGC video ads',
    hypothesis: 'UGC videos will improve CTR by 20%',
    status: 'IDEA',
    channel: 'meta',
    primaryMetric: 'conversion_rate',
    targetLift: 20,
    reach: 7,
    impact: 8,
    confidence: 6,
    effort: 4,
    riceScore: 84,
    startDate: null,
    endDate: null,
    result: null,
    learnings: null,
    nextSteps: null,
    createdAt: new Date('2026-02-15'),
    updatedAt: new Date('2026-02-15'),
    ...overrides,
  };
}

describe('Experiments Routes', () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // Register routes once
  it('registers without error', async () => {
    await app.register(experimentsRoutes, { prefix: '/api' });
    await app.ready();
  });

  // ── LIST ──────────────────────────────────────────────────
  it('GET /api/experiments returns empty list', async () => {
    mockPrisma.experiment.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/experiments' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.experiments).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('GET /api/experiments?status=BACKLOG filters by status', async () => {
    mockPrisma.experiment.findMany.mockResolvedValueOnce([
      mockExperiment({ status: 'BACKLOG' }),
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/experiments?status=BACKLOG' });
    const body = JSON.parse(res.payload);
    expect(body.experiments).toHaveLength(1);
    expect(mockPrisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'BACKLOG' } }),
    );
  });

  // ── CREATE ────────────────────────────────────────────────
  it('POST /api/experiments creates with required fields', async () => {
    const created = mockExperiment();
    mockPrisma.experiment.create.mockResolvedValueOnce(created);

    const res = await app.inject({
      method: 'POST',
      url: '/api/experiments',
      payload: {
        name: 'Test UGC video ads',
        hypothesis: 'UGC videos will improve CTR by 20%',
        primaryMetric: 'conversion_rate',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Test UGC video ads');
  });

  it('POST /api/experiments returns 400 without required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/experiments',
      payload: { name: 'Test' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('required');
  });

  it('POST /api/experiments auto-computes RICE score', async () => {
    mockPrisma.experiment.create.mockImplementationOnce(({ data }: { data: Record<string, unknown> }) => {
      return Promise.resolve({ ...data, id: 'exp-new', createdAt: new Date(), updatedAt: new Date() });
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/experiments',
      payload: {
        name: 'RICE test',
        hypothesis: 'Testing RICE computation',
        primaryMetric: 'cac',
        reach: 8,
        impact: 9,
        confidence: 7,
        effort: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    // Verify create was called with computed riceScore = (8*9*7)/3 = 168
    expect(mockPrisma.experiment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ riceScore: 168 }),
      }),
    );
  });

  // ── GET single ────────────────────────────────────────────
  it('GET /api/experiments/:id returns experiment with metrics', async () => {
    mockPrisma.experiment.findUnique.mockResolvedValueOnce({
      ...mockExperiment(),
      metrics: [],
    });
    const res = await app.inject({ method: 'GET', url: '/api/experiments/exp-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('Test UGC video ads');
  });

  it('GET /api/experiments/:id returns 404 for missing', async () => {
    mockPrisma.experiment.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/experiments/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  // ── STATUS transition ─────────────────────────────────────
  it('PATCH /api/experiments/:id/status transitions IDEA → BACKLOG', async () => {
    mockPrisma.experiment.findUnique.mockResolvedValueOnce(mockExperiment({ status: 'IDEA' }));
    mockPrisma.experiment.update.mockResolvedValueOnce(mockExperiment({ status: 'BACKLOG' }));

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/experiments/exp-1/status',
      payload: { status: 'BACKLOG' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('BACKLOG');
  });

  it('PATCH /api/experiments/:id/status rejects invalid transition', async () => {
    mockPrisma.experiment.findUnique.mockResolvedValueOnce(mockExperiment({ status: 'COMPLETED' }));

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/experiments/exp-1/status',
      payload: { status: 'RUNNING' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Cannot transition');
  });

  // ── DELETE ────────────────────────────────────────────────
  it('DELETE /api/experiments/:id deletes experiment', async () => {
    mockPrisma.experiment.findUnique.mockResolvedValueOnce(mockExperiment());
    mockPrisma.experiment.delete.mockResolvedValueOnce({});

    const res = await app.inject({ method: 'DELETE', url: '/api/experiments/exp-1' });
    expect(res.statusCode).toBe(204);
  });
});
