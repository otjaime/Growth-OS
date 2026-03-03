// ──────────────────────────────────────────────────────────────
// Growth OS — Autopilot Route Tests
// Tests Meta ad listing, campaign tree, stats, and sync endpoints
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ── Mock Prisma ──────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  metaAdAccount: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: 'acc-1', adAccountId: 'act_demo_123' }),
  },
  metaCampaign: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: 'camp-1', campaignId: 'meta_camp_001' }),
  },
  metaAdSet: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: 'adset-1', adSetId: 'meta_adset_001' }),
  },
  metaAd: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: 'ad-1', adId: 'meta_ad_001' }),
  },
  jobRun: {
    create: vi.fn().mockResolvedValue({ id: 'job-1', startedAt: new Date() }),
    update: vi.fn().mockResolvedValue({}),
  },
  connectorCredential: {
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  diagnosis: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  adVariant: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  organization: {
    findUnique: vi.fn().mockResolvedValue({ id: 'org-1', plan: 'STARTER' }),
    findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }),
    create: vi.fn().mockResolvedValue({ id: 'org-auto' }),
  },
  diagnosisFeedback: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
}));

const mockIsDemoMode = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@growth-os/database', () => ({
  prisma: mockPrisma,
  isDemoMode: mockIsDemoMode,
  decrypt: vi.fn().mockReturnValue('{}'),
  DiagnosisStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    EXECUTED: 'EXECUTED',
    DISMISSED: 'DISMISSED',
    EXPIRED: 'EXPIRED',
  },
}));

vi.mock('../jobs/sync-meta-ads.js', () => ({
  syncMetaAds: vi.fn().mockResolvedValue({
    accountsUpserted: 1,
    campaignsUpserted: 3,
    adSetsUpserted: 5,
    adsUpserted: 10,
    durationMs: 1234,
  }),
}));

vi.mock('../jobs/run-diagnosis.js', () => ({
  runDiagnosis: vi.fn().mockResolvedValue({
    adsEvaluated: 10,
    diagnosesCreated: 3,
    diagnosesUpdated: 1,
    diagnosesExpired: 0,
    durationMs: 456,
  }),
}));

vi.mock('../lib/copy-generator.js', () => ({
  generateCopyVariants: vi.fn().mockResolvedValue([
    { angle: 'benefit', headline: 'Transform Your Routine', primaryText: 'Discover the difference our products make.', description: 'Shop now' },
    { angle: 'pain_point', headline: 'Tired of Low Results?', primaryText: 'Stop wasting money on ads that don\'t convert.', description: 'Fix it today' },
    { angle: 'urgency', headline: 'Last Chance — 30% Off', primaryText: 'Sale ends tonight. Don\'t miss this deal.', description: 'Limited time' },
  ]),
}));

// Plan guard removed from autopilot routes — no mock needed

vi.mock('../jobs/execute-action.js', () => ({
  executeAction: vi.fn().mockResolvedValue({
    success: true,
    diagnosisId: 'diag-1',
    actionType: 'PAUSE_AD',
    executionResult: { success: true, metaResponse: { success: true } },
  }),
}));

vi.mock('../lib/ai.js', () => ({
  isAIConfigured: vi.fn().mockReturnValue(true),
  getClient: vi.fn(),
}));

import { autopilotRoutes } from './autopilot.js';

