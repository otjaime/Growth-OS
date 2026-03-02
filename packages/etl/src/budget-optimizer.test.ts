// ──────────────────────────────────────────────────────────────
// Growth OS — Portfolio Budget Optimizer Tests
// Golden fixtures with hand-calculated expected values.
// Covers basic optimization, edge cases, and budget constraints.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { optimizeBudgetAllocation } from './budget-optimizer.js';
import type { AdSetMetrics, BudgetOptimizerConfig } from './budget-optimizer.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeAdSet(overrides: Partial<AdSetMetrics> = {}): AdSetMetrics {
  return {
    adSetId: 'as-1',
    adSetName: 'Test Ad Set',
    currentDailyBudget: 100,
    spend7d: 700,
    revenue7d: 2800,
    roas7d: 4.0,
    impressions7d: 50000,
    clicks7d: 1500,
    conversions7d: 40,
    frequency7d: 2.0,
    ...overrides,
  };
}

const DEFAULT_CONFIG: BudgetOptimizerConfig = {
  maxChangePct: 30,
  minDailyBudget: 10,
};

// ── Basic optimization ──────────────────────────────────────────

describe('optimizeBudgetAllocation', () => {
  describe('basic optimization with 3 ad sets of varying ROAS', () => {
    it('allocates more to high ROAS and less to low ROAS', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-high', adSetName: 'High ROAS', currentDailyBudget: 100, spend7d: 700, revenue7d: 2800, roas7d: 4.0, frequency7d: 1.5 }),
        makeAdSet({ adSetId: 'as-mid', adSetName: 'Mid ROAS', currentDailyBudget: 100, spend7d: 700, revenue7d: 1050, roas7d: 1.5, frequency7d: 2.0 }),
        makeAdSet({ adSetId: 'as-low', adSetName: 'Low ROAS', currentDailyBudget: 100, spend7d: 700, revenue7d: 350, roas7d: 0.5, frequency7d: 3.0 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      // High ROAS (4.0x) with low frequency (1.5) should increase by 30%
      const highAlloc = result.allocations.find((a) => a.adSetId === 'as-high')!;
      expect(highAlloc.suggestedDailyBudget).toBe(130); // 100 * 1.30
      expect(highAlloc.changePct).toBeGreaterThan(0);

      // Mid ROAS (1.5x) is between breakeven and target (2.0x) => hold steady
      const midAlloc = result.allocations.find((a) => a.adSetId === 'as-mid')!;
      expect(midAlloc.suggestedDailyBudget).toBe(100);
      expect(midAlloc.changePct).toBe(0);

      // Low ROAS (0.5x) is below breakeven (1.0x) => decrease
      const lowAlloc = result.allocations.find((a) => a.adSetId === 'as-low')!;
      expect(lowAlloc.suggestedDailyBudget).toBeLessThan(100);
      expect(lowAlloc.changePct).toBeLessThan(0);

      expect(result.allocations).toHaveLength(3);
      // currentBlendedRoas = totalRevenue / totalSpend = (2800+1050+350) / (700+700+700) = 4200/2100 = 2.0
      expect(result.currentBlendedRoas).toBe(2);
    });
  });

  // ── Underperformer budget decrease ──────────────────────────────

  describe('underperformer budget decrease', () => {
    it('decreases budget for ad set with ROAS below 1.0', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({
          adSetId: 'as-under',
          adSetName: 'Underperformer',
          currentDailyBudget: 50,
          spend7d: 350,
          revenue7d: 175,
          roas7d: 0.5,
          frequency7d: 4.0,
        }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);
      const alloc = result.allocations[0]!;

      // ROAS 0.5 < 1.0 threshold => decrease
      expect(alloc.suggestedDailyBudget).toBeLessThan(50);
      expect(alloc.changePct).toBeLessThan(0);
      expect(alloc.reason).toContain('below breakeven');
    });
  });

  // ── Winner gets scaled ──────────────────────────────────────────

  describe('winner gets scaled', () => {
    it('increases budget for ad set with high ROAS and low frequency', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({
          adSetId: 'as-winner',
          adSetName: 'Winner',
          currentDailyBudget: 200,
          spend7d: 1400,
          revenue7d: 7000,
          roas7d: 5.0,
          frequency7d: 1.0,
        }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);
      const alloc = result.allocations[0]!;

      // ROAS 5.0 >= target 2.0 and frequency 1.0 < 3.0 => scale up by maxChangePct
      expect(alloc.suggestedDailyBudget).toBe(260); // 200 * 1.30
      expect(alloc.changePct).toBe(30);
      expect(alloc.reason).toContain('Scaling up');
    });

    it('holds budget for high ROAS but high frequency', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({
          adSetId: 'as-saturated',
          adSetName: 'Saturated',
          currentDailyBudget: 200,
          spend7d: 1400,
          revenue7d: 7000,
          roas7d: 5.0,
          frequency7d: 5.0, // >= 3 threshold
        }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);
      const alloc = result.allocations[0]!;

      // High ROAS but frequency >= 3 => hold
      expect(alloc.suggestedDailyBudget).toBe(200);
      expect(alloc.changePct).toBe(0);
      expect(alloc.reason).toContain('frequency');
      expect(alloc.reason).toContain('Holding steady');
    });
  });

  // ── Budget cap enforcement ──────────────────────────────────────

  describe('budget cap enforcement', () => {
    it('scales down suggested budgets when total exceeds totalBudgetCap', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-a', adSetName: 'A', currentDailyBudget: 100, roas7d: 4.0, frequency7d: 1.0, spend7d: 700, revenue7d: 2800 }),
        makeAdSet({ adSetId: 'as-b', adSetName: 'B', currentDailyBudget: 100, roas7d: 3.0, frequency7d: 1.5, spend7d: 700, revenue7d: 2100 }),
      ];

      // Both would be scaled up (ROAS >= 2.0, freq < 3)
      // Without cap: 130 + 130 = 260
      // With cap of 200: should scale down to fit
      const configWithCap: BudgetOptimizerConfig = {
        maxChangePct: 30,
        minDailyBudget: 10,
        totalBudgetCap: 200,
      };

      const result = optimizeBudgetAllocation(adSets, configWithCap);
      const totalSuggested = result.allocations.reduce((sum, a) => sum + a.suggestedDailyBudget, 0);

      expect(totalSuggested).toBeLessThanOrEqual(200);
    });

    it('does not scale when total is within cap', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-a', adSetName: 'A', currentDailyBudget: 50, roas7d: 4.0, frequency7d: 1.0, spend7d: 350, revenue7d: 1400 }),
      ];

      const configWithCap: BudgetOptimizerConfig = {
        maxChangePct: 30,
        minDailyBudget: 10,
        totalBudgetCap: 500,
      };

      const result = optimizeBudgetAllocation(adSets, configWithCap);
      const alloc = result.allocations[0]!;

      // 50 * 1.3 = 65 which is well under 500 cap
      expect(alloc.suggestedDailyBudget).toBe(65);
    });
  });

  // ── Empty input ─────────────────────────────────────────────────

  describe('empty input', () => {
    it('returns reasonable defaults for empty ad set array', () => {
      const result = optimizeBudgetAllocation([], DEFAULT_CONFIG);

      expect(result.totalCurrentDailyBudget).toBe(0);
      expect(result.totalSuggestedDailyBudget).toBe(0);
      expect(result.currentBlendedRoas).toBeNull();
      expect(result.projectedBlendedRoas).toBeNull();
      expect(result.allocations).toHaveLength(0);
      expect(result.summary).toBe('No ad sets provided for optimization.');
    });
  });

  // ── All null ROAS ───────────────────────────────────────────────

  describe('all null ROAS', () => {
    it('holds budgets steady when all ROAS values are null', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-1', adSetName: 'Null A', currentDailyBudget: 100, roas7d: null, spend7d: 0, revenue7d: 0, frequency7d: null }),
        makeAdSet({ adSetId: 'as-2', adSetName: 'Null B', currentDailyBudget: 80, roas7d: null, spend7d: 0, revenue7d: 0, frequency7d: null }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      for (const alloc of result.allocations) {
        expect(alloc.changePct).toBe(0);
        expect(alloc.reason).toContain('Insufficient data');
      }

      expect(result.totalCurrentDailyBudget).toBe(180);
      expect(result.totalSuggestedDailyBudget).toBe(180);
    });
  });

  // ── Single ad set ───────────────────────────────────────────────

  describe('single ad set', () => {
    it('handles single ad set correctly', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-solo', adSetName: 'Solo', currentDailyBudget: 150, roas7d: 3.0, frequency7d: 2.0, spend7d: 1050, revenue7d: 3150 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      expect(result.allocations).toHaveLength(1);
      // ROAS 3.0 >= target 2.0 and frequency 2.0 < 3.0 => increase
      const alloc = result.allocations[0]!;
      expect(alloc.suggestedDailyBudget).toBe(195); // 150 * 1.30
      expect(result.summary).toContain('1 ad set');
      // Not "1 ad sets"
      expect(result.summary).not.toContain('1 ad sets');
    });
  });

  // ── Minimum daily budget floor ──────────────────────────────────

  describe('minimum daily budget floor', () => {
    it('never drops below minDailyBudget even for underperformers', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({
          adSetId: 'as-floor',
          adSetName: 'Floor Test',
          currentDailyBudget: 15,
          roas7d: 0.1,
          spend7d: 105,
          revenue7d: 10.5,
          frequency7d: 8.0,
        }),
      ];

      const configHighFloor: BudgetOptimizerConfig = {
        maxChangePct: 90,
        minDailyBudget: 10,
      };

      const result = optimizeBudgetAllocation(adSets, configHighFloor);
      const alloc = result.allocations[0]!;

      // Even with 90% max decrease, should not go below minDailyBudget of 10
      expect(alloc.suggestedDailyBudget).toBeGreaterThanOrEqual(10);
    });

    it('enforces floor even with budget cap scaling', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-a', adSetName: 'A', currentDailyBudget: 100, roas7d: 4.0, frequency7d: 1.0, spend7d: 700, revenue7d: 2800 }),
        makeAdSet({ adSetId: 'as-b', adSetName: 'B', currentDailyBudget: 100, roas7d: 3.5, frequency7d: 1.5, spend7d: 700, revenue7d: 2450 }),
      ];

      // Very tight cap forces heavy scaling
      const configTightCap: BudgetOptimizerConfig = {
        maxChangePct: 30,
        minDailyBudget: 20,
        totalBudgetCap: 50,
      };

      const result = optimizeBudgetAllocation(adSets, configTightCap);

      for (const alloc of result.allocations) {
        expect(alloc.suggestedDailyBudget).toBeGreaterThanOrEqual(20);
      }
    });
  });

  // ── Summary text correctness ────────────────────────────────────

  describe('summary text', () => {
    it('includes blended ROAS figures when available', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-1', adSetName: 'A', currentDailyBudget: 100, roas7d: 3.0, frequency7d: 1.5, spend7d: 700, revenue7d: 2100 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      expect(result.summary).toContain('blended ROAS');
      expect(result.summary).toContain('Analyzed 1 ad set.');
    });

    it('mentions net budget increase/decrease', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-1', adSetName: 'A', currentDailyBudget: 100, roas7d: 4.0, frequency7d: 1.0, spend7d: 700, revenue7d: 2800 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      // Budget increases from 100 to 130 => net increase of $30
      expect(result.summary).toContain('increase');
      expect(result.summary).toContain('$30.00');
    });
  });

  // ── Projected blended ROAS ──────────────────────────────────────

  describe('projected blended ROAS', () => {
    it('computes weighted projected ROAS using suggested budgets', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-1', adSetName: 'A', currentDailyBudget: 100, roas7d: 4.0, frequency7d: 1.0, spend7d: 700, revenue7d: 2800 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      // Single ad set: projected = (revenue7d/7) * (suggestedBudget / currentBudget) / suggestedBudget
      // = (2800/7) * (130/100) / 130 = 400 * 1.3 / 130 = 520/130 = 4.0
      expect(result.projectedBlendedRoas).toBe(4.0);
    });

    it('returns null projected ROAS for all null ROAS ad sets', () => {
      const adSets: readonly AdSetMetrics[] = [
        makeAdSet({ adSetId: 'as-1', adSetName: 'A', currentDailyBudget: 100, roas7d: null, spend7d: 0, revenue7d: 0 }),
      ];

      const result = optimizeBudgetAllocation(adSets, DEFAULT_CONFIG);

      expect(result.projectedBlendedRoas).toBeNull();
    });
  });
});
