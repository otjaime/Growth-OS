// ──────────────────────────────────────────────────────────────
// Growth OS — Statistical Anomaly Detection
// Z-score based anomaly detection for ad performance metrics
// Pure functions — no side effects, no DB access
// ──────────────────────────────────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────

export interface MetricSeries {
  values: readonly number[];
  metric: string;
}

export interface AnomalyResult {
  metric: string;
  zScore: number;
  isAnomaly: boolean;
  direction: 'up' | 'down';
  currentValue: number;
  percentChange: number;
  historicalMean: number;
  historicalStdDev: number;
}

export interface AnomalyDetectionConfig {
  zScoreThreshold?: number;
  minDataPoints?: number;
  excludeRecentDays?: number;
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_Z_SCORE_THRESHOLD = 2.0;
const DEFAULT_MIN_DATA_POINTS = 14;
const DEFAULT_EXCLUDE_RECENT_DAYS = 3;
const MIN_STD_DEV = 0.001;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute mean of a numeric array, skipping NaN values.
 * Returns 0 for empty arrays or arrays with only NaN.
 */
function computeMean(values: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (!isNaN(v)) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Compute population standard deviation of a numeric array, skipping NaN values.
 * Returns 0 for arrays with fewer than 2 valid values.
 */
function computeStdDev(values: readonly number[], mean: number): number {
  let sumSquaredDiffs = 0;
  let count = 0;
  for (const v of values) {
    if (!isNaN(v)) {
      const diff = v - mean;
      sumSquaredDiffs += diff * diff;
      count++;
    }
  }
  return count >= 2 ? Math.sqrt(sumSquaredDiffs / count) : 0;
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Detect statistical anomalies across multiple metric time series.
 *
 * Algorithm:
 * 1. For each metric series, exclude the last `excludeRecentDays` values as noise buffer
 * 2. If fewer than `minDataPoints` remain, skip the metric
 * 3. Compute mean and standard deviation of the historical window
 * 4. If stdDev is near-zero (< 0.001), skip (not meaningful for anomaly detection)
 * 5. Compute z-score = (currentValue - mean) / stdDev
 * 6. Flag as anomaly if |z-score| exceeds threshold
 *
 * @param series - Array of metric time series (values ordered chronologically, oldest first)
 * @param currentValues - Map of metric name to current observed value
 * @param config - Optional detection configuration
 * @returns Array of anomaly results for metrics with sufficient data
 */
export function detectAnomalies(
  series: readonly MetricSeries[],
  currentValues: Record<string, number>,
  config?: AnomalyDetectionConfig,
): AnomalyResult[] {
  const threshold = config?.zScoreThreshold ?? DEFAULT_Z_SCORE_THRESHOLD;
  const minDataPoints = config?.minDataPoints ?? DEFAULT_MIN_DATA_POINTS;
  const excludeRecent = config?.excludeRecentDays ?? DEFAULT_EXCLUDE_RECENT_DAYS;

  const results: AnomalyResult[] = [];

  for (const s of series) {
    const currentValue = currentValues[s.metric];

    // Skip if no current value provided for this metric
    if (currentValue === undefined) continue;

    // Step 1: Exclude recent days to avoid noise (based on full array length, preserving time alignment)
    const cutoff = Math.max(0, s.values.length - excludeRecent);
    const historicalValues = s.values.slice(0, cutoff);

    // Step 2: Check minimum valid (non-NaN) data points
    const validCount = historicalValues.filter((v) => !isNaN(v)).length;
    if (validCount < minDataPoints) continue;

    // Step 3: Compute statistics
    const mean = computeMean(historicalValues);
    const stdDev = computeStdDev(historicalValues, mean);

    // Step 4: Skip if std dev is effectively zero
    if (stdDev < MIN_STD_DEV) continue;

    // Step 5: Compute z-score
    const zScore = (currentValue - mean) / stdDev;

    // Step 6: Determine anomaly status
    const isAnomaly = Math.abs(zScore) > threshold;
    const direction: 'up' | 'down' = zScore >= 0 ? 'up' : 'down';

    // Compute percent change from historical mean
    const percentChange = mean !== 0 ? ((currentValue - mean) / Math.abs(mean)) * 100 : 0;

    results.push({
      metric: s.metric,
      zScore: Math.round(zScore * 100) / 100,
      isAnomaly,
      direction,
      currentValue,
      percentChange: Math.round(percentChange * 10) / 10,
      historicalMean: Math.round(mean * 1000) / 1000,
      historicalStdDev: Math.round(stdDev * 1000) / 1000,
    });
  }

  return results;
}
