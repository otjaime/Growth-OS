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
 *   - Margin (0-25):    Products below 30% margin are not viable for paid ads.
 *   - Velocity (0-25):  5+ daily units proves organic demand exists.
 *   - Profit (0-20):    $5K+ monthly gross profit means scale is proven.
 *   - Repeat (0-15):    20%+ repeat buyer rate signals product-market fit.
 *   - Readiness (0-15): 5 pts for image, 5 pts for description, 5 pts for price > 0.
 *
 * Products scoring 60+ are "ad-eligible."
 */
export function scoreAdFitness(input: AdFitnessInput): AdFitnessResult {
  // Margin score: scale from 30% to 65% linearly (0-25 pts)
  const marginScore = input.estimatedMargin <= 0.30
    ? 0
    : Math.min(25, ((input.estimatedMargin - 0.30) / 0.35) * 25);

  // Velocity score: scale from 0 to 5 daily units (0-25 pts)
  const velocityScore = Math.min(25, (input.avgDailyUnits / 5) * 25);

  // Profit score: scale from $0 to $5000 monthly gross profit (0-20 pts)
  const profitScore = Math.min(20, (input.grossProfit30d / 5000) * 20);

  // Repeat buyer score: scale from 0% to 20% repeat rate (0-15 pts)
  const repeatScore = Math.min(15, (input.repeatBuyerPct / 0.20) * 15);

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
  } else if (input.estimatedMargin < 0.30) {
    reason = `Margin too low (${(input.estimatedMargin * 100).toFixed(0)}%) — ad spend would eat profits`;
  } else if (input.avgDailyUnits < 1) {
    reason = 'Low sales velocity — not enough organic demand to justify ad spend';
  } else {
    reason = `Score ${score.toFixed(0)}/100 — needs improvement before advertising`;
  }

  return { score, breakdown, eligible, reason };
}
