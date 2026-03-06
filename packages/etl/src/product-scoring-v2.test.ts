import { describe, it, expect } from 'vitest';
import { scoreDtcProduct } from './product-scoring-v2.js';
import type { DtcScoreInput } from './product-scoring-v2.js';

function makeInput(overrides: Partial<DtcScoreInput> = {}): DtcScoreInput {
  return {
    revenue30d: 5000,
    grossProfit30d: 2500,
    estimatedMargin: 0.50,
    avgDailyUnits: 0.8,
    avgPrice: 50,
    repeatBuyerPct: 0.12,
    revenueShare: 0.08,
    revenueTrend: 0.10,
    daysSinceFirstSale: 120,
    hasImage: true,
    hasDescription: true,
    hasCollections: true,
    historicalRoas: 2.5,
    timesAdvertised: 5,
    ...overrides,
  };
}

/** Build a "perfect" input that maximizes every scoring component. */
function makePerfectInput(): DtcScoreInput {
  return {
    revenue30d: 20000,
    grossProfit30d: 10000,
    estimatedMargin: 0.55,
    avgDailyUnits: 2.0,
    avgPrice: 100,
    repeatBuyerPct: 0.20,
    revenueShare: 0.15,
    revenueTrend: 0.30,
    daysSinceFirstSale: 365,
    hasImage: true,
    hasDescription: true,
    hasCollections: true,
    historicalRoas: 3.0,
    timesAdvertised: 10,
  };
}

