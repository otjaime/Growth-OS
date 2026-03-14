import { describe, it, expect } from 'vitest';
import { canTransition, applyTransition, VALID_TRANSITIONS } from '../lifecycle.js';
import type { CampaignHypothesis } from '@growth-os/database';

// Helper to create a minimal hypothesis-like object
function makeHypothesis(overrides: Partial<CampaignHypothesis> = {}): CampaignHypothesis {
  return {
    id: 'test-id',
    clientId: 'client-1',
    title: 'Test Hypothesis',
    trigger: 'LOSS_AVERSION',
    triggerMechanism: 'People fear losses more than they value gains',
    awarenessLevel: 'PAIN_AWARE',
    audience: 'Health-conscious millennials aged 25-35',
    funnelStage: 'MOFU',
    creativeAngle: 'Show the cost of inaction on their health',
    copyHook: 'Stop losing $50/month to bad supplements',
    primaryEmotion: 'fear',
    primaryObjection: 'Not sure this product is different from others',
    conviction: 4,
    budgetUSD: 5000,
    durationDays: 14,
    falsificationCondition: 'If CTR < 1.2% after 3 days with 1000+ impressions, the hook is not resonating',
    expectedROAS: 3.0,
    expectedCTR: 2.5,
    expectedCVR: 3.0,
    status: 'DRAFT',
    metaCampaignId: null,
    launchedAt: null,
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

describe('canTransition', () => {
  describe('DRAFT -> APPROVED', () => {
    it('allows transition when all required fields are present', () => {
      const h = makeHypothesis({ status: 'DRAFT' as never });
      const result = canTransition(h, 'APPROVED');
      expect(result.valid).toBe(true);
    });

    it('rejects when title is missing', () => {
      const h = makeHypothesis({ status: 'DRAFT' as never, title: '' as never });
      const result = canTransition(h, 'APPROVED');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('title');
    });

    it('rejects when falsificationCondition is too short', () => {
      const h = makeHypothesis({
        status: 'DRAFT' as never,
        falsificationCondition: 'Too short' as never,
      });
      const result = canTransition(h, 'APPROVED');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('falsificationCondition');
      expect(result.reason).toContain('30');
    });

    it('rejects when conviction is missing', () => {
      const h = makeHypothesis({ status: 'DRAFT' as never, conviction: null as never });
      const result = canTransition(h, 'APPROVED');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('conviction');
    });
  });

  describe('APPROVED -> LIVE', () => {
    it('allows when metaCampaignId is present', () => {
      const h = makeHypothesis({
        status: 'APPROVED' as never,
        metaCampaignId: 'meta-123' as never,
      });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(true);
    });

    it('rejects when metaCampaignId is missing', () => {
      const h = makeHypothesis({ status: 'APPROVED' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('metaCampaignId');
    });
  });

  describe('LIVE -> PAUSED_BY_SYSTEM', () => {
    it('allows with no required fields', () => {
      const h = makeHypothesis({ status: 'LIVE' as never });
      const result = canTransition(h, 'PAUSED_BY_SYSTEM');
      expect(result.valid).toBe(true);
    });
  });

  describe('LIVE -> PAUSED_BY_USER', () => {
    it('allows with no required fields', () => {
      const h = makeHypothesis({ status: 'LIVE' as never });
      const result = canTransition(h, 'PAUSED_BY_USER');
      expect(result.valid).toBe(true);
    });
  });

  describe('PAUSED_BY_SYSTEM -> LIVE', () => {
    it('allows resume with no required fields', () => {
      const h = makeHypothesis({ status: 'PAUSED_BY_SYSTEM' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(true);
    });
  });

  describe('LIVE -> WINNER', () => {
    it('allows when all result fields are present and lesson is long enough', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        actualROAS: 4.5 as never,
        actualCTR: 3.2 as never,
        triggerEffective: true as never,
        lesson: 'Loss aversion headline drove 2.3x higher CTR than control. The specific dollar amount in the hook was key — abstract loss framing underperformed.' as never,
      });
      const result = canTransition(h, 'WINNER');
      expect(result.valid).toBe(true);
    });

    it('rejects when lesson is too short', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        actualROAS: 4.5 as never,
        actualCTR: 3.2 as never,
        triggerEffective: true as never,
        lesson: 'It worked well.' as never,
      });
      const result = canTransition(h, 'WINNER');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('50');
    });

    it('rejects when actualROAS is missing', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        actualCTR: 3.2 as never,
        triggerEffective: true as never,
        lesson: 'Loss aversion headline drove 2.3x higher CTR than control. The specific dollar amount was key.' as never,
      });
      const result = canTransition(h, 'WINNER');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('actualROAS');
    });
  });

  describe('LIVE -> LOSER', () => {
    it('allows when all result fields are present', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        actualROAS: 0.8 as never,
        actualCTR: 0.5 as never,
        triggerEffective: false as never,
        lesson: 'Loss aversion framing backfired with this audience. They are not yet pain-aware enough to respond to loss framing. Need to educate first.' as never,
      });
      const result = canTransition(h, 'LOSER');
      expect(result.valid).toBe(true);
    });

    it('rejects when triggerEffective is missing', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        actualROAS: 0.8 as never,
        actualCTR: 0.5 as never,
        lesson: 'Loss aversion framing backfired with this audience. They are not yet pain-aware enough to respond to loss framing.' as never,
      });
      const result = canTransition(h, 'LOSER');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('triggerEffective');
    });
  });

  describe('LIVE -> INCONCLUSIVE', () => {
    it('allows when lesson is present (no min length for INCONCLUSIVE)', () => {
      const h = makeHypothesis({
        status: 'LIVE' as never,
        lesson: 'Budget ran out before reaching statistical significance.' as never,
      });
      const result = canTransition(h, 'INCONCLUSIVE');
      expect(result.valid).toBe(true);
    });

    it('rejects when lesson is missing', () => {
      const h = makeHypothesis({ status: 'LIVE' as never });
      const result = canTransition(h, 'INCONCLUSIVE');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('lesson');
    });
  });

  describe('PAUSED_BY_USER -> WINNER/LOSER/INCONCLUSIVE', () => {
    it('allows PAUSED_BY_USER -> WINNER', () => {
      const h = makeHypothesis({
        status: 'PAUSED_BY_USER' as never,
        actualROAS: 4.0 as never,
        actualCTR: 2.8 as never,
        triggerEffective: true as never,
        lesson: 'Even after pausing, the data from the initial run clearly showed a winning pattern with the tribal identity approach.' as never,
      });
      const result = canTransition(h, 'WINNER');
      expect(result.valid).toBe(true);
    });

    it('allows PAUSED_BY_USER -> LOSER', () => {
      const h = makeHypothesis({
        status: 'PAUSED_BY_USER' as never,
        actualROAS: 0.5 as never,
        actualCTR: 0.3 as never,
        triggerEffective: false as never,
        lesson: 'Paused early due to poor performance. The curiosity gap hook generated clicks but zero conversions — classic bait-and-switch perception.' as never,
      });
      const result = canTransition(h, 'LOSER');
      expect(result.valid).toBe(true);
    });

    it('allows PAUSED_BY_USER -> INCONCLUSIVE', () => {
      const h = makeHypothesis({
        status: 'PAUSED_BY_USER' as never,
        lesson: 'Paused due to client request. Insufficient data to draw conclusions.' as never,
      });
      const result = canTransition(h, 'INCONCLUSIVE');
      expect(result.valid).toBe(true);
    });
  });

  describe('PAUSED_BY_SYSTEM -> WINNER/LOSER/INCONCLUSIVE', () => {
    it('allows PAUSED_BY_SYSTEM -> WINNER', () => {
      const h = makeHypothesis({
        status: 'PAUSED_BY_SYSTEM' as never,
        actualROAS: 5.0 as never,
        actualCTR: 3.5 as never,
        triggerEffective: true as never,
        lesson: 'System paused due to budget limit but results were clearly positive. Social proof with specific numbers outperformed by 2x.' as never,
      });
      expect(canTransition(h, 'WINNER').valid).toBe(true);
    });

    it('allows PAUSED_BY_SYSTEM -> INCONCLUSIVE', () => {
      const h = makeHypothesis({
        status: 'PAUSED_BY_SYSTEM' as never,
        lesson: 'System paused before sufficient data. Cannot determine outcome.' as never,
      });
      expect(canTransition(h, 'INCONCLUSIVE').valid).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects DRAFT -> LIVE (must go through APPROVED)', () => {
      const h = makeHypothesis({ status: 'DRAFT' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid transition');
    });

    it('rejects WINNER -> LIVE (terminal state)', () => {
      const h = makeHypothesis({ status: 'WINNER' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(false);
    });

    it('rejects LOSER -> DRAFT (terminal state)', () => {
      const h = makeHypothesis({ status: 'LOSER' as never });
      const result = canTransition(h, 'DRAFT');
      expect(result.valid).toBe(false);
    });

    it('rejects INCONCLUSIVE -> LIVE (terminal state)', () => {
      const h = makeHypothesis({ status: 'INCONCLUSIVE' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(false);
    });

    it('rejects APPROVED -> WINNER (must go through LIVE first)', () => {
      const h = makeHypothesis({ status: 'APPROVED' as never });
      const result = canTransition(h, 'WINNER');
      expect(result.valid).toBe(false);
    });

    it('rejects PAUSED_BY_USER -> LIVE (no resume from user pause)', () => {
      const h = makeHypothesis({ status: 'PAUSED_BY_USER' as never });
      const result = canTransition(h, 'LIVE');
      expect(result.valid).toBe(false);
    });
  });
});

describe('applyTransition', () => {
  it('updates status field', () => {
    const h = makeHypothesis({
      status: 'DRAFT' as never,
    });
    const updated = applyTransition(h, 'APPROVED');
    expect(updated.status).toBe('APPROVED');
  });

  it('sets launchedAt when transitioning APPROVED -> LIVE', () => {
    const h = makeHypothesis({
      status: 'APPROVED' as never,
      metaCampaignId: 'meta-456' as never,
    });
    const updated = applyTransition(h, 'LIVE');
    expect(updated.status).toBe('LIVE');
    expect(updated.launchedAt).toBeInstanceOf(Date);
  });

  it('sets closedAt when transitioning to WINNER', () => {
    const h = makeHypothesis({
      status: 'LIVE' as never,
      actualROAS: 4.0 as never,
      actualCTR: 2.5 as never,
      triggerEffective: true as never,
      lesson: 'The loss aversion angle with specific dollar amounts was the winning combination for this pain-aware audience segment.' as never,
    });
    const updated = applyTransition(h, 'WINNER');
    expect(updated.status).toBe('WINNER');
    expect(updated.closedAt).toBeInstanceOf(Date);
  });

  it('sets closedAt when transitioning to LOSER', () => {
    const h = makeHypothesis({
      status: 'LIVE' as never,
      actualROAS: 0.5 as never,
      actualCTR: 0.3 as never,
      triggerEffective: false as never,
      lesson: 'The scarcity messaging did not work for this audience segment because they are subscription-based and know they can reorder anytime.' as never,
    });
    const updated = applyTransition(h, 'LOSER');
    expect(updated.closedAt).toBeInstanceOf(Date);
  });

  it('sets closedAt when transitioning to INCONCLUSIVE', () => {
    const h = makeHypothesis({
      status: 'LIVE' as never,
      lesson: 'Test ran out of budget before reaching significance threshold.' as never,
    });
    const updated = applyTransition(h, 'INCONCLUSIVE');
    expect(updated.closedAt).toBeInstanceOf(Date);
  });

  it('throws on invalid transition', () => {
    const h = makeHypothesis({ status: 'DRAFT' as never });
    expect(() => applyTransition(h, 'LIVE')).toThrow('Cannot transition');
  });

  it('does not mutate the original hypothesis', () => {
    const h = makeHypothesis({ status: 'DRAFT' as never });
    const updated = applyTransition(h, 'APPROVED');
    expect(h.status).toBe('DRAFT');
    expect(updated.status).toBe('APPROVED');
  });
});

describe('VALID_TRANSITIONS', () => {
  it('has correct number of transitions', () => {
    // DRAFT->APPROVED, APPROVED->LIVE,
    // LIVE->PAUSED_BY_SYSTEM, LIVE->PAUSED_BY_USER, PAUSED_BY_SYSTEM->LIVE,
    // LIVE->WINNER, LIVE->LOSER, LIVE->INCONCLUSIVE,
    // PAUSED_BY_SYSTEM->WINNER, PAUSED_BY_SYSTEM->LOSER, PAUSED_BY_SYSTEM->INCONCLUSIVE,
    // PAUSED_BY_USER->WINNER, PAUSED_BY_USER->LOSER, PAUSED_BY_USER->INCONCLUSIVE
    expect(VALID_TRANSITIONS.length).toBe(14);
  });
});