function mockAd(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ad-1',
    adId: 'meta_ad_001',
    name: 'TOF Broad — Lifestyle Video',
    status: 'ACTIVE',
    organizationId: null,
    accountId: 'acc-1',
    campaignId: 'camp-1',
    adSetId: 'adset-1',
    headline: 'Shop the Collection',
    primaryText: 'Discover our best-selling products...',
    description: 'Shop now',
    imageUrl: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    callToAction: 'SHOP_NOW',
    creativeType: 'VIDEO',
    spend7d: 250.00,
    impressions7d: 15000,
    clicks7d: 450,
    conversions7d: 12,
    revenue7d: 1080.00,
    roas7d: 4.32,
    ctr7d: 0.03,
    cpc7d: 0.56,
    frequency7d: 2.5,
    spend14d: 200.00,
    impressions14d: 12000,
    clicks14d: 400,
    conversions14d: 14,
    revenue14d: 1120.00,
    roas14d: 5.6,
    ctr14d: 0.0333,
    cpc14d: 0.5,
    frequency14d: 2.0,
    lastSyncAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    campaign: { id: 'camp-1', name: 'PROS_TOF_Broad', campaignId: 'meta_camp_001', status: 'ACTIVE', objective: 'CONVERSIONS' },
    adSet: { id: 'adset-1', name: 'Broad — US 25-54 F', adSetId: 'meta_adset_001', status: 'ACTIVE', dailyBudget: 150 },
    ...overrides,
  };
}

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify();
  await app.register(autopilotRoutes, { prefix: '/api' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock values cleared by clearAllMocks
  mockIsDemoMode.mockResolvedValue(true);
  // Reset + restore defaults to clear any lingering mockResolvedValueOnce queues
  mockPrisma.organization.findFirst.mockReset();
  mockPrisma.organization.findFirst.mockResolvedValue({ id: 'org-1' });
  mockPrisma.organization.findUnique.mockReset();
  mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: 'STARTER' });
  mockPrisma.diagnosis.findFirst.mockReset();
  mockPrisma.diagnosis.findFirst.mockResolvedValue(null);
});

// ── List Ads ──────────────────────────────────────────────────
describe('GET /api/autopilot/ads', () => {
  it('returns empty list when no ads', async () => {
    mockPrisma.metaAd.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/ads' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ads).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns ads with trends computed', async () => {
    mockPrisma.metaAd.findMany.mockResolvedValueOnce([mockAd()]);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/ads' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ads).toHaveLength(1);
    expect(body.ads[0].trends).toBeDefined();
    // spend went from 200 → 250 = +25%
    expect(body.ads[0].trends.spendChange).toBeCloseTo(0.25, 2);
  });

  it('filters by status', async () => {
    mockPrisma.metaAd.findMany.mockResolvedValueOnce([]);
    await app.inject({ method: 'GET', url: '/api/autopilot/ads?status=PAUSED' });
    expect(mockPrisma.metaAd.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PAUSED' }),
      }),
    );
  });
});

// ── Single Ad Detail ──────────────────────────────────────────
describe('GET /api/autopilot/ads/:id', () => {
  it('returns 404 for non-existent ad', async () => {
    mockPrisma.metaAd.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/ads/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns ad detail with full context', async () => {
    const adWithAccount = {
      ...mockAd(),
      account: { id: 'acc-1', adAccountId: 'act_demo_123', name: 'Demo Account', currency: 'USD' },
    };
    mockPrisma.metaAd.findFirst.mockResolvedValueOnce(adWithAccount);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/ads/ad-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe('TOF Broad — Lifestyle Video');
    expect(body.account.adAccountId).toBe('act_demo_123');
  });
});

