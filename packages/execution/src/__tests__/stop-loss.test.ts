import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STOP_LOSS_RULES, evaluateHypothesis } from '../stop-loss.js';
import type { MetaAdExecutor } from '../meta-writer.js';
import type { CampaignMetrics } from '../meta-writer.js';
import type { CampaignHypothesis } from '@growth-os/database';

// Extract the DbClient type from the evaluateHypothesis signature
type DbClient = Parameters<typeof evaluateHypothesis>[2];

// ── Helpers ─────────────────────────────────────────────────

function makeHypothesis(overrides: Partial<CampaignHypothesis> = {}): CampaignHypothesis {
  return {
    id: 'hyp_test',
    clientId: 'client_1',
    title: 'Test Hypothesis',
    trigger: 'SCARCITY',
    triggerMechanism: 'Limited stock',
    awarenessLevel: 'PROBLEM_AWARE',
    audience: 'US women 25-34',
    funnelStage: 'CONSIDERATION',
    creativeAngle: 'Before/after',
    copyHook: 'Hook text',
    primaryEmotion: 'urgency',
    primaryObjection: 'price',
    conviction: 4,
    budgetUSD: 1000,
    durationDays: 14,
    falsificationCondition: 'ROAS < 1.0 after 5 days',
    expectedROAS: 3.0,
    expectedCTR: 0.02,
    expectedCVR: 0.05,
    status: 'LIVE',
    metaCampaignId: 'camp_123',
    launchedAt: new Date(),
    closedAt: null,
    actualROAS: null,
    actualCTR: null,
    actualCVR: null,
    actualSpend: null,
    actualRevenue: null,
    delta: null,
    verdict: null,
    lesson: null,
    triggerEffective: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CampaignHypothesis;
}

function makeMetrics(overrides: Partial<CampaignMetrics> = {}): CampaignMetrics {
  return {
    spend: 300,
    revenue: 900,
    roas: 3.0,
    ctr: 0.02,
    cvr: 0.05,
    impressions: 10000,
    clicks: 200,
    conversions: 10,
    daysRunning: 5,
    ...overrides,
  };
}

function makeMockExecutor(metrics: CampaignMetrics) {
  return {
    getCampaignMetrics: vi.fn().mockResolvedValue(metrics),
    pauseCampaign: vi.fn().mockResolvedValue({ success: true }),
    scaleBudget: vi.fn().mockResolvedValue({ success: true }),
    accessToken: 'test',
    adAccountId: 'act_123',
  };
}

function makeMockDb() {
  return {
    campaignHypothesis: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    stopLossEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    connectorCredential: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

// ── Rule Unit Tests ─────────────────────────────────────────

describe('STOP_LOSS_RULES', () => {
  describe('roas-floor', () => {
    const rule = STOP_LOSS_RULES.find((r) => r.id === 'roas-floor')!;

    it('fires when ROAS < 50% of target after 3 days', () => {
      const metrics = makeMetrics({ roas: 1.4, daysRunning: 3 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(true);
    });

    it('does not fire when ROAS is above 50% of target', () => {
      const metrics = makeMetrics({ roas: 1.6, daysRunning: 3 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('does not fire before 3 days even with bad ROAS', () => {
      const metrics = makeMetrics({ roas: 0.5, daysRunning: 2 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      // The condition itself checks daysRunning, but minDaysRunning also guards
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('has minDaysRunning of 3', () => {
      expect(rule.minDaysRunning).toBe(3);
    });

    it('action is PAUSE', () => {
      expect(rule.action).toBe('PAUSE');
    });
  });

  describe('ctr-floor', () => {
    const rule = STOP_LOSS_RULES.find((r) => r.id === 'ctr-floor')!;

    it('fires when CTR < 40% of expected after 2 days', () => {
      const metrics = makeMetrics({ ctr: 0.007, daysRunning: 2 });
      const hypothesis = makeHypothesis({ expectedCTR: 0.02 });
      expect(rule.condition(metrics, hypothesis)).toBe(true);
    });

    it('does not fire when CTR is above 40% of expected', () => {
      const metrics = makeMetrics({ ctr: 0.009, daysRunning: 2 });
      const hypothesis = makeHypothesis({ expectedCTR: 0.02 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('does not fire before 2 days', () => {
      const metrics = makeMetrics({ ctr: 0.001, daysRunning: 1 });
      const hypothesis = makeHypothesis({ expectedCTR: 0.02 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });
  });

  describe('zero-conversions', () => {
    const rule = STOP_LOSS_RULES.find((r) => r.id === 'zero-conversions')!;

    it('fires when 30% of budget spent with zero conversions', () => {
      const metrics = makeMetrics({ spend: 350, conversions: 0, daysRunning: 3 });
      const hypothesis = makeHypothesis({ budgetUSD: 1000 });
      expect(rule.condition(metrics, hypothesis)).toBe(true);
    });

    it('does not fire with some conversions', () => {
      const metrics = makeMetrics({ spend: 500, conversions: 1, daysRunning: 3 });
      const hypothesis = makeHypothesis({ budgetUSD: 1000 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('does not fire when spend below threshold', () => {
      const metrics = makeMetrics({ spend: 200, conversions: 0, daysRunning: 3 });
      const hypothesis = makeHypothesis({ budgetUSD: 1000 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('boundary: exactly 30% of budget with zero conversions', () => {
      const metrics = makeMetrics({ spend: 300, conversions: 0, daysRunning: 3 });
      const hypothesis = makeHypothesis({ budgetUSD: 1000 });
      // 300 is NOT > 300, so should NOT fire
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });
  });

  describe('winner-scale', () => {
    const rule = STOP_LOSS_RULES.find((r) => r.id === 'winner-scale')!;

    it('fires when ROAS > 150% of target, 5+ days, spend > $200', () => {
      const metrics = makeMetrics({ roas: 5.0, daysRunning: 5, spend: 250 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(true);
    });

    it('does not fire before 5 days', () => {
      const metrics = makeMetrics({ roas: 5.0, daysRunning: 4, spend: 250 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('does not fire with spend <= $200', () => {
      const metrics = makeMetrics({ roas: 5.0, daysRunning: 5, spend: 200 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('does not fire when ROAS is below 150% of target', () => {
      const metrics = makeMetrics({ roas: 4.0, daysRunning: 5, spend: 250 });
      const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
      expect(rule.condition(metrics, hypothesis)).toBe(false);
    });

    it('action is SCALE', () => {
      expect(rule.action).toBe('SCALE');
    });

    it('has minDaysRunning of 5', () => {
      expect(rule.minDaysRunning).toBe(5);
    });
  });
});

// ── evaluateHypothesis Integration ──────────────────────────

describe('evaluateHypothesis', () => {
  let mockDb: ReturnType<typeof makeMockDb>;

  beforeEach(() => {
    mockDb = makeMockDb();
  });

  it('skips when no metaCampaignId', async () => {
    const hypothesis = makeHypothesis({ metaCampaignId: null });
    const executor = makeMockExecutor(makeMetrics());

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('SKIP');
    expect(result.executed).toBe(false);
  });

  it('returns ERROR when getCampaignMetrics fails', async () => {
    const hypothesis = makeHypothesis();
    const executor = makeMockExecutor(makeMetrics());
    executor.getCampaignMetrics.mockRejectedValueOnce(new Error('API down'));

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('ERROR');
    expect(result.executed).toBe(false);
  });

  it('pauses campaign when roas-floor triggers', async () => {
    const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
    const metrics = makeMetrics({ roas: 1.0, daysRunning: 3 });
    const executor = makeMockExecutor(metrics);

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('PAUSE');
    expect(result.executed).toBe(true);
    expect(executor.pauseCampaign).toHaveBeenCalledWith('camp_123');
    expect(mockDb.campaignHypothesis.update).toHaveBeenCalledWith({
      where: { id: 'hyp_test' },
      data: { status: 'PAUSED_BY_SYSTEM' },
    });
    expect(mockDb.stopLossEvent.create).toHaveBeenCalledOnce();
  });

  it('scales campaign when winner-scale triggers', async () => {
    const hypothesis = makeHypothesis({ expectedROAS: 3.0, budgetUSD: 1000, durationDays: 10 });
    const metrics = makeMetrics({ roas: 5.0, daysRunning: 5, spend: 250, ctr: 0.03, conversions: 20 });
    const executor = makeMockExecutor(metrics);

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('SCALE');
    expect(result.executed).toBe(true);
    expect(executor.scaleBudget).toHaveBeenCalledOnce();
    // Should not update hypothesis status for SCALE
    expect(mockDb.campaignHypothesis.update).not.toHaveBeenCalled();
    expect(mockDb.stopLossEvent.create).toHaveBeenCalledOnce();
  });

  it('returns HOLD when no rules trigger', async () => {
    const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
    const metrics = makeMetrics({ roas: 3.0, ctr: 0.02, daysRunning: 5, spend: 100, conversions: 5 });
    const executor = makeMockExecutor(metrics);

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('HOLD');
    expect(result.executed).toBe(false);
    expect(mockDb.stopLossEvent.create).not.toHaveBeenCalled();
  });

  it('respects minDaysRunning — does not fire rules prematurely', async () => {
    const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
    // ROAS is terrible but only 1 day running — no rule should fire
    const metrics = makeMetrics({ roas: 0.1, ctr: 0.001, daysRunning: 1, conversions: 0, spend: 50 });
    const executor = makeMockExecutor(metrics);

    const result = await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    expect(result.action).toBe('HOLD');
    expect(result.executed).toBe(false);
  });

  it('creates StopLossEvent record with correct data on PAUSE', async () => {
    const hypothesis = makeHypothesis({ expectedROAS: 3.0 });
    const metrics = makeMetrics({ roas: 1.0, ctr: 0.015, daysRunning: 4, spend: 200, conversions: 2 });
    const executor = makeMockExecutor(metrics);

    await evaluateHypothesis(
      hypothesis,
      executor as unknown as MetaAdExecutor,
      mockDb as unknown as DbClient,
    );

    const createCall = mockDb.stopLossEvent.create.mock.calls[0]?.[0] as {
      data: { hypothesisId: string; rule: string; actionTaken: string; metricAtTrigger: Record<string, unknown> };
    };
    expect(createCall.data.hypothesisId).toBe('hyp_test');
    expect(createCall.data.rule).toBe('roas-floor');
    expect(createCall.data.actionTaken).toBe('PAUSE');
    expect(createCall.data.metricAtTrigger).toMatchObject({
      roas: 1.0,
      daysRunning: 4,
      spend: 200,
    });
  });
});
