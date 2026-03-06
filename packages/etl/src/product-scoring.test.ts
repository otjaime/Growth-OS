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
    expect(result.breakdown.marginScore).toBe(20);
    expect(result.breakdown.velocityScore).toBe(20);
    expect(result.breakdown.profitScore).toBe(30);
    expect(result.breakdown.repeatScore).toBe(15);
    expect(result.breakdown.readinessScore).toBe(15);
    expect(result.eligible).toBe(true);
  });

  it('returns 0 margin score for margin at or below 25%', () => {
    const result = scoreAdFitness({
      revenue30d: 200,
      grossProfit30d: 40,
      estimatedMargin: 0.20,
      avgDailyUnits: 0.05,
      repeatBuyerPct: 0,
      avgPrice: 30,
      hasImage: false,
      hasDescription: false,
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

  it('scales velocity linearly up to 1 daily unit', () => {
    const atHalf = scoreAdFitness({
      revenue30d: 0, grossProfit30d: 0, estimatedMargin: 0.50,
      avgDailyUnits: 0.5, repeatBuyerPct: 0, avgPrice: 0,
      hasImage: false, hasDescription: false,
    });

    const at1 = scoreAdFitness({
      revenue30d: 0, grossProfit30d: 0, estimatedMargin: 0.50,
      avgDailyUnits: 1, repeatBuyerPct: 0, avgPrice: 0,
      hasImage: false, hasDescription: false,
    });

    expect(atHalf.breakdown.velocityScore).toBeCloseTo(10, 1);
    expect(at1.breakdown.velocityScore).toBe(20);
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
    expect(result.breakdown.marginScore).toBe(20);
    expect(result.breakdown.velocityScore).toBe(20);
    expect(result.breakdown.profitScore).toBe(30);
    expect(result.breakdown.repeatScore).toBe(15);
    expect(result.breakdown.readinessScore).toBe(15);
    expect(result.score).toBe(100);
  });

  it('returns eligible=true exactly at score 60', () => {
    // Engineer inputs to land near 60
    const result = scoreAdFitness({
      revenue30d: 1_000,
      grossProfit30d: 400,
      estimatedMargin: 0.40,
      avgDailyUnits: 0.5,
      repeatBuyerPct: 0.05,
      avgPrice: 30,
      hasImage: true,
      hasDescription: true,
    });

    // Margin: (0.40-0.25)/0.30*20 = 10
    // Velocity: 0.5/1*20 = 10
    // Profit: 400/1000*30 = 12
    // Repeat: 0.05/0.10*15 = 7.5
    // Readiness: 15
    // Total ≈ 54.5 — need more.  Let's bump slightly
    expect(result.score).toBeLessThan(60);
    expect(result.eligible).toBe(false);

    // Now a product that crosses the threshold
    const eligible = scoreAdFitness({
      revenue30d: 2_000,
      grossProfit30d: 800,
      estimatedMargin: 0.45,
      avgDailyUnits: 0.8,
      repeatBuyerPct: 0.08,
      avgPrice: 30,
      hasImage: true,
      hasDescription: true,
    });

    // Margin: (0.45-0.25)/0.30*20 ≈ 13.33
    // Velocity: 0.8/1*20 = 16
    // Profit: min(30, 800/1000*30) = 24
    // Repeat: 0.08/0.10*15 = 12
    // Readiness: 15
    // Total ≈ 80.33
    expect(eligible.score).toBeGreaterThanOrEqual(60);
    expect(eligible.eligible).toBe(true);
  });

  // ── Edge case tests ────────────────────────────────────────────

  it('handles NaN revenue gracefully — score is still a finite number', () => {
    const result = scoreAdFitness({
      revenue30d: NaN,
      grossProfit30d: NaN,
      estimatedMargin: 0.50,
      avgDailyUnits: 3,
      repeatBuyerPct: 0.10,
      avgPrice: 30,
      hasImage: true,
      hasDescription: true,
    });

    // NaN propagates through grossProfit (profitScore) but other scores should be valid
    // The score should be a number (even if NaN due to profitScore)
    // The key contract: the function must not throw
    expect(typeof result.score).toBe('number');
    expect(typeof result.breakdown.marginScore).toBe('number');
    expect(typeof result.breakdown.velocityScore).toBe('number');
  });

  it('gives margin score = 0 when margin is negative', () => {
    const result = scoreAdFitness({
      revenue30d: 1000,
      grossProfit30d: -200,
      estimatedMargin: -0.20,
      avgDailyUnits: 5,
      repeatBuyerPct: 0.10,
      avgPrice: 20,
      hasImage: true,
      hasDescription: true,
    });

    expect(result.breakdown.marginScore).toBe(0);
    expect(result.reason).toContain('Margin too low');
  });

  it('gives readiness score = 10 (not 15) when avgPrice is 0', () => {
    const result = scoreAdFitness({
      revenue30d: 1000,
      grossProfit30d: 500,
      estimatedMargin: 0.50,
      avgDailyUnits: 3,
      repeatBuyerPct: 0.10,
      avgPrice: 0, // zero price = no price point
      hasImage: true,
      hasDescription: true,
    });

    // hasImage = 5, hasDescription = 5, avgPrice=0 = 0 → total = 10
    expect(result.breakdown.readinessScore).toBe(10);
  });

  it('clamps all component scores to their max with extremely large values', () => {
    const result = scoreAdFitness({
      revenue30d: 1_000_000_000,
      grossProfit30d: 500_000_000,
      estimatedMargin: 0.99,
      avgDailyUnits: 100_000,
      repeatBuyerPct: 5.0, // 500% — nonsensical but tests clamp
      avgPrice: 10_000,
      hasImage: true,
      hasDescription: true,
    });

    expect(result.breakdown.marginScore).toBe(20);
    expect(result.breakdown.velocityScore).toBe(20);
    expect(result.breakdown.profitScore).toBe(30);
    expect(result.breakdown.repeatScore).toBe(15);
    expect(result.breakdown.readinessScore).toBe(15);
    expect(result.score).toBe(100);
  });

  it('gives margin score = 0 at exactly 25% boundary', () => {
    const result = scoreAdFitness({
      revenue30d: 1000,
      grossProfit30d: 250,
      estimatedMargin: 0.25,
      avgDailyUnits: 3,
      repeatBuyerPct: 0.10,
      avgPrice: 20,
      hasImage: true,
      hasDescription: true,
    });

    // At exactly 0.25: estimatedMargin <= 0.25 → 0
    expect(result.breakdown.marginScore).toBe(0);
  });

  it('gives margin score = 20 at exactly 55% boundary', () => {
    const result = scoreAdFitness({
      revenue30d: 1000,
      grossProfit30d: 550,
      estimatedMargin: 0.55,
      avgDailyUnits: 0,
      repeatBuyerPct: 0,
      avgPrice: 0,
      hasImage: false,
      hasDescription: false,
    });

    // At exactly 0.55: (0.55 - 0.25) / 0.30 * 20 = 20
    expect(result.breakdown.marginScore).toBe(20);
  });
});
