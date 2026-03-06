// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Budget Allocator
// Distributes available budget across campaign strategies.
// ──────────────────────────────────────────────────────────────

interface CampaignForBudget {
  readonly type: string;
  readonly estimatedRoas: number;
  readonly actualRoas: number | null;
  readonly actualSpend: number;
  readonly productCount: number;
}

export interface BudgetAllocationInput {
  readonly totalDailyBudget: number;
  readonly campaigns: readonly CampaignForBudget[];
}

export interface CampaignBudgetAllocation {
  readonly campaignIndex: number;
  readonly allocatedBudget: number;
  readonly reason: string;
}

// Base allocation percentages by campaign type
const BASE_ALLOCATION: Record<string, number> = {
  HERO_PRODUCT: 0.40,
  CATEGORY: 0.25,
  SEASONAL: 0.20,
  NEW_ARRIVAL: 0.075,
  CROSS_SELL: 0.075,
};

const DEFAULT_ALLOCATION = 0.10;
const MIN_DAILY_BUDGET = 5;
const ROAS_BOOST_THRESHOLD = 2.0;
const ROAS_BOOST_FACTOR = 1.20;
const ROAS_PENALTY_THRESHOLD = 1.0;
const ROAS_PENALTY_MIN_SPEND = 100;
const ROAS_PENALTY_FACTOR = 0.70;
const ROAS_REDISTRIBUTE_THRESHOLD = 1.5;

/**
 * Allocates the total daily budget across campaigns based on their type
 * and observed performance (actual ROAS). High performers get a boost,
 * underperformers are penalized, and excess is redistributed.
 */
export function allocateBudget(input: BudgetAllocationInput): CampaignBudgetAllocation[] {
  const { totalDailyBudget, campaigns } = input;

  if (campaigns.length === 0 || totalDailyBudget <= 0) {
    return [];
  }

  // Step 1: Compute base allocations by type
  interface AllocationEntry { index: number; budget: number; reason: string }
  const allocations: AllocationEntry[] = [];

  // Count campaigns per type for splitting within type
  const typeCounts = new Map<string, number>();
  for (const c of campaigns) {
    typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  }

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i]!;
    const typeAllocation = BASE_ALLOCATION[campaign.type] ?? DEFAULT_ALLOCATION;
    const countForType = typeCounts.get(campaign.type) ?? 1;
    const baseBudget = (totalDailyBudget * typeAllocation) / countForType;

    allocations.push({
      index: i,
      budget: baseBudget,
      reason: `Base allocation: ${(typeAllocation * 100).toFixed(0)}% for ${campaign.type}`,
    });
  }

  // Step 2: Apply performance-based adjustments
  for (const allocation of allocations) {
    const campaign = campaigns[allocation.index]!;

    if (campaign.actualRoas !== null) {
      if (campaign.actualRoas > ROAS_BOOST_THRESHOLD) {
        const oldBudget = allocation.budget;
        allocation.budget *= ROAS_BOOST_FACTOR;
        allocation.reason = `Boosted +20% (ROAS ${campaign.actualRoas.toFixed(2)} > ${ROAS_BOOST_THRESHOLD})`;
        // Keep track this was boosted
        allocation.budget = Math.max(oldBudget, allocation.budget);
      } else if (
        campaign.actualRoas < ROAS_PENALTY_THRESHOLD &&
        campaign.actualSpend > ROAS_PENALTY_MIN_SPEND
      ) {
        allocation.budget *= ROAS_PENALTY_FACTOR;
        allocation.reason = `Reduced -30% (ROAS ${campaign.actualRoas.toFixed(2)} < ${ROAS_PENALTY_THRESHOLD} with $${campaign.actualSpend.toFixed(0)} spent)`;
      }
    }
  }

  // Step 3: Enforce minimum budget
  for (const allocation of allocations) {
    if (allocation.budget < MIN_DAILY_BUDGET) {
      allocation.budget = MIN_DAILY_BUDGET;
      if (!allocation.reason.includes('minimum')) {
        allocation.reason += ` (enforced $${MIN_DAILY_BUDGET} minimum)`;
      }
    }
  }

  // Step 4: Redistribute excess to high performers
  const totalAllocated = allocations.reduce((sum, a) => sum + a.budget, 0);

  if (totalAllocated < totalDailyBudget) {
    // There's excess budget to distribute
    const excess = totalDailyBudget - totalAllocated;
    const highPerformers = allocations.filter((a) => {
      const campaign = campaigns[a.index]!;
      return campaign.actualRoas !== null && campaign.actualRoas > ROAS_REDISTRIBUTE_THRESHOLD;
    });

    if (highPerformers.length > 0) {
      const extraPerCampaign = excess / highPerformers.length;
      for (const hp of highPerformers) {
        hp.budget += extraPerCampaign;
        hp.reason += ` + $${extraPerCampaign.toFixed(2)} redistributed`;
      }
    } else {
      // Distribute proportionally to all campaigns
      const totalCurrent = allocations.reduce((sum, a) => sum + a.budget, 0);
      for (const allocation of allocations) {
        const share = totalCurrent > 0 ? allocation.budget / totalCurrent : 1 / allocations.length;
        allocation.budget += excess * share;
      }
    }
  } else if (totalAllocated > totalDailyBudget) {
    // Scale down proportionally to fit within budget
    const scaleFactor = totalDailyBudget / totalAllocated;
    for (const allocation of allocations) {
      allocation.budget *= scaleFactor;
      // Re-enforce minimum after scaling
      if (allocation.budget < MIN_DAILY_BUDGET) {
        allocation.budget = MIN_DAILY_BUDGET;
      }
    }

    // If we're still over after enforcing minimums, do a final scale on non-minimum items
    const afterMinTotal = allocations.reduce((sum, a) => sum + a.budget, 0);
    if (afterMinTotal > totalDailyBudget) {
      const minCampaigns = allocations.filter((a) => a.budget <= MIN_DAILY_BUDGET);
      const nonMinCampaigns = allocations.filter((a) => a.budget > MIN_DAILY_BUDGET);
      const minTotal = minCampaigns.reduce((sum, a) => sum + a.budget, 0);
      const remaining = totalDailyBudget - minTotal;

      if (remaining > 0 && nonMinCampaigns.length > 0) {
        const nonMinTotal = nonMinCampaigns.reduce((sum, a) => sum + a.budget, 0);
        for (const allocation of nonMinCampaigns) {
          allocation.budget = Math.max(MIN_DAILY_BUDGET, (allocation.budget / nonMinTotal) * remaining);
        }
      }
    }
  }

  // Round budgets to 2 decimal places
  return allocations.map((a) => ({
    campaignIndex: a.index,
    allocatedBudget: Math.round(a.budget * 100) / 100,
    reason: a.reason,
  }));
}
