// ──────────────────────────────────────────────────────────────
// Growth OS — Circuit Breaker for Autopilot
// Evaluates whether recent auto-actions degraded performance.
// If too many actions had negative outcomes, trips the breaker
// and downgrades the org from "auto" to "suggest" mode.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';

export interface CircuitBreakerResult {
  checked: number;
  degraded: number;
  threshold: number;
  tripped: boolean;
}

/**
 * Evaluate whether the circuit breaker should trip.
 * Looks at recent auto-executed budget/reactivate actions and checks
 * if the ad's ROAS declined after the action.
 */
export async function evaluateCircuitBreaker(
  organizationId: string,
): Promise<CircuitBreakerResult> {
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
  });

  if (!config || !config.circuitBreakerEnabled) {
    return { checked: 0, degraded: 0, threshold: 0, tripped: false };
  }

  // Already tripped — no need to re-evaluate
  if (config.circuitBreakerTrippedAt) {
    return { checked: 0, degraded: 0, threshold: config.circuitBreakerThreshold, tripped: true };
  }

  const windowMs = config.circuitBreakerWindowH * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);

  // Fetch recent auto-executed actions that could impact performance
  const recentActions = await prisma.autopilotActionLog.findMany({
    where: {
      organizationId,
      triggeredBy: 'auto',
      success: true,
      actionType: { in: ['INCREASE_BUDGET', 'DECREASE_BUDGET', 'REACTIVATE_AD'] },
      createdAt: { gte: since },
      undoneAt: null, // exclude undone actions
    },
    select: {
      id: true,
      targetId: true,
      actionType: true,
      createdAt: true,
    },
  });

  if (recentActions.length === 0) {
    return { checked: 0, degraded: 0, threshold: config.circuitBreakerThreshold, tripped: false };
  }

  let degradedCount = 0;

  for (const action of recentActions) {
    // Look at the ad's ROAS before and after the action
    const ad = await prisma.metaAd.findFirst({
      where: { adId: action.targetId, organizationId },
      select: { id: true, roas7d: true, roas14d: true },
    });

    if (!ad) continue;

    // If current ROAS (7d) is significantly worse than 14d (pre-action baseline)
    const roas7d = ad.roas7d ? Number(ad.roas7d) : null;
    const roas14d = ad.roas14d ? Number(ad.roas14d) : null;

    if (roas7d !== null && roas14d !== null && roas14d > 0) {
      const change = (roas7d - roas14d) / roas14d;
      // If ROAS declined by more than 20%, count as degraded
      if (change < -0.20) {
        degradedCount++;
      }
    }
  }

  const tripped = degradedCount >= config.circuitBreakerThreshold;

  if (tripped) {
    // Trip the breaker: set timestamp and downgrade to suggest mode
    await prisma.autopilotConfig.update({
      where: { organizationId },
      data: {
        circuitBreakerTrippedAt: new Date(),
        mode: 'suggest', // downgrade from auto to suggest
      },
    });
  }

  return {
    checked: recentActions.length,
    degraded: degradedCount,
    threshold: config.circuitBreakerThreshold,
    tripped,
  };
}
