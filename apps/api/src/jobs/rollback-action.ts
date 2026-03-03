// ──────────────────────────────────────────────────────────────
// Growth OS — Rollback Autopilot Action
// Takes an action log ID and performs the inverse operation
// via the Meta API, creating an audit trail of the rollback.
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt } from '@growth-os/database';
import { pauseAd, reactivateAd, updateAdSetBudget } from '../lib/meta-executor.js';

const ROLLBACK_WINDOW_DAYS = 7;

export interface RollbackResult {
  success: boolean;
  error?: string;
  rollbackActionLogId?: string;
}

/**
 * Rollback a previously executed autopilot action.
 * Validates the action, executes the inverse Meta API call,
 * and creates a new action log entry for the rollback.
 */
export async function rollbackAction(actionLogId: string): Promise<RollbackResult> {
  // 1. Load the action log
  const actionLog = await prisma.autopilotActionLog.findUnique({
    where: { id: actionLogId },
  });

  if (!actionLog) {
    return { success: false, error: 'Action log not found' };
  }

  // 2. Validate
  if (!actionLog.success) {
    return { success: false, error: 'Cannot rollback a failed action' };
  }

  if (actionLog.rollbackOfId) {
    return { success: false, error: 'Cannot rollback a rollback action' };
  }

  // Check if already rolled back
  const existingRollback = await prisma.autopilotActionLog.findFirst({
    where: { rollbackOfId: actionLogId },
  });
  if (existingRollback) {
    return { success: false, error: 'This action has already been rolled back' };
  }

  // Must be less than 7 days old
  const ageMs = Date.now() - actionLog.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > ROLLBACK_WINDOW_DAYS) {
    return { success: false, error: `Cannot rollback actions older than ${ROLLBACK_WINDOW_DAYS} days` };
  }

  // 3. Get Meta credentials
  const credential = await prisma.connectorCredential.findFirst({
    where: { connectorType: 'meta_ads', organizationId: actionLog.organizationId },
  });

  if (!credential) {
    return { success: false, error: 'No Meta Ads connector found for this organization' };
  }

  let creds: Record<string, string>;
  try {
    creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
  } catch {
    return { success: false, error: 'Failed to decrypt Meta Ads credentials' };
  }

  const accessToken = creds.accessToken ?? '';
  if (!accessToken) {
    return { success: false, error: 'No access token in Meta Ads credentials' };
  }

  // 4. Execute the inverse operation
  let inverseActionType: string;

  switch (actionLog.actionType) {
    case 'PAUSE_AD': {
      inverseActionType = 'REACTIVATE_AD';
      const result = await reactivateAd(accessToken, actionLog.targetId);
      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to reactivate ad' };
      }
      break;
    }

    case 'REACTIVATE_AD': {
      inverseActionType = 'PAUSE_AD';
      const result = await pauseAd(accessToken, actionLog.targetId);
      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to pause ad' };
      }
      break;
    }

    case 'INCREASE_BUDGET':
    case 'DECREASE_BUDGET': {
      // Restore original budget from beforeValue
      const beforeValue = actionLog.beforeValue as { dailyBudget?: string } | null;
      const originalBudgetStr = beforeValue?.dailyBudget;
      if (!originalBudgetStr) {
        return { success: false, error: 'No original budget found in beforeValue — cannot rollback' };
      }

      const originalBudgetDollars = parseFloat(originalBudgetStr);
      if (isNaN(originalBudgetDollars) || originalBudgetDollars <= 0) {
        return { success: false, error: 'Invalid original budget in beforeValue' };
      }

      // Look up the MetaAd to get the adSetId, then get the adSet's external adSetId
      const metaAd = await prisma.metaAd.findFirst({
        where: { adId: actionLog.targetId, organizationId: actionLog.organizationId },
        include: {
          adSet: { select: { adSetId: true } },
        },
      });

      if (!metaAd) {
        return { success: false, error: 'MetaAd not found for target — cannot determine ad set' };
      }

      const budgetCents = Math.round(originalBudgetDollars * 100);
      const result = await updateAdSetBudget(accessToken, metaAd.adSet.adSetId, budgetCents);
      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to restore budget' };
      }

      // Inverse action type: if we increased, the rollback is a decrease and vice versa
      inverseActionType = actionLog.actionType === 'INCREASE_BUDGET' ? 'DECREASE_BUDGET' : 'INCREASE_BUDGET';
      break;
    }

    default:
      return { success: false, error: `Cannot rollback action type: ${actionLog.actionType}` };
  }

  // 5. Query current ad state for beforeValue on the rollback log
  const currentAd = await prisma.metaAd.findFirst({
    where: { adId: actionLog.targetId, organizationId: actionLog.organizationId },
    select: {
      status: true,
      spend7d: true,
      roas7d: true,
      ctr7d: true,
      conversions7d: true,
      adSet: { select: { dailyBudget: true } },
    },
  });

  const rollbackBeforeValue = currentAd
    ? {
        status: currentAd.status,
        spend7d: currentAd.spend7d?.toString(),
        roas7d: currentAd.roas7d?.toString(),
        ctr7d: currentAd.ctr7d?.toString(),
        conversions7d: currentAd.conversions7d,
        dailyBudget: currentAd.adSet?.dailyBudget?.toString(),
      }
    : null;

  // 6. Create rollback action log entry
  const rollbackLog = await prisma.autopilotActionLog.create({
    data: {
      organizationId: actionLog.organizationId,
      actionType: inverseActionType,
      triggeredBy: 'user',
      targetEntity: actionLog.targetEntity,
      targetId: actionLog.targetId,
      targetName: actionLog.targetName,
      beforeValue: rollbackBeforeValue as never,
      rollbackOfId: actionLogId,
      success: true,
    },
  });

  return { success: true, rollbackActionLogId: rollbackLog.id };
}
