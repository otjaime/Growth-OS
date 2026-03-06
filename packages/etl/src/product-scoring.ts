// ──────────────────────────────────────────────────────────────
// Growth OS — Ad Fitness Scoring Engine
// Scores products on their suitability for paid advertising.
// Pure function: no DB access, no side effects.
// ──────────────────────────────────────────────────────────────

export interface AdFitnessInput {
  readonly revenue30d: number;
  readonly grossProfit30d: number;
  readonly estimatedMargin: number;
  readonly avgDailyUnits: number;
  readonly repeatBuyerPct: number;
  readonly avgPrice: number;
  readonly hasImage: boolean;
  readonly hasDescription: boolean;
}

export interface AdFitnessBreakdown {
  readonly marginScore: number;
  readonly velocityScore: number;
  readonly profitScore: number;
  readonly repeatScore: number;
  readonly readinessScore: number;
}

export interface AdFitnessResult {
  readonly score: number;
  readonly breakdown: AdFitnessBreakdown;
  readonly eligible: boolean;
  readonly reason: string;
}

/**
 * Score a product's fitness for paid advertising (0-100).
 *
 * Components:
 *   - Margin (0-20):    Products below 25% margin are not viable for paid ads.
 *   - Velocity (0-20):  1+ daily units proves organic demand exists.
 *   - Profit (0-30):    $1K+ monthly gross profit means scale is proven.
 *   - Repeat (0-15):    10%+ repeat buyer rate signals product-market fit.
 *   - Readiness (0-15): 5 pts for image, 5 pts for description, 5 pts for price > 0.
 *
 * Products scoring 60+ are "ad-eligible."
 *
 * Thresholds are calibrated for specialty/DTC ecommerce where
 * 0.3-1 daily units is healthy velocity.
 */
export function scoreAdFitness(input: AdFitnessInput): AdFitnessResult {
  // Margin score: scale from 25% to 55% linearly (0-20 pts)
  const marginScore = input.estimatedMargin <= 0.25
    ? 0
    : Math.min(20, ((input.estimatedMargin - 0.25) / 0.30) * 20);

  // Velocity score: scale from 0 to 1 daily unit (0-20 pts)
  // 1+ unit/day = max score. Calibrated for specialty DTC.
  const velocityScore = Math.min(20, (input.avgDailyUnits / 1) * 20);

  // Profit score: scale from $0 to $1000 monthly gross profit (0-30 pts)
  // Lower threshold rewards products that are profitable at smaller scale.
  const profitScore = Math.min(30, (input.grossProfit30d / 1000) * 30);

  // Repeat buyer score: scale from 0% to 10% repeat rate (0-15 pts)
  // 10%+ repeat rate signals product-market fit.
  const repeatScore = Math.min(15, (input.repeatBuyerPct / 0.10) * 15);

  // Readiness score: 5 pts each for image, description, valid price (0-15 pts)
  const readinessScore =
    (input.hasImage ? 5 : 0) +
    (input.hasDescription ? 5 : 0) +
    (input.avgPrice > 0 ? 5 : 0);

  const score = Math.round(
    (marginScore + velocityScore + profitScore + repeatScore + readinessScore) * 100,
  ) / 100;

  const breakdown: AdFitnessBreakdown = {
    marginScore: Math.round(marginScore * 100) / 100,
    velocityScore: Math.round(velocityScore * 100) / 100,
    profitScore: Math.round(profitScore * 100) / 100,
    repeatScore: Math.round(repeatScore * 100) / 100,
    readinessScore,
  };

  const eligible = score >= 60;

  let reason: string;
  if (eligible) {
    const topFactor =
      marginScore >= velocityScore && marginScore >= profitScore
        ? 'high margin'
        : velocityScore >= profitScore
          ? 'strong sales velocity'
          : 'proven profit at scale';
    reason = `Strong ad candidate — ${topFactor} (score ${score.toFixed(0)}/100)`;
  } else if (input.estimatedMargin < 0.25) {
    reason = `Margin too low (${(input.estimatedMargin * 100).toFixed(0)}%) — ad spend would eat profits`;
  } else if (input.avgDailyUnits < 0.1) {
    reason = 'Low sales velocity — not enough organic demand to justify ad spend';
  } else {
    reason = `Score ${score.toFixed(0)}/100 — needs improvement before advertising`;
  }

  return { score, breakdown, eligible, reason };
}
