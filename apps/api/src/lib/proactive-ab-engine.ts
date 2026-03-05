// ──────────────────────────────────────────────────────────────
// Growth OS — Proactive A/B Decision Engine
// Evaluates multi-variant performance for proactive ad jobs
// and declares winners/losers based on statistical significance.
// ──────────────────────────────────────────────────────────────

import { normalCDF } from './ab-stats.js';

export interface VariantPerformance {
  readonly variantIndex: number;
  readonly angle: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly revenue: number;
  readonly daysActive: number;
}

export interface ProactiveABConfig {
  /** Minimum spend per variant before evaluating ($) */
  readonly minSpendPerVariant: number;
  /** Minimum days before declaring a winner */
  readonly minDays: number;
  /** Maximum days before forcing a decision */
  readonly maxDays: number;
  /** p-value threshold for significance */
  readonly pValueThreshold: number;
  /** Minimum ROAS to be considered viable */
  readonly minViableRoas: number;
}

export type ABDecision =
  | { type: 'insufficient_data'; reason: string }
  | { type: 'all_poor'; reason: string }
  | { type: 'winner_found'; winnerIndex: number; loserIndices: number[]; reason: string }
  | { type: 'no_winner_yet'; reason: string; bestIndex: number }
  | { type: 'forced_winner'; winnerIndex: number; loserIndices: number[]; reason: string };

const DEFAULT_CONFIG: ProactiveABConfig = {
  minSpendPerVariant: 50,
  minDays: 5,
  maxDays: 14,
  pValueThreshold: 0.05,
  minViableRoas: 1.0,
};

/**
 * Evaluate a multi-variant A/B test for a proactive ad job.
 * Pure function — no side effects.
 */
export function evaluateProductABTest(
  variants: readonly VariantPerformance[],
  config: Partial<ProactiveABConfig> = {},
): ABDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (variants.length < 2) {
    return { type: 'insufficient_data', reason: 'Need at least 2 variants to compare' };
  }

  // Check if enough data
  const hasEnoughSpend = variants.every((v) => v.spend >= cfg.minSpendPerVariant);
  const hasEnoughDays = variants.every((v) => v.daysActive >= cfg.minDays);

  if (!hasEnoughSpend || !hasEnoughDays) {
    const spendShort = variants.filter((v) => v.spend < cfg.minSpendPerVariant).length;
    const daysShort = variants.filter((v) => v.daysActive < cfg.minDays).length;
    return {
      type: 'insufficient_data',
      reason: `${spendShort > 0 ? `${spendShort} variant(s) below $${cfg.minSpendPerVariant} spend. ` : ''}` +
        `${daysShort > 0 ? `${daysShort} variant(s) below ${cfg.minDays} days.` : ''}`.trim(),
    };
  }

  // Compute ROAS for each variant
  const roasValues = variants.map((v) => v.spend > 0 ? v.revenue / v.spend : 0);

  // Check if all variants are poor (ROAS < minimum viable)
  const allPoor = roasValues.every((r) => r < cfg.minViableRoas);
  if (allPoor) {
    return {
      type: 'all_poor',
      reason: `All variants have ROAS below ${cfg.minViableRoas}x. Best: ${Math.max(...roasValues).toFixed(2)}x`,
    };
  }

  // Find best variant by ROAS
  let bestIndex = 0;
  for (let i = 1; i < roasValues.length; i++) {
    if (roasValues[i]! > roasValues[bestIndex]!) bestIndex = i;
  }

  // Run pairwise z-tests: compare best vs each other variant
  const best = variants[bestIndex]!;
  let isSignificantWinner = true;

  for (let i = 0; i < variants.length; i++) {
    if (i === bestIndex) continue;
    const other = variants[i]!;

    // Two-proportion z-test on conversion rates
    const bestCR = best.clicks > 0 ? best.conversions / best.clicks : 0;
    const otherCR = other.clicks > 0 ? other.conversions / other.clicks : 0;

    if (best.clicks === 0 && other.clicks === 0) continue;

    const totalClicks = best.clicks + other.clicks;
    const totalConversions = best.conversions + other.conversions;
    const pooledP = totalClicks > 0 ? totalConversions / totalClicks : 0;
    const pooledSE = Math.sqrt(
      pooledP * (1 - pooledP) * (1 / Math.max(1, best.clicks) + 1 / Math.max(1, other.clicks)),
    );

    const zScore = pooledSE > 0 ? (bestCR - otherCR) / pooledSE : 0;
    const pValue = pooledSE > 0 ? 2 * (1 - normalCDF(Math.abs(zScore))) : 1;

    if (pValue >= cfg.pValueThreshold) {
      isSignificantWinner = false;
      break;
    }
  }

  const loserIndices = variants.map((_, i) => i).filter((i) => i !== bestIndex);

  if (isSignificantWinner) {
    return {
      type: 'winner_found',
      winnerIndex: bestIndex,
      loserIndices,
      reason: `Variant "${best.angle}" wins with ${roasValues[bestIndex]!.toFixed(2)}x ROAS (p < ${cfg.pValueThreshold})`,
    };
  }

  // Check if past max days — force a winner
  const maxDays = Math.max(...variants.map((v) => v.daysActive));
  if (maxDays >= cfg.maxDays) {
    return {
      type: 'forced_winner',
      winnerIndex: bestIndex,
      loserIndices,
      reason: `No statistical winner after ${maxDays} days. Picking "${best.angle}" with best ROAS ${roasValues[bestIndex]!.toFixed(2)}x`,
    };
  }

  return {
    type: 'no_winner_yet',
    reason: `Testing continues — best is "${best.angle}" at ${roasValues[bestIndex]!.toFixed(2)}x ROAS but not statistically significant yet`,
    bestIndex,
  };
}