// ── Campaigns Tree ────────────────────────────────────────────
describe('GET /api/autopilot/campaigns', () => {
  it('returns empty list when no campaigns', async () => {
    mockPrisma.metaCampaign.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/campaigns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.campaigns).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns campaigns with aggregated metrics', async () => {
    mockPrisma.metaCampaign.findMany.mockResolvedValueOnce([{
      id: 'camp-1',
      campaignId: 'meta_camp_001',
      name: 'PROS_TOF_Broad',
      status: 'ACTIVE',
      objective: 'CONVERSIONS',
      dailyBudget: 250,
      adSets: [{
        id: 'adset-1',
        name: 'Broad — US 25-54 F',
        adSetId: 'meta_adset_001',
        status: 'ACTIVE',
        dailyBudget: 150,
        ads: [
          { id: 'ad-1', adId: 'a1', name: 'Ad 1', status: 'ACTIVE', creativeType: 'VIDEO', spend7d: 100, impressions7d: 5000, clicks7d: 150, conversions7d: 5, revenue7d: 500, roas7d: 5.0, ctr7d: 0.03, frequency7d: 2.0 },
          { id: 'ad-2', adId: 'a2', name: 'Ad 2', status: 'ACTIVE', creativeType: 'IMAGE', spend7d: 80, impressions7d: 4000, clicks7d: 100, conversions7d: 3, revenue7d: 300, roas7d: 3.75, ctr7d: 0.025, frequency7d: 1.8 },
        ],
      }],
    }]);

    const res = await app.inject({ method: 'GET', url: '/api/autopilot/campaigns' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].metrics7d.totalSpend).toBe(180);
    expect(body.campaigns[0].metrics7d.totalRevenue).toBe(800);
    expect(body.campaigns[0].metrics7d.adCount).toBe(2);
    expect(body.campaigns[0].metrics7d.roas).toBeCloseTo(4.44, 1);
  });
});

// ── Sync ──────────────────────────────────────────────────────
describe('POST /api/autopilot/sync', () => {
  it('falls back to first org in demo mode when no org context', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/sync' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.adsUpserted).toBeDefined();
    expect(body.jobRunId).toBeDefined();
  });

  it('auto-creates org when none exists and proceeds with sync', async () => {
    mockPrisma.organization.findFirst.mockReset();
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValueOnce({ id: 'org-auto' });
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/sync' });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'My Organization' } }),
    );
  });
});

