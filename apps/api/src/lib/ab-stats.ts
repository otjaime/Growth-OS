// ──────────────────────────────────────────────────────────────
// Growth OS — A/B Test Statistical Analysis
// Two-proportion z-test for experiment results
// Pure functions, no external dependencies
// ──────────────────────────────────────────────────────────────

export interface ABTestInput {
  readonly controlSampleSize: number;
  readonly variantSampleSize: number;
  readonly controlConversions: number;
  readonly variantConversions: number;
}

export interface ABTestResult {
  readonly controlRate: number;
  readonly variantRate: number;
  readonly absoluteLift: number;
  readonly relativeLift: number;
  readonly pValue: number;
  readonly confidenceLevel: number;
  readonly isSignificant: boolean;
  readonly confidenceInterval: { readonly lower: number; readonly upper: number };
  readonly verdict: 'WINNER' | 'LOSER' | 'INCONCLUSIVE';
}

/** Round to 4 decimal places */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun formula 26.2.17).
 * Maximum absolute error: 7.5 × 10⁻⁸
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return round4(0.5 * (1.0 + sign * y));
}

/** Validate that A/B input fields are sane */
export function isValidABInput(input: ABTestInput): boolean {
  const { controlSampleSize, variantSampleSize, controlConversions, variantConversions } = input;

  if (controlSampleSize <= 0 || variantSampleSize <= 0) return false;
  if (controlConversions < 0 || variantConversions < 0) return false;
  if (controlConversions > controlSampleSize) return false;
  if (variantConversions > variantSampleSize) return false;

  return true;
}

/**
 * Two-proportion z-test for A/B test significance.
 * Returns null if inputs are invalid.
 */
export function computeABTestResults(input: ABTestInput): ABTestResult | null {
  if (!isValidABInput(input)) return null;

  const { controlSampleSize, variantSampleSize, controlConversions, variantConversions } = input;

  const controlRate = controlConversions / controlSampleSize;
  const variantRate = variantConversions / variantSampleSize;
  const absoluteLift = variantRate - controlRate;
  const relativeLift = controlRate > 0 ? absoluteLift / controlRate : 0;

  // Pooled proportion
  const pooledP = (controlConversions + variantConversions) / (controlSampleSize + variantSampleSize);
  const pooledSE = Math.sqrt(
    pooledP * (1 - pooledP) * (1 / controlSampleSize + 1 / variantSampleSize),
  );

  // Z-score and two-tailed p-value
  const zScore = pooledSE > 0 ? absoluteLift / pooledSE : 0;
  const pValue = pooledSE > 0
    ? round4(2 * (1 - normalCDF(Math.abs(zScore))))
    : 1;
  const confidenceLevel = round4(1 - pValue);
  const isSignificant = pValue < 0.05;

  // 95% confidence interval for the difference (unpooled SE)
  const unpooledSE = Math.sqrt(
    (controlRate * (1 - controlRate)) / controlSampleSize +
    (variantRate * (1 - variantRate)) / variantSampleSize,
  );
  const marginOfError = 1.96 * unpooledSE;
  const confidenceInterval = {
    lower: round4(absoluteLift - marginOfError),
    upper: round4(absoluteLift + marginOfError),
  };

  // Verdict
  let verdict: 'WINNER' | 'LOSER' | 'INCONCLUSIVE';
  if (!isSignificant) {
    verdict = 'INCONCLUSIVE';
  } else if (absoluteLift > 0) {
    verdict = 'WINNER';
  } else {
    verdict = 'LOSER';
  }

  return {
    controlRate: round4(controlRate),
    variantRate: round4(variantRate),
    absoluteLift: round4(absoluteLift),
    relativeLift: round4(relativeLift),
    pValue,
    confidenceLevel,
    isSignificant,
    confidenceInterval,
    verdict,
  };
}
