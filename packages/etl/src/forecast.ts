// ──────────────────────────────────────────────────────────────
// Growth OS — Holt-Winters Double Exponential Smoothing
// Pure TypeScript forecasting engine (no external dependencies)
// ──────────────────────────────────────────────────────────────

export interface ForecastResult {
  forecast: number[];
  lower80: number[];
  upper80: number[];
  lower95: number[];
  upper95: number[];
  alpha: number;
  beta: number;
  mse: number;
}

export interface ForecastConfig {
  horizon: number;
  holdoutPct: number;
  gridSteps: number;
}

const DEFAULTS: ForecastConfig = {
  horizon: 30,
  holdoutPct: 0.2,
  gridSteps: 10,
};

// ── Holt's Linear Trend Method ────────────────────────────────

export function holtSmooth(
  data: number[],
  alpha: number,
  beta: number,
): { level: number[]; trend: number[] } {
  const n = data.length;
  const level = new Array<number>(n);
  const trend = new Array<number>(n);

  // Initialize trend as average of first few differences
  if (n >= 4) {
    trend[0] = ((data[1]! - data[0]!) + (data[2]! - data[1]!) + (data[3]! - data[2]!)) / 3;
  } else if (n >= 2) {
    trend[0] = data[1]! - data[0]!;
  } else {
    trend[0] = 0;
  }
  level[0] = data[0]!;

  for (let t = 1; t < n; t++) {
    level[t] = alpha * data[t]! + (1 - alpha) * (level[t - 1]! + trend[t - 1]!);
    trend[t] = beta * (level[t]! - level[t - 1]!) + (1 - beta) * trend[t - 1]!;
  }

  return { level, trend };
}

// ── Generate Forecast Points ──────────────────────────────────

export function holtForecast(level: number, trend: number, steps: number): number[] {
  return Array.from({ length: steps }, (_, h) => Math.max(0, level + (h + 1) * trend));
}

// ── Mean Squared Error ────────────────────────────────────────

export function computeMSE(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const diff = actual[i]! - predicted[i]!;
    sum += diff * diff;
  }
  return sum / n;
}

// ── Parameter Optimization (Grid Search) ──────────────────────

function optimizeParameters(
  data: number[],
  config: ForecastConfig,
): { alpha: number; beta: number; mse: number } {
  const splitIdx = Math.floor(data.length * (1 - config.holdoutPct));
  const train = data.slice(0, splitIdx);
  const holdout = data.slice(splitIdx);

  if (train.length < 4 || holdout.length < 1) {
    return { alpha: 0.3, beta: 0.1, mse: Infinity };
  }

  let bestAlpha = 0.3;
  let bestBeta = 0.1;
  let bestMSE = Infinity;

  const steps = config.gridSteps;
  for (let ai = 1; ai < steps; ai++) {
    const alpha = ai / steps;
    for (let bi = 0; bi <= steps; bi++) {
      const beta = bi / steps;

      const { level, trend } = holtSmooth(train, alpha, beta);
      const lastLevel = level[level.length - 1]!;
      const lastTrend = trend[trend.length - 1]!;
      const predicted = holtForecast(lastLevel, lastTrend, holdout.length);
      const mse = computeMSE(holdout, predicted);

      if (mse < bestMSE) {
        bestMSE = mse;
        bestAlpha = alpha;
        bestBeta = beta;
      }
    }
  }

  return { alpha: bestAlpha, beta: bestBeta, mse: bestMSE };
}

// ── Confidence Intervals ──────────────────────────────────────

function computeConfidenceIntervals(
  forecastValues: number[],
  mse: number,
  horizon: number,
): { lower80: number[]; upper80: number[]; lower95: number[]; upper95: number[] } {
  const se = Math.sqrt(mse);
  const z80 = 1.28;
  const z95 = 1.96;

  const lower80: number[] = [];
  const upper80: number[] = [];
  const lower95: number[] = [];
  const upper95: number[] = [];

  for (let h = 0; h < horizon; h++) {
    const spread = se * Math.sqrt(h + 1);
    const val = forecastValues[h]!;

    lower80.push(Math.max(0, val - z80 * spread));
    upper80.push(val + z80 * spread);
    lower95.push(Math.max(0, val - z95 * spread));
    upper95.push(val + z95 * spread);
  }

  return { lower80, upper80, lower95, upper95 };
}

