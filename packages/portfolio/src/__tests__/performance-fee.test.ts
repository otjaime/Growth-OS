import { describe, it, expect } from 'vitest';
import { calculateMonthlyFee } from '../performance-fee.js';

describe('calculateMonthlyFee', () => {
  const baseClient = {
    id: 'client-1',
    feeStructure: {
      baseRetainer: 3000,
      perfFeePercent: 15,
      benchmarkROAS: 2.5,
    },
  };

  it('returns zero perf fee when actualROAS <= benchmark', () => {
    const result = calculateMonthlyFee({
      client: baseClient,
      monthlyRevenue: 25000,
      monthlyROAS: 2.0,
      period: '2026-03',
    });

    expect(result.perfFeeAmount).toBe(0);
    expect(result.incrementalROAS).toBe(0);
    expect(result.incrementalRevenue).toBe(0);
    expect(result.totalFee).toBe(3000);
  });

  it('returns zero perf fee when actualROAS equals benchmark', () => {
    const result = calculateMonthlyFee({
      client: baseClient,
      monthlyRevenue: 25000,
      monthlyROAS: 2.5,
      period: '2026-03',
    });

    expect(result.perfFeeAmount).toBe(0);
    expect(result.totalFee).toBe(3000);
  });

  it('calculates positive perf fee when actualROAS > benchmark', () => {
    // Revenue = 50000, ROAS = 5.0, spend = 50000/5.0 = 10000
    // Benchmark revenue = 10000 * 2.5 = 25000
    // Incremental revenue = 50000 - 25000 = 25000
    // Perf fee = 25000 * 15/100 = 3750
    const result = calculateMonthlyFee({
      client: baseClient,
      monthlyRevenue: 50000,
      monthlyROAS: 5.0,
      period: '2026-03',
    });

    expect(result.incrementalROAS).toBe(2.5);
    expect(result.revenueBase).toBe(25000);
    expect(result.incrementalRevenue).toBe(25000);
    expect(result.perfFeeAmount).toBe(3750);
    expect(result.totalFee).toBe(3000 + 3750);
  });

  it('handles zero ROAS gracefully', () => {
    const result = calculateMonthlyFee({
      client: baseClient,
      monthlyRevenue: 0,
      monthlyROAS: 0,
      period: '2026-03',
    });

    expect(result.perfFeeAmount).toBe(0);
    expect(result.totalFee).toBe(3000);
    expect(result.revenueBase).toBe(0);
  });

  it('populates all output fields correctly', () => {
    const result = calculateMonthlyFee({
      client: baseClient,
      monthlyRevenue: 30000,
      monthlyROAS: 3.0,
      period: '2026-02',
    });

    expect(result.clientId).toBe('client-1');
    expect(result.period).toBe('2026-02');
    expect(result.baseRetainer).toBe(3000);
    expect(result.benchmarkROAS).toBe(2.5);
    expect(result.actualROAS).toBe(3.0);
    expect(result.perfFeePercent).toBe(15);

    // spend = 30000/3.0 = 10000
    // benchmark rev = 10000 * 2.5 = 25000
    // incremental rev = 30000 - 25000 = 5000
    // perf fee = 5000 * 0.15 = 750
    expect(result.incrementalROAS).toBeCloseTo(0.5, 10);
    expect(result.revenueBase).toBeCloseTo(25000, 5);
    expect(result.incrementalRevenue).toBeCloseTo(5000, 5);
    expect(result.perfFeeAmount).toBeCloseTo(750, 5);
    expect(result.totalFee).toBeCloseTo(3750, 5);
  });
});
