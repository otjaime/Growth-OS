import { describe, it, expect } from 'vitest';
import { calculateTrackRecord, stdDev, avg } from '../winrate.js';
import type { TradeBookEntry } from '../tradebook.js';

function makeEntry(overrides: Partial<TradeBookEntry> = {}): TradeBookEntry {
  const expectedROAS = overrides.expectedROAS ?? 2.5;
  const actualROAS = overrides.actualROAS ?? 3.0;
  const delta = actualROAS - expectedROAS;
  const relativeReturn = expectedROAS === 0 ? 0 : delta / expectedROAS;

  return {
    hypothesisId: 'hyp-1',
    clientId: 'client-1',
    clientName: 'Test Client',
    vertical: 'ECOMMERCE_DTC',
    trigger: 'LOSS_AVERSION',
    awarenessLevel: 'SOLUTION_AWARE',
    budgetUSD: 1000,
    expectedROAS,
    actualROAS,
    delta,
    relativeReturn,
    verdict: 'WINNER',
    lesson: 'Good lesson',
    triggerEffective: true,
    durationDays: 14,
    openedAt: new Date('2026-01-01'),
    closedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('avg', () => {
  it('returns 0 for empty array', () => {
    expect(avg([])).toBe(0);
  });

  it('computes mean', () => {
    expect(avg([2, 4, 6])).toBe(4);
  });
});

describe('stdDev', () => {
  it('returns 0 for empty array', () => {
    expect(stdDev([])).toBe(0);
  });

  it('returns 0 for single value', () => {
    expect(stdDev([5])).toBe(0);
  });

  it('computes population std dev', () => {
    // [2, 4, 6] -> mean=4, variances=[4, 0, 4], variance=8/3, stddev=sqrt(8/3)
    const result = stdDev([2, 4, 6]);
    expect(result).toBeCloseTo(Math.sqrt(8 / 3), 10);
  });
});

describe('calculateTrackRecord', () => {
  it('returns zeros for empty array', () => {
    const result = calculateTrackRecord([]);
    expect(result.totalHypotheses).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.inconclusive).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.avgWinROAS).toBe(0);
    expect(result.avgLossROAS).toBe(0);
    expect(result.expectedValue).toBe(0);
    expect(result.sharpeEquivalent).toBe(0);
    expect(result.alpha).toBe(0);
    expect(result.totalSpend).toBe(0);
    expect(result.totalRevenue).toBe(0);
  });

  it('all wins -> winRate = 1.0', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', actualROAS: 3.0, expectedROAS: 2.0, verdict: 'WINNER' }),
      makeEntry({ hypothesisId: '2', actualROAS: 4.0, expectedROAS: 2.5, verdict: 'WINNER' }),
      makeEntry({ hypothesisId: '3', actualROAS: 3.5, expectedROAS: 2.0, verdict: 'WINNER' }),
    ];
    const result = calculateTrackRecord(entries);
    expect(result.winRate).toBe(1.0);
    expect(result.wins).toBe(3);
    expect(result.losses).toBe(0);
  });

  it('all losses -> winRate = 0', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', actualROAS: 1.0, expectedROAS: 2.5, verdict: 'LOSER' }),
      makeEntry({ hypothesisId: '2', actualROAS: 0.5, expectedROAS: 2.0, verdict: 'LOSER' }),
    ];
    const result = calculateTrackRecord(entries);
    expect(result.winRate).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.losses).toBe(2);
  });

  it('INCONCLUSIVE excluded from winRate', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', verdict: 'WINNER', actualROAS: 3.0, expectedROAS: 2.0 }),
      makeEntry({ hypothesisId: '2', verdict: 'LOSER', actualROAS: 1.0, expectedROAS: 2.0 }),
      makeEntry({ hypothesisId: '3', verdict: 'INCONCLUSIVE', actualROAS: 2.0, expectedROAS: 2.0 }),
    ];
    const result = calculateTrackRecord(entries);
    expect(result.totalHypotheses).toBe(3);
    expect(result.wins).toBe(1);
    expect(result.losses).toBe(1);
    expect(result.inconclusive).toBe(1);
    expect(result.winRate).toBe(0.5);
  });

  it('single entry returns 0 for stdDev-based sharpe', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', verdict: 'WINNER', actualROAS: 3.0, expectedROAS: 2.0 }),
    ];
    const result = calculateTrackRecord(entries);
    expect(result.totalHypotheses).toBe(1);
    expect(result.wins).toBe(1);
    expect(result.winRate).toBe(1.0);
    // Single entry -> stdDev = 0 -> sharpeEquivalent = 0
    expect(result.sharpeEquivalent).toBe(0);
  });

  it('computes alpha against custom benchmark', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', actualROAS: 4.0, expectedROAS: 2.0, verdict: 'WINNER', budgetUSD: 5000 }),
      makeEntry({ hypothesisId: '2', actualROAS: 3.0, expectedROAS: 2.0, verdict: 'WINNER', budgetUSD: 5000 }),
    ];
    const result = calculateTrackRecord(entries, 2.5);
    // avg actual ROAS = 3.5, benchmark = 2.5, alpha = 1.0
    expect(result.alpha).toBe(1.0);
  });

  it('computes totalSpend and totalRevenue', () => {
    const entries = [
      makeEntry({ hypothesisId: '1', actualROAS: 3.0, budgetUSD: 2000, verdict: 'WINNER' }),
      makeEntry({ hypothesisId: '2', actualROAS: 2.0, budgetUSD: 3000, verdict: 'LOSER' }),
    ];
    const result = calculateTrackRecord(entries);
    expect(result.totalSpend).toBe(5000);
    // revenue = 3.0*2000 + 2.0*3000 = 6000 + 6000 = 12000
    expect(result.totalRevenue).toBe(12000);
  });

  it('mixed entries with expected value calculation', () => {
    const win = makeEntry({
      hypothesisId: '1',
      verdict: 'WINNER',
      actualROAS: 4.0,
      expectedROAS: 2.0,
      budgetUSD: 1000,
    });
    const loss = makeEntry({
      hypothesisId: '2',
      verdict: 'LOSER',
      actualROAS: 1.0,
      expectedROAS: 2.0,
      budgetUSD: 1000,
    });

    const entries = [win, loss];
    const result = calculateTrackRecord(entries);

    expect(result.winRate).toBe(0.5);
    // win relativeReturn = (4-2)/2 = 1.0, loss relativeReturn = (1-2)/2 = -0.5
    // EV = 0.5 * 1.0 - 0.5 * 0.5 = 0.5 - 0.25 = 0.25
    expect(result.expectedValue).toBeCloseTo(0.25, 10);
  });
});
