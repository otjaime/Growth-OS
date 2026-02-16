// ──────────────────────────────────────────────────────────────
// Growth OS — Growth Model / Scenario Planning Engine
// Pure computation: input assumptions → projected business outcomes
// ──────────────────────────────────────────────────────────────

export interface GrowthModelInput {
  monthlyBudget: number;
  targetCac: number;
  expectedCvr: number;
  avgOrderValue: number;
  cogsPercent: number;
  monthlyTraffic?: number | null;
  returnRate: number;
  avgOrdersPerCustomer: number;
  horizonMonths: number;
}

export interface MonthlyProjection {
  month: number;
  spend: number;
  newCustomers: number;
  returningCustomers: number;
  orders: number;
  revenue: number;
  cogs: number;
  contributionMargin: number;
  cumulativeRevenue: number;
  cumulativeSpend: number;
  cumulativeProfit: number;
  roas: number;
}

export interface GrowthModelOutput {
  projectedRevenue: number;
  projectedOrders: number;
  projectedCustomers: number;
  projectedRoas: number;
  projectedMer: number;
  projectedLtv: number;
  projectedContributionMargin: number;
  breakEvenMonth: number | null;
  monthlyBreakdown: MonthlyProjection[];
}

/**
 * Compute monthly breakdown projections from input assumptions.
 *
 * Logic per month:
 *   - newCustomers = floor(monthlyBudget / targetCac) (guards divide-by-zero)
 *   - returningCustomers = floor(cumulative prior customers * returnRate)
 *   - orders = newCustomers * avgOrdersPerCustomer + returningCustomers
 *   - revenue = orders * avgOrderValue
 *   - cogs = revenue * cogsPercent
 *   - contributionMargin = revenue - cogs - monthlyBudget
 *   - Track cumulative values; breakEvenMonth = first month cumulativeProfit >= 0
 */
export function computeMonthlyBreakdown(input: GrowthModelInput): MonthlyProjection[] {
  const {
    monthlyBudget,
    targetCac,
    avgOrderValue,
    cogsPercent,
    returnRate,
    avgOrdersPerCustomer,
    horizonMonths,
  } = input;

  const newCustomersPerMonth = targetCac > 0 ? Math.floor(monthlyBudget / targetCac) : 0;

  const months: MonthlyProjection[] = [];
  let cumulativeRevenue = 0;
  let cumulativeSpend = 0;
  let cumulativeProfit = 0;
  let cumulativeNewCustomers = 0;

  for (let m = 1; m <= horizonMonths; m++) {
    const returningCustomers = Math.floor(cumulativeNewCustomers * returnRate);
    const orders = Math.round(newCustomersPerMonth * avgOrdersPerCustomer) + returningCustomers;
    const revenue = orders * avgOrderValue;
    const cogs = revenue * cogsPercent;
    const contributionMargin = revenue - cogs - monthlyBudget;

    cumulativeRevenue += revenue;
    cumulativeSpend += monthlyBudget;
    cumulativeProfit += contributionMargin;
    cumulativeNewCustomers += newCustomersPerMonth;

    const roas = monthlyBudget > 0 ? revenue / monthlyBudget : 0;

    months.push({
      month: m,
      spend: monthlyBudget,
      newCustomers: newCustomersPerMonth,
      returningCustomers,
      orders,
      revenue,
      cogs,
      contributionMargin,
      cumulativeRevenue,
      cumulativeSpend,
      cumulativeProfit,
      roas,
    });
  }

  return months;
}

/**
 * Compute full growth model output from input assumptions.
 * Returns summary KPIs + monthly breakdown.
 */
export function computeGrowthModel(input: GrowthModelInput): GrowthModelOutput {
  const months = computeMonthlyBreakdown(input);

  if (months.length === 0) {
    return {
      projectedRevenue: 0,
      projectedOrders: 0,
      projectedCustomers: 0,
      projectedRoas: 0,
      projectedMer: 0,
      projectedLtv: 0,
      projectedContributionMargin: 0,
      breakEvenMonth: null,
      monthlyBreakdown: [],
    };
  }

  const last = months[months.length - 1]!;
  const totalRevenue = last.cumulativeRevenue;
  const totalSpend = last.cumulativeSpend;
  const totalOrders = months.reduce((sum, m) => sum + m.orders, 0);
  const totalNewCustomers = months.reduce((sum, m) => sum + m.newCustomers, 0);
  const totalCM = months.reduce((sum, m) => sum + m.contributionMargin, 0);

  // Break-even: first month where cumulativeProfit >= 0
  let breakEvenMonth: number | null = null;
  for (const m of months) {
    if (m.cumulativeProfit >= 0) {
      breakEvenMonth = m.month;
      break;
    }
  }

  // LTV = total revenue per customer over the horizon
  const projectedLtv = totalNewCustomers > 0 ? totalRevenue / totalNewCustomers : 0;

  return {
    projectedRevenue: totalRevenue,
    projectedOrders: totalOrders,
    projectedCustomers: totalNewCustomers,
    projectedRoas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    projectedMer: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    projectedLtv,
    projectedContributionMargin: totalCM,
    breakEvenMonth,
    monthlyBreakdown: months,
  };
}

// ── Demo Scenarios ────────────────────────────────────────────

export interface DemoScenario {
  name: string;
  description: string;
  isBaseline: boolean;
  input: GrowthModelInput;
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    name: 'Current Baseline',
    description: 'Based on current business metrics — $45K monthly budget with existing CAC and conversion rates.',
    isBaseline: true,
    input: {
      monthlyBudget: 45000,
      targetCac: 32,
      expectedCvr: 0.028,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.20,
      avgOrdersPerCustomer: 1.3,
      horizonMonths: 6,
    },
  },
  {
    name: 'Scale Meta 2x',
    description: 'Double Meta Ads budget to $90K/mo — expect slightly higher CAC but similar CVR.',
    isBaseline: false,
    input: {
      monthlyBudget: 90000,
      targetCac: 35,
      expectedCvr: 0.025,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.18,
      avgOrdersPerCustomer: 1.2,
      horizonMonths: 6,
    },
  },
  {
    name: 'Optimize CAC',
    description: 'Focus on CAC efficiency — maintain budget, improve targeting and creative to lower CAC to $26.',
    isBaseline: false,
    input: {
      monthlyBudget: 45000,
      targetCac: 26,
      expectedCvr: 0.035,
      avgOrderValue: 85,
      cogsPercent: 0.45,
      returnRate: 0.25,
      avgOrdersPerCustomer: 1.4,
      horizonMonths: 6,
    },
  },
];
