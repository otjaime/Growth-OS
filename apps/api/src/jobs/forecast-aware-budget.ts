// ──────────────────────────────────────────────────────────────
// Growth OS — Forecast-Aware Budget Context
// Uses Holt-Winters forecast from historical revenue data to
// adjust budget recommendations based on demand trends.
// Called once per diagnosis run — NOT per ad.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { forecast, forecastSeasonal } from '@growth-os/etl';
import type { ForecastResult, SeasonalForecastResult } from '@growth-os/etl';

// ── Interfaces ────────────────────────────────────────────────

export interface ForecastBudgetContext {
  /** Revenue trend: growing (>5%) | flat | declining (<-5%) */
  trend: 'growing' | 'flat' | 'declining';

  /** Budget multiplier (0.8–1.3): growing → scale up, declining → scale down */
  budgetMultiplier: number;

  /** 7-day revenue forecast (sum of next 7 days) */
  forecastedRevenue7d: number;

  /** Percent change between forecasted and recent actual revenue */
  forecastVsActualPct: number;

  /** Seasonal factor for today (if available). >1 = high-demand day */
  todaySeasonalFactor: number | null;

  /** Whether seasonal data was available */
  hasSeasonal: boolean;
}

// ── Constants ─────────────────────────────────────────────────

const GROWING_THRESHOLD = 0.05;   // >5% growth = growing
const DECLINING_THRESHOLD = -0.05; // <-5% = declining
const MIN_DAYS_FOR_FORECAST = 14;
const MIN_DAYS_FOR_SEASONAL = 14;  // 2 × weekly period
const MAX_MULTIPLIER = 1.3;
const MIN_MULTIPLIER = 0.8;
const SEASONAL_BOOST_THRESHOLD = 1.1;
const SEASONAL_BOOST_PCT = 0.10;

// ── Main Export ───────────────────────────────────────────────

/**
 * Compute demand-aware budget context from historical revenue data.
 *
 * - Loads daily revenue from FactOrder (last 60 days)
 * - Runs Holt-Winters forecast for next 7 days
 * - Computes revenue trend (growing/flat/declining)
 * - Returns budget multiplier (0.8–1.3)
 * - If ≥14 days available, also extracts seasonal factors
 *
 * Returns null if insufficient data (< 14 days of revenue).
 */
export async function computeForecastBudgetContext(
  organizationId: string,
): Promise<ForecastBudgetContext | null> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Load daily revenue from FactOrder (grouped by orderDate)
  const dailyRevenue = await prisma.factOrder.groupBy({
    by: ['orderDate'],
    where: {
      ...(organizationId ? { organizationId } : {}),
      orderDate: { gte: sixtyDaysAgo },
    },
    _sum: {
      revenueNet: true,
    },
    orderBy: {
      orderDate: 'asc',
    },
  });

  if (dailyRevenue.length < MIN_DAYS_FOR_FORECAST) {
    return null;
  }

  // Extract revenue time series
  const revenueData = dailyRevenue.map((d) => d._sum?.revenueNet?.toNumber() ?? 0);

  // Run Holt-Winters forecast (7-day horizon)
  const forecastResult = forecast(revenueData, { horizon: 7 });
  if (!forecastResult) return null;

  // Compute recent actual revenue (last 7 days)
  const recentRevenue = revenueData.slice(-7);
  const actualRevenue7d = recentRevenue.reduce((sum, v) => sum + v, 0);
  const forecastedRevenue7d = forecastResult.forecast.reduce((sum, v) => sum + v, 0);

  // Compute trend as % change between forecast and actual
  const forecastVsActualPct = actualRevenue7d > 0
    ? (forecastedRevenue7d - actualRevenue7d) / actualRevenue7d
    : 0;

  // Determine trend classification
  let trend: 'growing' | 'flat' | 'declining';
  if (forecastVsActualPct > GROWING_THRESHOLD) {
    trend = 'growing';
  } else if (forecastVsActualPct < DECLINING_THRESHOLD) {
    trend = 'declining';
  } else {
    trend = 'flat';
  }

  // Compute budget multiplier based on trend
  let budgetMultiplier = 1.0;
  if (trend === 'growing') {
    // Scale proportionally: +5% forecast → 1.05x, +20% → 1.2x, max 1.3x
    budgetMultiplier = Math.min(MAX_MULTIPLIER, 1.0 + forecastVsActualPct * 0.5);
  } else if (trend === 'declining') {
    // Scale down proportionally: -5% → 0.975x, -20% → 0.9x, min 0.8x
    budgetMultiplier = Math.max(MIN_MULTIPLIER, 1.0 + forecastVsActualPct * 0.5);
  }

  budgetMultiplier = Math.round(budgetMultiplier * 100) / 100;

  // Phase 5.2: Try seasonal forecast if enough data (weekly pattern)
  let todaySeasonalFactor: number | null = null;
  let hasSeasonal = false;

  if (revenueData.length >= MIN_DAYS_FOR_SEASONAL) {
    const seasonalResult = forecastSeasonal(revenueData, {
      horizon: 7,
      seasonalPeriod: 7,
    });

    if (seasonalResult && seasonalResult.seasonalFactors.length > 0) {
      hasSeasonal = true;

      // Get today's day-of-week index (0=Sun, 6=Sat)
      const today = new Date();
      const dayIndex = today.getDay();

      // Seasonal factors are additive: compute relative factor
      const avgRevenue = revenueData.reduce((s, v) => s + v, 0) / revenueData.length;
      if (avgRevenue > 0 && dayIndex < seasonalResult.seasonalFactors.length) {
        todaySeasonalFactor = 1 + (seasonalResult.seasonalFactors[dayIndex]! / avgRevenue);
        todaySeasonalFactor = Math.round(todaySeasonalFactor * 100) / 100;

        // Boost budget multiplier on high-demand days
        if (todaySeasonalFactor > SEASONAL_BOOST_THRESHOLD) {
          budgetMultiplier = Math.min(
            MAX_MULTIPLIER,
            budgetMultiplier * (1 + SEASONAL_BOOST_PCT),
          );
          budgetMultiplier = Math.round(budgetMultiplier * 100) / 100;
        }
      }
    }
  }

  return {
    trend,
    budgetMultiplier,
    forecastedRevenue7d: Math.round(forecastedRevenue7d * 100) / 100,
    forecastVsActualPct: Math.round(forecastVsActualPct * 1000) / 10, // as percentage
    todaySeasonalFactor,
    hasSeasonal,
  };
}
