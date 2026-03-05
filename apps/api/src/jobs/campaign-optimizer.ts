// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign-Level Budget Optimizer
// Moves budget from low-ROAS to high-ROAS campaigns.
// Pure function: no DB access, no side effects.
// ──────────────────────────────────────────────────────────────

export interface CampaignMetricsInput {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly totalSpend7d: number;
  readonly totalRevenue7d: number;
  readonly roas7d: number | null;
  readonly adSetCount: number;
  /** Sum of all ad set daily budgets (or campaign budget if CBO). */
  readonly currentDailyBudget: number;
}

export interface CampaignAllocation {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly currentDailyBudget: number;
  readonly suggestedDailyBudget: number;
  readonly changePct: number;
  readonly reason: string;
}

export interface CampaignOptimizerConfig {
  readonly targetRoas: number;
  readonly maxChangePct?: number;
}

/**
 * Analyse campaign-level ROAS and suggest budget reallocations.
 *
 * Returns allocations only for campaigns where a significant (>=20%)
 * budget change is warranted based on 7-day ROAS performance.
 */
export function optimizeCampaignAllocation(
  campaigns: readonly CampaignMetricsInput[],
  config: CampaignOptimizerConfig,
): CampaignAllocation[] {
  if (campaigns.length < 2) return [];

  const maxChange = config.maxChangePct ?? 30;
  const allocations: CampaignAllocation[] = [];

  for (const c of campaigns) {
    if (c.currentDailyBudget <= 0) continue;

    const roas = c.roas7d ?? 0;
    let changePct = 0;
    let reason = '';

    if (roas < 1.0 && c.totalSpend7d > 100) {
      // Losing money — decrease significantly
      changePct = -Math.min(maxChange, 50);
      reason = `ROAS ${roas.toFixed(2)}x is below breakeven — reduce to limit losses`;
    } else if (roas >= config.targetRoas && roas > 2.0) {
      // High performer — increase
      changePct = Math.min(maxChange, 30);
      reason = `ROAS ${roas.toFixed(2)}x exceeds target — scale to capture more revenue`;
    } else if (roas >= 1.0 && roas < config.targetRoas) {
      // Below target but not losing — slight decrease
      changePct = -Math.min(maxChange * 0.3, 10);
      reason = `ROAS ${roas.toFixed(2)}x is below target ${config.targetRoas.toFixed(1)}x — optimize before scaling`;
    }

    if (Math.abs(changePct) < 20) continue; // Only significant changes

    allocations.push({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      currentDailyBudget: c.currentDailyBudget,
      suggestedDailyBudget: Math.round(c.currentDailyBudget * (1 + changePct / 100) * 100) / 100,
      changePct,
      reason,
    });
  }

  return allocations;
}
