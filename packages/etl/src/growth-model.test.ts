import { describe, it, expect } from 'vitest';
import { computeGrowthModel, computeMonthlyBreakdown, DEMO_SCENARIOS } from './growth-model.js';
import type { GrowthModelInput } from './growth-model.js';

describe('computeMonthlyBreakdown', () => {
  const baseInput: GrowthModelInput = {
    monthlyBudget: 45000,
    targetCac: 32,
    expectedCvr: 0.028,
    avgOrderValue: 85,
    cogsPercent: 0.45,
    returnRate: 0.20,
    avgOrdersPerCustomer: 1.3,
    horizonMonths: 6,
  };

  it('returns correct number of months', () => {
    const result = computeMonthlyBreakdown(baseInput);
    expect(result).toHaveLength(6);
    expect(result[0]!.month).toBe(1);
    expect(result[5]!.month).toBe(6);
  });

  it('computes new customers per month correctly', () => {
    const result = computeMonthlyBreakdown(baseInput);
    // floor(45000 / 32) = 1406
    expect(result[0]!.newCustomers).toBe(1406);
    expect(result[5]!.newCustomers).toBe(1406);
  });

  it('has zero returning customers in month 1', () => {
    const result = computeMonthlyBreakdown(baseInput);
    expect(result[0]!.returningCustomers).toBe(0);
  });

  it('computes returning customers correctly in subsequent months', () => {
    const result = computeMonthlyBreakdown(baseInput);
    // Month 2: floor(1406 * 0.20) = 281
    expect(result[1]!.returningCustomers).toBe(281);
    // Month 3: floor(2812 * 0.20) = 562
    expect(result[2]!.returningCustomers).toBe(562);
  });

  it('computes orders correctly (newCustomers * avgOrdersPerCustomer + returning)', () => {
    const result = computeMonthlyBreakdown(baseInput);
    // Month 1: round(1406 * 1.3) + 0 = 1828 + 0 = 1828
    expect(result[0]!.orders).toBe(1828);
    // Month 2: round(1406 * 1.3) + 281 = 1828 + 281 = 2109
    expect(result[1]!.orders).toBe(2109);
  });

  it('computes revenue = orders * avgOrderValue', () => {
    const result = computeMonthlyBreakdown(baseInput);
    expect(result[0]!.revenue).toBe(1828 * 85);
  });

  it('computes COGS = revenue * cogsPercent', () => {
    const result = computeMonthlyBreakdown(baseInput);
    expect(result[0]!.cogs).toBe(1828 * 85 * 0.45);
  });

  it('computes contribution margin = revenue - COGS - budget', () => {
    const result = computeMonthlyBreakdown(baseInput);
    const expectedCm = (1828 * 85) - (1828 * 85 * 0.45) - 45000;
    expect(result[0]!.contributionMargin).toBeCloseTo(expectedCm, 2);
  });

  it('cumulative values are monotonically non-decreasing', () => {
    const result = computeMonthlyBreakdown(baseInput);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.cumulativeRevenue).toBeGreaterThanOrEqual(result[i - 1]!.cumulativeRevenue);
      expect(result[i]!.cumulativeSpend).toBeGreaterThanOrEqual(result[i - 1]!.cumulativeSpend);
    }
  });

  it('ROAS = revenue / spend per month', () => {
    const result = computeMonthlyBreakdown(baseInput);
    const m1 = result[0]!;
    expect(m1.roas).toBeCloseTo(m1.revenue / m1.spend, 6);
  });
});

