// ──────────────────────────────────────────────────────────────
// Growth OS — Statistical Anomaly Detection Tests
// Golden fixtures with hand-calculated expected values.
// Covers z-score detection, direction, thresholds, and edge cases.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { detectAnomalies } from './anomaly-detection.js';
import type { MetricSeries, AnomalyDetectionConfig } from './anomaly-detection.js';

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Generate N values all equal to `value`.
 */
function constantSeries(n: number, value: number): number[] {
  return Array.from({ length: n }, () => value);
}

/**
 * Generate N values from a normal-ish distribution centered on `mean` with
 * known standard deviation by spacing values symmetrically.
 * For simplicity, interleaves (mean + offset) and (mean - offset).
 */
function symmetricSeries(n: number, mean: number, offset: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? mean + offset : mean - offset));
}

// ── detectAnomalies ─────────────────────────────────────────────

describe('detectAnomalies', () => {
  // ── Clear anomaly ─────────────────────────────────────────────

  describe('clear anomaly', () => {
    it('flags value 3+ standard deviations from mean', () => {
      // Build a series of 20 values: 10 values of 100 and 10 values of 100
      // Then 3 recent values excluded by default (excludeRecentDays=3)
      // Historical window: first 17 values, all = 100
      // mean = 100, stdDev = 0 ... but that would be skipped.
      //
      // Instead, use a series with known stats:
      // 20 values alternating between 90 and 110 => mean = 100, stdDev = 10
      // Then 3 recent values (excluded by default)
      // Total needed: 14 (min) + 3 (excluded) = 17 minimum
      const historicalValues = symmetricSeries(20, 100, 10);
      // mean of alternating 90,110 = 100
      // population stdDev = 10

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: historicalValues },
      ];

      // Current value = 140 => z = (140 - 100) / 10 = 4.0, well above default threshold 2.0
      const results = detectAnomalies(series, { spend: 140 });

      expect(results).toHaveLength(1);
      expect(results[0]!.metric).toBe('spend');
      expect(results[0]!.isAnomaly).toBe(true);
      expect(results[0]!.zScore).toBeGreaterThan(2.0);
      expect(results[0]!.direction).toBe('up');
      expect(results[0]!.currentValue).toBe(140);
    });
  });

  // ── No anomaly ────────────────────────────────────────────────

  describe('no anomaly', () => {
    it('does not flag value within normal range', () => {
      const historicalValues = symmetricSeries(20, 100, 10);

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: historicalValues },
      ];

      // Current value = 105 => z = (105 - 100) / 10 = 0.5, below threshold 2.0
      const results = detectAnomalies(series, { spend: 105 });

      expect(results).toHaveLength(1);
      expect(results[0]!.isAnomaly).toBe(false);
      expect(Math.abs(results[0]!.zScore)).toBeLessThanOrEqual(2.0);
    });
  });

  // ── Direction detection ───────────────────────────────────────

  describe('direction detection', () => {
    it('reports direction "up" for high value', () => {
      const historicalValues = symmetricSeries(20, 50, 5);

      const series: readonly MetricSeries[] = [
        { metric: 'cpc', values: historicalValues },
      ];

      // Current value = 80 => clearly above mean of 50
      const results = detectAnomalies(series, { cpc: 80 });

      expect(results[0]!.direction).toBe('up');
      expect(results[0]!.isAnomaly).toBe(true);
    });

    it('reports direction "down" for low value', () => {
      const historicalValues = symmetricSeries(20, 50, 5);

      const series: readonly MetricSeries[] = [
        { metric: 'cpc', values: historicalValues },
      ];

      // Current value = 20 => clearly below mean of 50
      const results = detectAnomalies(series, { cpc: 20 });

      expect(results[0]!.direction).toBe('down');
      expect(results[0]!.isAnomaly).toBe(true);
    });
  });

  // ── Insufficient data ─────────────────────────────────────────

  describe('insufficient data', () => {
    it('skips metric when fewer than minDataPoints after exclusion', () => {
      // Default minDataPoints = 14, excludeRecentDays = 3
      // Need at least 14 + 3 = 17 values
      // Provide only 10 values: after excluding 3, only 7 remain < 14
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: Array.from({ length: 10 }, (_, i) => 100 + i) },
      ];

      const results = detectAnomalies(series, { spend: 200 });

      expect(results).toHaveLength(0);
    });

    it('skips metric when series is empty', () => {
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: [] },
      ];

      const results = detectAnomalies(series, { spend: 100 });

      expect(results).toHaveLength(0);
    });

    it('skips metric when no current value is provided', () => {
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: symmetricSeries(20, 100, 10) },
      ];

      // No 'spend' key in currentValues
      const results = detectAnomalies(series, { revenue: 500 });

      expect(results).toHaveLength(0);
    });
  });

  // ── Zero standard deviation ───────────────────────────────────

  describe('zero standard deviation', () => {
    it('skips metric when all values are the same (stdDev < 0.001)', () => {
      // All values are 100 => stdDev = 0 => skip
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: constantSeries(20, 100) },
      ];

      const results = detectAnomalies(series, { spend: 200 });

      expect(results).toHaveLength(0);
    });
  });

  // ── Custom threshold ──────────────────────────────────────────

  describe('custom threshold', () => {
    it('catches more anomalies with lower zScoreThreshold', () => {
      const historicalValues = symmetricSeries(20, 100, 10);

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: historicalValues },
      ];

      // Current = 115 => z = (115 - 100) / 10 = 1.5
      // Default threshold 2.0: NOT an anomaly
      const defaultResults = detectAnomalies(series, { spend: 115 });
      expect(defaultResults[0]!.isAnomaly).toBe(false);

      // Lower threshold 1.0: IS an anomaly
      const config: AnomalyDetectionConfig = { zScoreThreshold: 1.0 };
      const sensitiveResults = detectAnomalies(series, { spend: 115 }, config);
      expect(sensitiveResults[0]!.isAnomaly).toBe(true);
    });

    it('uses custom minDataPoints', () => {
      // Provide 10 values + 3 excluded = need at least 10 historical
      // Default minDataPoints = 14 would skip; custom = 5 should not skip
      const values = symmetricSeries(10, 100, 10);

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: values },
      ];

      const config: AnomalyDetectionConfig = { minDataPoints: 5 };
      const results = detectAnomalies(series, { spend: 200 }, config);

      expect(results).toHaveLength(1);
      expect(results[0]!.isAnomaly).toBe(true);
    });

    it('uses custom excludeRecentDays', () => {
      // With excludeRecentDays = 0 and 15 data points, we get all 15 in historical
      const values = symmetricSeries(15, 100, 10);

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: values },
      ];

      // With default excludeRecentDays=3: 15-3=12 < 14 (default min) => skipped
      const defaultResults = detectAnomalies(series, { spend: 200 });
      expect(defaultResults).toHaveLength(0);

      // With excludeRecentDays=0: all 15 values are historical >= 14 => not skipped
      const config: AnomalyDetectionConfig = { excludeRecentDays: 0 };
      const results = detectAnomalies(series, { spend: 200 }, config);
      expect(results).toHaveLength(1);
    });
  });

  // ── Multiple metrics ──────────────────────────────────────────

  describe('multiple metrics', () => {
    it('detects anomalies independently for each metric', () => {
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: symmetricSeries(20, 100, 10) },
        { metric: 'revenue', values: symmetricSeries(20, 500, 50) },
        { metric: 'cpc', values: symmetricSeries(20, 2, 0.2) },
      ];

      // spend: z = (150-100)/10 = 5.0 => anomaly up
      // revenue: z = (520-500)/50 = 0.4 => not anomaly
      // cpc: z = (0.5-2)/0.2 = -7.5 => anomaly down
      const results = detectAnomalies(series, {
        spend: 150,
        revenue: 520,
        cpc: 0.5,
      });

      expect(results).toHaveLength(3);

      const spendResult = results.find((r) => r.metric === 'spend')!;
      expect(spendResult.isAnomaly).toBe(true);
      expect(spendResult.direction).toBe('up');

      const revenueResult = results.find((r) => r.metric === 'revenue')!;
      expect(revenueResult.isAnomaly).toBe(false);

      const cpcResult = results.find((r) => r.metric === 'cpc')!;
      expect(cpcResult.isAnomaly).toBe(true);
      expect(cpcResult.direction).toBe('down');
    });

    it('only includes metrics that have current values', () => {
      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: symmetricSeries(20, 100, 10) },
        { metric: 'revenue', values: symmetricSeries(20, 500, 50) },
      ];

      // Only provide current value for 'spend', not 'revenue'
      const results = detectAnomalies(series, { spend: 150 });

      expect(results).toHaveLength(1);
      expect(results[0]!.metric).toBe('spend');
    });
  });

  // ── Percent change calculation ────────────────────────────────

  describe('percent change', () => {
    it('computes correct percent change from historical mean', () => {
      // Use an even number of values in the historical window.
      // 20 total values, excludeRecentDays=3 => 17 historical values (odd).
      // To get exactly mean=100, use 20 values with excludeRecentDays=0.
      // 20 alternating 110, 90 => mean = 100, stdDev = 10
      const historicalValues = symmetricSeries(20, 100, 10);

      const series: readonly MetricSeries[] = [
        { metric: 'spend', values: historicalValues },
      ];

      const config: AnomalyDetectionConfig = { excludeRecentDays: 0 };
      // Current = 130 => percentChange = (130-100)/100 * 100 = 30%
      const results = detectAnomalies(series, { spend: 130 }, config);

      expect(results[0]!.percentChange).toBe(30);
      expect(results[0]!.historicalMean).toBe(100);
    });
  });

  // ── Historical statistics ─────────────────────────────────────

  describe('historical statistics', () => {
    it('returns correct historicalMean and historicalStdDev', () => {
      // Use excludeRecentDays=0 to keep all 20 values in the historical window.
      // 20 alternating 220, 180 => mean = 200, stdDev = 20
      const historicalValues = symmetricSeries(20, 200, 20);

      const series: readonly MetricSeries[] = [
        { metric: 'revenue', values: historicalValues },
      ];

      const config: AnomalyDetectionConfig = { excludeRecentDays: 0 };
      const results = detectAnomalies(series, { revenue: 250 }, config);

      expect(results[0]!.historicalMean).toBe(200);
      expect(results[0]!.historicalStdDev).toBe(20);
    });
  });
});
