/**
 * Position Sizer — calculates budget scale targets for outperforming campaigns.
 *
 * Scales proportionally to overperformance, capped at maxScaleMultiplier.
 * If currentROAS <= expectedROAS, returns currentDailyBudget (no scale).
 */

export interface ScaleParams {
  currentDailyBudget: number;
  currentROAS: number;
  expectedROAS: number;
  maxScaleMultiplier?: number;
}

const DEFAULT_MAX_SCALE_MULTIPLIER = 2.5;

export function calculateScaleTarget(params: ScaleParams): number {
  const {
    currentDailyBudget,
    currentROAS,
    expectedROAS,
    maxScaleMultiplier = DEFAULT_MAX_SCALE_MULTIPLIER,
  } = params;

  // No scale if not outperforming
  if (currentROAS <= expectedROAS || expectedROAS <= 0) {
    return currentDailyBudget;
  }

  // Scale proportionally to overperformance
  const overperformanceRatio = currentROAS / expectedROAS;
  const scaleMultiplier = Math.min(overperformanceRatio, maxScaleMultiplier);

  return currentDailyBudget * scaleMultiplier;
}
