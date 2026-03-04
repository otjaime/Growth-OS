import { describe, it, expect } from 'vitest';
import { computeDynamicThresholds } from './dynamic-thresholds.js';
import type { AdMetricsForThresholds } from './dynamic-thresholds.js';

describe('computeDynamicThresholds', () => {
  // ── Fallback to defaults when insufficient data ──

  it('returns defaults when no ads are provided', () => {
    const result = computeDynamicThresholds([]);
    expect(result.minCtr).toBe(0.008);
    expect(result.wastedSpendThreshold).toBe(100);
    expect(result.cpcSpikeThreshold).toBe(0.3);
  });

  it('returns defaults when fewer than 5 ads have metrics', () => {
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.02, cpc7d: 2.0, adSetDailyBudget: 100 },
      { ctr7d: null, cpc7d: null, adSetDailyBudget: null },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.minCtr).toBe(0.008);
    expect(result.wastedSpendThreshold).toBe(100);
    expect(result.cpcSpikeThreshold).toBe(0.3);
  });

  // ── Dynamic CTR threshold ──

  it('computes 25th percentile CTR when ≥5 ads have CTR data', () => {
    // CTR values: 0.005, 0.008, 0.010, 0.015, 0.020
    // Sorted: 0.005, 0.008, 0.010, 0.015, 0.020
    // 25th percentile: index = 0.25 * 4 = 1.0 → exactly 0.008
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.020, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.005, cpc7d: 1.2, adSetDailyBudget: 50 },
      { ctr7d: 0.010, cpc7d: 1.1, adSetDailyBudget: 50 },
      { ctr7d: 0.008, cpc7d: 0.9, adSetDailyBudget: 50 },
      { ctr7d: 0.015, cpc7d: 1.3, adSetDailyBudget: 50 },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.minCtr).toBe(0.008);
  });

  it('filters out null and zero CTR values', () => {
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: null, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.02, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.03, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.04, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.05, cpc7d: 1.0, adSetDailyBudget: 50 },
    ];
    const result = computeDynamicThresholds(ads);
    // 5 valid CTR values: 0.01, 0.02, 0.03, 0.04, 0.05
    // 25th percentile: index = 0.25 * 4 = 1.0 → 0.02
    expect(result.minCtr).toBe(0.02);
  });

  // ── Dynamic wasted spend threshold ──

  it('computes 10% of median daily budget × 7', () => {
    // Budget values: 20, 30, 50, 80, 100
    // Median (50th percentile): index = 0.5 * 4 = 2.0 → 50
    // Threshold: 50 * 0.10 * 7 = 35
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 100 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 20 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 30 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 80 },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.wastedSpendThreshold).toBe(35);
  });

  // ── Dynamic CPC spike threshold ──

  it('computes CPC spike threshold from coefficient of variation', () => {
    // CPC values: 1.0, 1.0, 1.0, 1.0, 1.0 (zero variance)
    // Mean = 1.0, variance = 0, cv = 0
    // Threshold: max(0.20, min(0.60, 0.20 + 0 * 0.5)) = 0.20
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.cpcSpikeThreshold).toBe(0.2);
  });

  it('increases CPC spike threshold for volatile CPC values', () => {
    // CPC values: 0.5, 1.0, 2.0, 3.0, 4.0 (high variance)
    // Mean = 2.1, variance = 1.54, stddev = 1.24, cv ≈ 0.59
    // Threshold: max(0.20, min(0.60, 0.20 + 0.59 * 0.5)) = max(0.20, min(0.60, 0.495)) ≈ 0.50
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: 0.5, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 1.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 2.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 3.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 4.0, adSetDailyBudget: 50 },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.cpcSpikeThreshold).toBeGreaterThan(0.4);
    expect(result.cpcSpikeThreshold).toBeLessThanOrEqual(0.6);
  });

  it('caps CPC spike threshold at 60%', () => {
    // Extremely volatile CPC values
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: 0.1, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 10.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 0.2, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 8.0, adSetDailyBudget: 50 },
      { ctr7d: 0.01, cpc7d: 0.3, adSetDailyBudget: 50 },
    ];
    const result = computeDynamicThresholds(ads);
    expect(result.cpcSpikeThreshold).toBe(0.6);
  });

  // ── Mixed data ──

  it('handles ads with partial null fields independently per metric', () => {
    // Only 3 have CTR (fall back to default), but 5 have budgets (dynamic)
    const ads: AdMetricsForThresholds[] = [
      { ctr7d: 0.01, cpc7d: null, adSetDailyBudget: 100 },
      { ctr7d: 0.02, cpc7d: null, adSetDailyBudget: 200 },
      { ctr7d: 0.03, cpc7d: null, adSetDailyBudget: 300 },
      { ctr7d: null, cpc7d: null, adSetDailyBudget: 150 },
      { ctr7d: null, cpc7d: null, adSetDailyBudget: 250 },
    ];
    const result = computeDynamicThresholds(ads);
    // CTR: only 3 valid → fall back to default
    expect(result.minCtr).toBe(0.008);
    // Budget: 5 valid → 50th percentile of [100, 150, 200, 250, 300] = 200
    // Threshold: 200 * 0.10 * 7 = 140
    expect(result.wastedSpendThreshold).toBe(140);
    // CPC: 0 valid → fall back to default
    expect(result.cpcSpikeThreshold).toBe(0.3);
  });
});