// ── Stats ─────────────────────────────────────────────────────
describe('GET /api/autopilot/stats', () => {
  it('returns stats with zero values when no data', async () => {
    mockPrisma.metaAdAccount.count.mockResolvedValueOnce(0);
    mockPrisma.metaCampaign.count.mockResolvedValueOnce(0);
    mockPrisma.metaAdSet.count.mockResolvedValueOnce(0);
    mockPrisma.metaAd.count
      .mockResolvedValueOnce(0)  // total
      .mockResolvedValueOnce(0); // active
    mockPrisma.metaAd.findMany.mockResolvedValueOnce([]);
    mockPrisma.metaAd.findFirst.mockResolvedValueOnce(null);

    const res = await app.inject({ method: 'GET', url: '/api/autopilot/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accounts).toBe(0);
    expect(body.totalAds).toBe(0);
    expect(body.metrics7d.totalSpend).toBe(0);
    expect(body.lastSyncAt).toBeNull();
  });

  it('returns correct aggregate metrics', async () => {
    mockPrisma.metaAdAccount.count.mockResolvedValueOnce(1);
    mockPrisma.metaCampaign.count.mockResolvedValueOnce(3);
    mockPrisma.metaAdSet.count.mockResolvedValueOnce(5);
    mockPrisma.metaAd.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(8); // active
    mockPrisma.metaAd.findMany.mockResolvedValueOnce([
      { spend7d: 100, revenue7d: 450, conversions7d: 5, impressions7d: 5000, clicks7d: 150 },
      { spend7d: 200, revenue7d: 800, conversions7d: 10, impressions7d: 10000, clicks7d: 300 },
    ]);
    mockPrisma.metaAd.findFirst.mockResolvedValueOnce({ lastSyncAt: new Date('2026-02-25T12:00:00Z') });

    const res = await app.inject({ method: 'GET', url: '/api/autopilot/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.accounts).toBe(1);
    expect(body.campaigns).toBe(3);
    expect(body.totalAds).toBe(10);
    expect(body.activeAds).toBe(8);
    expect(body.metrics7d.totalSpend).toBe(300);
    expect(body.metrics7d.totalRevenue).toBe(1250);
    expect(body.metrics7d.blendedRoas).toBeCloseTo(4.17, 1);
    expect(body.lastSyncAt).toBeDefined();
  });
});

// ── Diagnoses ────────────────────────────────────────────────

function mockDiagnosis(overrides: Record<string, unknown> = {}) {
  return {
    id: 'diag-1',
    organizationId: null,
    adId: 'ad-1',
    ruleId: 'creative_fatigue',
    severity: 'WARNING',
    title: 'Creative Fatigue Detected',
    message: 'TOF Broad — Lifestyle Video: Frequency at 5.2x...',
    actionType: 'GENERATE_COPY_VARIANTS',
    status: 'PENDING',
    suggestedValue: { currentFrequency: 5.2, ctrDrop: 30 },
    executedAt: null,
    executionResult: null,
    expiresAt: new Date('2026-02-28T12:00:00Z'),
    createdAt: new Date('2026-02-25T12:00:00Z'),
    updatedAt: new Date('2026-02-25T12:00:00Z'),
    ad: {
      id: 'ad-1', adId: 'meta_ad_001', name: 'TOF Broad — Lifestyle Video',
      status: 'ACTIVE', creativeType: 'VIDEO', spend7d: 250, roas7d: 4.32,
      ctr7d: 0.03, frequency7d: 5.2,
      imageUrl: 'https://example.com/image.jpg', thumbnailUrl: 'https://example.com/thumb.jpg',
      campaign: { id: 'camp-1', name: 'PROS_TOF_Broad' },
      adSet: { id: 'adset-1', name: 'Broad — US 25-54 F', dailyBudget: 150 },
    },
    ...overrides,
  };
}

describe('GET /api/autopilot/diagnoses', () => {
  it('returns empty list when no diagnoses', async () => {
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.diagnoses).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns diagnoses sorted by severity', async () => {
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([
      mockDiagnosis({ id: 'diag-2', severity: 'INFO', ruleId: 'learning_phase', createdAt: new Date('2026-02-25T10:00:00Z') }),
      mockDiagnosis({ id: 'diag-1', severity: 'CRITICAL', ruleId: 'negative_roas', createdAt: new Date('2026-02-25T11:00:00Z') }),
      mockDiagnosis({ id: 'diag-3', severity: 'WARNING', ruleId: 'creative_fatigue', createdAt: new Date('2026-02-25T12:00:00Z') }),
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.diagnoses).toHaveLength(3);
    expect(body.diagnoses[0].severity).toBe('CRITICAL');
    expect(body.diagnoses[1].severity).toBe('WARNING');
    expect(body.diagnoses[2].severity).toBe('INFO');
  });

  it('filters by status', async () => {
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([]);
    await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses?status=PENDING' });
    expect(mockPrisma.diagnosis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });

  it('filters by severity', async () => {
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([]);
    await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses?severity=CRITICAL' });
    expect(mockPrisma.diagnosis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ severity: 'CRITICAL' }),
      }),
    );
  });
});

describe('GET /api/autopilot/diagnoses/stats', () => {
  it('returns counts by severity', async () => {
    mockPrisma.diagnosis.count
      .mockResolvedValueOnce(2)  // critical
      .mockResolvedValueOnce(5)  // warning
      .mockResolvedValueOnce(3)  // info
      .mockResolvedValueOnce(10); // total
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.critical).toBe(2);
    expect(body.warning).toBe(5);
    expect(body.info).toBe(3);
    expect(body.total).toBe(10);
  });
});

describe('GET /api/autopilot/diagnoses/:id', () => {
  it('returns 404 for non-existent diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns diagnosis detail with ad context', async () => {
    const diagWithAd = {
      ...mockDiagnosis(),
      ad: {
        ...mockDiagnosis().ad,
        campaign: { id: 'camp-1', name: 'PROS_TOF_Broad', campaignId: 'meta_camp_001', status: 'ACTIVE', objective: 'CONVERSIONS' },
        adSet: { id: 'adset-1', name: 'Broad — US 25-54 F', adSetId: 'meta_adset_001', status: 'ACTIVE', dailyBudget: 150 },
        account: { id: 'acc-1', adAccountId: 'act_demo_123', name: 'Demo Account', currency: 'USD' },
      },
    };
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(diagWithAd);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/diag-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ruleId).toBe('creative_fatigue');
    expect(body.ad.name).toBe('TOF Broad — Lifestyle Video');
  });
});

