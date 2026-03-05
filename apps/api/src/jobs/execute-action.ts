// ──────────────────────────────────────────────────────────────
// Growth OS — Execute Diagnosis Action
// Takes an approved diagnosis and executes it via the Meta API.
// Records an AutopilotActionLog entry for every execution attempt.
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt } from '@growth-os/database';
import { getCurrencyOffset } from '@growth-os/etl';
import {
  pauseAd,
  reactivateAd,
  updateAdSetBudget,
  updateCampaignBudget,
  createAdFromVariant,
} from '../lib/meta-executor.js';
import type { ExecutionResult } from '../lib/meta-executor.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export interface ExecuteActionResult {
  success: boolean;
  diagnosisId: string;
  actionType: string;
  executionResult?: ExecutionResult;
  error?: string;
}

/** Trigger source for an action execution. */
export type TriggeredBy = 'user' | 'auto' | 'schedule';

/**
 * Extract the "before" state of the ad/adset for the action log,
 * based on the action type being performed.
 */
function getBeforeValue(diagnosis: DiagnosisWithAd): Record<string, unknown> | null {
  switch (diagnosis.actionType) {
    case 'PAUSE_AD':
      return { status: diagnosis.ad.status };
    case 'REACTIVATE_AD':
      return { status: diagnosis.ad.status };
    case 'INCREASE_BUDGET':
    case 'DECREASE_BUDGET':
      return {
        dailyBudget: diagnosis.ad.adSet.dailyBudget
          ? Number(diagnosis.ad.adSet.dailyBudget)
          : null,
      };
    case 'GENERATE_COPY_VARIANTS':
      return { action: 'create_new_ad' };
    case 'REFRESH_CREATIVE':
      return { action: 'refresh_creative' };
    default:
      return null;
  }
}

/**
 * Extract the "after" state for the action log, incorporating the
 * execution result for success cases or the error for failures.
 */
function getAfterValue(
  diagnosis: DiagnosisWithAd,
  result: ExecutionResult,
): Record<string, unknown> | null {
  if (!result.success) {
    return { error: result.error ?? 'Unknown error' };
  }

  switch (diagnosis.actionType) {
    case 'PAUSE_AD':
      return { status: 'PAUSED' };
    case 'REACTIVATE_AD':
      return { status: 'ACTIVE' };
    case 'INCREASE_BUDGET':
    case 'DECREASE_BUDGET': {
      const suggested = diagnosis.suggestedValue as { newBudget?: number } | null;
      return { dailyBudget: suggested?.newBudget ?? null };
    }
    case 'GENERATE_COPY_VARIANTS': {
      const resp = result.metaResponse as { adId?: string } | undefined;
      return { newAdId: resp?.adId ?? null };
    }
    default:
      return null;
  }
}

/** Shape of the diagnosis object returned by our Prisma query with includes. */
interface DiagnosisWithAd {
  readonly id: string;
  readonly organizationId: string;
  readonly actionType: string;
  readonly status: string;
  readonly suggestedValue: unknown;
  readonly ad: {
    readonly adId: string;
    readonly name: string;
    readonly status: string;
    readonly adSet: { readonly adSetId: string; readonly dailyBudget: unknown };
    readonly campaign: { readonly campaignId: string };
    readonly account: { readonly adAccountId: string; readonly currency: string };
  };
}

/**
 * Execute the approved action for a diagnosis.
 * Fetches credentials, calls Meta API, updates diagnosis record,
 * and writes an AutopilotActionLog entry for the audit trail.
 */