describe('computeGrowthModel', () => {
  const baseInput: GrowthModelInput = {
    monthlyBudget: 45000,
    targetCac: 32,
    expectedCvr: 0.028,
    avgOrderValue: 85,
    cogsPercent: 0.45,
    returnRate: 0.20,
    avgOrdersPerCustomer: 1.3,
    horizonMonths: 6,
  };

  it('returns summary KPIs and monthly breakdown', () => {
    const result = computeGrowthModel(baseInput);
    expect(result.monthlyBreakdown).toHaveLength(6);
    expect(result.projectedRevenue).toBeGreaterThan(0);
    expect(result.projectedOrders).toBeGreaterThan(0);
    expect(result.projectedCustomers).toBeGreaterThan(0);
    expect(result.projectedRoas).toBeGreaterThan(0);
    expect(result.projectedMer).toBeGreaterThan(0);
    expect(result.projectedLtv).toBeGreaterThan(0);
  });

  it('projectedCustomers = newCustomers * horizonMonths', () => {
    const result = computeGrowthModel(baseInput);
    // floor(45000 / 32) * 6 = 1406 * 6 = 8436
    expect(result.projectedCustomers).toBe(1406 * 6);
  });

  it('projectedRevenue matches sum of monthly revenues', () => {
    const result = computeGrowthModel(baseInput);
    const sumRevenue = result.monthlyBreakdown.reduce((s, m) => s + m.revenue, 0);
    expect(result.projectedRevenue).toBeCloseTo(sumRevenue, 2);
  });

  it('projectedOrders matches sum of monthly orders', () => {
    const result = computeGrowthModel(baseInput);
    const sumOrders = result.monthlyBreakdown.reduce((s, m) => s + m.orders, 0);
    expect(result.projectedOrders).toBe(sumOrders);
  });

  it('finds break-even month (first month cumulative profit >= 0)', () => {
    const result = computeGrowthModel(baseInput);
    // With these inputs, CM should be positive from month 1
    expect(result.breakEvenMonth).toBe(1);
  });

  it('returns null break-even when COGS is 100%', () => {
    const result = computeGrowthModel({
      ...baseInput,
      cogsPercent: 1.0,
    });
    expect(result.breakEvenMonth).toBeNull();
    expect(result.projectedContributionMargin).toBeLessThan(0);
  });
});

describe('edge cases', () => {
  it('zero budget returns zero everything', () => {
    const result = computeGrowthModel({
      monthlyBudget: 0,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.20,
      avgOrdersPerCustomer: 1.3,
      horizonMonths: 6,
    });
    expect(result.projectedCustomers).toBe(0);
    expect(result.projectedOrders).toBe(0);
    expect(result.projectedRevenue).toBe(0);
  });

  it('zero CAC returns zero customers', () => {
    const result = computeGrowthModel({
      monthlyBudget: 50000,
      targetCac: 0,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.20,
      avgOrdersPerCustomer: 1.3,
      horizonMonths: 6,
    });
    expect(result.projectedCustomers).toBe(0);
    expect(result.projectedRevenue).toBe(0);
  });

  it('zero return rate means no returning customers', () => {
    const result = computeGrowthModel({
      monthlyBudget: 10000,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0,
      avgOrdersPerCustomer: 1.0,
      horizonMonths: 3,
    });
    for (const m of result.monthlyBreakdown) {
      expect(m.returningCustomers).toBe(0);
    }
  });

  it('high return rate produces compounding returning customers', () => {
    const result = computeGrowthModel({
      monthlyBudget: 10000,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.50,
      avgOrdersPerCustomer: 1.0,
      horizonMonths: 6,
    });
    // Each month should have more returning customers than the previous
    for (let i = 2; i < result.monthlyBreakdown.length; i++) {
      expect(result.monthlyBreakdown[i]!.returningCustomers)
        .toBeGreaterThan(result.monthlyBreakdown[i - 1]!.returningCustomers);
    }
  });

  it('zero horizonMonths returns empty breakdown', () => {
    const result = computeGrowthModel({
      monthlyBudget: 10000,
      targetCac: 50,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.20,
      avgOrdersPerCustomer: 1.3,
      horizonMonths: 0,
    });
    expect(result.monthlyBreakdown).toHaveLength(0);
    expect(result.projectedRevenue).toBe(0);
    expect(result.breakEvenMonth).toBeNull();
  });
});

describe('DEMO_SCENARIOS', () => {
  it('has 3 scenarios', () => {
    expect(DEMO_SCENARIOS).toHaveLength(3);
  });

  it('first scenario is marked as baseline', () => {
    expect(DEMO_SCENARIOS[0]!.isBaseline).toBe(true);
  });

  it('all scenarios produce valid output', () => {
    for (const scenario of DEMO_SCENARIOS) {
      const result = computeGrowthModel(scenario.input);
      expect(result.projectedRevenue).toBeGreaterThan(0);
      expect(result.monthlyBreakdown).toHaveLength(scenario.input.horizonMonths);
    }
  });
});
