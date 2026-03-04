// ──────────────────────────────────────────────────────────────
// Growth OS — Dynamic Threshold Computation
// Computes percentile-based thresholds from historical ad data
// instead of relying on hardcoded values.
// Pure functions — no side effects, no DB access.
// ──────────────────────────────────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────

export interface AdMetricsForThresholds {
  ctr7d: number | null;
  cpc7d: number | null;
  adSetDailyBudget: number | null;
}

export interface DynamicThresholds {
  /** 25th percentile of CTR across all ads (replaces hardcoded 0.8%) */
  minCtr: number;
  /** 10% of median daily budget × 7 (replaces hardcoded $100) */
  wastedSpendThreshold: number;
  /** CPC spike threshold based on historical variance (replaces hardcoded 30%) */
  cpcSpikeThreshold: number;
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_MIN_CTR = 0.008;
const DEFAULT_WASTED_SPEND = 100;
const DEFAULT_CPC_SPIKE = 0.30;
const MIN_ADS_FOR_DYNAMIC = 5;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute a given percentile from a sorted array.
 * Uses linear interpolation between adjacent values.
 */
function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sortedValues[lower]!;
  return sortedValues[lower]! * (1 - fraction) + sortedValues[upper]! * fraction;
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Compute dynamic thresholds from actual ad performance data.
 *
 * Uses percentile-based calculations instead of hardcoded values:
 * - minCtr: 25th percentile of CTR (ads below this are genuinely low)
 * - wastedSpendThreshold: 10% of median daily budget × 7 (scales with account size)
 * - cpcSpikeThreshold: Uses coefficient of variation of CPC (accounts with volatile CPC
 *   need a higher threshold to avoid false alarms)
 *
 * Falls back to defaults if insufficient data (< 5 ads with metrics).
 *
 * @param ads - Array of ad metrics (readonly)
 * @returns Dynamic thresholds for use in DiagnosisRuleConfig
 */
export function computeDynamicThresholds(
  ads: readonly AdMetricsForThresholds[],
): DynamicThresholds {
  // ── CTR threshold (25th percentile) ──
  const ctrValues = ads
    .map((a) => a.ctr7d)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);

  const minCtr = ctrValues.length >= MIN_ADS_FOR_DYNAMIC
    ? percentile(ctrValues, 25)
    : DEFAULT_MIN_CTR;

  // ── Wasted spend threshold (10% of median daily budget × 7) ──
  const budgetValues = ads
    .map((a) => a.adSetDailyBudget)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);

  const wastedSpendThreshold = budgetValues.length >= MIN_ADS_FOR_DYNAMIC
    ? percentile(budgetValues, 50) * 0.10 * 7
    : DEFAULT_WASTED_SPEND;

  // ── CPC spike threshold (based on coefficient of variation) ──
  const cpcValues = ads
    .map((a) => a.cpc7d)
    .filter((v): v is number => v !== null && v > 0);

  let cpcSpikeThreshold = DEFAULT_CPC_SPIKE;
  if (cpcValues.length >= MIN_ADS_FOR_DYNAMIC) {
    const mean = cpcValues.reduce((s, v) => s + v, 0) / cpcValues.length;
    if (mean > 0) {
      const variance = cpcValues.reduce((s, v) => s + (v - mean) ** 2, 0) / cpcValues.length;
      const cv = Math.sqrt(variance) / mean;
      // Higher variance → higher threshold (max 60%, min 20%)
      cpcSpikeThreshold = Math.max(0.20, Math.min(0.60, 0.20 + cv * 0.5));
    }
  }

  return {
    minCtr: Math.round(minCtr * 100000) / 100000,
    wastedSpendThreshold: Math.round(wastedSpendThreshold * 100) / 100,
    cpcSpikeThreshold: Math.round(cpcSpikeThreshold * 100) / 100,
  };
}
