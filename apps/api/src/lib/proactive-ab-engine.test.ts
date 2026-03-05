import { describe, it, expect } from 'vitest';
import { evaluateProductABTest } from './proactive-ab-engine.js';
import type { VariantPerformance } from './proactive-ab-engine.js';

function variant(overrides: Partial<VariantPerformance> & { variantIndex: number }): VariantPerformance {
  return {
    angle: 'benefit',
    spend: 100,
    impressions: 5000,
    clicks: 200,
    conversions: 20,
    revenue: 400,
    daysActive: 7,
    ...overrides,
  };
}

describe('evaluateProductABTest', () => {
  it('returns insufficient_data when only 1 variant', () => {
    const result = evaluateProductABTest([variant({ variantIndex: 0 })]);
    expect(result.type).toBe('insufficient_data');
  });

  it('returns insufficient_data when spend is too low', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, spend: 10 }),
      variant({ variantIndex: 1, spend: 10 }),
    ]);
    expect(result.type).toBe('insufficient_data');
  });

  it('returns insufficient_data when days are too few', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, daysActive: 2 }),
      variant({ variantIndex: 1, daysActive: 2 }),
    ]);
    expect(result.type).toBe('insufficient_data');
  });

  it('returns all_poor when all variants have bad ROAS', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, spend: 200, revenue: 100 }), // 0.5x
      variant({ variantIndex: 1, spend: 200, revenue: 80 }),  // 0.4x
    ]);
    expect(result.type).toBe('all_poor');
  });

  it('returns winner_found when one variant is significantly better', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, clicks: 1000, conversions: 100, spend: 200, revenue: 600 }),
      variant({ variantIndex: 1, clicks: 1000, conversions: 30, spend: 200, revenue: 180 }),
    ]);
    // The first variant has a much higher conversion rate
    expect(result.type).toBe('winner_found');
    if (result.type === 'winner_found') {
      expect(result.winnerIndex).toBe(0);
      expect(result.loserIndices).toEqual([1]);
    }
  });

  it('returns no_winner_yet when variants are similar', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, clicks: 100, conversions: 10, spend: 100, revenue: 200 }),
      variant({ variantIndex: 1, clicks: 100, conversions: 9, spend: 100, revenue: 180 }),
    ]);
    // Very close conversion rates — no statistical significance
    expect(result.type).toBe('no_winner_yet');
  });

  it('returns forced_winner after max days', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, clicks: 100, conversions: 10, spend: 100, revenue: 200, daysActive: 15 }),
      variant({ variantIndex: 1, clicks: 100, conversions: 9, spend: 100, revenue: 180, daysActive: 15 }),
    ]);
    expect(result.type).toBe('forced_winner');
    if (result.type === 'forced_winner') {
      expect(result.winnerIndex).toBe(0);
    }
  });

  it('handles 3 variants correctly', () => {
    const result = evaluateProductABTest([
      variant({ variantIndex: 0, angle: 'benefit', clicks: 1000, conversions: 120, spend: 200, revenue: 720 }),
      variant({ variantIndex: 1, angle: 'pain_point', clicks: 1000, conversions: 40, spend: 200, revenue: 240 }),
      variant({ variantIndex: 2, angle: 'urgency', clicks: 1000, conversions: 35, spend: 200, revenue: 210 }),
    ]);
    expect(result.type).toBe('winner_found');
    if (result.type === 'winner_found') {
      expect(result.winnerIndex).toBe(0);
      expect(result.loserIndices).toEqual([1, 2]);
    }
  });
});