describe('POST /api/autopilot/diagnoses/:id/dismiss', () => {
  it('returns 404 for non-existent diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/nonexistent/dismiss' });
    expect(res.statusCode).toBe(404);
  });

  it('dismisses a PENDING diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(mockDiagnosis({ status: 'PENDING' }));
    mockPrisma.diagnosis.update.mockResolvedValueOnce({ ...mockDiagnosis(), status: 'DISMISSED' });
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/dismiss' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('DISMISSED');
  });

  it('returns 400 for non-PENDING diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(mockDiagnosis({ status: 'EXECUTED' }));
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/dismiss' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Cannot dismiss');
  });
});

describe('POST /api/autopilot/run-diagnosis', () => {
  it('falls back to first org when no org context on request', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/run-diagnosis' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.adsEvaluated).toBeDefined();
  });

  it('auto-creates org when none exists and proceeds with diagnosis', async () => {
    mockPrisma.organization.findFirst.mockReset();
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValueOnce({ id: 'org-auto' });
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/run-diagnosis' });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.create).toHaveBeenCalled();
  });
});

// ── Copy Generation ──────────────────────────────────────────

describe('POST /api/autopilot/diagnoses/:id/generate-copy', () => {
  it('auto-creates org when none exists for generate-copy', async () => {
    mockPrisma.organization.findFirst.mockReset();
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValueOnce({ id: 'org-auto' });
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/generate-copy' });
    // 404 because diagnosis not found (but org was auto-created successfully)
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organization.create).toHaveBeenCalled();
  });

  it('returns 404 for non-existent diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/nonexistent/generate-copy' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for non-GENERATE_COPY_VARIANTS diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(mockDiagnosis({
      actionType: 'PAUSE_AD',
      ad: { id: 'ad-1', headline: 'Test', primaryText: 'Test', description: 'Test', spend7d: 100, roas7d: 1.5, ctr7d: 0.02, frequency7d: 3, conversions7d: 5 },
    }));
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/generate-copy' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('PAUSE_AD');
  });
});

// ── Variant Endpoints ────────────────────────────────────────

function mockVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'var-1',
    diagnosisId: 'diag-1',
    adId: 'ad-1',
    angle: 'benefit',
    headline: 'Transform Your Routine',
    primaryText: 'Discover the difference our products make.',
    description: 'Shop now',
    status: 'DRAFT',
    metaAdId: null,
    spend: null,
    impressions: null,
    clicks: null,
    conversions: null,
    revenue: null,
    createdAt: new Date('2026-02-25T12:00:00Z'),
    updatedAt: new Date('2026-02-25T12:00:00Z'),
    diagnosis: { id: 'diag-1', ruleId: 'creative_fatigue', title: 'Creative Fatigue', severity: 'WARNING', organizationId: null },
    ad: { id: 'ad-1', adId: 'meta_ad_001', name: 'TOF Broad — Lifestyle Video', headline: 'Shop Now', primaryText: 'Best products...', description: 'Shop' },
    ...overrides,
  };
}

describe('GET /api/autopilot/variants/:id', () => {
  it('returns 404 for non-existent variant', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/variants/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('returns variant with diagnosis and ad context', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(mockVariant());
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/variants/var-1' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.angle).toBe('benefit');
    expect(body.headline).toBe('Transform Your Routine');
    expect(body.diagnosis.ruleId).toBe('creative_fatigue');
  });
});

