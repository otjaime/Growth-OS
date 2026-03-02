// ──────────────────────────────────────────────────────────────
// Growth OS — Creative Decay Analysis Tests
// Golden fixtures with hand-calculated expected values.
// Covers decay classification, linear regression, and edge cases.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { analyzeCreativeDecay, linearRegression } from './creative-decay.js';
import type { DailySnapshot } from './creative-decay.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  return {
    date: '2026-02-20',
    spend: 50,
    revenue: 200,
    roas: 4.0,
    ctr: 0.03,
    impressions: 10000,
    frequency: 2.0,
    ...overrides,
  };
}

/**
 * Generate N daily snapshots with linearly declining ROAS.
 * First snapshot starts at startRoas, last snapshot ends near endRoas.
 */
function generateDecliningSnapshots(
  count: number,
  startRoas: number,
  endRoas: number,
): DailySnapshot[] {
  const step = (endRoas - startRoas) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const roas = startRoas + step * i;
    const date = `2026-02-${String(i + 1).padStart(2, '0')}`;
    return makeSnapshot({ date, roas, revenue: roas * 50 });
  });
}

/**
 * Generate N daily snapshots with stable ROAS.
 */
function generateStableSnapshots(count: number, roas: number): DailySnapshot[] {
  return Array.from({ length: count }, (_, i) => {
    const date = `2026-02-${String(i + 1).padStart(2, '0')}`;
    return makeSnapshot({ date, roas, revenue: roas * 50 });
  });
}

// ── linearRegression helper ─────────────────────────────────────

describe('linearRegression', () => {
  it('computes correct slope and intercept for perfect linear data', () => {
    // y = 2x + 1
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, 3, 5, 7, 9];

    const result = linearRegression(xs, ys);

    expect(result.slope).toBeCloseTo(2, 10);
    expect(result.intercept).toBeCloseTo(1, 10);
    expect(result.r2).toBeCloseTo(1, 10);
  });

  it('computes negative slope for declining data', () => {
    // y = -0.5x + 5
    const xs = [0, 1, 2, 3, 4, 5, 6];
    const ys = [5, 4.5, 4, 3.5, 3, 2.5, 2];

    const result = linearRegression(xs, ys);

    expect(result.slope).toBeCloseTo(-0.5, 10);
    expect(result.intercept).toBeCloseTo(5, 10);
    expect(result.r2).toBeCloseTo(1, 10);
  });

  it('returns zero slope and average intercept for single point', () => {
    const xs = [5];
    const ys = [10];

    const result = linearRegression(xs, ys);

    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(10);
    expect(result.r2).toBe(0);
  });

  it('returns zero slope when all x values are the same', () => {
    const xs = [3, 3, 3, 3];
    const ys = [1, 2, 3, 4];

    const result = linearRegression(xs, ys);

    expect(result.slope).toBe(0);
    expect(result.r2).toBe(0);
  });

  it('returns r2 between 0 and 1 for noisy data', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, 2.5, 2, 4.5, 4];

    const result = linearRegression(xs, ys);

    expect(result.r2).toBeGreaterThanOrEqual(0);
    expect(result.r2).toBeLessThanOrEqual(1);
    // Positive slope overall
    expect(result.slope).toBeGreaterThan(0);
  });

  it('handles empty arrays', () => {
    const result = linearRegression([], []);

    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.r2).toBe(0);
  });
});

// ── analyzeCreativeDecay ────────────────────────────────────────

