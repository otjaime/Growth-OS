import { describe, it, expect } from 'vitest';
import { evaluateProactiveRules } from './proactive-rules.js';
import type { ProductPerformanceRow } from './proactive-rules.js';

function makeProduct(overrides: Partial<ProductPerformanceRow> = {}): ProductPerformanceRow {
  return {
    productTitle: 'Test Product',
    productType: 'beauty',
    adFitnessScore: 75,
    revenue30d: 8000,
    grossProfit30d: 4000,
    estimatedMargin: 0.65,
    avgPrice: 45,
    avgDailyUnits: 4,
    repeatBuyerPct: 0.12,
    imageUrl: 'https://example.com/img.jpg',
    productTier: 'growth',
    revenueTrend: 0.10,
    revenueShare: 0.05,
    ...overrides,
  };
}

describe('evaluateProactiveRules', () => {
  it('returns eligible products sorted by fitness score', () => {
    const products = [
      makeProduct({ productTitle: 'Low Score', adFitnessScore: 55 }),
      makeProduct({ productTitle: 'High Score', adFitnessScore: 90 }),
      makeProduct({ productTitle: 'Mid Score', adFitnessScore: 70 }),
    ];

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
    });

    expect(recs).toHaveLength(3); // All included (>= 55)
    expect(recs[0]!.productTitle).toBe('High Score');
    expect(recs[1]!.productTitle).toBe('Mid Score');
    expect(recs[2]!.productTitle).toBe('Low Score');
  });

  it('excludes products already being advertised', () => {
    const products = [
      makeProduct({ productTitle: 'Already Running', adFitnessScore: 90 }),
      makeProduct({ productTitle: 'New Candidate', adFitnessScore: 80 }),
    ];

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(['Already Running']),
    });

    expect(recs).toHaveLength(1);
    expect(recs[0]!.productTitle).toBe('New Candidate');
  });

  it('respects maxRecommendations limit', () => {
    const products = Array.from({ length: 10 }, (_, i) =>
      makeProduct({ productTitle: `Product ${i}`, adFitnessScore: 90 - i }),
    );

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
      maxRecommendations: 2,
    });

    expect(recs).toHaveLength(2);
  });

  it('returns empty array when no products are eligible', () => {
    const products = [
      makeProduct({ productTitle: 'Low', adFitnessScore: 40 }),
    ];

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
    });

    expect(recs).toHaveLength(0);
  });

  it('respects custom minFitnessScore', () => {
    const products = [
      makeProduct({ productTitle: 'A', adFitnessScore: 75 }),
      makeProduct({ productTitle: 'B', adFitnessScore: 85 }),
    ];

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
      minFitnessScore: 80,
    });

    expect(recs).toHaveLength(1);
    expect(recs[0]!.productTitle).toBe('B');
  });

  it('calculates estimated ROAS', () => {
    const products = [
      makeProduct({ avgPrice: 100, estimatedMargin: 0.60 }),
    ];

    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
    });

    expect(recs).toHaveLength(1);
    // ROAS = (100 * 0.60) / (100 * 0.25) = 60 / 25 = 2.4
    expect(recs[0]!.estimatedROAS).toBe(2.4);
  });

  it('includes ruleId product_opportunity on all results', () => {
    const products = [makeProduct()];
    const recs = evaluateProactiveRules({
      products,
      existingProductAds: new Set(),
    });

    expect(recs[0]!.ruleId).toBe('product_opportunity');
  });
});