// ── Main Export ───────────────────────────────────────────────

export function forecast(
  data: number[],
  config?: Partial<ForecastConfig>,
): ForecastResult | null {
  const cfg: ForecastConfig = { ...DEFAULTS, ...config };

  // Edge case: insufficient data
  if (data.length < 14) return null;

  // Edge case: all identical values (flat forecast)
  const firstVal = data[0]!;
  const allSame = data.every((v) => v === firstVal);
  if (allSame) {
    const flat = Array.from<number>({ length: cfg.horizon }).fill(firstVal);
    return {
      forecast: flat,
      lower80: [...flat],
      upper80: [...flat],
      lower95: [...flat],
      upper95: [...flat],
      alpha: 0.5,
      beta: 0.0,
      mse: 0,
    };
  }

  // Optimize parameters via grid search
  const { alpha, beta, mse } = optimizeParameters(data, cfg);

  // Smooth the full dataset with optimized parameters
  const { level, trend } = holtSmooth(data, alpha, beta);
  const lastLevel = level[level.length - 1]!;
  const lastTrend = trend[trend.length - 1]!;

  // Generate forecast
  const forecastValues = holtForecast(lastLevel, lastTrend, cfg.horizon);

  // Compute confidence intervals
  const ci = computeConfidenceIntervals(forecastValues, mse, cfg.horizon);

  return {
    forecast: forecastValues,
    ...ci,
    alpha,
    beta,
    mse,
  };
}

// ── Holt-Winters Triple Exponential (Seasonal) ─────────────────

export interface SeasonalForecastConfig extends ForecastConfig {
  seasonalPeriod: number;
  seasonalType: 'additive' | 'multiplicative';
}

export interface SeasonalForecastResult extends ForecastResult {
  gamma: number;
  seasonalFactors: number[];
}

const SEASONAL_DEFAULTS: SeasonalForecastConfig = {
  horizon: 30,
  holdoutPct: 0.2,
  gridSteps: 5,
  seasonalPeriod: 7,
  seasonalType: 'additive',
};

/**
 * Holt-Winters Triple Exponential Smoothing (additive seasonality).
 * Falls back to double exponential if data is too short for a full seasonal cycle.
 */
export function forecastSeasonal(
  data: number[],
  config?: Partial<SeasonalForecastConfig>,
): SeasonalForecastResult | null {
  const cfg: SeasonalForecastConfig = { ...SEASONAL_DEFAULTS, ...config };
  const m = cfg.seasonalPeriod;

  // Need at least 2 full seasonal periods
  if (data.length < m * 2) {
    const result = forecast(data, cfg);
    if (!result) return null;
    return { ...result, gamma: 0, seasonalFactors: [] };
  }

  const { alpha, beta, gamma, mse, seasonal } = optimizeSeasonalParameters(data, cfg);

  // Smooth with best parameters
  const { level, trend, seasonalFactors } = hwTripleSmooth(data, alpha, beta, gamma, m);
  const n = data.length;
  const lastLevel = level[n - 1]!;
  const lastTrend = trend[n - 1]!;

  // Generate seasonal forecast
  const forecastValues: number[] = [];
  for (let h = 0; h < cfg.horizon; h++) {
    const seasonIdx = (n + h) % m;
    const val = lastLevel + (h + 1) * lastTrend + seasonalFactors[seasonIdx]!;
    forecastValues.push(Math.max(0, val));
  }

  const ci = computeConfidenceIntervals(forecastValues, mse, cfg.horizon);

  return {
    forecast: forecastValues,
    ...ci,
    alpha,
    beta,
    gamma,
    mse,
    seasonalFactors: seasonal,
  };
}

