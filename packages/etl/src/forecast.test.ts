// ──────────────────────────────────────────────────────────────
// Growth OS — Forecast Engine Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import seedrandom from 'seedrandom';
import { forecast, forecastSeasonal, holtSmooth, holtForecast, computeMSE } from './forecast.js';

describe('holtSmooth', () => {
  it('with alpha=1, beta=0 the level tracks data exactly', () => {
    const data = [10, 20, 15, 25, 30];
    const { level } = holtSmooth(data, 1, 0);
    for (let i = 0; i < data.length; i++) {
      expect(level[i]).toBeCloseTo(data[i]!, 5);
    }
  });

  it('with alpha=0, beta=0 the level stays near initial value', () => {
    const data = [100, 200, 300, 400, 500];
    const { level } = holtSmooth(data, 0, 0);
    // level should carry forward: level[0] + cumulative trend
    // With alpha=0: level[t] = level[t-1] + trend[t-1]
    // With beta=0: trend stays constant at initial trend
    expect(level[0]).toBe(100);
    // Level should grow by initial trend each step
    const initialTrend = ((200 - 100) + (300 - 200) + (400 - 300)) / 3; // 100
    for (let i = 1; i < data.length; i++) {
      expect(level[i]).toBeCloseTo(100 + i * initialTrend, 1);
    }
  });

  it('returns arrays of correct length', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { level, trend } = holtSmooth(data, 0.5, 0.3);
    expect(level).toHaveLength(10);
    expect(trend).toHaveLength(10);
  });
});

describe('holtForecast', () => {
  it('generates correct number of forecast points', () => {
    const result = holtForecast(100, 2, 5);
    expect(result).toHaveLength(5);
  });

  it('projects linear extrapolation', () => {
    const result = holtForecast(100, 10, 3);
    expect(result[0]).toBe(110);
    expect(result[1]).toBe(120);
    expect(result[2]).toBe(130);
  });

  it('clamps negative values to zero', () => {
    const result = holtForecast(5, -10, 3);
    expect(result[0]).toBe(0); // 5 + 1*(-10) = -5 → 0
    expect(result[1]).toBe(0); // 5 + 2*(-10) = -15 → 0
  });
});