describe('PATCH /api/autopilot/variants/:id', () => {
  it('returns 400 without status', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/var-1', payload: {} });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('APPROVED or REJECTED');
  });

  it('returns 400 for invalid status', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/var-1', payload: { status: 'PUBLISHED' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-existent variant', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/nonexistent', payload: { status: 'APPROVED' } });
    expect(res.statusCode).toBe(404);
  });

  it('approves a DRAFT variant', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(mockVariant({ status: 'DRAFT' }));
    mockPrisma.adVariant.update.mockResolvedValueOnce({ ...mockVariant(), status: 'APPROVED' });
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/var-1', payload: { status: 'APPROVED' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('APPROVED');
  });

  it('rejects a DRAFT variant', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(mockVariant({ status: 'DRAFT' }));
    mockPrisma.adVariant.update.mockResolvedValueOnce({ ...mockVariant(), status: 'REJECTED' });
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/var-1', payload: { status: 'REJECTED' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('REJECTED');
  });

  it('returns 400 for non-DRAFT variant', async () => {
    mockPrisma.adVariant.findFirst.mockResolvedValueOnce(mockVariant({ status: 'APPROVED' }));
    const res = await app.inject({ method: 'PATCH', url: '/api/autopilot/variants/var-1', payload: { status: 'REJECTED' } });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Cannot update variant');
  });
});

// ── History ──────────────────────────────────────────────────

describe('GET /api/autopilot/history', () => {
  it('returns empty history', async () => {
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([]);
    mockPrisma.diagnosis.count.mockResolvedValueOnce(0);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/history' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns actioned diagnoses with variants', async () => {
    const dismissed = {
      ...mockDiagnosis({ status: 'DISMISSED' }),
      variants: [],
    };
    const executed = {
      ...mockDiagnosis({ id: 'diag-2', status: 'EXECUTED' }),
      variants: [{ id: 'var-1', angle: 'benefit', headline: 'Test', status: 'APPROVED' }],
    };
    mockPrisma.diagnosis.findMany.mockResolvedValueOnce([executed, dismissed]);
    mockPrisma.diagnosis.count.mockResolvedValueOnce(2);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/history' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.items[0].variants).toHaveLength(1);
  });
});

// ── Approve + Execute ──────────────────────────────────────────

describe('POST /api/autopilot/diagnoses/:id/approve', () => {
  it('auto-creates org when none exists for approve', async () => {
    mockPrisma.organization.findFirst.mockReset();
    mockPrisma.organization.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValueOnce({ id: 'org-auto' });
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/approve' });
    // 404 because diagnosis not found (but org was auto-created)
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.organization.create).toHaveBeenCalled();
  });

  it('returns 404 for non-existent diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/nonexistent/approve' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for non-PENDING diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(mockDiagnosis({ status: 'EXECUTED' }));
    const res = await app.inject({ method: 'POST', url: '/api/autopilot/diagnoses/diag-1/approve' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toContain('Cannot approve');
  });
});

// ── Status SSE ────────────────────────────────────────────────

describe('GET /api/autopilot/diagnoses/:id/status', () => {
  it('returns 404 for non-existent diagnosis', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/nonexistent/status' });
    expect(res.statusCode).toBe(404);
  });

  it('returns terminal status immediately (no SSE)', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce({
      id: 'diag-1',
      status: 'EXECUTED',
      actionType: 'PAUSE_AD',
      executedAt: new Date('2026-02-25T14:00:00Z'),
      executionResult: { success: true },
    });
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/diag-1/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('EXECUTED');
    expect(body.executedAt).toBeDefined();
    expect(body.executionResult).toBeDefined();
  });

  it('returns terminal status for DISMISSED', async () => {
    mockPrisma.diagnosis.findFirst.mockResolvedValueOnce({
      id: 'diag-2',
      status: 'DISMISSED',
      actionType: 'PAUSE_AD',
      executedAt: null,
      executionResult: null,
    });
    const res = await app.inject({ method: 'GET', url: '/api/autopilot/diagnoses/diag-2/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('DISMISSED');
  });
});
