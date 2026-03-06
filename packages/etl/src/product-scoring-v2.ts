// ──────────────────────────────────────────────────────────────
// Growth OS — DTC Product Scoring Engine v2
// Multi-dimensional scoring with trend analysis, ad viability,
// and campaign type recommendations.
// Pure function: no DB access, no side effects.
// ──────────────────────────────────────────────────────────────

export interface DtcScoreInput {
  // Performance
  readonly revenue30d: number;
  readonly grossProfit30d: number;
  readonly estimatedMargin: number;
  readonly avgDailyUnits: number;
  readonly avgPrice: number;
  // Customer signals
  readonly repeatBuyerPct: number;
  readonly revenueShare: number;
  // Trend signals
  readonly revenueTrend: number;        // -1 to +inf (% change)
  readonly daysSinceFirstSale: number;
  // Creative readiness
  readonly hasImage: boolean;
  readonly hasDescription: boolean;
  readonly hasCollections: boolean;
  // Ad history
  readonly historicalRoas: number | null;
  readonly timesAdvertised: number;
}

export interface DtcScoreBreakdown {
  readonly profitabilityScore: number;  // 0-25
  readonly demandScore: number;         // 0-25
  readonly customerScore: number;       // 0-20
  readonly creativeScore: number;       // 0-15
  readonly adViabilityScore: number;    // 0-15
}

export interface CampaignRecommendation {
  readonly type: 'hero_product' | 'category' | 'seasonal' | 'new_arrival' | 'cross_sell';
  readonly confidence: number;         // 0-100
  readonly reason: string;
}

export interface DtcScoreResult {
  readonly score: number;              // 0-100
  readonly tier: 'hero' | 'growth' | 'niche' | 'long-tail';
  readonly breakdown: DtcScoreBreakdown;
  readonly eligible: boolean;
  readonly campaignTypes: readonly CampaignRecommendation[];
  readonly reason: string;
}

/**
 * Linearly interpolate a value within [min, max] → [0, maxPts].
 * Clamps at both ends.
 */
function linearScale(value: number, min: number, max: number, maxPts: number): number {
  if (!Number.isFinite(value) || value <= min) return 0;
  if (value >= max) return maxPts;
  return ((value - min) / (max - min)) * maxPts;
}

/**
 * Score a product's fitness for DTC advertising using a
 * multi-dimensional model (0-100).
 *
 * Components:
 *   - Profitability (0-25): gross profit absolute + margin %
 *   - Demand (0-25):        velocity + trend momentum
 *   - Customer Signal (0-20): repeat buyer rate + revenue share
 *   - Creative Ready (0-15): image, description, collections, price
 *   - Ad Viability (0-15):  historical ROAS + price point
 *
 * Products scoring >= 55 are "ad-eligible."
 */
