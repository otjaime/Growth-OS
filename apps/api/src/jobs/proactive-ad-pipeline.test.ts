import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  prisma: {
    autopilotConfig: { findUnique: vi.fn() },
    productPerformance: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    proactiveAdJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    connectorCredential: { findFirst: vi.fn() },
    metaAdSet: { create: vi.fn() },
    metaAd: { create: vi.fn(), findMany: vi.fn() },
    metaCampaign: { findFirst: vi.fn() },
    metaAdAccount: { findFirst: vi.fn() },
  },
  decrypt: vi.fn(),
  evaluateProactiveRules: vi.fn(),
  generateProductCopy: vi.fn(),
  prepareAdImage: vi.fn(),
  createProactiveAdSet: vi.fn(),
  createAdFromVariant: vi.fn(),
  createAdvantagePlusAd: vi.fn(),
  fetchEligiblePageId: vi.fn(),
  pauseAd: vi.fn(),
  evaluateProductABTest: vi.fn(),
}));

vi.mock('@growth-os/database', () => ({
  prisma: mocks.prisma,
  decrypt: mocks.decrypt,
}));
vi.mock('@growth-os/etl', () => ({
  evaluateProactiveRules: mocks.evaluateProactiveRules,
}));
vi.mock('../lib/product-copy-generator.js', () => ({
  generateProductCopy: mocks.generateProductCopy,
}));
vi.mock('../lib/ad-image-manager.js', () => ({
  prepareAdImage: mocks.prepareAdImage,
}));
vi.mock('../lib/meta-executor.js', () => ({
  createProactiveAdSet: mocks.createProactiveAdSet,
  createAdFromVariant: mocks.createAdFromVariant,
  createAdvantagePlusAd: mocks.createAdvantagePlusAd,
  fetchEligiblePageId: mocks.fetchEligiblePageId,
  pauseAd: mocks.pauseAd,
  reactivateAd: vi.fn(),
  appendUtmParams: (url: string) => url,
}));
vi.mock('../lib/proactive-ab-engine.js', () => ({
  evaluateProductABTest: mocks.evaluateProductABTest,
}));

import {
  runProactiveDiscovery,
  generateProactiveAssets,
  publishProactiveJob,
  runProactiveABLoop,
} from './proactive-ad-pipeline.js';

