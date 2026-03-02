// ──────────────────────────────────────────────────────────────
// Growth OS — Creative Decay Analysis
// Detects ad creative fatigue using daily snapshot history
// Pure functions — no side effects, no DB access
// ──────────────────────────────────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────

export interface DailySnapshot {
  date: string;       // YYYY-MM-DD
  spend: number;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  impressions: number;
  frequency: number | null;
}

export interface CreativeDecayAnalysis {
  adId: string;
  adName: string;
  ageInDays: number;
  peakRoas: number | null;
  currentRoas: number | null;
  decayRate: number | null;
  estimatedDaysToBreakeven: number | null;
  recommendation: 'healthy' | 'early_decay' | 'accelerating_decay' | 'replace_now';
  confidence: 'low' | 'medium' | 'high';
}

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
  r2: number;
}

// ── Constants ─────────────────────────────────────────────────

const MIN_SNAPSHOTS_FOR_ANALYSIS = 7;
const REGRESSION_WINDOW = 14;
const EARLY_DECAY_THRESHOLD = 0.05;     // 5% per week
const ACCELERATING_DECAY_THRESHOLD = 0.15; // 15% per week
const REPLACE_NOW_ROAS_CEILING = 1.2;
const REPLACE_NOW_MIN_DECAY_RATE = 0.03;  // must have at least 3% weekly decay to trigger replace_now
const LOW_CONFIDENCE_THRESHOLD = 14;
const MEDIUM_CONFIDENCE_THRESHOLD = 21;

// ── Linear Regression ─────────────────────────────────────────

/**
 * Compute ordinary least squares linear regression.
 * Returns slope, intercept, and coefficient of determination (R-squared).
 *
 * @param xs - Independent variable values
 * @param ys - Dependent variable values (must be same length as xs)
 * @returns Regression result with slope, intercept, and r2
 */
export function linearRegression(xs: readonly number[], ys: readonly number[]): LinearRegressionResult {
  const n = xs.length;

  // Edge case: insufficient points
  if (n < 2) {
    return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  }

  const denominator = n * sumXX - sumX * sumX;

  // Edge case: all x values are the same
  if (Math.abs(denominator) < 1e-12) {
    return { slope: 0, intercept: sumY / n, r2: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Compute R-squared
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i]! + intercept;
    const residual = ys[i]! - predicted;
    ssRes += residual * residual;
    ssTot += (ys[i]! - meanY) * (ys[i]! - meanY);
  }

  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, r2 };
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Analyze creative performance decay from daily snapshot history.
 *
 * Algorithm:
 * 1. Requires minimum 7 snapshots for meaningful analysis
 * 2. Finds peak ROAS from history
 * 3. Computes linear regression slope of ROAS over recent window (up to 14 days)
 * 4. Classifies decay rate: healthy, early_decay, accelerating_decay, replace_now
 * 5. Estimates days until ROAS hits breakeven (1.0) via trend extrapolation
 *
 * @param adId - Unique identifier for the ad creative
 * @param adName - Human-readable name for the ad creative
 * @param snapshots - Chronologically ordered daily performance snapshots
 * @param currentRoas - Most recent ROAS value (may differ from last snapshot)
 * @returns Creative decay analysis with recommendation and confidence level
 */
export function analyzeCreativeDecay(
  adId: string,
  adName: string,
  snapshots: readonly DailySnapshot[],
  currentRoas: number | null,
): CreativeDecayAnalysis {
  const ageInDays = snapshots.length;

  // Edge case: insufficient data
  if (ageInDays < MIN_SNAPSHOTS_FOR_ANALYSIS) {
    return {
      adId,
      adName,
      ageInDays,
      peakRoas: currentRoas,
      currentRoas,
      decayRate: null,
      estimatedDaysToBreakeven: null,
      recommendation: 'healthy',
      confidence: 'low',
    };
  }

  // Step 1: Find peak ROAS from history
  const roasValues = snapshots
    .map((s) => s.roas)
    .filter((r): r is number => r !== null);

  if (roasValues.length === 0) {
    return {
      adId,
      adName,
      ageInDays,
      peakRoas: null,
      currentRoas,
      decayRate: null,
      estimatedDaysToBreakeven: null,
      recommendation: 'healthy',
      confidence: 'low',
    };
  }

  // Use reduce instead of Math.max(...) to avoid stack overflow on large arrays
  let peakRoas = -Infinity;
  for (const v of roasValues) {
    if (v > peakRoas) peakRoas = v;
  }

  // Step 2: Compute regression over last REGRESSION_WINDOW snapshots (or all if fewer)
  const recentSnapshots = snapshots.slice(-REGRESSION_WINDOW);
  const regressionData: { x: number; y: number }[] = [];

  for (let i = 0; i < recentSnapshots.length; i++) {
    const roas = recentSnapshots[i]!.roas;
    if (roas !== null) {
      regressionData.push({ x: i, y: roas });
    }
  }

  // Need at least 2 non-null ROAS values for regression
  if (regressionData.length < 2) {
    return {
      adId,
      adName,
      ageInDays,
      peakRoas,
      currentRoas,
      decayRate: null,
      estimatedDaysToBreakeven: null,
      recommendation: 'healthy',
      confidence: 'low',
    };
  }

  const xs = regressionData.map((d) => d.x);
  const ys = regressionData.map((d) => d.y);
  const regression = linearRegression(xs, ys);

  // Step 3: Compute decay rate (slope * 7 = weekly change)
  // Express as fraction of peak ROAS for normalization
  const weeklyChange = regression.slope * 7;
  const decayRate = peakRoas > 0 ? -weeklyChange / peakRoas : null;

  // Step 4: Determine confidence
  let confidence: 'low' | 'medium' | 'high';
  if (ageInDays < LOW_CONFIDENCE_THRESHOLD) {
    confidence = 'low';
  } else if (ageInDays < MEDIUM_CONFIDENCE_THRESHOLD) {
    confidence = 'medium';
  } else {
    confidence = 'high';
  }

  // Step 5: Classify recommendation
  let recommendation: 'healthy' | 'early_decay' | 'accelerating_decay' | 'replace_now';

  if (currentRoas !== null && currentRoas < REPLACE_NOW_ROAS_CEILING && decayRate !== null && decayRate >= REPLACE_NOW_MIN_DECAY_RATE) {
    recommendation = 'replace_now';
  } else if (decayRate === null || decayRate <= 0 || decayRate < EARLY_DECAY_THRESHOLD) {
    recommendation = 'healthy';
  } else if (decayRate < ACCELERATING_DECAY_THRESHOLD) {
    recommendation = 'early_decay';
  } else {
    recommendation = 'accelerating_decay';
  }

  // Step 6: Estimate days to breakeven (ROAS = 1.0)
  let estimatedDaysToBreakeven: number | null = null;
  if (regression.slope < 0 && currentRoas !== null && currentRoas > 1.0) {
    // From current ROAS, how many days until regression line hits 1.0?
    // currentRoas + slope * days = 1.0
    // days = (1.0 - currentRoas) / slope
    const daysToBreakeven = (1.0 - currentRoas) / regression.slope;
    if (daysToBreakeven > 0 && isFinite(daysToBreakeven)) {
      estimatedDaysToBreakeven = Math.ceil(daysToBreakeven);
    }
  }

  return {
    adId,
    adName,
    ageInDays,
    peakRoas: Math.round(peakRoas * 100) / 100,
    currentRoas,
    decayRate: decayRate !== null ? Math.round(decayRate * 1000) / 1000 : null,
    estimatedDaysToBreakeven,
    recommendation,
    confidence,
  };
}
