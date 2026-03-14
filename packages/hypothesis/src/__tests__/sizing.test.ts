import { describe, it, expect } from 'vitest';
import { calculateBudget } from '../sizing.js';
import type { SizingInput } from '../sizing.js';

describe('calculateBudget', () => {
  const baseInput: SizingInput = {
    conviction: 3,
    clientMonthlyBudget: 30000,
    triggerWinRate: 0.6,
    activeHypothesesCount: 2,
    sampleSize: 40,
  };

  it('returns correct Kelly fraction for 60% win rate', () => {
    // f* = (0.6 * 1.5 - 0.4) / 1.5 = (0.9 - 0.4) / 1.5 = 0.5 / 1.5 = 0.3333
    const result = calculateBudget(baseInput);
    expect(result.kellyFraction).toBeCloseTo(0.3333, 3);
  });

  it('applies conviction scaling correctly', () => {
    // conviction=3 -> 60% scale
    // Kelly * budget * conviction = 0.3333 * 30000 * 0.6 = 6000
    // maxBudget = 30000 / max(2+1, 3) = 30000 / 3 = 10000
    // min(6000, 10000) = 6000
    const result = calculateBudget(baseInput);
    expect(result.recommendedBudget).toBe(6000);
    expect(result.confidenceAdjustment).toContain('FULL_KELLY');
  });

  it('caps budget at portfolio concentration limit', () => {
    const input: SizingInput = {
      ...baseInput,
      conviction: 5, // 100% scale -> 0.3333 * 30000 * 1.0 = 10000
      // maxBudget = 30000 / 3 = 10000
      // 10000 == 10000, so not capped
    };
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(10000);
  });

  it('caps when kelly budget exceeds max', () => {
    const input: SizingInput = {
      conviction: 5,
      clientMonthlyBudget: 30000,
      triggerWinRate: 0.8, // higher win rate
      activeHypothesesCount: 5,
      sampleSize: 50,
    };
    // f* = (0.8*1.5 - 0.2) / 1.5 = (1.2 - 0.2)/1.5 = 0.6667
    // Kelly budget = 0.6667 * 30000 * 1.0 = 20000
    // maxBudget = 30000 / max(6, 3) = 30000 / 6 = 5000
    // Capped at 5000
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(5000);
    expect(result.confidenceAdjustment).toContain('CAPPED');
  });

  it('uses half-Kelly when sampleSize < 30', () => {
    const input: SizingInput = {
      ...baseInput,
      sampleSize: 15,
    };
    // half-Kelly = 0.3333 / 2 = 0.1667
    // budget = 0.1667 * 30000 * 0.6 = 3000
    const result = calculateBudget(input);
    expect(result.kellyFraction).toBeCloseTo(0.1667, 3);
    expect(result.recommendedBudget).toBe(3000);
    expect(result.confidenceAdjustment).toContain('HALF_KELLY');
  });

  it('returns $500 minimum for negative Kelly (losing strategy)', () => {
    const input: SizingInput = {
      ...baseInput,
      triggerWinRate: 0.2, // p=0.2, q=0.8 -> f* = (0.2*1.5 - 0.8)/1.5 = (0.3-0.8)/1.5 = -0.3333
    };
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(500);
    expect(result.kellyFraction).toBeLessThan(0);
    expect(result.confidenceAdjustment).toContain('NEGATIVE_EDGE');
  });

  it('returns $500 minimum for break-even win rate', () => {
    // At p = 1/(1+b) = 1/2.5 = 0.4, Kelly is exactly 0
    const input: SizingInput = {
      ...baseInput,
      triggerWinRate: 0.4,
    };
    // f* = (0.4*1.5 - 0.6)/1.5 = (0.6-0.6)/1.5 = 0
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(500);
    expect(result.kellyFraction).toBe(0);
  });

  it('enforces $500 minimum even when calculated budget is lower', () => {
    const input: SizingInput = {
      conviction: 1, // 20% scale
      clientMonthlyBudget: 3000,
      triggerWinRate: 0.5,
      activeHypothesesCount: 10,
      sampleSize: 40,
    };
    // f* = (0.5*1.5 - 0.5)/1.5 = 0.25/1.5 = 0.1667
    // Kelly budget = 0.1667 * 3000 * 0.2 = 100
    // maxBudget = 3000 / max(11, 3) = 3000 / 11 = 272.73
    // min(100, 272.73) = 100 -> floor at 500
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(500);
  });

  it('conviction 1 uses 20% multiplier', () => {
    const input: SizingInput = {
      ...baseInput,
      conviction: 1,
    };
    // 0.3333 * 30000 * 0.2 = 2000
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(2000);
  });

  it('conviction 5 uses 100% multiplier', () => {
    const input: SizingInput = {
      ...baseInput,
      conviction: 5,
    };
    // 0.3333 * 30000 * 1.0 = 10000
    // maxBudget = 30000/3 = 10000
    const result = calculateBudget(input);
    expect(result.recommendedBudget).toBe(10000);
  });

  it('maxBudget is at least $500', () => {
    const input: SizingInput = {
      conviction: 3,
      clientMonthlyBudget: 600,
      triggerWinRate: 0.2,
      activeHypothesesCount: 10,
      sampleSize: 40,
    };
    const result = calculateBudget(input);
    expect(result.maxBudget).toBeGreaterThanOrEqual(500);
  });
});
