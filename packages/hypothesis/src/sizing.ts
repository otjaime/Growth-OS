export interface SizingInput {
  readonly conviction: number;
  readonly clientMonthlyBudget: number;
  readonly triggerWinRate: number;
  readonly activeHypothesesCount: number;
  readonly sampleSize: number;
}

export interface SizingOutput {
  readonly recommendedBudget: number;
  readonly kellyFraction: number;
  readonly confidenceAdjustment: string;
  readonly maxBudget: number;
}

const MIN_BUDGET = 500;
const PAYOFF_RATIO = 1.5; // b in Kelly formula

const CONVICTION_SCALE: Record<number, number> = {
  1: 0.2,
  2: 0.4,
  3: 0.6,
  4: 0.8,
  5: 1.0,
};

/**
 * Calculate recommended budget using Kelly criterion position sizing.
 *
 * Kelly fraction: f* = (p * b - q) / b
 * where p = winRate, q = 1 - p, b = payoff ratio (1.5)
 *
 * Half-Kelly when sampleSize < 30 (low confidence).
 * Scaled by conviction (1-5 maps to 20%-100%).
 * Hard-capped at monthlyBudget / max(activeCount + 1, 3).
 * Floor at $500.
 */
export function calculateBudget(input: SizingInput): SizingOutput {
  const { conviction, clientMonthlyBudget, triggerWinRate, activeHypothesesCount, sampleSize } = input;

  const p = Math.max(0, Math.min(1, triggerWinRate));
  const q = 1 - p;
  const b = PAYOFF_RATIO;

  // Kelly fraction: f* = (p * b - q) / b
  const rawKelly = (p * b - q) / b;

  // Half-Kelly for low sample sizes
  const isLowSample = sampleSize < 30;
  const adjustedKelly = isLowSample ? rawKelly / 2 : rawKelly;

  // Hard cap: budget / max(activeCount + 1, 3)
  const maxBudget = clientMonthlyBudget / Math.max(activeHypothesesCount + 1, 3);

  let confidenceAdjustment: string;

  if (rawKelly <= 0) {
    // Negative Kelly = losing strategy. Return minimum with warning.
    confidenceAdjustment = 'NEGATIVE_EDGE: Kelly fraction is negative — trigger win rate does not justify the bet. Defaulting to minimum $500 for data collection only.';
    return {
      recommendedBudget: MIN_BUDGET,
      kellyFraction: rawKelly,
      confidenceAdjustment,
      maxBudget: Math.max(maxBudget, MIN_BUDGET),
    };
  }

  // Scale by conviction
  const convictionMultiplier = CONVICTION_SCALE[Math.max(1, Math.min(5, Math.round(conviction)))] ?? 0.6;
  const kellyBudget = adjustedKelly * clientMonthlyBudget * convictionMultiplier;

  // Apply hard cap and floor
  const recommendedBudget = Math.max(MIN_BUDGET, Math.min(kellyBudget, maxBudget));

  if (isLowSample) {
    confidenceAdjustment = `HALF_KELLY: Sample size (${sampleSize}) < 30 — using half-Kelly for risk management.`;
  } else if (kellyBudget > maxBudget) {
    confidenceAdjustment = `CAPPED: Kelly suggests $${Math.round(kellyBudget)} but capped at $${Math.round(maxBudget)} due to portfolio concentration limits.`;
  } else {
    confidenceAdjustment = 'FULL_KELLY: Sufficient sample size and within portfolio limits.';
  }

  return {
    recommendedBudget: Math.round(recommendedBudget * 100) / 100,
    kellyFraction: Math.round(adjustedKelly * 10000) / 10000,
    confidenceAdjustment,
    maxBudget: Math.round(Math.max(maxBudget, MIN_BUDGET) * 100) / 100,
  };
}
