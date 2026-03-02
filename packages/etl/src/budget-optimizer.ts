// ──────────────────────────────────────────────────────────────
// Growth OS — Portfolio Budget Optimizer
// Reallocates ad budget from low-ROAS to high-ROAS ad sets
// Pure functions — no side effects, no DB access
// ──────────────────────────────────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────

export interface AdSetMetrics {
  adSetId: string;
  adSetName: string;
  currentDailyBudget: number;
  spend7d: number;
  revenue7d: number;
  roas7d: number | null;
  impressions7d: number;
  clicks7d: number;
  conversions7d: number;
  frequency7d: number | null;
}

export interface BudgetAllocation {
  adSetId: string;
  adSetName: string;
  currentDailyBudget: number;
  suggestedDailyBudget: number;
  changePct: number;
  reason: string;
}

export interface BudgetOptimizerConfig {
  totalBudgetCap?: number;
  targetRoas?: number;
  maxChangePct: number;
  minDailyBudget: number;
}

export interface PortfolioOptimization {
  totalCurrentDailyBudget: number;
  totalSuggestedDailyBudget: number;
  currentBlendedRoas: number | null;
  projectedBlendedRoas: number | null;
  allocations: BudgetAllocation[];
  summary: string;
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_TARGET_ROAS = 2.0;
const FREQUENCY_CEILING = 10;
const UNDERPERFORMER_ROAS_THRESHOLD = 1.0;
const FREQUENCY_HEADROOM_THRESHOLD = 3;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute marginal efficiency for an ad set.
 * Formula: ROAS * (1 - frequency / 10) as a proxy for efficiency with headroom.
 * Returns 0 for null ROAS or null/high frequency.
 */
function computeMarginalEfficiency(roas: number | null, frequency: number | null): number {
  if (roas === null || roas <= 0) return 0;
  const freq = frequency ?? 0;
  const headroom = Math.max(0, 1 - freq / FREQUENCY_CEILING);
  return roas * headroom;
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Optimize budget allocation across a portfolio of ad sets.
 *
 * Algorithm:
 * 1. Calculate marginal ROAS for each ad set: ROAS * (1 - frequency/10)
 * 2. Sort by marginal efficiency descending
 * 3. Decrease budget for underperformers (ROAS < 1.0), increase for strong performers
 * 4. Enforce totalBudgetCap if set
 * 5. Calculate projected blended ROAS weighted by suggested budgets
 * 6. Generate plain English summary
 *
 * @param adSets - Array of ad set metrics (readonly)
 * @param config - Optimizer configuration
 * @returns Portfolio optimization result with allocations and summary
 */
export function optimizeBudgetAllocation(
  adSets: readonly AdSetMetrics[],
  config: BudgetOptimizerConfig,
): PortfolioOptimization {
  const targetRoas = config.targetRoas ?? DEFAULT_TARGET_ROAS;
  const maxChangeFrac = config.maxChangePct / 100;

  // Edge case: no ad sets
  if (adSets.length === 0) {
    return {
      totalCurrentDailyBudget: 0,
      totalSuggestedDailyBudget: 0,
      currentBlendedRoas: null,
      projectedBlendedRoas: null,
      allocations: [],
      summary: 'No ad sets provided for optimization.',
    };
  }

  // Step 1: Compute marginal efficiency and sort descending
  const ranked = adSets.map((as) => ({
    ...as,
    marginalEfficiency: computeMarginalEfficiency(as.roas7d, as.frequency7d),
  }));
  ranked.sort((a, b) => b.marginalEfficiency - a.marginalEfficiency);

  // Step 2: Compute current blended ROAS
  const totalSpend7d = adSets.reduce((sum, as) => sum + as.spend7d, 0);
  const totalRevenue7d = adSets.reduce((sum, as) => sum + as.revenue7d, 0);
  const currentBlendedRoas = totalSpend7d > 0 ? totalRevenue7d / totalSpend7d : null;

  // Step 3: Generate allocations
  const allocations: BudgetAllocation[] = ranked.map((as) => {
    const roas = as.roas7d;
    const frequency = as.frequency7d ?? 0;
    let suggestedBudget = as.currentDailyBudget;
    let reason = '';

    if (roas === null || as.spend7d === 0) {
      // No data — hold budget steady
      reason = 'Insufficient data to optimize; holding budget steady.';
    } else if (roas < UNDERPERFORMER_ROAS_THRESHOLD) {
      // Underperformer: decrease budget
      const decreaseFrac = Math.min(maxChangeFrac, 1 - config.minDailyBudget / Math.max(as.currentDailyBudget, 0.01));
      const actualDecrease = Math.max(0, decreaseFrac);
      suggestedBudget = Math.max(config.minDailyBudget, as.currentDailyBudget * (1 - actualDecrease));
      reason = `ROAS ${roas.toFixed(2)}x is below breakeven (1.0x). Reducing budget to limit losses.`;
    } else if (roas >= targetRoas && frequency < FREQUENCY_HEADROOM_THRESHOLD) {
      // Strong performer with headroom: increase budget
      suggestedBudget = as.currentDailyBudget * (1 + maxChangeFrac);
      reason = `ROAS ${roas.toFixed(2)}x exceeds target (${targetRoas.toFixed(1)}x) with low frequency (${frequency.toFixed(1)}). Scaling up.`;
    } else if (roas >= targetRoas && frequency >= FREQUENCY_HEADROOM_THRESHOLD) {
      // Strong ROAS but high frequency: hold
      reason = `ROAS ${roas.toFixed(2)}x is strong but frequency ${frequency.toFixed(1)} limits scaling headroom. Holding steady.`;
    } else {
      // Mid-range ROAS (1.0 to target): hold or minor adjust
      reason = `ROAS ${roas.toFixed(2)}x is between breakeven and target (${targetRoas.toFixed(1)}x). Holding budget steady.`;
    }

    // Enforce minimum budget
    suggestedBudget = Math.max(config.minDailyBudget, suggestedBudget);

    // Compute change percentage
    const changePct = as.currentDailyBudget > 0
      ? ((suggestedBudget - as.currentDailyBudget) / as.currentDailyBudget) * 100
      : 0;

    return {
      adSetId: as.adSetId,
      adSetName: as.adSetName,
      currentDailyBudget: as.currentDailyBudget,
      suggestedDailyBudget: Math.round(suggestedBudget * 100) / 100,
      changePct: Math.round(changePct * 10) / 10,
      reason,
    };
  });

  // Step 4: Enforce totalBudgetCap if set
  if (config.totalBudgetCap !== undefined && config.totalBudgetCap > 0) {
    const totalSuggested = allocations.reduce((sum, a) => sum + a.suggestedDailyBudget, 0);
    if (totalSuggested > config.totalBudgetCap) {
      const scaleFactor = config.totalBudgetCap / totalSuggested;
      for (const alloc of allocations) {
        alloc.suggestedDailyBudget = Math.max(
          config.minDailyBudget,
          Math.round(alloc.suggestedDailyBudget * scaleFactor * 100) / 100,
        );
        alloc.changePct = alloc.currentDailyBudget > 0
          ? Math.round(((alloc.suggestedDailyBudget - alloc.currentDailyBudget) / alloc.currentDailyBudget) * 1000) / 10
          : 0;
      }
    }
  }

  // Step 5: Compute totals and projected blended ROAS
  const totalCurrentDailyBudget = adSets.reduce((sum, as) => sum + as.currentDailyBudget, 0);
  const totalSuggestedDailyBudget = allocations.reduce((sum, a) => sum + a.suggestedDailyBudget, 0);

  // Projected blended ROAS: weighted average of ad set ROAS by suggested budget
  let projectedWeightedRevenue = 0;
  let projectedWeightedSpend = 0;
  for (let i = 0; i < ranked.length; i++) {
    const as = ranked[i]!;
    const alloc = allocations[i]!;
    if (as.roas7d !== null && as.currentDailyBudget > 0) {
      // Estimate revenue at new budget level using current ROAS
      const budgetRatio = alloc.suggestedDailyBudget / as.currentDailyBudget;
      projectedWeightedRevenue += (as.revenue7d / 7) * budgetRatio;
      projectedWeightedSpend += alloc.suggestedDailyBudget;
    }
  }
  const projectedBlendedRoas = projectedWeightedSpend > 0
    ? projectedWeightedRevenue / projectedWeightedSpend
    : null;

  // Step 6: Generate summary
  const increases = allocations.filter((a) => a.changePct > 0);
  const decreases = allocations.filter((a) => a.changePct < 0);
  const unchanged = allocations.filter((a) => a.changePct === 0);

  const parts: string[] = [];
  parts.push(`Analyzed ${adSets.length} ad set${adSets.length === 1 ? '' : 's'}.`);

  if (increases.length > 0) {
    parts.push(`Increasing budget for ${increases.length} high-performing ad set${increases.length === 1 ? '' : 's'}.`);
  }
  if (decreases.length > 0) {
    parts.push(`Decreasing budget for ${decreases.length} underperforming ad set${decreases.length === 1 ? '' : 's'}.`);
  }
  if (unchanged.length > 0) {
    parts.push(`Holding ${unchanged.length} ad set${unchanged.length === 1 ? '' : 's'} steady.`);
  }

  const budgetDelta = totalSuggestedDailyBudget - totalCurrentDailyBudget;
  if (Math.abs(budgetDelta) > 0.01) {
    const direction = budgetDelta > 0 ? 'increase' : 'decrease';
    parts.push(`Net daily budget ${direction}: $${Math.abs(budgetDelta).toFixed(2)}.`);
  }

  if (currentBlendedRoas !== null && projectedBlendedRoas !== null) {
    parts.push(
      `Current blended ROAS: ${currentBlendedRoas.toFixed(2)}x. Projected blended ROAS: ${projectedBlendedRoas.toFixed(2)}x.`,
    );
  }

  return {
    totalCurrentDailyBudget: Math.round(totalCurrentDailyBudget * 100) / 100,
    totalSuggestedDailyBudget: Math.round(totalSuggestedDailyBudget * 100) / 100,
    currentBlendedRoas: currentBlendedRoas !== null ? Math.round(currentBlendedRoas * 100) / 100 : null,
    projectedBlendedRoas: projectedBlendedRoas !== null ? Math.round(projectedBlendedRoas * 100) / 100 : null,
    allocations,
    summary: parts.join(' '),
  };
}