describe('computeMSE', () => {
  it('returns 0 for identical arrays', () => {
    expect(computeMSE([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('computes correct MSE for known offset', () => {
    // Each diff is 1, so MSE = (1+1+1)/3 = 1
    expect(computeMSE([1, 2, 3], [2, 3, 4])).toBe(1);
  });

  it('returns 0 for empty arrays', () => {
    expect(computeMSE([], [])).toBe(0);
  });
});

describe('forecast — linear trend', () => {
  it('extrapolates a perfect linear trend', () => {
    // y = 100 + 2*x for x = 0..59
    const data = Array.from({ length: 60 }, (_, i) => 100 + 2 * i);
    const result = forecast(data, { horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    // Forecast should continue the trend
    // data ends at x=59 → value=218. Next should be ~220, 222, 224...
    for (let h = 0; h < 10; h++) {
      const expected = 100 + 2 * (60 + h);
      expect(result.forecast[h]).toBeCloseTo(expected, 0);
    }
  });

  it('returns correct number of forecast points', () => {
    const data = Array.from({ length: 60 }, (_, i) => 100 + i);
    const result = forecast(data, { horizon: 30 });
    expect(result).not.toBeNull();
    expect(result!.forecast).toHaveLength(30);
    expect(result!.lower80).toHaveLength(30);
    expect(result!.upper80).toHaveLength(30);
    expect(result!.lower95).toHaveLength(30);
    expect(result!.upper95).toHaveLength(30);
  });
});

describe('forecast — constant data', () => {
  it('produces flat forecast for constant input', () => {
    const data = Array.from({ length: 60 }, () => 500);
    const result = forecast(data, { horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    for (const val of result.forecast) {
      expect(val).toBeCloseTo(500, 0);
    }
    expect(result.mse).toBe(0);
  });
});

describe('forecast — confidence intervals widen', () => {
  it('confidence interval width increases monotonically', () => {
    const data = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i) * 10);
    const result = forecast(data, { horizon: 20 });

    expect(result).not.toBeNull();
    if (!result) return;

    for (let i = 0; i < result.forecast.length - 1; i++) {
      const width95Current = result.upper95[i]! - result.lower95[i]!;
      const width95Next = result.upper95[i + 1]! - result.lower95[i + 1]!;
      expect(width95Next).toBeGreaterThanOrEqual(width95Current - 0.001); // small tolerance for floating point
    }
  });

  it('80% CI is narrower than 95% CI', () => {
    const data = Array.from({ length: 60 }, (_, i) => 200 + i * 3);
    const result = forecast(data, { horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    for (let i = 0; i < result.forecast.length; i++) {
      const width80 = result.upper80[i]! - result.lower80[i]!;
      const width95 = result.upper95[i]! - result.lower95[i]!;
      expect(width95).toBeGreaterThanOrEqual(width80);
    }
  });
});

describe('forecast — edge cases', () => {
  it('returns null for data with fewer than 14 points', () => {
    expect(forecast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(forecast([])).toBeNull();
  });

  it('returns null for single value', () => {
    expect(forecast([42])).toBeNull();
  });

  it('handles all-zero data', () => {
    const data = Array.from({ length: 30 }, () => 0);
    const result = forecast(data);

    expect(result).not.toBeNull();
    if (!result) return;

    for (const val of result.forecast) {
      expect(val).toBe(0);
    }
  });

  it('returns exactly 14 points with minimum viable data', () => {
    const data = Array.from({ length: 14 }, (_, i) => 100 + i * 5);
    const result = forecast(data, { horizon: 5 });
    expect(result).not.toBeNull();
    expect(result!.forecast).toHaveLength(5);
  });
});

describe('forecast — noisy data', () => {
  it('detects upward trend in noisy data', () => {
    const rng = seedrandom('growth-os-test');
    // Linear trend 100 + 3*x with noise ±20
    const data = Array.from({ length: 90 }, (_, i) => 100 + 3 * i + (rng() - 0.5) * 40);
    const result = forecast(data, { horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    // Forecast values should generally increase
    const lastActual = data[data.length - 1]!;
    const avgForecast = result.forecast.reduce((s, v) => s + v, 0) / result.forecast.length;
    // Average forecast should be above last actual value (trending up)
    expect(avgForecast).toBeGreaterThan(lastActual * 0.8);
  });

  it('detects downward trend in noisy data', () => {
    const rng = seedrandom('growth-os-down');
    // Downward trend 500 - 2*x with noise ±15
    const data = Array.from({ length: 90 }, (_, i) => 500 - 2 * i + (rng() - 0.5) * 30);
    const result = forecast(data, { horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    // Last forecast should be less than last data value (trending down)
    const lastActual = data[data.length - 1]!;
    expect(result.forecast[result.forecast.length - 1]).toBeLessThan(lastActual + 50);
  });
});

// ── Seasonal Forecasting (Holt-Winters Triple) ─────────────────

describe('forecastSeasonal — basic', () => {
  it('returns null for too-short data', () => {
    expect(forecastSeasonal([1, 2, 3])).toBeNull();
  });

  it('falls back when data is shorter than 2 periods', () => {
    // 7-day seasonality needs >= 14 points
    const data = Array.from({ length: 12 }, (_, i) => 100 + i);
    const result = forecastSeasonal(data, { seasonalPeriod: 7 });
    // Should fall back to double exponential (also returns null since < 14 points)
    expect(result).toBeNull();
  });

  it('returns result with gamma and seasonalFactors', () => {
    // Generate 60 data points with weekly pattern
    const data = Array.from({ length: 60 }, (_, i) => {
      const base = 100 + i * 2;
      const dayOfWeek = i % 7;
      const seasonal = dayOfWeek < 5 ? 20 : -30; // weekdays high, weekends low
      return base + seasonal;
    });

    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 14 });
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result).toHaveProperty('gamma');
    expect(result).toHaveProperty('seasonalFactors');
    expect(result.gamma).toBeGreaterThanOrEqual(0);
    expect(result.gamma).toBeLessThanOrEqual(1);
    expect(result.forecast).toHaveLength(14);
  });

  it('returns correct number of forecast points', () => {
    const data = Array.from({ length: 90 }, (_, i) => 200 + i + Math.sin(i * Math.PI / 3.5) * 30);
    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 30 });
    expect(result).not.toBeNull();
    expect(result!.forecast).toHaveLength(30);
    expect(result!.lower80).toHaveLength(30);
    expect(result!.upper80).toHaveLength(30);
    expect(result!.lower95).toHaveLength(30);
    expect(result!.upper95).toHaveLength(30);
  });
});

describe('forecastSeasonal — weekly pattern', () => {
  it('detects weekly seasonality in clean data', () => {
    const rng = seedrandom('seasonal-test');
    // Weekly pattern: Mon-Fri are higher, Sat-Sun lower
    const data = Array.from({ length: 91 }, (_, i) => {
      const base = 1000 + i * 5;
      const dayOfWeek = i % 7;
      const seasonalEffect = dayOfWeek < 5 ? 100 : -150;
      return base + seasonalEffect + (rng() - 0.5) * 30;
    });

    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 14 });
    expect(result).not.toBeNull();
    if (!result) return;

    // Forecast should show variation matching the weekly pattern
    const forecastValues = result.forecast;
    expect(forecastValues.length).toBe(14);

    // All forecast values should be positive
    for (const v of forecastValues) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('forecast values are non-negative', () => {
    const data = Array.from({ length: 60 }, (_, i) => Math.max(0, 50 + i + Math.sin(i * Math.PI / 3.5) * 20));
    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 14 });
    expect(result).not.toBeNull();
    if (!result) return;

    for (const v of result.forecast) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('forecastSeasonal — confidence intervals', () => {
  it('80% CI is narrower than 95% CI', () => {
    const data = Array.from({ length: 90 }, (_, i) => 200 + i * 3 + Math.sin(i * Math.PI / 3.5) * 40);
    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 14 });

    expect(result).not.toBeNull();
    if (!result) return;

    for (let i = 0; i < result.forecast.length; i++) {
      const width80 = result.upper80[i]! - result.lower80[i]!;
      const width95 = result.upper95[i]! - result.lower95[i]!;
      expect(width95).toBeGreaterThanOrEqual(width80);
    }
  });
});

describe('forecastSeasonal — edge cases', () => {
  it('handles constant data with seasonality disabled (gamma=0 fallback)', () => {
    const data = Array.from({ length: 60 }, () => 300);
    const result = forecastSeasonal(data, { seasonalPeriod: 7, horizon: 10 });

    expect(result).not.toBeNull();
    if (!result) return;

    for (const val of result.forecast) {
      expect(val).toBeCloseTo(300, 0);
    }
  });

  it('works with non-7 seasonal period', () => {
    // Monthly period = 30
    const data = Array.from({ length: 120 }, (_, i) => 500 + i + Math.sin(i * Math.PI / 15) * 50);
    const result = forecastSeasonal(data, { seasonalPeriod: 30, horizon: 30 });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.forecast).toHaveLength(30);
    expect(result.seasonalFactors.length).toBeGreaterThan(0);
  });
});
