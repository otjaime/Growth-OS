// ──────────────────────────────────────────────────────────────
// Growth OS — Execute Diagnosis Action
// Takes an approved diagnosis and executes it via the Meta API.
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt } from '@growth-os/database';
import {
  pauseAd,
  reactivateAd,
  updateAdSetBudget,
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

/**
 * Execute the approved action for a diagnosis.
 * Fetches credentials, calls Meta API, updates diagnosis record.
 */
export async function executeAction(diagnosisId: string): Promise<ExecuteActionResult> {
  // Load diagnosis with ad + account context
  const diagnosis = await prisma.diagnosis.findUnique({
    where: { id: diagnosisId },
    include: {
      ad: {
        include: {
          adSet: { select: { adSetId: true, dailyBudget: true } },
          account: { select: { adAccountId: true } },
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
  const adAccountId = diagnosis.ad.account.adAccountId; // act_xxx

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
        const suggested = diagnosis.suggestedValue as { newBudget?: number } | null;
        const newBudgetDollars = suggested?.newBudget;
        if (!newBudgetDollars || newBudgetDollars <= 0) {
          result = { success: false, error: 'No valid budget in suggestedValue', retryable: false };
          break;
        }
        // Meta expects cents
        const budgetCents = Math.round(newBudgetDollars * 100);
        result = await updateAdSetBudget(accessToken, metaAdSetId, budgetCents);
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
  } else {
    await markFailed(diagnosisId, result.error ?? 'Unknown error');
  }

  return {
    success: result.success,
    diagnosisId,
    actionType: diagnosis.actionType,
    executionResult: result,
  };
}

async function markFailed(diagnosisId: string, errorMessage: string): Promise<void> {
  await prisma.diagnosis.update({
    where: { id: diagnosisId },
    data: {
      executionResult: { error: errorMessage } as never,
    },
  });
}