const ORG_ID = 'org_test_123';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── runProactiveDiscovery ──────────────────────────────────────
describe('runProactiveDiscovery', () => {
  it('skips when proactiveEnabled is false', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: false,
    });

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips when config is null', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
  });

  it('skips when monthly limit is reached', async () => {
    // First call: config check
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 3,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    // Safety check: no restrictions
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    // Monthly count = 3 (at limit)
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(3);

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
  });

  it('skips when concurrent limit (3 active) is reached', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    // Safety check
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    // Monthly count = 1 (under limit)
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(1);
    // Active count = 3 (at concurrent limit)
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(3);

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
  });

  it('filters products by fitness score >= threshold', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 70,
      mode: 'auto',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0); // monthly
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0); // concurrent

    mocks.prisma.productPerformance.findMany.mockResolvedValueOnce([]);
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([]);
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([]);
    mocks.evaluateProactiveRules.mockReturnValueOnce([]);

    await runProactiveDiscovery(ORG_ID);

    // Verify findMany was called with gte: 70
    const findManyCall = mocks.prisma.productPerformance.findMany.mock.calls[0]![0];
    expect(findManyCall.where.adFitnessScore.gte).toBe(70);
  });

  it('excludes products already with active jobs', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);

    mocks.prisma.productPerformance.findMany.mockResolvedValueOnce([
      {
        productTitle: 'Widget A',
        productType: 'gadget',
        revenue30d: 5000,
        grossProfit30d: 3000,
        avgDailyUnits: 5,
        repeatBuyerPct: 0.15,
        estimatedMargin: 0.55,
        avgPrice: 30,
        adFitnessScore: 80,
        imageUrl: 'https://example.com/img.jpg',
        description: 'Great widget',
      },
    ]);
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([]);
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      { productTitle: 'Widget A' },
    ]);

    mocks.evaluateProactiveRules.mockReturnValueOnce([]);

    await runProactiveDiscovery(ORG_ID);

    // evaluateProactiveRules should receive existing products in the set
    const rulesInput = mocks.evaluateProactiveRules.mock.calls[0]![0];
    expect(rulesInput.existingProductAds.has('widget a')).toBe(true);
  });

  it('skips when circuit breaker is tripped (safety guardrails)', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    // Safety check returns circuit breaker tripped
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      circuitBreakerTrippedAt: new Date(),
      executionWindowStart: null,
      executionWindowEnd: null,
      maxActionsPerDay: null,
      dailyBudgetCap: null,
    });

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
  });

  it('creates new jobs for eligible products', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);

    mocks.prisma.productPerformance.findMany.mockResolvedValueOnce([
      {
        productTitle: 'Serum X',
        productType: 'beauty',
        revenue30d: 10000,
        grossProfit30d: 6500,
        avgDailyUnits: 8,
        repeatBuyerPct: 0.22,
        estimatedMargin: 0.65,
        avgPrice: 45,
        adFitnessScore: 85,
        imageUrl: 'https://example.com/serum.jpg',
        description: 'Anti-aging serum',
      },
    ]);
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([]);
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([]);

    mocks.evaluateProactiveRules.mockReturnValueOnce([
      { productTitle: 'Serum X', productType: 'beauty', adFitnessScore: 85 },
    ]);
    mocks.prisma.proactiveAdJob.create.mockResolvedValueOnce({ id: 'job_1' });

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(1);
    expect(mocks.prisma.proactiveAdJob.create).toHaveBeenCalledOnce();
    const createArg = mocks.prisma.proactiveAdJob.create.mock.calls[0]![0];
    expect(createArg.data.productTitle).toBe('Serum X');
    expect(createArg.data.status).toBe('PENDING');
  });

  it('records errors when job creation fails', async () => {
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: 10,
      minAdFitnessScore: 60,
      mode: 'auto',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);
    mocks.prisma.proactiveAdJob.count.mockResolvedValueOnce(0);

    mocks.prisma.productPerformance.findMany.mockResolvedValueOnce([
      {
        productTitle: 'Widget B',
        productType: 'gadget',
        revenue30d: 8000,
        grossProfit30d: 4000,
        avgDailyUnits: 6,
        repeatBuyerPct: 0.1,
        estimatedMargin: 0.5,
        avgPrice: 25,
        adFitnessScore: 75,
        imageUrl: null,
        description: null,
      },
    ]);
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([]);
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([]);

    mocks.evaluateProactiveRules.mockReturnValueOnce([
      { productTitle: 'Widget B', productType: 'gadget', adFitnessScore: 75 },
    ]);
    mocks.prisma.proactiveAdJob.create.mockRejectedValueOnce(
      new Error('Unique constraint failed'),
    );

    const result = await runProactiveDiscovery(ORG_ID);

    expect(result.jobsCreated).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Widget B');
  });
});

// ── generateProactiveAssets ────────────────────────────────────
describe('generateProactiveAssets', () => {
  it('returns error when job is not found', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce(null);

    const result = await generateProactiveAssets('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Job not found');
  });

  it('returns error when job is in invalid state (not PENDING/GENERATING)', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'PUBLISHED',
      organizationId: ORG_ID,
    });

    const result = await generateProactiveAssets('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid state');
    expect(result.error).toContain('PUBLISHED');
  });

  it('transitions PENDING -> GENERATING -> READY with copy and image', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'PENDING',
      organizationId: ORG_ID,
      productTitle: 'Serum X',
      productType: 'beauty',
      productImageUrl: 'https://example.com/serum.jpg',
      adFitnessScore: 85,
    });
    mocks.prisma.proactiveAdJob.update.mockResolvedValue({});
    mocks.prisma.productPerformance.findFirst.mockResolvedValueOnce({
      description: 'Anti-aging serum',
      avgPrice: 45,
      estimatedMargin: 0.65,
      repeatBuyerPct: 0.22,
    });

    const copyVariants = [
      { angle: 'benefit', headline: 'Test', primaryText: 'Test text', description: 'CTA' },
      { angle: 'pain_point', headline: 'Test2', primaryText: 'Pain text', description: 'CTA2' },
      { angle: 'urgency', headline: 'Test3', primaryText: 'Urgency', description: 'CTA3' },
    ];
    mocks.generateProductCopy.mockResolvedValueOnce(copyVariants);

    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({ useAIImages: false });
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce(null);
    mocks.prepareAdImage.mockResolvedValueOnce({
      success: true,
      imageHash: 'demo_hash',
      imageUrl: 'https://example.com/img.jpg',
      source: 'demo',
    });

    const result = await generateProactiveAssets('job_1');

    expect(result.success).toBe(true);
    // First update: set to GENERATING
    expect(mocks.prisma.proactiveAdJob.update.mock.calls[0]![0].data.status).toBe('GENERATING');
    // Second update: set to READY with assets
    expect(mocks.prisma.proactiveAdJob.update.mock.calls[1]![0].data.status).toBe('READY');
    expect(mocks.prisma.proactiveAdJob.update.mock.calls[1]![0].data.imageHash).toBe('demo_hash');
  });

  it('sets status to FAILED on error with errorMessage', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'PENDING',
      organizationId: ORG_ID,
      productTitle: 'Serum X',
      productType: 'beauty',
      productImageUrl: null,
      adFitnessScore: 70,
    });
    mocks.prisma.proactiveAdJob.update.mockResolvedValue({});
    mocks.prisma.productPerformance.findFirst.mockResolvedValueOnce(null);

    mocks.generateProductCopy.mockRejectedValueOnce(new Error('AI unavailable'));

    const result = await generateProactiveAssets('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('AI unavailable');
    // Second update should be FAILED
    const failUpdate = mocks.prisma.proactiveAdJob.update.mock.calls[1]![0];
    expect(failUpdate.data.status).toBe('FAILED');
    expect(failUpdate.data.errorMessage).toBe('AI unavailable');
  });
});

