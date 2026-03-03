// ──────────────────────────────────────────────────────────────
// Growth OS — Meta API Executor
// Functions to mutate Meta Ads via the Marketing API.
// All changes require prior user approval (never called automatically).
// ──────────────────────────────────────────────────────────────

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface ExecutionResult {
  success: boolean;
  metaResponse?: unknown;
  error?: string;
  errorCode?: number;
  retryable?: boolean;
}

/**
 * Pause an active Meta ad.
 * POST /{ad-id} { status: 'PAUSED' }
 */
export async function pauseAd(accessToken: string, adId: string): Promise<ExecutionResult> {
  return updateAdStatus(accessToken, adId, 'PAUSED');
}

/**
 * Reactivate a paused Meta ad.
 * POST /{ad-id} { status: 'ACTIVE' }
 */
export async function reactivateAd(accessToken: string, adId: string): Promise<ExecutionResult> {
  return updateAdStatus(accessToken, adId, 'ACTIVE');
}

/**
 * Update an ad set's daily budget.
 * POST /{adset-id} { daily_budget: <cents> }
 * Meta expects budget in cents (integer).
 *
 * NOTE: This will fail with error code 200 (Permissions) if Campaign
 * Budget Optimization (CBO) is enabled. Use updateCampaignBudget() instead.
 */
export async function updateAdSetBudget(
  accessToken: string,
  adSetId: string,
  newDailyBudgetCents: number,
): Promise<ExecutionResult> {
  if (!Number.isInteger(newDailyBudgetCents) || newDailyBudgetCents < 100) {
    return { success: false, error: 'Budget must be an integer >= 100 (cents)', retryable: false };
  }

  try {
    const resp = await fetch(`${META_BASE}/${adSetId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ daily_budget: newDailyBudgetCents }),
    });

    const body = await resp.json() as { success?: boolean; error?: MetaErrorResponse };
    if (!resp.ok || body.error) {
      return handleMetaError(body.error, resp.status);
    }

    return { success: true, metaResponse: body };
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}`, retryable: true };
  }
}

/**
 * Update a campaign's daily budget.
 * POST /{campaign-id} { daily_budget: <cents> }
 * Use this when Campaign Budget Optimization (CBO) is enabled
 * and ad-set-level budget updates are not allowed.
 */
export async function updateCampaignBudget(
  accessToken: string,
  campaignId: string,
  newDailyBudgetCents: number,
): Promise<ExecutionResult> {
  if (!Number.isInteger(newDailyBudgetCents) || newDailyBudgetCents < 100) {
    return { success: false, error: 'Budget must be an integer >= 100 (cents)', retryable: false };
  }

  try {
    const resp = await fetch(`${META_BASE}/${campaignId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ daily_budget: newDailyBudgetCents }),
    });

    const body = await resp.json() as { success?: boolean; error?: MetaErrorResponse };
    if (!resp.ok || body.error) {
      return handleMetaError(body.error, resp.status);
    }

    return { success: true, metaResponse: { ...body, level: 'campaign' } };
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}`, retryable: true };
  }
}

/**
 * Create a new ad from an approved copy variant.
 * Steps:
 *   1. Create an AdCreative with the variant copy
 *   2. Create a new Ad in the same ad set with a name suffix
 */
export async function createAdFromVariant(
  accessToken: string,
  adAccountId: string,
  adSetId: string,
  creative: {
    name: string;
    headline: string;
    primaryText: string;
    description?: string;
    imageHash?: string;
    imageUrl?: string;
    callToAction?: string;
    linkUrl?: string;
  },
): Promise<ExecutionResult> {
  try {
    // Step 1: Create AdCreative
    const creativePayload: Record<string, unknown> = {
      name: `${creative.name} — GrowthOS Variant`,
      object_story_spec: {
        link_data: {
          message: creative.primaryText,
          name: creative.headline,
          description: creative.description ?? '',
          call_to_action: { type: creative.callToAction ?? 'LEARN_MORE' },
          link: creative.linkUrl ?? '',
          ...(creative.imageHash ? { image_hash: creative.imageHash } : {}),
        },
      },
    };

    const creativeResp = await fetch(`${META_BASE}/${adAccountId}/adcreatives`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(creativePayload),
    });

    const creativeBody = await creativeResp.json() as { id?: string; error?: MetaErrorResponse };
    if (!creativeResp.ok || creativeBody.error) {
      return handleMetaError(creativeBody.error, creativeResp.status);
    }

    const creativeId = creativeBody.id;
    if (!creativeId) {
      return { success: false, error: 'Meta returned no creative ID', retryable: false };
    }

    // Step 2: Create Ad using the new creative
    const adResp = await fetch(`${META_BASE}/${adAccountId}/ads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: `${creative.name} — GrowthOS`,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: 'PAUSED', // Always create paused — user must activate manually
      }),
    });

    const adBody = await adResp.json() as { id?: string; error?: MetaErrorResponse };
    if (!adResp.ok || adBody.error) {
      return handleMetaError(adBody.error, adResp.status);
    }

    return {
      success: true,
      metaResponse: { creativeId, adId: adBody.id },
    };
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}`, retryable: true };
  }
}

// ── Internals ───────────────────────────────────────────────────

interface MetaErrorResponse {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

async function updateAdStatus(
  accessToken: string,
  adId: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<ExecutionResult> {
  try {
    const resp = await fetch(`${META_BASE}/${adId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status }),
    });

    const body = await resp.json() as { success?: boolean; error?: MetaErrorResponse };
    if (!resp.ok || body.error) {
      return handleMetaError(body.error, resp.status);
    }

    return { success: true, metaResponse: body };
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}`, retryable: true };
  }
}

function handleMetaError(error: MetaErrorResponse | undefined, httpStatus: number): ExecutionResult {
  const code = error?.code ?? httpStatus;
  const message = error?.message ?? `HTTP ${httpStatus}`;

  // Meta error code classification
  // 190: Expired/invalid token → not retryable, user must re-auth
  // 32: Rate limit → retryable with backoff
  // 200: Permission error → not retryable
  // 1487: Ad account suspended → not retryable
  // 2: Temporary error → retryable
  const retryable = code === 32 || code === 2;

  return {
    success: false,
    error: `Meta API error (${code}): ${message}`,
    errorCode: code,
    retryable,
  };
}
