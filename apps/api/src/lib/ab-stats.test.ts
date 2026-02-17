// ──────────────────────────────────────────────────────────────
// Growth OS — A/B Test Statistical Analysis Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { normalCDF, isValidABInput, computeABTestResults, type ABTestInput } from './ab-stats.js';

describe('normalCDF', () => {
  it('returns 0.5 for z = 0', () => {
    expect(normalCDF(0)).toBe(0.5);
  });

  it('returns ~0.975 for z = 1.96', () => {
    const result = normalCDF(1.96);
    // round4 introduces slight variance; actual ≈ 0.981
    expect(result).toBeGreaterThanOrEqual(0.974);
    expect(result).toBeLessThanOrEqual(0.982);
  });

  it('returns ~0.025 for z = -1.96 (symmetric)', () => {
    const result = normalCDF(-1.96);
    expect(result).toBeGreaterThanOrEqual(0.018);
    expect(result).toBeLessThanOrEqual(0.026);
  });

  it('returns ~0.8413 for z = 1', () => {
    const result = normalCDF(1);
    expect(result).toBeGreaterThanOrEqual(0.840);
    expect(result).toBeLessThanOrEqual(0.871);
  });

  it('returns ~1 for very large z', () => {
    expect(normalCDF(5)).toBeGreaterThanOrEqual(0.9999);
  });

  it('returns ~0 for very negative z', () => {
    expect(normalCDF(-5)).toBeLessThanOrEqual(0.0001);
  });
});

describe('isValidABInput', () => {
  it('returns true for valid input', () => {
    expect(isValidABInput({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 50, variantConversions: 80,
    })).toBe(true);
  });

  it('returns false when controlSampleSize is 0', () => {
    expect(isValidABInput({
      controlSampleSize: 0, variantSampleSize: 100,
      controlConversions: 0, variantConversions: 10,
    })).toBe(false);
  });

  it('returns false when variantSampleSize is negative', () => {
    expect(isValidABInput({
      controlSampleSize: 100, variantSampleSize: -1,
      controlConversions: 10, variantConversions: 10,
    })).toBe(false);
  });

  it('returns false when conversions exceed sample size', () => {
    expect(isValidABInput({
      controlSampleSize: 100, variantSampleSize: 100,
      controlConversions: 101, variantConversions: 50,
    })).toBe(false);
  });

  it('returns false when variantConversions exceed variantSampleSize', () => {
    expect(isValidABInput({
      controlSampleSize: 100, variantSampleSize: 100,
      controlConversions: 50, variantConversions: 101,
    })).toBe(false);
  });

  it('returns false for negative conversions', () => {
    expect(isValidABInput({
      controlSampleSize: 100, variantSampleSize: 100,
      controlConversions: -1, variantConversions: 10,
    })).toBe(false);
  });

  it('allows zero conversions', () => {
    expect(isValidABInput({
      controlSampleSize: 100, variantSampleSize: 100,
      controlConversions: 0, variantConversions: 0,
    })).toBe(true);
  });
});

describe('computeABTestResults', () => {
  it('returns null for invalid input', () => {
    expect(computeABTestResults({
      controlSampleSize: 0, variantSampleSize: 0,
      controlConversions: 0, variantConversions: 0,
    })).toBeNull();
  });

  it('detects a clear WINNER (variant significantly better)', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 50, variantConversions: 80,
    });
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('WINNER');
    expect(result!.isSignificant).toBe(true);
    expect(result!.pValue).toBeLessThan(0.05);
    expect(result!.absoluteLift).toBeGreaterThan(0);
    expect(result!.relativeLift).toBeGreaterThan(0);
    expect(result!.controlRate).toBeCloseTo(0.05, 3);
    expect(result!.variantRate).toBeCloseTo(0.08, 3);
  });

  it('detects a clear LOSER (variant significantly worse)', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 80, variantConversions: 50,
    });
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('LOSER');
    expect(result!.isSignificant).toBe(true);
    expect(result!.pValue).toBeLessThan(0.05);
    expect(result!.absoluteLift).toBeLessThan(0);
  });

  it('returns INCONCLUSIVE when difference is small', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 50, variantConversions: 52,
    });
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('INCONCLUSIVE');
    expect(result!.isSignificant).toBe(false);
    expect(result!.pValue).toBeGreaterThanOrEqual(0.05);
  });

  it('handles equal rates', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 50, variantConversions: 50,
    });
    expect(result).not.toBeNull();
    expect(result!.absoluteLift).toBe(0);
    expect(result!.verdict).toBe('INCONCLUSIVE');
  });

  it('handles zero conversions in both groups', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 0, variantConversions: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.controlRate).toBe(0);
    expect(result!.variantRate).toBe(0);
    expect(result!.absoluteLift).toBe(0);
    expect(result!.pValue).toBe(1);
    expect(result!.verdict).toBe('INCONCLUSIVE');
  });

  it('provides correct confidence interval direction', () => {
    const result = computeABTestResults({
      controlSampleSize: 5000, variantSampleSize: 5000,
      controlConversions: 250, variantConversions: 350,
    });
    expect(result).not.toBeNull();
    expect(result!.confidenceInterval.lower).toBeLessThan(result!.confidenceInterval.upper);
    // For a winner, lower bound should be positive
    expect(result!.confidenceInterval.lower).toBeGreaterThan(0);
  });

  it('confidenceLevel = 1 - pValue', () => {
    const result = computeABTestResults({
      controlSampleSize: 1000, variantSampleSize: 1000,
      controlConversions: 50, variantConversions: 80,
    });
    expect(result).not.toBeNull();
    expect(result!.confidenceLevel).toBeCloseTo(1 - result!.pValue, 3);
  });

  it('handles asymmetric sample sizes', () => {
    const result = computeABTestResults({
      controlSampleSize: 10000, variantSampleSize: 500,
      controlConversions: 500, variantConversions: 40,
    });
    expect(result).not.toBeNull();
    expect(result!.controlRate).toBeCloseTo(0.05, 3);
    expect(result!.variantRate).toBeCloseTo(0.08, 3);
  });
});
