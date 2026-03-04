// ──────────────────────────────────────────────────────────────
// Growth OS — Meta API Executor
// Functions to mutate Meta Ads via the Marketing API.
// All changes require prior user approval (never called automatically).
//
// IMPORTANT: Meta's Marketing API expects POST requests as
// application/x-www-form-urlencoded with access_token as a field,
// NOT JSON with Bearer header. Using JSON+Bearer can cause
// error code 200 / subcode 4841013 ("user doesn't have permission").
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
 * POST /{adset-id} -F daily_budget=<value> -F access_token=<token>
 * Budget value is in the ad account's currency unit (same as Meta API returns).
 *
 * NOTE: This will fail with error code 200 (Permissions) if Campaign
 * Budget Optimization (CBO) is enabled. Use updateCampaignBudget() instead.
 */
export async function updateAdSetBudget(
  accessToken: string,
  adSetId: string,
  newDailyBudget: number,
): Promise<ExecutionResult> {
  if (!Number.isInteger(newDailyBudget) || newDailyBudget < 1) {
    return { success: false, error: 'Budget must be a positive integer', retryable: false };
  }

  return metaPost(accessToken, adSetId, {
    daily_budget: String(newDailyBudget),
  });
}

/**
 * Update a campaign's daily budget.
 * POST /{campaign-id} -F daily_budget=<value> -F access_token=<token>
 * Budget value is in the ad account's currency unit (same as Meta API returns).
 * Use this when Campaign Budget Optimization (CBO) is enabled
 * and ad-set-level budget updates are not allowed.
 */
export async function updateCampaignBudget(
  accessToken: string,
  campaignId: string,
  newDailyBudget: number,
): Promise<ExecutionResult> {
  if (!Number.isInteger(newDailyBudget) || newDailyBudget < 1) {
    return { success: false, error: 'Budget must be a positive integer', retryable: false };
  }

  const result = await metaPost(accessToken, campaignId, {
    daily_budget: String(newDailyBudget),
  });

  // Tag the response as campaign-level for logging
  if (result.success && result.metaResponse) {
    result.metaResponse = { ...(result.metaResponse as Record<string, unknown>), level: 'campaign' };
  }

  return result;
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
    // Step 1: Create AdCreative — this one uses JSON because it has nested objects
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
    const adFormData = new URLSearchParams();
    adFormData.append('access_token', accessToken);
    adFormData.append('name', `${creative.name} — GrowthOS`);
    adFormData.append('adset_id', adSetId);
    adFormData.append('creative', JSON.stringify({ creative_id: creativeId }));
    adFormData.append('status', 'PAUSED'); // Always create paused — user must activate manually

    const adResp = await fetch(`${META_BASE}/${adAccountId}/ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adFormData.toString(),
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

/**
 * Core helper: POST to a Meta object using form-urlencoded format.
 * Meta's Marketing API officially uses form-urlencoded with access_token
 * as a field (not JSON body with Bearer header).
 */
async function metaPost(
  accessToken: string,
  objectId: string,
  fields: Record<string, string>,
): Promise<ExecutionResult> {
  try {
    const formData = new URLSearchParams();
    formData.append('access_token', accessToken);
    for (const [key, value] of Object.entries(fields)) {
      formData.append(key, value);
    }

    const resp = await fetch(`${META_BASE}/${objectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
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

async function updateAdStatus(
  accessToken: string,
  adId: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<ExecutionResult> {
  return metaPost(accessToken, adId, { status });
}

function handleMetaError(error: MetaErrorResponse | undefined, httpStatus: number): ExecutionResult {
  const code = error?.code ?? httpStatus;
  const message = error?.message ?? `HTTP ${httpStatus}`;
  const subcode = error?.error_subcode;

  // Meta error code classification
  // 190: Expired/invalid token → not retryable, user must re-auth
  // 32: Rate limit → retryable with backoff
  // 200: Permission error → not retryable
  // 1487: Ad account suspended → not retryable
  // 2: Temporary error → retryable
  const retryable = code === 32 || code === 2;

  // Provide actionable error messages for common issues
  let userMessage = `Meta API error (${code}${subcode ? `/${subcode}` : ''}): ${message}`;
  if (code === 200) {
    userMessage = `Meta permission denied (${code}/${subcode ?? '?'}): ${message}. Check that your user has Admin role on the ad account in Business Settings.`;
  } else if (code === 190) {
    userMessage = 'Meta access token expired or invalid — re-connect Meta Ads in Data Connections.';
  } else if (code === 1487) {
    userMessage = 'Meta ad account is suspended — contact Meta support to restore access.';
  }

  return {
    success: false,
    error: userMessage,
    errorCode: code,
    retryable,
  };
}
