// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Health Scoring Tests
// Golden fixtures with hand-calculated expected values.
// Covers scoring, grading, trend detection, and edge cases.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { scoreCampaignHealth } from './campaign-health.js';
import type { CampaignMetrics, AdSetHealth, CampaignHealthConfig } from './campaign-health.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeAdSet(overrides: Partial<AdSetHealth> = {}): AdSetHealth {
  return {
    adSetId: 'as-1',
    spend7d: 700,
    revenue7d: 2800,
    roas7d: 4.0,
    ctr7d: 0.03,
    frequency7d: 1.5,
    roas14d: 3.8,
    ctr14d: 0.028,
    ...overrides,
  };
}

function makeCampaign(
  adSets: readonly AdSetHealth[],
  overrides: Partial<CampaignMetrics> = {},
): CampaignMetrics {
  return {
    campaignId: 'camp-1',
    campaignName: 'Test Campaign',
    adSets,
    ...overrides,
  };
}

// ── Perfect campaign ────────────────────────────────────────────

describe('scoreCampaignHealth', () => {
  describe('perfect campaign', () => {
    it('scores near 100 with grade A when all metrics are at target', () => {
      // ROAS 4.0 >= target 2.0 => roasScore = 25
      // 7d ROAS (4.0) vs 14d ROAS (3.5): (4.0 - 3.5)/3.5 = 14.3% > 10% => efficiencyScore = 25
      // frequency 1.0 < 1.5 => scaleScore = 25
      // Stable ROAS values with low CV => stabilityScore = 25
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 4.0,
          roas14d: 3.5, // 7d/14d change > 10% => improving
          frequency7d: 1.0,
          spend7d: 1000,
          roasValues: [3.8, 3.9, 4.0, 4.1, 3.9, 4.0, 4.0], // Low CV
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // roasScore = 25, efficiencyScore = 25, scaleScore = 25, stabilityScore = 25
      expect(result.overallScore).toBe(100);
      expect(result.grade).toBe('A');
      expect(result.trend).toBe('improving');
      expect(result.components.roasScore).toBe(25);
      expect(result.components.efficiencyScore).toBe(25);
      expect(result.components.scaleScore).toBe(25);
      expect(result.components.stabilityScore).toBe(25);
      // All components >= 80% of max (20) => no top issue
      expect(result.topIssue).toBeNull();
    });
  });

  // ── Struggling campaign ───────────────────────────────────────

  describe('struggling campaign', () => {
    it('scores low with grade D or F for bad metrics', () => {
      // ROAS 0.5 < target 2.0 => roasScore = (0.5/2.0)*25 = 6.25 (rounded to 6.3)
      // 7d ROAS (0.5) vs 14d ROAS (0.8): (0.5 - 0.8)/0.8 = -37.5% < -10% => efficiencyScore = 5
      // frequency 6.0 >= 4.5 => scaleScore = 0
      // Volatile ROAS values => stabilityScore = 5
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 0.5,
          roas14d: 0.8,
          frequency7d: 6.0,
          spend7d: 500,
          roasValues: [0.2, 0.9, 0.3, 1.1, 0.1, 0.8, 0.5], // High CV
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // roasScore = 6.3, efficiencyScore = 5, scaleScore = 0, stabilityScore varies
      expect(result.overallScore).toBeLessThan(35);
      expect(['D', 'F']).toContain(result.grade);
      expect(result.trend).toBe('declining');
      expect(result.topIssue).not.toBeNull();
    });
  });

  // ── Improving trend ───────────────────────────────────────────

  describe('improving trend', () => {
    it('detects improving trend when 7d ROAS is >10% above 14d ROAS', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 3.5,
          roas14d: 3.0, // (3.5 - 3.0)/3.0 = 16.7% > 10%
          frequency7d: 2.0,
          spend7d: 700,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.trend).toBe('improving');
    });

    it('detects declining trend when 7d ROAS is >10% below 14d ROAS', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 2.5,
          roas14d: 3.0, // (2.5 - 3.0)/3.0 = -16.7% < -10%
          frequency7d: 2.0,
          spend7d: 700,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.trend).toBe('declining');
    });

    it('detects stable trend when change is within +/- 10%', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 3.1,
          roas14d: 3.0, // (3.1 - 3.0)/3.0 = 3.3% within [-10%, 10%]
          frequency7d: 2.0,
          spend7d: 700,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.trend).toBe('stable');
    });
  });

  // ── Empty ad sets ─────────────────────────────────────────────

  describe('empty ad sets', () => {
    it('returns reasonable defaults for campaign with no ad sets', () => {
      const campaign = makeCampaign([]);
      const result = scoreCampaignHealth(campaign);

      expect(result.overallScore).toBe(0);
      expect(result.grade).toBe('F');
      expect(result.trend).toBe('stable');
      expect(result.topIssue).toBe('No ad sets found for this campaign.');
      expect(result.components.roasScore).toBe(0);
      expect(result.components.efficiencyScore).toBe(0);
      expect(result.components.scaleScore).toBe(0);
      expect(result.components.stabilityScore).toBe(0);
    });
  });

  // ── Grade boundaries ──────────────────────────────────────────

  describe('grade boundaries', () => {
    it('assigns grade A for score >= 80', () => {
      // Build a campaign that scores exactly 80
      // roasScore = 25 (ROAS >= target), efficiencyScore = 25, scaleScore = 25, stabilityScore = 5
      // Total = 80
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 3.0,
          roas14d: 2.5, // improving
          frequency7d: 1.0,
          spend7d: 700,
          roasValues: [1.0, 5.0, 1.0, 5.0, 1.0, 5.0, 1.0], // Very volatile => stabilityScore = 5
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // roasScore = 25, efficiencyScore = 25, scaleScore = 25, stabilityScore = 5
      expect(result.overallScore).toBe(80);
      expect(result.grade).toBe('A');
    });

    it('assigns grade B for score 65-79', () => {
      // roasScore = 25 (ROAS >= target), efficiencyScore = 15 (stable), scaleScore = 20, stabilityScore = 5
      // Total = 65
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 2.5,
          roas14d: 2.4, // stable (change = 4.2%)
          frequency7d: 2.0,
          spend7d: 700,
          roasValues: [1.0, 5.0, 1.0, 5.0, 1.0, 5.0, 1.0], // Very volatile => stabilityScore = 5
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // roasScore = 25, efficiencyScore = 15, scaleScore = 20, stabilityScore = 5
      expect(result.overallScore).toBe(65);
      expect(result.grade).toBe('B');
    });

    it('assigns grade C for score 50-64', () => {
      // roasScore = 25, efficiencyScore = 5 (declining), scaleScore = 12, stabilityScore = 10
      // Target = 2.0, roas7d = 2.5, roas14d = 3.0 => declining
      // frequency = 3.0 => scaleScore = 12
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 2.5,
          roas14d: 3.0, // declining: (2.5-3.0)/3.0 = -16.7%
          frequency7d: 3.0, // => scaleScore = 12
          spend7d: 700,
          roasValues: [2.0, 3.0, 2.5, 3.5, 2.0, 2.8, 3.2], // Moderate CV => 10
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.overallScore).toBeGreaterThanOrEqual(50);
      expect(result.overallScore).toBeLessThan(65);
      expect(result.grade).toBe('C');
    });

    it('assigns grade D for score 35-49', () => {
      // roasScore = (1.0/2.0)*25 = 12.5, efficiencyScore = 5, scaleScore = 5, stabilityScore = 15
      // frequency 4.0 => scaleScore = 5
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 1.0,
          roas14d: 1.5, // declining: (1.0-1.5)/1.5 = -33%
          frequency7d: 4.0,
          spend7d: 700,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // roasScore = 12.5, efficiencyScore = 5, scaleScore = 5, stabilityScore = 15 (default)
      // Total = 37.5 => rounded = 38
      expect(result.overallScore).toBeGreaterThanOrEqual(35);
      expect(result.overallScore).toBeLessThan(50);
      expect(result.grade).toBe('D');
    });

    it('assigns grade F for score < 35', () => {
      // roasScore = (0.3/2.0)*25 = 3.75, efficiencyScore = 5, scaleScore = 0, stabilityScore = 5
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 0.3,
          roas14d: 0.5, // declining
          frequency7d: 6.0, // scaleScore = 0
          spend7d: 700,
          roasValues: [0.1, 0.8, 0.2, 0.7, 0.1, 0.9, 0.3], // volatile => 5
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.overallScore).toBeLessThan(35);
      expect(result.grade).toBe('F');
    });
  });

  // ── topIssue detection ────────────────────────────────────────

  describe('topIssue detection', () => {
    it('picks the lowest scoring component as top issue', () => {
      // Make scaleScore the clear lowest
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 4.0,
          roas14d: 3.5,       // improving => efficiencyScore = 25
          frequency7d: 5.0,   // scaleScore = 0 (the lowest)
          spend7d: 700,
          roasValues: [3.8, 3.9, 4.0, 4.1, 3.9, 4.0, 4.0], // stable => stabilityScore = 25
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // scaleScore = 0 is the lowest
      expect(result.topIssue).toContain('frequency');
    });

    it('returns null topIssue when all components score well', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 4.0,
          roas14d: 3.5,
          frequency7d: 1.0,
          spend7d: 700,
          roasValues: [3.8, 3.9, 4.0, 4.1, 3.9, 4.0, 4.0],
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // All components >= 20 (80% of 25) => no issue flagged
      expect(result.topIssue).toBeNull();
    });

    it('picks ROAS issue when roasScore is lowest', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 0.5,
          roas14d: 0.45, // improving (but ROAS still very low)
          frequency7d: 1.0,
          spend7d: 700,
          roasValues: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      expect(result.topIssue).toContain('ROAS');
    });
  });

  // ── Custom config ─────────────────────────────────────────────

  describe('custom config', () => {
    it('uses custom targetRoas for ROAS scoring', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: 3.0,
          roas14d: 2.8,
          frequency7d: 2.0,
          spend7d: 700,
        }),
      ];

      // With target 2.0: ROAS 3.0 >= 2.0 => roasScore = 25
      const campaign = makeCampaign(adSets);
      const resultLowTarget = scoreCampaignHealth(campaign, { targetRoas: 2.0 });
      expect(resultLowTarget.components.roasScore).toBe(25);

      // With target 6.0: ROAS 3.0 < 6.0 => roasScore = (3.0/6.0)*25 = 12.5
      const resultHighTarget = scoreCampaignHealth(campaign, { targetRoas: 6.0 });
      expect(resultHighTarget.components.roasScore).toBe(12.5);
    });
  });

  // ── Spend-weighted averaging ──────────────────────────────────

  describe('spend-weighted averaging', () => {
    it('correctly weights metrics by spend across multiple ad sets', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          adSetId: 'as-big',
          roas7d: 4.0,
          roas14d: 3.8,
          frequency7d: 2.0,
          spend7d: 900,
        }),
        makeAdSet({
          adSetId: 'as-small',
          roas7d: 1.0,
          roas14d: 0.9,
          frequency7d: 5.0,
          spend7d: 100,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // Blended ROAS = (4.0*900 + 1.0*100) / (900+100) = 3700/1000 = 3.7
      // roasScore = 25 (3.7 >= target 2.0)
      expect(result.components.roasScore).toBe(25);

      // Blended frequency = (2.0*900 + 5.0*100) / 1000 = 2300/1000 = 2.3
      // 2.3 < 2.5 => scaleScore = 20
      expect(result.components.scaleScore).toBe(20);
    });
  });

  // ── Null metric handling ──────────────────────────────────────

  describe('null metric handling', () => {
    it('uses default scores when ROAS values are null', () => {
      const adSets: readonly AdSetHealth[] = [
        makeAdSet({
          roas7d: null,
          roas14d: null,
          frequency7d: null,
          spend7d: 700,
        }),
      ];

      const campaign = makeCampaign(adSets);
      const result = scoreCampaignHealth(campaign);

      // null ROAS => roasScore = 0
      expect(result.components.roasScore).toBe(0);
      // null 7d/14d => efficiencyScore defaults to 15
      expect(result.components.efficiencyScore).toBe(15);
      // null frequency => scaleScore defaults to 15
      expect(result.components.scaleScore).toBe(15);
      // no roasValues => stabilityScore defaults to 15
      expect(result.components.stabilityScore).toBe(15);
      // trend stable when nulls
      expect(result.trend).toBe('stable');
    });
  });
});