function hwTripleSmooth(
  data: number[],
  alpha: number,
  beta: number,
  gamma: number,
  m: number,
): { level: number[]; trend: number[]; seasonalFactors: number[] } {
  const n = data.length;
  const level = new Array<number>(n);
  const trend = new Array<number>(n);
  const seasonal = new Array<number>(n + m);

  // Initialize: average of first period
  let firstPeriodAvg = 0;
  for (let i = 0; i < m; i++) firstPeriodAvg += data[i]!;
  firstPeriodAvg /= m;

  level[0] = firstPeriodAvg;
  trend[0] = 0;
  if (m >= 2) {
    let secondPeriodAvg = 0;
    for (let i = m; i < Math.min(m * 2, n); i++) secondPeriodAvg += data[i]!;
    secondPeriodAvg /= Math.min(m, n - m);
    trend[0] = (secondPeriodAvg - firstPeriodAvg) / m;
  }

  // Initialize seasonal factors from first period
  for (let i = 0; i < m; i++) {
    seasonal[i] = data[i]! - firstPeriodAvg;
  }

  for (let t = 1; t < n; t++) {
    const prevSeasonal = seasonal[t % m]!;
    level[t] = alpha * (data[t]! - prevSeasonal) + (1 - alpha) * (level[t - 1]! + trend[t - 1]!);
    trend[t] = beta * (level[t]! - level[t - 1]!) + (1 - beta) * trend[t - 1]!;
    seasonal[t % m + m] = gamma * (data[t]! - level[t]!) + (1 - gamma) * prevSeasonal;
  }

  // Extract the last m seasonal factors
  const finalSeasonal = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const idx = (n - 1) % m;
    // Find the most recent seasonal factor for position i
    const offset = ((i - idx % m) + m) % m;
    finalSeasonal[i] = seasonal[((n - 1 - offset) % m) + m] ?? seasonal[i]!;
  }

  // Normalize: final factors from the last full pass
  for (let i = 0; i < m; i++) {
    finalSeasonal[i] = seasonal[i + m] ?? seasonal[i]!;
  }

  return { level, trend, seasonalFactors: finalSeasonal };
}

function optimizeSeasonalParameters(
  data: number[],
  config: SeasonalForecastConfig,
): { alpha: number; beta: number; gamma: number; mse: number; seasonal: number[] } {
  const splitIdx = Math.floor(data.length * (1 - config.holdoutPct));
  const train = data.slice(0, splitIdx);
  const holdout = data.slice(splitIdx);
  const m = config.seasonalPeriod;

  if (train.length < m * 2 || holdout.length < 1) {
    return { alpha: 0.3, beta: 0.1, gamma: 0.1, mse: Infinity, seasonal: [] };
  }

  let bestAlpha = 0.3;
  let bestBeta = 0.1;
  let bestGamma = 0.1;
  let bestMSE = Infinity;
  let bestSeasonal: number[] = [];

  const steps = config.gridSteps;
  // Coarser grid for 3 parameters to keep runtime reasonable
  for (let ai = 1; ai < steps; ai++) {
    const alpha = ai / steps;
    for (let bi = 0; bi <= Math.min(steps, 3); bi++) {
      const beta = bi / steps;
      for (let gi = 1; gi <= Math.min(steps, 3); gi++) {
        const gamma = gi / steps;

        const { level, trend, seasonalFactors } = hwTripleSmooth(train, alpha, beta, gamma, m);
        const lastLevel = level[train.length - 1]!;
        const lastTrend = trend[train.length - 1]!;

        const predicted: number[] = [];
        for (let h = 0; h < holdout.length; h++) {
          const seasonIdx = (train.length + h) % m;
          predicted.push(Math.max(0, lastLevel + (h + 1) * lastTrend + seasonalFactors[seasonIdx]!));
        }

        const mse = computeMSE(holdout, predicted);
        if (mse < bestMSE) {
          bestMSE = mse;
          bestAlpha = alpha;
          bestBeta = beta;
          bestGamma = gamma;
          bestSeasonal = [...seasonalFactors];
        }
      }
    }
  }

  return { alpha: bestAlpha, beta: bestBeta, gamma: bestGamma, mse: bestMSE, seasonal: bestSeasonal };
}