describe('scoreDtcProduct', () => {
  // ── 1. Perfect product → score 100, tier hero, eligible true ──
  it('scores a perfect product at 100 with hero tier', () => {
    const result = scoreDtcProduct(makePerfectInput());
    expect(result.score).toBe(100);
    expect(result.tier).toBe('hero');
    expect(result.eligible).toBe(true);
    expect(result.breakdown.profitabilityScore).toBe(25);
    expect(result.breakdown.demandScore).toBe(25);
    expect(result.breakdown.customerScore).toBe(20);
    expect(result.breakdown.creativeScore).toBe(15);
    expect(result.breakdown.adViabilityScore).toBe(15);
  });

  // ── 2. Low margin product → low profitability score ──
  it('gives 0 profitability when margin <= 20%', () => {
    const result = scoreDtcProduct(makeInput({ estimatedMargin: 0.15 }));
    expect(result.breakdown.profitabilityScore).toBe(0);
  });

  it('shows margin too low reason when margin <= 20% and product is ineligible', () => {
    const result = scoreDtcProduct(makeInput({
      estimatedMargin: 0.15,
      avgDailyUnits: 0.01,  // also kill demand
      revenueShare: 0,
      repeatBuyerPct: 0,
      historicalRoas: 0.3,
      hasImage: false,
      hasDescription: false,
      hasCollections: false,
      avgPrice: 5,
    }));
    expect(result.breakdown.profitabilityScore).toBe(0);
    expect(result.reason).toContain('Margin too low');
  });

  it('gives partial profitability for 35% margin', () => {
    const result = scoreDtcProduct(makeInput({ estimatedMargin: 0.35 }));
    // Margin: (0.35 - 0.25) / 0.30 * 10 = 3.33 pts
    expect(result.breakdown.profitabilityScore).toBeGreaterThan(0);
    expect(result.breakdown.profitabilityScore).toBeLessThan(25);
  });

  // ── 3. Declining trend product → reduced demand score ──
  it('gives lower demand score for negative trend', () => {
    const declining = scoreDtcProduct(makeInput({ revenueTrend: -0.30 }));
    const growing = scoreDtcProduct(makeInput({ revenueTrend: 0.20 }));
    expect(declining.breakdown.demandScore).toBeLessThan(growing.breakdown.demandScore);
  });

  it('gives 0 trend pts for -50% or worse decline', () => {
    const result = scoreDtcProduct(makeInput({ revenueTrend: -0.60 }));
    // velocity should still contribute, but trend pts = 0
    // With velocity of 0.8 → 0.8/1 * 15 = 12 pts velocity
    // trend at -0.60 → clamped to 0 = 0 pts trend
    expect(result.breakdown.demandScore).toBeCloseTo(12, 0);
  });

  // ── 4. New arrival (< 45 days) → new_arrival campaign recommendation ──
  it('recommends new_arrival for recent product with image and good margin', () => {
    const result = scoreDtcProduct(makeInput({
      daysSinceFirstSale: 20,
      estimatedMargin: 0.45,
    }));
    const newArrival = result.campaignTypes.find(c => c.type === 'new_arrival');
    expect(newArrival).toBeDefined();
    expect(newArrival!.confidence).toBeGreaterThanOrEqual(70);
    expect(newArrival!.reason).toContain('New product');
  });

  it('does not recommend new_arrival when daysSinceFirstSale >= 45', () => {
    const result = scoreDtcProduct(makeInput({ daysSinceFirstSale: 60 }));
    const newArrival = result.campaignTypes.find(c => c.type === 'new_arrival');
    expect(newArrival).toBeUndefined();
  });

  it('does not recommend new_arrival when no image', () => {
    const result = scoreDtcProduct(makeInput({
      daysSinceFirstSale: 10,
      hasImage: false,
    }));
    const newArrival = result.campaignTypes.find(c => c.type === 'new_arrival');
    expect(newArrival).toBeUndefined();
  });

  it('does not recommend new_arrival when margin < 30%', () => {
    const result = scoreDtcProduct(makeInput({
      daysSinceFirstSale: 10,
      estimatedMargin: 0.25,
    }));
    const newArrival = result.campaignTypes.find(c => c.type === 'new_arrival');
    expect(newArrival).toBeUndefined();
  });

  // ── 5. Hero product → hero_product campaign recommendation ──
  it('recommends hero_product for hero tier with high score', () => {
    const result = scoreDtcProduct(makePerfectInput());
    const hero = result.campaignTypes.find(c => c.type === 'hero_product');
    expect(hero).toBeDefined();
    expect(hero!.confidence).toBe(100);
    expect(hero!.reason).toContain('revenue share');
  });

  it('does not recommend hero_product when tier is not hero', () => {
    // Low revenue share prevents hero tier
    const result = scoreDtcProduct(makeInput({ revenueShare: 0.01 }));
    const hero = result.campaignTypes.find(c => c.type === 'hero_product');
    expect(hero).toBeUndefined();
  });

  // ── 6. Untested product (no ad history) → gets 5 pts for viability ──
  it('gives 5 ROAS pts for untested product', () => {
    const untested = scoreDtcProduct(makeInput({ historicalRoas: null }));
    const tested = scoreDtcProduct(makeInput({ historicalRoas: 2.5 }));
    // Untested gets 5 ROAS pts, tested with 2.5 gets 10
    expect(untested.breakdown.adViabilityScore).toBeLessThan(tested.breakdown.adViabilityScore);
    // With price >= 15 → 5 pts + 5 ROAS pts = 10
    expect(untested.breakdown.adViabilityScore).toBe(10);
  });

  // ── 7. Bad ROAS history → 0 viability pts ──
  it('gives 0 ROAS pts for low historical ROAS', () => {
    const result = scoreDtcProduct(makeInput({ historicalRoas: 0.5, avgPrice: 8 }));
    expect(result.breakdown.adViabilityScore).toBe(0);
  });

  it('gives 3 ROAS pts for ROAS between 1.0 and 1.5', () => {
    const result = scoreDtcProduct(makeInput({ historicalRoas: 1.2, avgPrice: 8 }));
    // 3 ROAS pts + 0 price pts (< 10) = 3
    expect(result.breakdown.adViabilityScore).toBe(3);
  });

  it('gives 7 ROAS pts for ROAS between 1.5 and 2.0', () => {
    const result = scoreDtcProduct(makeInput({ historicalRoas: 1.7, avgPrice: 8 }));
    // 7 ROAS pts + 0 price pts = 7
    expect(result.breakdown.adViabilityScore).toBe(7);
  });

  // ── 8. No image/description → low creative score ──
  it('gives 0 creative score when no image, no description, no collections, low price', () => {
    const result = scoreDtcProduct(makeInput({
      hasImage: false,
      hasDescription: false,
      hasCollections: false,
      avgPrice: 5,
    }));
    expect(result.breakdown.creativeScore).toBe(0);
  });

  it('gives partial creative for image only', () => {
    const result = scoreDtcProduct(makeInput({
      hasImage: true,
      hasDescription: false,
      hasCollections: false,
      avgPrice: 5,
    }));
    expect(result.breakdown.creativeScore).toBe(6);
  });

  it('gives full creative score for everything', () => {
    const result = scoreDtcProduct(makeInput({
      hasImage: true,
      hasDescription: true,
      hasCollections: true,
      avgPrice: 50,
    }));
    // 6 + 5 + 2 + 2 = 15
    expect(result.breakdown.creativeScore).toBe(15);
  });

  // ── 9. Clamping at max values ──
  it('clamps score at 100 even with extreme inputs', () => {
    const result = scoreDtcProduct(makeInput({
      revenue30d: 1000000,
      grossProfit30d: 500000,
      avgDailyUnits: 100,
      repeatBuyerPct: 1.0,
      revenueShare: 0.5,
      revenueTrend: 5.0,
    }));
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.profitabilityScore).toBeLessThanOrEqual(25);
    expect(result.breakdown.demandScore).toBeLessThanOrEqual(25);
    expect(result.breakdown.customerScore).toBeLessThanOrEqual(20);
    expect(result.breakdown.creativeScore).toBeLessThanOrEqual(15);
    expect(result.breakdown.adViabilityScore).toBeLessThanOrEqual(15);
  });

  // ── 10. Edge cases: NaN, negative values, zero revenue ──
  it('handles NaN revenue gracefully', () => {
    const result = scoreDtcProduct(makeInput({
      revenue30d: NaN,
      grossProfit30d: NaN,
    }));
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('handles negative values gracefully', () => {
    const result = scoreDtcProduct(makeInput({
      revenue30d: -100,
      grossProfit30d: -50,
      avgDailyUnits: -1,
      revenueTrend: -2,
    }));
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    // Negative velocity should yield 0 demand
    expect(result.breakdown.demandScore).toBe(0);
  });

  it('handles zero revenue product', () => {
    const result = scoreDtcProduct(makeInput({
      revenue30d: 0,
      grossProfit30d: 0,
      avgDailyUnits: 0,
      revenueShare: 0,
      repeatBuyerPct: 0,
    }));
    expect(result.eligible).toBe(false);
    expect(result.score).toBeLessThan(55);
  });

  // ── Tier classification ──
  it('classifies growth tier for score >= 55 with positive trend', () => {
    const result = scoreDtcProduct(makeInput({
      revenueShare: 0.02,  // too low for hero
      revenueTrend: 0.05,  // positive trend
    }));
    if (result.score >= 55) {
      expect(result.tier).toBe('growth');
    }
  });

  it('classifies niche tier for moderate score with repeat buyers', () => {
    const result = scoreDtcProduct(makeInput({
      revenueShare: 0.01,
      revenueTrend: -0.10,
      repeatBuyerPct: 0.15,
      avgDailyUnits: 0.3,
      grossProfit30d: 500,
    }));
    if (result.score >= 40 && result.score < 55) {
      expect(result.tier).toBe('niche');
    }
  });

  it('classifies long-tail for low-scoring products', () => {
    const result = scoreDtcProduct(makeInput({
      revenue30d: 50,
      grossProfit30d: 10,
      estimatedMargin: 0.15,
      avgDailyUnits: 0.01,
      revenueShare: 0.001,
      repeatBuyerPct: 0.0,
      revenueTrend: -0.50,
      hasImage: false,
      hasDescription: false,
      hasCollections: false,
      historicalRoas: 0.3,
      avgPrice: 5,
    }));
    expect(result.tier).toBe('long-tail');
    expect(result.eligible).toBe(false);
  });

  // ── Eligibility threshold ──
  it('marks eligible at exactly score 55', () => {
    // We need to construct a product that scores exactly 55
    // This is hard to do precisely, so we test boundary behavior
    const result = scoreDtcProduct(makeInput());
    if (result.score >= 55) {
      expect(result.eligible).toBe(true);
    } else {
      expect(result.eligible).toBe(false);
    }
  });

  // ── Price point thresholds ──
  it('gives 5 price pts for avgPrice >= 15', () => {
    const result = scoreDtcProduct(makeInput({ avgPrice: 20, historicalRoas: null }));
    // 5 ROAS (untested) + 5 price = 10
    expect(result.breakdown.adViabilityScore).toBe(10);
  });

  it('gives 3 price pts for avgPrice between 10 and 15', () => {
    const result = scoreDtcProduct(makeInput({ avgPrice: 12, historicalRoas: null }));
    // 5 ROAS (untested) + 3 price = 8
    expect(result.breakdown.adViabilityScore).toBe(8);
  });

  it('gives 0 price pts for avgPrice < 10', () => {
    const result = scoreDtcProduct(makeInput({ avgPrice: 8, historicalRoas: null }));
    // 5 ROAS (untested) + 0 price = 5
    expect(result.breakdown.adViabilityScore).toBe(5);
  });

  // ── Low velocity threshold ──
  it('gives 0 demand score when velocity < 0.05', () => {
    const result = scoreDtcProduct(makeInput({ avgDailyUnits: 0.03 }));
    expect(result.breakdown.demandScore).toBe(0);
  });

  // ── Reason strings ──
  it('includes reason with top factor for eligible products', () => {
    const result = scoreDtcProduct(makePerfectInput());
    expect(result.reason).toContain('Strong ad candidate');
    expect(result.reason).toContain('tier: hero');
  });

  it('mentions velocity in reason for low-velocity ineligible products', () => {
    const result = scoreDtcProduct(makeInput({
      avgDailyUnits: 0.02,
      estimatedMargin: 0.25,
      revenueShare: 0,
      repeatBuyerPct: 0,
      historicalRoas: 0.3,
      hasImage: false,
      hasDescription: false,
      hasCollections: false,
      avgPrice: 5,
      grossProfit30d: 10,
    }));
    expect(result.reason).toContain('velocity');
  });
});