// ── publishProactiveJob ────────────────────────────────────────
describe('publishProactiveJob', () => {
  it('returns error when job not found', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce(null);

    const result = await publishProactiveJob('nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Job not found');
  });

  it('returns error for invalid status (not READY/APPROVED)', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'PENDING',
      organizationId: ORG_ID,
      copyVariants: [],
    });

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('READY or APPROVED');
  });

  it('returns error when no copy variants exist', async () => {
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: [],
    });

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No copy variants');
  });

  it('returns error when budget is not configured (0 or null)', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H', primaryText: 'P', description: 'D' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: variants,
    });
    // Safety check passes
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    // Budget config: 0
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 0,
    });

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('budget not configured');
  });

  it('demo mode (no credentials) skips Meta calls and uses demo IDs', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
      { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: variants,
      imageHash: 'demo_hash',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null); // safety
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 20,
    });
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce(null); // demo mode
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(true);
    expect(mocks.createProactiveAdSet).not.toHaveBeenCalled();
    expect(mocks.createAdFromVariant).not.toHaveBeenCalled();
    const updateArg = mocks.prisma.proactiveAdJob.update.mock.calls[0]![0];
    expect(updateArg.data.status).toBe('PUBLISHED');
    expect(updateArg.data.metaAdSetId).toContain('demo_adset_');
    expect(updateArg.data.metaAdIds).toHaveLength(2);
  });

  it('live mode creates ad set + ads and stores MetaAd rows', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H1', primaryText: 'P1', description: 'D1' },
      { angle: 'pain_point', headline: 'H2', primaryText: 'P2', description: 'D2' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'APPROVED',
      organizationId: ORG_ID,
      copyVariants: variants,
      productTitle: 'Serum X',
      productType: 'beauty',
      imageHash: 'abc123',
    });
    // Safety check
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    // Budget config
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 25,
    });
    // Credentials
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(
      JSON.stringify({ accessToken: 'tok_abc', adAccountId: 'act_123' }),
    );
    // Eligible page
    mocks.fetchEligiblePageId.mockResolvedValueOnce({ pageId: 'page_mrpork', pageName: 'Mr Pork' });
    // Campaign
    mocks.prisma.metaCampaign.findFirst.mockResolvedValueOnce({
      id: 'camp_db_1',
      campaignId: 'camp_meta_1',
    });
    // Ad Account
    mocks.prisma.metaAdAccount.findFirst.mockResolvedValueOnce({ id: 'acct_db_1' });
    // Ad set creation
    mocks.createProactiveAdSet.mockResolvedValueOnce({
      success: true,
      metaResponse: { id: 'adset_meta_1' },
    });
    // MetaAdSet row
    mocks.prisma.metaAdSet.create.mockResolvedValueOnce({ id: 'adset_db_1' });
    // Product URL
    mocks.prisma.productPerformance.findFirst.mockResolvedValueOnce({
      productUrl: 'https://shop.com/serum-x',
      productHandle: 'serum-x',
    });
    // Advantage+ Creative (1 ad with all variants)
    mocks.createAdvantagePlusAd.mockResolvedValueOnce({
      success: true,
      metaResponse: { adId: 'ad_advantage_1' },
    });
    mocks.prisma.metaAd.create.mockResolvedValue({});
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(true);
    expect(mocks.createProactiveAdSet).toHaveBeenCalledWith(
      'tok_abc',
      'act_123',
      'camp_meta_1',
      'Serum X',
      2500, // $25 -> 2500 cents
    );
    // Advantage+ creates 1 ad (not 2 separate ones)
    expect(mocks.createAdvantagePlusAd).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.metaAd.create).toHaveBeenCalledTimes(1);
    const finalUpdate = mocks.prisma.proactiveAdJob.update.mock.calls[0]![0];
    expect(finalUpdate.data.status).toBe('PUBLISHED');
    expect(finalUpdate.data.metaAdIds).toEqual(['ad_advantage_1']);
  });

  it('returns error when no active campaign found', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H', primaryText: 'P', description: 'D' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: variants,
      productTitle: 'Widget',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 20,
    });
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(
      JSON.stringify({ accessToken: 'tok', adAccountId: 'acct' }),
    );
    mocks.fetchEligiblePageId.mockResolvedValueOnce({ pageId: 'page_1', pageName: 'Page' });
    mocks.prisma.metaCampaign.findFirst.mockResolvedValueOnce(null);

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No active Meta campaign');
  });

  it('sets FAILED when ad set creation fails on Meta', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H', primaryText: 'P', description: 'D' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: variants,
      productTitle: 'Widget',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 15,
    });
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(
      JSON.stringify({ accessToken: 'tok', adAccountId: 'acct' }),
    );
    mocks.fetchEligiblePageId.mockResolvedValueOnce({ pageId: 'page_1', pageName: 'Page' });
    mocks.prisma.metaCampaign.findFirst.mockResolvedValueOnce({
      id: 'c1',
      campaignId: 'mc1',
    });
    mocks.prisma.metaAdAccount.findFirst.mockResolvedValueOnce({ id: 'a1' });
    mocks.createProactiveAdSet.mockResolvedValueOnce({
      success: false,
      error: 'Rate limit exceeded',
    });
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(mocks.prisma.proactiveAdJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('sets FAILED when all ad creations fail on Meta', async () => {
    const variants = [
      { angle: 'benefit', headline: 'H', primaryText: 'P', description: 'D' },
    ];
    mocks.prisma.proactiveAdJob.findUnique.mockResolvedValueOnce({
      id: 'job_1',
      status: 'READY',
      organizationId: ORG_ID,
      copyVariants: variants,
      productTitle: 'Widget',
      imageHash: 'hash1',
    });
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce(null);
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      proactiveDefaultBudget: 15,
    });
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(
      JSON.stringify({ accessToken: 'tok', adAccountId: 'acct' }),
    );
    mocks.fetchEligiblePageId.mockResolvedValueOnce({ pageId: 'page_1', pageName: 'Page' });
    mocks.prisma.metaCampaign.findFirst.mockResolvedValueOnce({
      id: 'c1',
      campaignId: 'mc1',
    });
    mocks.prisma.metaAdAccount.findFirst.mockResolvedValueOnce({ id: 'a1' });
    mocks.createProactiveAdSet.mockResolvedValueOnce({
      success: true,
      metaResponse: { id: 'adset_1' },
    });
    mocks.prisma.metaAdSet.create.mockResolvedValueOnce({ id: 'as_db1' });
    mocks.prisma.productPerformance.findFirst.mockResolvedValueOnce({
      productUrl: 'https://shop.com/products/widget',
      productHandle: 'widget',
    });
    // Advantage+ fails
    mocks.createAdvantagePlusAd.mockResolvedValueOnce({
      success: false,
      error: 'Creative rejected',
    });
    // Fallback individual ads also fail
    mocks.createAdFromVariant.mockResolvedValueOnce({
      success: false,
      error: 'Creative rejected',
    });
    // Update for FAILED status
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});

    const result = await publishProactiveJob('job_1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('All ad creations failed');
  });
});

