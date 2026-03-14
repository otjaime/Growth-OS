import type { TradeBookEntry } from './tradebook.js';

export interface TrackRecordResult {
  totalHypotheses: number;
  wins: number;
  losses: number;
  inconclusive: number;
  winRate: number;
  avgWinROAS: number;
  avgLossROAS: number;
  avgExpectedROAS: number;
  expectedValue: number;
  sharpeEquivalent: number;
  alpha: number;
  totalSpend: number;
  totalRevenue: number;
}

export const INDUSTRY_BENCHMARK_ROAS: Record<string, number> = {
  ECOMMERCE_DTC: 2.5,
  FOOD_BEVERAGE: 2.0,
  SAAS: 1.8,
  FITNESS: 2.2,
  BEAUTY: 2.8,
  HOME: 2.3,
  PETS: 2.4,
  OTHER: 2.0,
};

export function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

export function stdDev(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = avg(values);
  let sumSq = 0;
  for (const v of values) {
    const diff = v - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

export function calculateTrackRecord(
  entries: readonly TradeBookEntry[],
  benchmarkROAS?: number,
): TrackRecordResult {
  if (entries.length === 0) {
    return {
      totalHypotheses: 0,
      wins: 0,
      losses: 0,
      inconclusive: 0,
      winRate: 0,
      avgWinROAS: 0,
      avgLossROAS: 0,
      avgExpectedROAS: 0,
      expectedValue: 0,
      sharpeEquivalent: 0,
      alpha: 0,
      totalSpend: 0,
      totalRevenue: 0,
    };
  }

  const wins = entries.filter((e) => e.verdict === 'WINNER');
  const losses = entries.filter((e) => e.verdict === 'LOSER');
  const inconclusiveEntries = entries.filter((e) => e.verdict === 'INCONCLUSIVE');

  const winCount = wins.length;
  const lossCount = losses.length;
  const inconclusiveCount = inconclusiveEntries.length;
  const decidedCount = winCount + lossCount;

  const winRate = decidedCount === 0 ? 0 : winCount / decidedCount;

  const avgWinROAS = avg(wins.map((e) => e.actualROAS));
  const avgLossROAS = avg(losses.map((e) => e.actualROAS));
  const avgExpectedROAS = avg(entries.map((e) => e.expectedROAS));

  // Returns = relativeReturn for each entry
  const returns = entries.map((e) => e.relativeReturn);
  const avgReturn = avg(returns);
  const sd = stdDev(returns);

  // Expected value: winRate * avgUpside - lossRate * avgDownside
  const avgUpside = avg(wins.map((e) => e.relativeReturn));
  const avgDownside = avg(losses.map((e) => Math.abs(e.relativeReturn)));
  const lossRate = decidedCount === 0 ? 0 : lossCount / decidedCount;
  const expectedValue = winRate * avgUpside - lossRate * avgDownside;

  // Sharpe equivalent: EV / stdDev(returns)
  const sharpeEquivalent = sd === 0 ? 0 : avgReturn / sd;

  // Alpha: actual avg ROAS - benchmark ROAS
  const benchmark = benchmarkROAS ?? 2.0;
  const actualAvgROAS = avg(entries.map((e) => e.actualROAS));
  const alpha = actualAvgROAS - benchmark;

  // Totals
  const totalSpend = entries.reduce((sum, e) => sum + e.budgetUSD, 0);
  const totalRevenue = entries.reduce((sum, e) => sum + e.actualROAS * e.budgetUSD, 0);

  return {
    totalHypotheses: entries.length,
    wins: winCount,
    losses: lossCount,
    inconclusive: inconclusiveCount,
    winRate,
    avgWinROAS,
    avgLossROAS,
    avgExpectedROAS,
    expectedValue,
    sharpeEquivalent,
    alpha,
    totalSpend,
    totalRevenue,
  };
}
