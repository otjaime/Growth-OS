// ──────────────────────────────────────────────────────────────
// Growth OS — Suggestions Route Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';

const mockPrisma = vi.hoisted(() => ({
  opportunity: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  suggestion: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  suggestionFeedback: {
    create: vi.fn().mockResolvedValue({}),
  },
  experiment: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
  },
  factOrder: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  factSpend: {
    aggregate: vi.fn().mockResolvedValue({ _sum: { spend: 0 } }),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  factTraffic: {
    aggregate: vi.fn().mockResolvedValue({
      _sum: { sessions: 0, pdpViews: 0, addToCart: 0, checkouts: 0, purchases: 0 },
    }),
  },
  dimChannel: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  cohort: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('./lib/ai.js', () => ({
  isAIConfigured: vi.fn().mockReturnValue(false),
}));

import { suggestionsRoutes } from './routes/suggestions.js';

function mockSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    opportunityId: 'opp-1',
    type: 'RULE_BASED',
    title: 'Shift budget to Google Brand',
    hypothesis: 'If we reallocate 20% of Meta spend to Google Brand, MER will improve by 15%',
    suggestedChannel: 'google_ads',
    suggestedMetric: 'mer',
    suggestedTargetLift: 15,
    impactScore: 7,
    confidenceScore: 8,
    effortScore: 3,
    riskScore: 2,
    reasoning: 'Google Brand converts at lower CAC.',
    status: 'PENDING',
    feedback: [],
    createdAt: new Date('2026-02-15'),
    updatedAt: new Date('2026-02-15'),
    ...overrides,
  };
}

function mockOpportunity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'opp-1',
    type: 'EFFICIENCY_DROP',
    title: 'Marketing efficiency declining',
    description: 'MER decreased significantly WoW',
    priority: 85,
    status: 'NEW',
    signalsJson: [],
    suggestions: [],
    createdAt: new Date('2026-02-15'),
    updatedAt: new Date('2026-02-15'),
    ...overrides,
  };
}

describe('Suggestions Routes', () => {
  const app = Fastify();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // Register routes once
  it('registers without error', async () => {
    await app.register(suggestionsRoutes, { prefix: '/api' });
    await app.ready();
  });

  // ── POST /signals/detect ────────────────────────────────────
  it('POST /api/signals/detect returns signals array', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/signals/detect' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('signals');
    expect(body).toHaveProperty('evaluatedAt');
    expect(Array.isArray(body.signals)).toBe(true);
  });

  // ── GET /opportunities ──────────────────────────────────────
  it('GET /api/opportunities returns empty list', async () => {
    mockPrisma.opportunity.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/opportunities' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.opportunities).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('GET /api/opportunities?status=NEW filters by status', async () => {
    mockPrisma.opportunity.findMany.mockResolvedValueOnce([mockOpportunity()]);
    const res = await app.inject({ method: 'GET', url: '/api/opportunities?status=NEW' });
    const body = JSON.parse(res.payload);
    expect(body.opportunities).toHaveLength(1);
    expect(mockPrisma.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'NEW' } }),
    );
  });

  // ── GET /suggestions ────────────────────────────────────────
  it('GET /api/suggestions returns suggestions list', async () => {
    mockPrisma.suggestion.findMany.mockResolvedValueOnce([mockSuggestion()]);
    const res = await app.inject({ method: 'GET', url: '/api/suggestions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.suggestions).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/suggestions?status=PENDING filters by status', async () => {
    mockPrisma.suggestion.findMany.mockResolvedValueOnce([mockSuggestion()]);
    const res = await app.inject({ method: 'GET', url: '/api/suggestions?status=PENDING' });
    const body = JSON.parse(res.payload);
    expect(body.suggestions).toHaveLength(1);
    expect(mockPrisma.suggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' } }),
    );
  });

  // ── POST /suggestions/:id/feedback ──────────────────────────
  it('POST /api/suggestions/:id/feedback approves suggestion', async () => {
    mockPrisma.suggestion.findUnique.mockResolvedValueOnce(mockSuggestion());
    mockPrisma.suggestion.update.mockResolvedValueOnce(mockSuggestion({ status: 'APPROVED' }));
    mockPrisma.suggestionFeedback.create.mockResolvedValueOnce({
      id: 'fb-1',
      action: 'APPROVE',
      notes: null,
    });
    mockPrisma.opportunity.update.mockResolvedValueOnce(mockOpportunity({ status: 'REVIEWED' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/sug-1/feedback',
      payload: { action: 'approve' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('suggestion');
    expect(body).toHaveProperty('feedback');
  });

  it('POST /api/suggestions/:id/feedback rejects suggestion', async () => {
    mockPrisma.suggestion.findUnique.mockResolvedValueOnce(mockSuggestion());
    mockPrisma.suggestion.update.mockResolvedValueOnce(mockSuggestion({ status: 'REJECTED' }));
    mockPrisma.suggestionFeedback.create.mockResolvedValueOnce({
      id: 'fb-2',
      action: 'REJECT',
      notes: 'Not relevant',
    });
    mockPrisma.opportunity.update.mockResolvedValueOnce(mockOpportunity({ status: 'REVIEWED' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/sug-1/feedback',
      payload: { action: 'reject', notes: 'Not relevant' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/suggestions/:id/feedback returns 400 for invalid action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/sug-1/feedback',
      payload: { action: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/suggestions/:id/feedback returns 404 for missing suggestion', async () => {
    mockPrisma.suggestion.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/nonexistent/feedback',
      payload: { action: 'approve' },
    });
    expect(res.statusCode).toBe(404);
  });

  // ── POST /suggestions/:id/promote ───────────────────────────
  it('POST /api/suggestions/:id/promote creates experiment', async () => {
    const sug = mockSuggestion({ opportunity: mockOpportunity() });
    mockPrisma.suggestion.findUnique.mockResolvedValueOnce(sug);
    mockPrisma.experiment.create.mockResolvedValueOnce({
      id: 'exp-promoted',
      name: sug.title,
      status: 'IDEA',
    });
    mockPrisma.suggestion.update.mockResolvedValueOnce({ ...sug, status: 'PROMOTED' });
    mockPrisma.suggestionFeedback.create.mockResolvedValueOnce({
      id: 'fb-3',
      action: 'PROMOTE',
      promotedExperimentId: 'exp-promoted',
    });
    mockPrisma.opportunity.update.mockResolvedValueOnce(mockOpportunity({ status: 'ACTED' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/sug-1/promote',
      payload: { notes: 'Looks promising' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('experiment');
    expect(body).toHaveProperty('feedback');
    expect(body.experiment.id).toBe('exp-promoted');
  });

  it('POST /api/suggestions/:id/promote returns 404 for missing', async () => {
    mockPrisma.suggestion.findUnique.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/suggestions/nonexistent/promote',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