// ── runProactiveABLoop ─────────────────────────────────────────
describe('runProactiveABLoop', () => {
  it('returns early with empty result when no TESTING jobs exist', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([]);

    const result = await runProactiveABLoop(ORG_ID);

    expect(result.jobsEvaluated).toBe(0);
    expect(result.winnersFound).toBe(0);
    expect(result.jobsPaused).toBe(0);
  });

  it('handles winner_found: pauses losers, sets WINNER status', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      {
        id: 'job_1',
        organizationId: ORG_ID,
        metaAdIds: ['ad_a', 'ad_b', 'ad_c'],
        copyVariants: [{ angle: 'benefit' }, { angle: 'pain_point' }, { angle: 'urgency' }],
        testStartedAt: new Date(Date.now() - 7 * 86_400_000),
        testRoundNumber: 1,
        productTitle: 'Serum X',
        productType: 'beauty',
        productImageUrl: 'img.jpg',
        adFitnessScore: 80,
      },
    ]);
    // Meta credentials
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(
      JSON.stringify({ accessToken: 'tok' }),
    );
    // Config
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({
      maxTestRounds: 3,
    });
    // Ad performances
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([
      { adId: 'ad_a', spend7d: 100, impressions7d: 5000, clicks7d: 200, conversions7d: 20, revenue7d: 500 },
      { adId: 'ad_b', spend7d: 100, impressions7d: 5000, clicks7d: 180, conversions7d: 5, revenue7d: 80 },
      { adId: 'ad_c', spend7d: 100, impressions7d: 5000, clicks7d: 190, conversions7d: 8, revenue7d: 120 },
    ]);

    mocks.evaluateProductABTest.mockReturnValueOnce({
      type: 'winner_found',
      winnerIndex: 0,
      loserIndices: [1, 2],
      reason: 'Variant "benefit" wins with 5.00x ROAS',
    });

    mocks.pauseAd.mockResolvedValue({ success: true });
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});
    mocks.prisma.proactiveAdJob.create.mockResolvedValueOnce({});

    const result = await runProactiveABLoop(ORG_ID);

    expect(result.jobsEvaluated).toBe(1);
    expect(result.winnersFound).toBe(1);
    expect(mocks.pauseAd).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.proactiveAdJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'WINNER',
          winnerId: 'ad_a',
        }),
      }),
    );
  });

  it('handles all_poor: pauses all variants, decrements fitness score', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      {
        id: 'job_2',
        organizationId: ORG_ID,
        metaAdIds: ['ad_x', 'ad_y'],
        copyVariants: [{ angle: 'benefit' }, { angle: 'urgency' }],
        testStartedAt: new Date(Date.now() - 10 * 86_400_000),
        testRoundNumber: 1,
        productTitle: 'Bad Widget',
        productType: 'gadget',
      },
    ]);
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(JSON.stringify({ accessToken: 'tok' }));
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({ maxTestRounds: 3 });
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([
      { adId: 'ad_x', spend7d: 100, impressions7d: 5000, clicks7d: 100, conversions7d: 1, revenue7d: 10 },
      { adId: 'ad_y', spend7d: 100, impressions7d: 5000, clicks7d: 90, conversions7d: 0, revenue7d: 0 },
    ]);

    mocks.evaluateProductABTest.mockReturnValueOnce({
      type: 'all_poor',
      reason: 'All variants have ROAS below 1.0x',
    });

    mocks.pauseAd.mockResolvedValue({ success: true });
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});
    mocks.prisma.productPerformance.updateMany.mockResolvedValueOnce({});

    const result = await runProactiveABLoop(ORG_ID);

    expect(result.jobsPaused).toBe(1);
    expect(mocks.pauseAd).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.proactiveAdJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAUSED' }),
      }),
    );
    expect(mocks.prisma.productPerformance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adFitnessScore: { decrement: 20 },
        }),
      }),
    );
  });

  it('handles insufficient_data: continues testing', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      {
        id: 'job_3',
        organizationId: ORG_ID,
        metaAdIds: ['ad_m', 'ad_n'],
        copyVariants: [{ angle: 'benefit' }, { angle: 'urgency' }],
        testStartedAt: new Date(Date.now() - 2 * 86_400_000),
        testRoundNumber: 1,
        productTitle: 'New Widget',
      },
    ]);
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce(null);
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({ maxTestRounds: 3 });
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([
      { adId: 'ad_m', spend7d: 10, impressions7d: 500, clicks7d: 20, conversions7d: 1, revenue7d: 15 },
      { adId: 'ad_n', spend7d: 8, impressions7d: 400, clicks7d: 15, conversions7d: 0, revenue7d: 0 },
    ]);

    mocks.evaluateProductABTest.mockReturnValueOnce({
      type: 'insufficient_data',
      reason: '2 variant(s) below $50 spend',
    });

    const result = await runProactiveABLoop(ORG_ID);

    expect(result.jobsEvaluated).toBe(1);
    expect(result.winnersFound).toBe(0);
    expect(result.jobsPaused).toBe(0);
    // No updates for insufficient_data
    expect(mocks.prisma.proactiveAdJob.update).not.toHaveBeenCalled();
  });

  it('respects maxTestRounds: creates next-round job when under limit', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      {
        id: 'job_4',
        organizationId: ORG_ID,
        metaAdIds: ['ad_p', 'ad_q'],
        copyVariants: [{ angle: 'benefit' }, { angle: 'urgency' }],
        testStartedAt: new Date(Date.now() - 7 * 86_400_000),
        testRoundNumber: 2,
        productTitle: 'Serum X',
        productType: 'beauty',
        productImageUrl: 'img.jpg',
        adFitnessScore: 85,
      },
    ]);
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(JSON.stringify({ accessToken: 'tok' }));
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({ maxTestRounds: 3 });
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([
      { adId: 'ad_p', spend7d: 100, impressions7d: 5000, clicks7d: 200, conversions7d: 20, revenue7d: 500 },
      { adId: 'ad_q', spend7d: 100, impressions7d: 5000, clicks7d: 150, conversions7d: 5, revenue7d: 60 },
    ]);

    mocks.evaluateProductABTest.mockReturnValueOnce({
      type: 'winner_found',
      winnerIndex: 0,
      loserIndices: [1],
      reason: 'Winner',
    });

    mocks.pauseAd.mockResolvedValue({ success: true });
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});
    mocks.prisma.proactiveAdJob.create.mockResolvedValueOnce({});

    const result = await runProactiveABLoop(ORG_ID);

    expect(result.winnersFound).toBe(1);
    // Should create next-round job since round 2 < maxTestRounds 3
    expect(mocks.prisma.proactiveAdJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testRoundNumber: 3,
          status: 'PENDING',
          productTitle: 'Serum X',
        }),
      }),
    );
  });

  it('does not create next-round job when at maxTestRounds', async () => {
    mocks.prisma.proactiveAdJob.findMany.mockResolvedValueOnce([
      {
        id: 'job_5',
        organizationId: ORG_ID,
        metaAdIds: ['ad_r', 'ad_s'],
        copyVariants: [{ angle: 'benefit' }, { angle: 'urgency' }],
        testStartedAt: new Date(Date.now() - 7 * 86_400_000),
        testRoundNumber: 3,
        productTitle: 'Serum X',
        productType: 'beauty',
      },
    ]);
    mocks.prisma.connectorCredential.findFirst.mockResolvedValueOnce({
      encryptedData: 'enc',
      iv: 'iv',
      authTag: 'tag',
    });
    mocks.decrypt.mockReturnValueOnce(JSON.stringify({ accessToken: 'tok' }));
    mocks.prisma.autopilotConfig.findUnique.mockResolvedValueOnce({ maxTestRounds: 3 });
    mocks.prisma.metaAd.findMany.mockResolvedValueOnce([
      { adId: 'ad_r', spend7d: 100, impressions7d: 5000, clicks7d: 200, conversions7d: 20, revenue7d: 500 },
      { adId: 'ad_s', spend7d: 100, impressions7d: 5000, clicks7d: 150, conversions7d: 5, revenue7d: 60 },
    ]);

    mocks.evaluateProductABTest.mockReturnValueOnce({
      type: 'winner_found',
      winnerIndex: 0,
      loserIndices: [1],
      reason: 'Winner',
    });

    mocks.pauseAd.mockResolvedValue({ success: true });
    mocks.prisma.proactiveAdJob.update.mockResolvedValueOnce({});

    await runProactiveABLoop(ORG_ID);

    // Should NOT create a new job since round 3 >= maxTestRounds 3
    expect(mocks.prisma.proactiveAdJob.create).not.toHaveBeenCalled();
  });
});