describe('analyzeCreativeDecay', () => {
  // ── Healthy creative ──────────────────────────────────────────

  describe('healthy creative', () => {
    it('returns healthy for stable ROAS over 21+ days', () => {
      const snapshots = generateStableSnapshots(25, 3.5);

      const result = analyzeCreativeDecay('ad-1', 'Stable Ad', snapshots, 3.5);

      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('high'); // 25 >= 21
      expect(result.peakRoas).toBe(3.5);
      expect(result.currentRoas).toBe(3.5);
      expect(result.ageInDays).toBe(25);
    });

    it('returns healthy with flat or upward trend', () => {
      // Upward trend: ROAS going from 2.0 to 4.0
      const snapshots = generateDecliningSnapshots(14, 2.0, 4.0); // actually increasing

      const result = analyzeCreativeDecay('ad-2', 'Growing Ad', snapshots, 4.0);

      // Slope is positive => decay rate is negative => classified as healthy
      expect(result.recommendation).toBe('healthy');
    });
  });

  // ── Early decay ───────────────────────────────────────────────

  describe('early decay', () => {
    it('detects gradual ROAS decline as early_decay', () => {
      // Decline from 4.0 to about 3.0 over 14 days
      // Slope = (3.0 - 4.0) / 13 = -0.0769 per day
      // weeklyChange = slope * 7 = -0.0769 * 7 = -0.5385
      // decayRate = -weeklyChange / peakRoas = 0.5385 / 4.0 = 0.1346
      // 0.05 <= 0.1346 < 0.15 => early_decay
      const snapshots = generateDecliningSnapshots(14, 4.0, 3.0);

      const result = analyzeCreativeDecay('ad-3', 'Fading Ad', snapshots, 3.0);

      expect(result.recommendation).toBe('early_decay');
      expect(result.decayRate).not.toBeNull();
      expect(result.decayRate!).toBeGreaterThanOrEqual(0.05);
      expect(result.decayRate!).toBeLessThan(0.15);
      expect(result.peakRoas).toBe(4.0);
      expect(result.confidence).toBe('medium'); // 14 >= 14 but < 21
    });
  });

  // ── Accelerating decay ────────────────────────────────────────

  describe('accelerating decay', () => {
    it('detects steep ROAS decline as accelerating_decay', () => {
      // Decline from 5.0 to 1.5 over 14 days
      // Slope = (1.5 - 5.0) / 13 = -0.2692 per day
      // weeklyChange = -0.2692 * 7 = -1.8846
      // decayRate = 1.8846 / 5.0 = 0.3769
      // 0.3769 >= 0.15 => accelerating_decay
      // BUT: currentRoas = 1.5 > 1.2 => no replace_now override
      const snapshots = generateDecliningSnapshots(14, 5.0, 1.5);

      const result = analyzeCreativeDecay('ad-4', 'Crashing Ad', snapshots, 1.5);

      expect(result.recommendation).toBe('accelerating_decay');
      expect(result.decayRate!).toBeGreaterThanOrEqual(0.15);
    });
  });

  // ── Replace now ───────────────────────────────────────────────

  describe('replace now', () => {
    it('recommends replace_now for low ROAS with positive decay rate', () => {
      // Declining from 3.0 to 0.8 over 14 days
      // currentRoas = 0.8 < 1.2 ceiling AND decayRate > 0 => replace_now
      const snapshots = generateDecliningSnapshots(14, 3.0, 0.8);

      const result = analyzeCreativeDecay('ad-5', 'Dead Ad', snapshots, 0.8);

      expect(result.recommendation).toBe('replace_now');
      expect(result.currentRoas).toBe(0.8);
    });

    it('does not recommend replace_now if ROAS is above ceiling', () => {
      // Declining but still above 1.2 ceiling
      const snapshots = generateDecliningSnapshots(14, 4.0, 2.0);

      const result = analyzeCreativeDecay('ad-6', 'Above Ceiling', snapshots, 2.0);

      // currentRoas 2.0 >= 1.2 => cannot be replace_now
      expect(result.recommendation).not.toBe('replace_now');
    });
  });

  // ── Insufficient data ─────────────────────────────────────────

  describe('insufficient data', () => {
    it('returns healthy with low confidence for < 7 snapshots', () => {
      const snapshots = generateStableSnapshots(5, 3.0);

      const result = analyzeCreativeDecay('ad-7', 'New Ad', snapshots, 3.0);

      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('low');
      expect(result.decayRate).toBeNull();
      expect(result.estimatedDaysToBreakeven).toBeNull();
      expect(result.ageInDays).toBe(5);
    });

    it('returns healthy with low confidence for exactly 0 snapshots', () => {
      const result = analyzeCreativeDecay('ad-8', 'Empty Ad', [], 2.0);

      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('low');
      expect(result.ageInDays).toBe(0);
      expect(result.peakRoas).toBe(2.0); // falls back to currentRoas
    });

    it('returns healthy with low confidence for 6 snapshots (just below threshold)', () => {
      const snapshots = generateDecliningSnapshots(6, 4.0, 0.5);

      const result = analyzeCreativeDecay('ad-9', 'Almost Enough', snapshots, 0.5);

      // Even though data shows steep decline, < 7 snapshots => insufficient
      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('low');
    });
  });

  // ── All null ROAS ─────────────────────────────────────────────

  describe('all null ROAS', () => {
    it('handles all null ROAS snapshots gracefully', () => {
      const snapshots = Array.from({ length: 10 }, (_, i) =>
        makeSnapshot({ date: `2026-02-${String(i + 1).padStart(2, '0')}`, roas: null }),
      );

      const result = analyzeCreativeDecay('ad-10', 'Null ROAS Ad', snapshots, null);

      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('low');
      expect(result.peakRoas).toBeNull();
      expect(result.decayRate).toBeNull();
    });

    it('handles mix of null and non-null with fewer than 2 valid points', () => {
      const snapshots = Array.from({ length: 10 }, (_, i) =>
        makeSnapshot({
          date: `2026-02-${String(i + 1).padStart(2, '0')}`,
          roas: i === 5 ? 3.0 : null, // Only one valid ROAS
        }),
      );

      const result = analyzeCreativeDecay('ad-11', 'Sparse Ad', snapshots, 3.0);

      // Only 1 non-null ROAS in regression window => not enough for regression
      expect(result.recommendation).toBe('healthy');
      expect(result.confidence).toBe('low');
    });
  });

  // ── Estimated days to breakeven ───────────────────────────────

  describe('estimated days to breakeven', () => {
    it('extrapolates days until ROAS hits 1.0', () => {
      // Decline from 4.0 to 2.0 over 14 days (slope = -2/13 per day)
      // currentRoas = 2.0
      // daysToBreakeven = (1.0 - 2.0) / slope = -1.0 / (-2/13) = 13/2 = 6.5 => ceil = 7
      const snapshots = generateDecliningSnapshots(14, 4.0, 2.0);

      const result = analyzeCreativeDecay('ad-12', 'Declining Ad', snapshots, 2.0);

      expect(result.estimatedDaysToBreakeven).not.toBeNull();
      expect(result.estimatedDaysToBreakeven!).toBeGreaterThan(0);
      expect(result.estimatedDaysToBreakeven!).toBe(7);
    });

    it('returns null when ROAS is already below 1.0', () => {
      const snapshots = generateDecliningSnapshots(14, 2.0, 0.5);

      const result = analyzeCreativeDecay('ad-13', 'Below Breakeven', snapshots, 0.5);

      // currentRoas 0.5 <= 1.0 => no days-to-breakeven calculation
      expect(result.estimatedDaysToBreakeven).toBeNull();
    });

    it('returns null when ROAS is stable (no declining slope)', () => {
      const snapshots = generateStableSnapshots(14, 3.0);

      const result = analyzeCreativeDecay('ad-14', 'Stable', snapshots, 3.0);

      // Slope is ~0 or positive => no breakeven extrapolation
      expect(result.estimatedDaysToBreakeven).toBeNull();
    });
  });

  // ── Confidence levels ─────────────────────────────────────────

  describe('confidence levels', () => {
    it('returns low confidence for < 14 days', () => {
      const snapshots = generateStableSnapshots(10, 3.0);
      const result = analyzeCreativeDecay('ad-15', 'Short', snapshots, 3.0);
      expect(result.confidence).toBe('low');
    });

    it('returns medium confidence for 14-20 days', () => {
      const snapshots = generateStableSnapshots(18, 3.0);
      const result = analyzeCreativeDecay('ad-16', 'Medium', snapshots, 3.0);
      expect(result.confidence).toBe('medium');
    });

    it('returns high confidence for >= 21 days', () => {
      const snapshots = generateStableSnapshots(21, 3.0);
      const result = analyzeCreativeDecay('ad-17', 'Long', snapshots, 3.0);
      expect(result.confidence).toBe('high');
    });
  });
});
