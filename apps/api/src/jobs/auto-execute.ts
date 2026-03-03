// ──────────────────────────────────────────────────────────────
// Growth OS — Auto-Execute Pending Diagnoses
// Implements automatic execution for autopilot "auto" mode.
// Called by run-diagnosis.ts after diagnosis evaluation when
// the org's AutopilotConfig mode is 'auto'.
//
// Safety checks:
//   0a. Execution window (business hours only)
//   0b. Circuit breaker not tripped
//   0c. Daily action limit not exceeded
//   1.  Only auto-executable action types (PAUSE_AD, INCREASE_BUDGET,
//       DECREASE_BUDGET, REACTIVATE_AD)
//   2.  Max 3 auto-actions per 24h per campaign
//   3.  DISMISSED diagnosis blocks auto-action on that ad for 7 days
//   4.  Budget increases respect maxBudgetIncreasePct
//   5.  Minimum spend threshold (minSpendBeforeAction)
//   6.  Daily budget change cap (org-level)
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { executeAction } from './execute-action.js';

/** Action types that are safe for automatic execution. */
const AUTO_EXECUTABLE_ACTIONS = new Set([
  'PAUSE_AD',
  'INCREASE_BUDGET',
  'DECREASE_BUDGET',
  'REACTIVATE_AD',
]);

/** Maximum number of auto-actions per campaign in a 24-hour window. */
const MAX_AUTO_ACTIONS_PER_CAMPAIGN_24H = 3;

/** Duration (in days) that a DISMISSED diagnosis blocks auto-action on the same ad. */
const DISMISSED_BLOCK_DAYS = 7;

/** Result of an auto-execution run. */
export interface AutoExecuteResult {
  actionsQueued: number;
  actionsSkipped: number;
  actionsRemaining: number;
  reasons: string[];
}

/** Minimal shape of the autopilot config fields needed for auto-execute. */
export interface AutopilotConfigLike {
  readonly mode: string;
  readonly maxBudgetIncreasePct: number;
  readonly minSpendBeforeAction: number;
  readonly executionWindowStart: number;
  readonly executionWindowEnd: number;
  readonly executionTimezone: string;
  readonly maxActionsPerDay: number;
  readonly dailyBudgetChangeCap: number | null;
  readonly circuitBreakerTrippedAt: Date | null;
}

/**
 * Check if the current time is within the configured execution window.
 */
function isWithinExecutionWindow(config: AutopilotConfigLike): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: config.executionTimezone,
    });
    const currentHour = parseInt(formatter.format(new Date()), 10);

    if (config.executionWindowStart <= config.executionWindowEnd) {
      // Normal window: e.g. 9–17
      return currentHour >= config.executionWindowStart && currentHour < config.executionWindowEnd;
    }
    // Overnight window: e.g. 22–6
    return currentHour >= config.executionWindowStart || currentHour < config.executionWindowEnd;
  } catch {
    // If timezone is invalid, default to allowing execution
    return true;
  }
}

/**
 * Automatically execute all eligible PENDING diagnoses for an organization.
 *
 * This function applies multiple safety guardrails before executing each
 * diagnosis, and records every action via the executeAction audit trail.
 *
 * @param organizationId - The org to process
 * @param config - Autopilot config with safety thresholds
 * @returns Summary of queued and skipped actions with reasons
 */
