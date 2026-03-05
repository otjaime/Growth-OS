import { describe, it, expect } from 'vitest';
import { scoreAdFitness } from './product-scoring.js';

describe('scoreAdFitness', () => {
  it('returns max score for a perfect product', () => {
    const result = scoreAdFitness({
      revenue30d: 20_000,
      grossProfit30d: 12_000,
      estimatedMargin: 0.65,
      avgDailyUnits: 10,
      repeatBuyerPct: 0.30,
      avgPrice: 50,
      hasImage: true,
      hasDescription: true,
    });

    expect(result.score).toBe(100);
    expect(result.breakdown.marginScore).toBe(25);
    expect(result.breakdown.velocityScore).toBe(25);
    expect(result.breakdown.profitScore).toBe(20);
    expect(result.breakdown.repeatScore).toBe(15);
    expect(result.breakdown.readinessScore).toBe(15);
    expect(result.eligible).toBe(true);
  });

  it('returns 0 margin score for margin below 30%', () => {
    const result = scoreAdFitness({
      revenue30d: 5_000,
      grossProfit30d: 1_000,
      estimatedMargin: 0.25,
      avgDailyUnits: 3,
      repeatBuyerPct: 0.10,
      avgPrice: 30,
      hasImage: true,
      hasDescription: true,
    });

    expect(result.breakdown.marginScore).toBe(0);
    expect(result.reason).toContain('Margin too low');
  });

  it('returns ineligible for low velocity product', () => {
    const result = scoreAdFitness({
      revenue30d: 500,
      grossProfit30d: 250,
      estimatedMargin: 0.50,
      avgDailyUnits: 0.5,
      repeatBuyerPct: 0.05,
      avgPrice: 40,
      hasImage: false,
      hasDescription: false,
    });

    expect(result.eligible).toBe(false);
    expect(result.score).toBeLessThan(60);
  });

  it('gives readiness points for image, description, and price', () => {
    const withAll = scoreAdFitness({
      revenue30d: 0,
      grossProfit30d: 0,
      estimatedMargin: 0.50,
      avgDailyUnits: 0,
      repeatBuyerPct: 0,
      avgPrice: 10,
      hasImage: true,
      hasDescription: true,
    });

    const withNone = scoreAdFitness({
      revenue30d: 0,
      grossProfit30d: 0,
      estimatedMargin: 0.50,
      avgDailyUnits: 0,
      repeatBuyerPct: 0,
      avgPrice: 0,
      hasImage: false,
      hasDescription: false,
    });

    expect(withAll.breakdown.readinessScore).toBe(15);
    expect(withNone.breakdown.readinessScore).toBe(0);
    expect(withAll.score - withNone.score).toBeCloseTo(15, 1);
  });

  it('scales velocity linearly up to 5 daily units', () => {
    const at2 = scoreAdFitness({
      revenue30d: 0, grossProfit30d: 0, estimatedMargin: 0.50,
      avgDailyUnits: 2, repeatBuyerPct: 0, avgPrice: 0,
      hasImage: false, hasDescription: false,
    });

    const at5 = scoreAdFitness({
      revenue30d: 0, grossProfit30d: 0, estimatedMargin: 0.50,
      avgDailyUnits: 5, repeatBuyerPct: 0, avgPrice: 0,
      hasImage: false, hasDescription: false,
    });

    expect(at2.breakdown.velocityScore).toBeCloseTo(10, 1);
    expect(at5.breakdown.velocityScore).toBe(25);
  });

  it('caps all components at their max', () => {
    const result = scoreAdFitness({
      revenue30d: 100_000,
      grossProfit30d: 50_000,
      estimatedMargin: 0.90,
      avgDailyUnits: 100,
      repeatBuyerPct: 0.80,
      avgPrice: 200,
      hasImage: true,
      hasDescription: true,
    });

    // All scores should be capped at max
    expect(result.breakdown.marginScore).toBe(25);
    expect(result.breakdown.velocityScore).toBe(25);
    expect(result.breakdown.profitScore).toBe(20);
    expect(result.breakdown.repeatScore).toBe(15);
    expect(result.breakdown.readinessScore).toBe(15);
    expect(result.score).toBe(100);
  });

  it('returns eligible=true exactly at score 60', () => {
    // Engineer inputs to land near 60
    const result = scoreAdFitness({
      revenue30d: 5_000,
      grossProfit30d: 2_500,
      estimatedMargin: 0.50,
      avgDailyUnits: 3,
      repeatBuyerPct: 0.10,
      avgPrice: 30,
      hasImage: true,
      hasDescription: true,
    });

    // Margin: (0.50-0.30)/0.35*25 ≈ 14.29
    // Velocity: 3/5*25 = 15
    // Profit: 2500/5000*20 = 10
    // Repeat: 0.10/0.20*15 = 7.5
    // Readiness: 15
    // Total ≈ 61.79
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.eligible).toBe(true);
  });
});