export function scoreDtcProduct(input: DtcScoreInput): DtcScoreResult {
  // ── Profitability (0-25) ──────────────────────────────────
  let profitabilityScore: number;
  if (!Number.isFinite(input.estimatedMargin) || input.estimatedMargin <= 0.20) {
    profitabilityScore = 0;
  } else {
    // Gross profit absolute: $0-$2000/mo → 0-15 pts
    const profitAbsolute = linearScale(
      Number.isFinite(input.grossProfit30d) ? input.grossProfit30d : 0,
      0, 2000, 15,
    );
    // Margin %: 25%-55% → 0-10 pts
    const marginPts = linearScale(input.estimatedMargin, 0.25, 0.55, 10);
    profitabilityScore = profitAbsolute + marginPts;
  }

  // ── Demand (0-25) ─────────────────────────────────────────
  const safeVelocity = Number.isFinite(input.avgDailyUnits) ? input.avgDailyUnits : 0;
  let demandScore: number;
  if (safeVelocity < 0.05) {
    demandScore = 0;
  } else {
    // Velocity: 0-1 daily units → 0-15 pts
    const velocityPts = linearScale(safeVelocity, 0, 1, 15);
    // Trend momentum: -50% = 0 pts, 0% = 5 pts, +20%+ = 10 pts
    const safeTrend = Number.isFinite(input.revenueTrend) ? input.revenueTrend : 0;
    const trendPts = linearScale(safeTrend, -0.50, 0.20, 10);
    demandScore = velocityPts + trendPts;
  }

  // ── Customer Signal (0-20) ────────────────────────────────
  const safeRepeat = Number.isFinite(input.repeatBuyerPct) ? input.repeatBuyerPct : 0;
  const safeRevenueShare = Number.isFinite(input.revenueShare) ? input.revenueShare : 0;
  // Repeat buyer: 0%-15% → 0-10 pts
  const repeatPts = linearScale(safeRepeat, 0, 0.15, 10);
  // Revenue share: 0%-10% → 0-10 pts
  const sharePts = linearScale(safeRevenueShare, 0, 0.10, 10);
  const customerScore = repeatPts + sharePts;

  // ── Creative Ready (0-15) ─────────────────────────────────
  const safePrice = Number.isFinite(input.avgPrice) ? input.avgPrice : 0;
  const creativeScore =
    (input.hasImage ? 6 : 0) +
    (input.hasDescription ? 5 : 0) +
    (input.hasCollections ? 2 : 0) +
    (safePrice > 10 ? 2 : 0);

  // ── Ad Viability (0-15) ───────────────────────────────────
  let roasPts: number;
  if (input.historicalRoas === null || input.historicalRoas === undefined) {
    // Untested product — moderate potential
    roasPts = 5;
  } else {
    const safeRoas = Number.isFinite(input.historicalRoas) ? input.historicalRoas : 0;
    if (safeRoas >= 2.0) {
      roasPts = 10;
    } else if (safeRoas >= 1.5) {
      roasPts = 7;
    } else if (safeRoas >= 1.0) {
      // Between 1.0 and 1.5 — marginal
      roasPts = 3;
    } else {
      roasPts = 0;
    }
  }
  const pricePts = safePrice >= 15 ? 5 : safePrice >= 10 ? 3 : 0;
  const adViabilityScore = roasPts + pricePts;

  // ── Total Score ───────────────────────────────────────────
  const rawScore = profitabilityScore + demandScore + customerScore + creativeScore + adViabilityScore;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)) * 100) / 100;

  // ── Breakdown ─────────────────────────────────────────────
  const breakdown: DtcScoreBreakdown = {
    profitabilityScore: Math.round(Math.min(25, profitabilityScore) * 100) / 100,
    demandScore: Math.round(Math.min(25, demandScore) * 100) / 100,
    customerScore: Math.round(Math.min(20, customerScore) * 100) / 100,
    creativeScore: Math.min(15, creativeScore),
    adViabilityScore: Math.min(15, adViabilityScore),
  };

  // ── Eligibility ───────────────────────────────────────────
  const eligible = score >= 55;

  // ── Tier Classification ───────────────────────────────────
  let tier: 'hero' | 'growth' | 'niche' | 'long-tail';
  if (score >= 75 && safeRevenueShare >= 0.05) {
    tier = 'hero';
  } else if (score >= 55 && (Number.isFinite(input.revenueTrend) ? input.revenueTrend : 0) > 0) {
    tier = 'growth';
  } else if (score >= 40 && safeRepeat >= 0.10) {
    tier = 'niche';
  } else {
    tier = 'long-tail';
  }

  // ── Campaign Type Recommendations ─────────────────────────
  const campaignTypes: CampaignRecommendation[] = [];

  if (tier === 'hero' && score >= 70 && input.hasImage) {
    campaignTypes.push({
      type: 'hero_product',
      confidence: Math.min(100, Math.round(score)),
      reason: `Top-performing product with ${(safeRevenueShare * 100).toFixed(1)}% revenue share`,
    });
  }

  const safeDays = Number.isFinite(input.daysSinceFirstSale) ? input.daysSinceFirstSale : Infinity;
  const safeMargin = Number.isFinite(input.estimatedMargin) ? input.estimatedMargin : 0;
  if (safeDays < 45 && input.hasImage && safeMargin >= 0.30) {
    campaignTypes.push({
      type: 'new_arrival',
      confidence: Math.min(100, Math.round(70 + linearScale(safeMargin, 0.30, 0.60, 30))),
      reason: `New product (${safeDays} days) with ${(safeMargin * 100).toFixed(0)}% margin`,
    });
  }

  // ── Reason ────────────────────────────────────────────────
  let reason: string;
  if (eligible) {
    const topComponent =
      breakdown.profitabilityScore >= breakdown.demandScore &&
      breakdown.profitabilityScore >= breakdown.customerScore
        ? 'strong profitability'
        : breakdown.demandScore >= breakdown.customerScore
          ? 'solid demand signals'
          : 'loyal customer base';
    reason = `Strong ad candidate — ${topComponent} (score ${score.toFixed(0)}/100, tier: ${tier})`;
  } else if (safeMargin < 0.20) {
    reason = `Margin too low (${(safeMargin * 100).toFixed(0)}%) — ad spend would eat profits`;
  } else if (safeVelocity < 0.05) {
    reason = 'Low sales velocity — not enough organic demand to justify ad spend';
  } else {
    reason = `Score ${score.toFixed(0)}/100 — needs improvement before advertising (tier: ${tier})`;
  }

  return {
    score,
    tier,
    breakdown,
    eligible,
    campaignTypes,
    reason,
  };
}
