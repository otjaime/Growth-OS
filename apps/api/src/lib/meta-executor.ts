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

/**
 * Duplicate an ad set with its winning ad to target fresh audiences.
 * Steps:
 *   1. Read source ad set configuration (targeting, budget, bid strategy)
 *   2. Create a new ad set under the same campaign (status: PAUSED)
 *   3. Read the winning ad's creative
 *   4. Create a new ad in the new ad set using the same creative
 */
export async function duplicateAdSet(
  accessToken: string,
  adAccountId: string,
  sourceAdSetId: string,
  sourceAdId: string,
  newName: string,
): Promise<ExecutionResult> {
  // Step 1: Read source ad set config
  const readUrl = `${META_BASE}/${sourceAdSetId}?fields=name,daily_budget,targeting,billing_event,optimization_goal,bid_strategy,campaign_id,status&access_token=${accessToken}`;

  let sourceConfig: Record<string, unknown>;
  try {
    const readRes = await fetch(readUrl);
    sourceConfig = (await readRes.json()) as Record<string, unknown>;
    if (sourceConfig.error) {
      return { success: false, error: `Failed to read source ad set: ${JSON.stringify(sourceConfig.error)}` };
    }
  } catch (err) {
    return { success: false, error: `Network error reading source ad set: ${String(err)}`, retryable: true };
  }

  // Step 2: Create new ad set under same campaign
  const campaignId = String(sourceConfig.campaign_id ?? '');
  if (!campaignId) {
    return { success: false, error: 'Source ad set has no campaign_id', retryable: false };
  }

  const adSetFields: Record<string, string> = {
    name: newName,
    campaign_id: campaignId,
    status: 'PAUSED',
    billing_event: String(sourceConfig.billing_event ?? 'IMPRESSIONS'),
    optimization_goal: String(sourceConfig.optimization_goal ?? 'OFFSITE_CONVERSIONS'),
  };

  // Copy budget (daily_budget is in cents)
  if (sourceConfig.daily_budget) {
    adSetFields.daily_budget = String(sourceConfig.daily_budget);
  }

  // Copy targeting if available
  if (sourceConfig.targeting) {
    adSetFields.targeting = JSON.stringify(sourceConfig.targeting);
  }

  // Copy bid strategy if available
  if (sourceConfig.bid_strategy) {
    adSetFields.bid_strategy = String(sourceConfig.bid_strategy);
  }

  const createAdSetResult = await metaPost(accessToken, `act_${adAccountId}/adsets`, adSetFields);
  if (!createAdSetResult.success) {
    return { ...createAdSetResult, error: `Failed to create ad set: ${createAdSetResult.error}` };
  }

  const newAdSetId = (createAdSetResult.metaResponse as Record<string, unknown>)?.id;
  if (!newAdSetId) {
    return { success: false, error: 'Ad set created but no ID returned', retryable: false };
  }

  // Step 3: Get the winning ad's creative
  const creativeUrl = `${META_BASE}/${sourceAdId}?fields=creative{id}&access_token=${accessToken}`;
  let creativeId: string | null = null;
  try {
    const creativeRes = await fetch(creativeUrl);
    const creativeData = (await creativeRes.json()) as Record<string, unknown>;
    const creative = creativeData.creative as Record<string, unknown> | undefined;
    creativeId = creative?.id ? String(creative.id) : null;
  } catch {
    // Non-fatal: we'll skip ad creation
  }

  // Step 4: Create new ad in the new ad set
  let newAdId: unknown = null;
  if (creativeId) {
    const adFields: Record<string, string> = {
      name: `${newName} — Ad`,
      adset_id: String(newAdSetId),
      creative: JSON.stringify({ creative_id: creativeId }),
      status: 'PAUSED',
    };

    const createAdResult = await metaPost(accessToken, `act_${adAccountId}/ads`, adFields);
    if (createAdResult.success) {
      newAdId = (createAdResult.metaResponse as Record<string, unknown>)?.id;
    }
  }

  return {
    success: true,
    metaResponse: { newAdSetId, newAdId, sourceAdSetId, sourceAdId },
  };
}

/**
 * Create a new ad set for proactive ads with budget and broad targeting.
 * POST act_{id}/adsets — form-urlencoded with budget in cents.
 */
export async function createProactiveAdSet(
  accessToken: string,
  adAccountId: string,
  campaignId: string,
  productTitle: string,
  dailyBudgetCents: number,
): Promise<ExecutionResult> {
  if (!Number.isInteger(dailyBudgetCents) || dailyBudgetCents < 100) {
    return { success: false, error: 'Daily budget must be at least 100 cents ($1)', retryable: false };
  }

  return metaPost(accessToken, `act_${adAccountId}/adsets`, {
    name: `GrowthOS Proactive — ${productTitle}`,
    campaign_id: campaignId,
    daily_budget: String(dailyBudgetCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    status: 'PAUSED',
    targeting: JSON.stringify({ geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65 }),
  });
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
