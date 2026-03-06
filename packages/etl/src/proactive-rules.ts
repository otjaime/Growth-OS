// ──────────────────────────────────────────────────────────────
// Growth OS — Proactive Rules Engine
// Identifies products that should be advertised proactively.
// Pure function: no DB access, no side effects.
// ──────────────────────────────────────────────────────────────

export interface ProductPerformanceRow {
  readonly productTitle: string;
  readonly productType: string;
  readonly adFitnessScore: number;
  readonly revenue30d: number;
  readonly grossProfit30d: number;
  readonly estimatedMargin: number;
  readonly avgPrice: number;
  readonly avgDailyUnits: number;
  readonly imageUrl: string | null;
  readonly productTier: string | null;
  readonly revenueTrend: number | null;
  readonly revenueShare: number | null;
}

export interface ProactiveRulesInput {
  readonly products: readonly ProductPerformanceRow[];
  /** Set of product titles already being advertised */
  readonly existingProductAds: ReadonlySet<string>;
  /** Minimum fitness score to consider (default 60) */
  readonly minFitnessScore?: number;
  /** Maximum recommendations to return (default 3) */
  readonly maxRecommendations?: number;
}

export interface ProactiveRecommendation {
  readonly ruleId: 'product_opportunity';
  readonly productTitle: string;
  readonly productType: string;
  readonly adFitnessScore: number;
  readonly estimatedROAS: number;
  readonly reason: string;
}

/**
 * Evaluate products and return proactive ad recommendations.
 *
 * Filters for ad-eligible products not yet being advertised,
 * ranks by fitness score, and returns the top N.
 */
export function evaluateProactiveRules(
  input: ProactiveRulesInput,
): ProactiveRecommendation[] {
  const minScore = input.minFitnessScore ?? 60;
  const maxRecs = input.maxRecommendations ?? 3;

  const candidates = input.products
    .filter((p) => {
      if (p.adFitnessScore < minScore) return false;
      if (input.existingProductAds.has(p.productTitle)) return false;
      return true;
    })
    .sort((a, b) => b.adFitnessScore - a.adFitnessScore)
    .slice(0, maxRecs);

  return candidates.map((p) => {
    // Rough ROAS estimate: (avgPrice * margin) / estimated CPA
    // Assume CPA is about 25% of avgPrice for eligible products
    const estimatedCPA = p.avgPrice * 0.25;
    const estimatedROAS = estimatedCPA > 0
      ? Math.round(((p.avgPrice * p.estimatedMargin) / estimatedCPA) * 100) / 100
      : 0;

    return {
      ruleId: 'product_opportunity' as const,
      productTitle: p.productTitle,
      productType: p.productType,
      adFitnessScore: p.adFitnessScore,
      estimatedROAS,
      reason: `${p.productTitle} has a fitness score of ${p.adFitnessScore.toFixed(0)} — ` +
        `${p.avgDailyUnits.toFixed(1)} units/day, ${(p.estimatedMargin * 100).toFixed(0)}% margin, ` +
        `$${p.grossProfit30d.toFixed(0)} monthly profit`,
    };
  });
}