export async function executeAction(
  diagnosisId: string,
  triggeredBy: TriggeredBy = 'user',
): Promise<ExecuteActionResult> {
  // Load diagnosis with ad + account context (including ad name for audit log)
  const diagnosis = await prisma.diagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      ad: {
        include: {
          adSet: { select: { id: true, adSetId: true, dailyBudget: true } },
          campaign: { select: { campaignId: true } },
          account: { select: { adAccountId: true, currency: true } },
        },
      },
    },
  });

  if (!diagnosis) {
    return { success: false, diagnosisId, actionType: 'UNKNOWN', error: 'Diagnosis not found' };
  }

  if (diagnosis.status !== 'APPROVED') {
    return {
      success: false,
      diagnosisId,
      actionType: diagnosis.actionType,
      error: `Cannot execute diagnosis with status ${diagnosis.status}`,
    };
  }

  // Get Meta access token from connector credentials
  const credential = await prisma.connectorCredential.findFirst({
    where: { connectorType: 'meta_ads', organizationId: diagnosis.organizationId },
  });

  if (!credential) {
    await markFailed(diagnosisId, 'No Meta Ads connector found for this organization');
    return {
      success: false,
      diagnosisId,
      actionType: diagnosis.actionType,
      error: 'No Meta Ads connector found',
    };
  }

  let creds: Record<string, string>;
  try {
    creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
  } catch {
    await markFailed(diagnosisId, 'Failed to decrypt Meta Ads credentials');
    return {
      success: false,
      diagnosisId,
      actionType: diagnosis.actionType,
      error: 'Failed to decrypt credentials',
    };
  }

  const accessToken = creds.accessToken ?? '';
  if (!accessToken) {
    await markFailed(diagnosisId, 'No access token in Meta Ads credentials');
    return {
      success: false,
      diagnosisId,
      actionType: diagnosis.actionType,
      error: 'No access token',
    };
  }

  const metaAdId = diagnosis.ad.adId; // external Meta ad ID
  const metaAdSetId = diagnosis.ad.adSet.adSetId; // external Meta ad set ID
  const metaCampaignId = diagnosis.ad.campaign.campaignId; // external Meta campaign ID
  const adAccountId = diagnosis.ad.account.adAccountId; // act_xxx
  const currencyOffset = getCurrencyOffset(diagnosis.ad.account.currency);

  // Execute with retries for retryable errors
  let result: ExecutionResult = { success: false, error: 'No action taken' };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    switch (diagnosis.actionType) {
      case 'PAUSE_AD':
        result = await pauseAd(accessToken, metaAdId);
        break;

      case 'REACTIVATE_AD':
        result = await reactivateAd(accessToken, metaAdId);
        break;

      case 'INCREASE_BUDGET':
      case 'DECREASE_BUDGET': {
        // Diagnosis rules use different field names for the suggested budget:
        //   Rule 3 (winner_not_scaled): suggestedBudget
        //   Rule 9 (top_performer):     newBudget
        // Accept both to avoid silent failures.
        const suggested = diagnosis.suggestedValue as {
          newBudget?: number;
          suggestedBudget?: number;
        } | null;
        const newBudget = suggested?.newBudget ?? suggested?.suggestedBudget;
        if (!newBudget || newBudget <= 0) {
          result = { success: false, error: 'No valid budget in suggestedValue', retryable: false };
          break;
        }
        // Diagnosis rules produce human-readable values (e.g. 1476 MXN).
        // Meta API expects values multiplied by currency offset (e.g. 147600 for MXN offset=100).
        const budgetValue = Math.round(newBudget * currencyOffset);

        // When Campaign Budget Optimization (CBO) is enabled, the ad set
        // won't have a daily_budget — Meta returns error code 200 (Permissions).
        // Detect CBO by checking if adSet.dailyBudget is null and fall back
        // to updating the campaign budget directly.
        const isCBO = diagnosis.ad.adSet.dailyBudget == null;

        if (isCBO) {
          // CBO campaign — update at the campaign level
          result = await updateCampaignBudget(accessToken, metaCampaignId, budgetValue);
        } else {
          // ABO (Ad Set Budget Optimization) — update at the ad set level
          result = await updateAdSetBudget(accessToken, metaAdSetId, budgetValue);
          // If ad set update fails with Permissions error (code 200), it's likely
          // CBO was enabled after last sync. Fall back to campaign budget.
          if (!result.success && result.errorCode === 200) {
            result = await updateCampaignBudget(accessToken, metaCampaignId, budgetValue);
          }
        }
        break;
      }

      case 'GENERATE_COPY_VARIANTS': {
        // Find the approved variant
        const approvedVariant = await prisma.adVariant.findFirst({
          where: { diagnosisId, status: 'APPROVED' },
        });
        if (!approvedVariant) {
          result = { success: false, error: 'No approved variant found for this diagnosis', retryable: false };
          break;
        }
        result = await createAdFromVariant(accessToken, adAccountId, metaAdSetId, {
          name: approvedVariant.headline,
          headline: approvedVariant.headline,
          primaryText: approvedVariant.primaryText,
          description: approvedVariant.description ?? undefined,
        });
        // If successful, update variant with the new Meta ad ID
        if (result.success && result.metaResponse) {
          const resp = result.metaResponse as { adId?: string };
          if (resp.adId) {
            await prisma.adVariant.update({
              where: { id: approvedVariant.id },
              data: { metaAdId: resp.adId, status: 'PUBLISHED' },
            });
          }
        }
        break;
      }

      case 'REFRESH_CREATIVE':
        // Same as GENERATE_COPY_VARIANTS flow
        result = { success: false, error: 'REFRESH_CREATIVE requires a variant — use generate-copy first', retryable: false };
        break;

      default:
        result = { success: false, error: `Unknown action type: ${diagnosis.actionType}`, retryable: false };
    }

    // If successful or not retryable, stop
    if (result.success || !result.retryable) break;
  }

  // Update diagnosis record
  if (result.success) {
    await prisma.diagnosis.update({
      where: { id: diagnosisId },
      data: {
        status: 'EXECUTED',
        executedAt: new Date(),
        executionResult: result as never,
      },
    });

    // Update MetaAdSet.dailyBudget in DB immediately after successful budget change
    // so the next diagnosis run sees the current budget (not stale pre-change value)
    if (
      (diagnosis.actionType === 'INCREASE_BUDGET' || diagnosis.actionType === 'DECREASE_BUDGET') &&
      diagnosis.ad.adSet?.id
    ) {
      const sv = diagnosis.suggestedValue as Record<string, unknown> | null;
      const newBudget = Number(sv?.newBudget ?? sv?.suggestedBudget ?? 0);
      if (newBudget > 0) {
        try {
          await prisma.metaAdSet.update({
            where: { id: diagnosis.ad.adSet.id },
            data: { dailyBudget: newBudget },
          });
        } catch {
          // Non-fatal: sync will eventually update from Meta API
        }
      }
    }

    // Audit log
    await prisma.autopilotActionLog.create({
      data: {
        organizationId: diagnosis.organizationId,
        diagnosisId,
        actionType: diagnosis.actionType,
        triggeredBy,
        targetEntity: 'ad',
        targetId: diagnosis.ad.adId,
        targetName: diagnosis.ad.name ?? diagnosis.ad.adId,
        beforeValue: {
          status: diagnosis.ad.status,
          spend7d: diagnosis.ad.spend7d?.toString(),
          roas7d: diagnosis.ad.roas7d?.toString(),
          ctr7d: diagnosis.ad.ctr7d?.toString(),
          conversions7d: diagnosis.ad.conversions7d,
          dailyBudget: diagnosis.ad.adSet?.dailyBudget?.toString(),
        } as never,
        success: true,
      },
    });
  } else {
    await markFailed(diagnosisId, result.error ?? 'Unknown error');

    // Audit log for failure
    await prisma.autopilotActionLog.create({
      data: {
        organizationId: diagnosis.organizationId,
        diagnosisId,
        actionType: diagnosis.actionType,
        triggeredBy,
        targetEntity: 'ad',
        targetId: diagnosis.ad.adId,
        targetName: diagnosis.ad.name ?? diagnosis.ad.adId,
        success: false,
        errorMessage: result.error ?? 'Unknown error',
      },
    });
  }

  // NOTE: Audit log is already written above (success at line 266, failure at line 290).
  // Do NOT duplicate the write here.

  return {
    success: result.success,
    diagnosisId,
    actionType: diagnosis.actionType,
    executionResult: result,
  };
}

/**
 * Mark a diagnosis execution as failed: keep status as APPROVED so the
 * expiration sweep doesn't expire it, but record the error in executionResult.
 * The user can retry or dismiss from the UI.
 */
async function markFailed(diagnosisId: string, errorMessage: string): Promise<void> {
  await prisma.diagnosis.update({
    where: { id: diagnosisId },
    data: {
      // Keep APPROVED — do NOT revert to PENDING.
      // Reverting to PENDING causes the next sync to expire it,
      // losing the user's approval signal.
      executionResult: { error: errorMessage, failedAt: new Date().toISOString() } as never,
    },
  });
}