export async function autoExecutePending(
  organizationId: string,
  config: AutopilotConfigLike,
): Promise<AutoExecuteResult> {
  const result: AutoExecuteResult = {
    actionsQueued: 0,
    actionsSkipped: 0,
    actionsRemaining: 0,
    reasons: [],
  };

  // Safety 0a: Execution window (business hours only)
  if (!isWithinExecutionWindow(config)) {
    result.reasons.push(
      `Outside execution window (${config.executionWindowStart}:00–${config.executionWindowEnd}:00 ${config.executionTimezone})`,
    );
    return result;
  }

  // Safety 0b: Circuit breaker check
  if (config.circuitBreakerTrippedAt) {
    result.reasons.push(
      `Circuit breaker tripped at ${config.circuitBreakerTrippedAt.toISOString()} — auto-execution suspended`,
    );
    return result;
  }

  // Safety 0c: Daily action limit — count today's auto-actions
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayAutoActions = await prisma.autopilotActionLog.count({
    where: {
      organizationId,
      triggeredBy: 'auto',
      createdAt: { gte: todayStart },
    },
  });

  if (todayAutoActions >= config.maxActionsPerDay) {
    result.reasons.push(
      `Daily action limit reached (${todayAutoActions}/${config.maxActionsPerDay})`,
    );
    return result;
  }

  let remainingDailyActions = config.maxActionsPerDay - todayAutoActions;

  // Safety 6 pre-calc: Daily budget change cap — sum today's budget changes
  let dailyBudgetChangeUsed = 0;
  if (config.dailyBudgetChangeCap !== null) {
    const todayBudgetActions = await prisma.autopilotActionLog.findMany({
      where: {
        organizationId,
        triggeredBy: 'auto',
        success: true,
        actionType: { in: ['INCREASE_BUDGET', 'DECREASE_BUDGET'] },
        createdAt: { gte: todayStart },
      },
      select: { beforeValue: true, afterValue: true },
    });

    for (const a of todayBudgetActions) {
      const before = (a.beforeValue as Record<string, number> | null)?.dailyBudget ?? 0;
      const after = (a.afterValue as Record<string, number> | null)?.dailyBudget ?? 0;
      dailyBudgetChangeUsed += Math.abs(after - before);
    }
  }

  // Fetch all PENDING diagnoses for this org, including ad info for safety checks
  const pendingDiagnoses = await prisma.diagnosis.findMany({
    where: {
      organizationId,
      status: 'PENDING',
    },
    include: {
      ad: {
        select: {
          id: true,
          adId: true,
          name: true,
          campaignId: true,
          spend7d: true,
          adSet: { select: { dailyBudget: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' }, // process oldest first
  });

  if (pendingDiagnoses.length === 0) {
    return result;
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - DISMISSED_BLOCK_DAYS * 24 * 60 * 60 * 1000);

  // Pre-fetch recent action logs for campaign-level rate limiting.
  // Group by campaign via the ads in this org.
  const recentActions = await prisma.autopilotActionLog.findMany({
    where: {
      organizationId,
      triggeredBy: 'auto',
      createdAt: { gte: twentyFourHoursAgo },
    },
    select: {
      targetId: true,
    },
  });

  // Build a map: campaignId → count of auto-actions in last 24h
  // We need to resolve targetId (Meta external adId) → campaignId.
  // Fetch all ads for this org to build the lookup.
  const orgAds = await prisma.metaAd.findMany({
    where: { organizationId },
    select: { adId: true, campaignId: true },
  });
  const adIdToCampaign = new Map<string, string>();
  for (const ad of orgAds) {
    adIdToCampaign.set(ad.adId, ad.campaignId);
  }

  const campaignActionCount = new Map<string, number>();
  for (const action of recentActions) {
    const campId = adIdToCampaign.get(action.targetId);
    if (campId) {
      campaignActionCount.set(campId, (campaignActionCount.get(campId) ?? 0) + 1);
    }
  }

  // Pre-fetch dismissed diagnoses in last 7 days to block auto-action per ad
  const dismissedDiagnoses = await prisma.diagnosis.findMany({
    where: {
      organizationId,
      status: 'DISMISSED',
      updatedAt: { gte: sevenDaysAgo },
    },
    select: { adId: true },
  });
  const dismissedAdIds = new Set(dismissedDiagnoses.map((d) => d.adId));

  // Process each pending diagnosis
  for (const diag of pendingDiagnoses) {
    const adName = diag.ad.name ?? diag.ad.adId;

    // Safety 1: Only auto-executable action types
    if (!AUTO_EXECUTABLE_ACTIONS.has(diag.actionType)) {
      result.actionsSkipped++;
      result.reasons.push(
        `Skipped "${adName}" (${diag.ruleId}): action ${diag.actionType} requires human judgment`,
      );
      continue;
    }

    // Safety 2: Max 3 auto-actions per campaign per 24h
    const campaignId = diag.ad.campaignId;
    const campCount = campaignActionCount.get(campaignId) ?? 0;
    if (campCount >= MAX_AUTO_ACTIONS_PER_CAMPAIGN_24H) {
      result.actionsSkipped++;
      result.reasons.push(
        `Skipped "${adName}" (${diag.ruleId}): campaign already has ${campCount} auto-actions in last 24h (limit: ${MAX_AUTO_ACTIONS_PER_CAMPAIGN_24H})`,
      );
      continue;
    }

    // Safety 3: DISMISSED diagnosis blocks auto-action on that ad for 7 days
    if (dismissedAdIds.has(diag.adId)) {
      result.actionsSkipped++;
      result.reasons.push(
        `Skipped "${adName}" (${diag.ruleId}): ad has a DISMISSED diagnosis within last ${DISMISSED_BLOCK_DAYS} days`,
      );
      continue;
    }

    // Safety 4: Budget increases must respect maxBudgetIncreasePct
    if (diag.actionType === 'INCREASE_BUDGET') {
      const suggested = diag.suggestedValue as { newBudget?: number } | null;
      const currentBudget = diag.ad.adSet?.dailyBudget
        ? Number(diag.ad.adSet.dailyBudget)
        : null;

      if (suggested?.newBudget && currentBudget && currentBudget > 0) {
        const maxAllowed = currentBudget * (1 + config.maxBudgetIncreasePct / 100);
        if (suggested.newBudget > maxAllowed) {
          result.actionsSkipped++;
          result.reasons.push(
            `Skipped "${adName}" (${diag.ruleId}): suggested budget $${suggested.newBudget} exceeds max allowed $${maxAllowed.toFixed(2)} (${config.maxBudgetIncreasePct}% increase cap)`,
          );
          continue;
        }
      }
    }

    // Safety 5: Minimum spend threshold
    const spend7d = diag.ad.spend7d ? Number(diag.ad.spend7d) : 0;
    if (spend7d < config.minSpendBeforeAction) {
      result.actionsSkipped++;
      result.reasons.push(
        `Skipped "${adName}" (${diag.ruleId}): 7d spend $${spend7d.toFixed(2)} below minimum $${config.minSpendBeforeAction}`,
      );
      continue;
    }

    // Safety 6: Daily budget change cap (org-level)
    if (
      config.dailyBudgetChangeCap !== null &&
      (diag.actionType === 'INCREASE_BUDGET' || diag.actionType === 'DECREASE_BUDGET')
    ) {
      const suggested = diag.suggestedValue as { newBudget?: number } | null;
      const currentBudget = diag.ad.adSet?.dailyBudget ? Number(diag.ad.adSet.dailyBudget) : 0;
      const proposedChange = Math.abs((suggested?.newBudget ?? 0) - currentBudget);

      if (dailyBudgetChangeUsed + proposedChange > config.dailyBudgetChangeCap) {
        result.actionsSkipped++;
        result.reasons.push(
          `Skipped "${adName}" (${diag.ruleId}): daily budget change cap reached ($${dailyBudgetChangeUsed.toFixed(2)} used of $${config.dailyBudgetChangeCap} cap)`,
        );
        continue;
      }
    }

    // Safety 0c (mid-loop): Daily action limit
    if (remainingDailyActions <= 0) {
      result.actionsRemaining++;
      result.reasons.push(
        `Skipped "${adName}" (${diag.ruleId}): daily action limit reached`,
      );
      continue;
    }

    // All safety checks passed — approve and execute
    try {
      // Mark diagnosis as APPROVED before execution
      await prisma.diagnosis.update({
        where: { id: diag.id },
        data: { status: 'APPROVED' },
      });

      // Execute the action (records audit log internally)
      const execResult = await executeAction(diag.id, 'auto');

      if (execResult.success) {
        result.actionsQueued++;
        remainingDailyActions--;
        // Increment campaign counter to enforce the per-24h limit within this run
        campaignActionCount.set(campaignId, campCount + 1);
        // Track budget change for daily cap
        if (
          config.dailyBudgetChangeCap !== null &&
          (diag.actionType === 'INCREASE_BUDGET' || diag.actionType === 'DECREASE_BUDGET')
        ) {
          const suggested = diag.suggestedValue as { newBudget?: number } | null;
          const currentBudget = diag.ad.adSet?.dailyBudget ? Number(diag.ad.adSet.dailyBudget) : 0;
          dailyBudgetChangeUsed += Math.abs((suggested?.newBudget ?? 0) - currentBudget);
        }
      } else {
        result.actionsSkipped++;
        result.reasons.push(
          `Failed "${adName}" (${diag.ruleId}): ${execResult.error ?? 'Unknown error'}`,
        );
      }
    } catch (err) {
      result.actionsSkipped++;
      result.reasons.push(
        `Error executing "${adName}" (${diag.ruleId}): ${(err as Error).message}`,
      );
    }
  }

  return result;
}
