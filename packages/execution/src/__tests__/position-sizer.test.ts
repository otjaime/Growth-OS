import { describe, it, expect } from 'vitest';
import { calculateScaleTarget } from '../position-sizer.js';

describe('calculateScaleTarget', () => {
  it('returns current budget when ROAS equals expected', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 3.0,
      expectedROAS: 3.0,
    });
    expect(result).toBe(100);
  });

  it('returns current budget when ROAS is below expected', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 2.0,
      expectedROAS: 3.0,
    });
    expect(result).toBe(100);
  });

  it('scales proportionally to overperformance', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 6.0,
      expectedROAS: 3.0,
    });
    // 6/3 = 2x multiplier
    expect(result).toBe(200);
  });

  it('caps at maxScaleMultiplier', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 15.0,
      expectedROAS: 3.0,
      maxScaleMultiplier: 2.5,
    });
    // 15/3 = 5x, capped at 2.5x
    expect(result).toBe(250);
  });

  it('uses default maxScaleMultiplier of 2.5', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 30.0,
      expectedROAS: 3.0,
    });
    // 30/3 = 10x, capped at default 2.5x
    expect(result).toBe(250);
  });

  it('handles custom maxScaleMultiplier', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 50,
      currentROAS: 10.0,
      expectedROAS: 2.0,
      maxScaleMultiplier: 3.0,
    });
    // 10/2 = 5x, capped at 3.0x
    expect(result).toBe(150);
  });

  it('returns current budget when expectedROAS is zero', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 5.0,
      expectedROAS: 0,
    });
    expect(result).toBe(100);
  });

  it('returns current budget when expectedROAS is negative', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 5.0,
      expectedROAS: -1,
    });
    expect(result).toBe(100);
  });

  it('handles small overperformance correctly', () => {
    const result = calculateScaleTarget({
      currentDailyBudget: 100,
      currentROAS: 3.3,
      expectedROAS: 3.0,
    });
    // 3.3/3.0 = 1.1x
    expect(result).toBeCloseTo(110, 1);
  });
});
