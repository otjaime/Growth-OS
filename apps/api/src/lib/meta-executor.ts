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

/**
 * Zero-decimal currencies — Meta expects budget in whole units (not × 100).
 * For these currencies, the smallest unit IS the currency itself.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'CLP', 'JPY', 'KRW', 'VND', 'BIF', 'DJF', 'GNF', 'ISK', 'KMF',
  'PYG', 'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/**
 * Convert a budget in display currency to Meta API "smallest unit" value.
 * For USD: $5.00 → 500 (cents). For CLP: $5000 → 5000 (pesos, no cents).
 */
export function toSmallestUnit(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return Math.round(amount); // already in smallest unit
  }
  return Math.round(amount * 100); // convert to cents
}

/**
 * Meta minimum daily budget per ad set, in the currency's smallest unit.
 * Meta enforces ~$1 USD equivalent minimum. Values are approximate.
 * If a currency is not listed, we default to 100 (= $1.00 for cent-based).
 */
const META_MIN_ADSET_DAILY_BUDGET: Record<string, number> = {
  CLP: 1000,   // ~$1 USD ≈ 1000 CLP
  JPY: 150,    // ~$1 USD ≈ 150 JPY
  KRW: 1400,   // ~$1 USD
  MXN: 20,     // 20 MXN ≈ $1 USD (in cents: 2000)
  BRL: 6,      // 6 BRL ≈ $1 USD (in cents: 600)
  ARS: 1000,   // ~$1 USD at official rate
  USD: 100,    // $1.00 in cents
  EUR: 100,    // €1.00 in cents
  GBP: 100,    // £1.00 in pence
  CAD: 140,    // ~$1 USD in cents
  AUD: 160,    // ~$1 USD in cents
};

/**
 * Get the minimum daily budget per ad set for a given currency.
 * Returns the value in the currency's smallest unit (cents/pesos/etc.).
 */
export function getMinAdSetBudget(currency: string): number {
  const upper = currency.toUpperCase();
  // For zero-decimal currencies, values are already in the map as whole units
  if (META_MIN_ADSET_DAILY_BUDGET[upper] !== undefined) {
    return META_MIN_ADSET_DAILY_BUDGET[upper];
  }
  // Default: 100 smallest units (= $1 for cent-based currencies)
  return 100;
}

/** Normalize an ad account ID to include the act_ prefix. */
function normalizeAccountId(id: string): string {
  const raw = id.trim().replace(/^act_/, '');
  return `act_${raw}`;
}

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
 * Fetch the first Facebook Page ID associated with the access token.
 * Uses GET /me/accounts which lists pages the user/system-user manages.
 * Returns undefined if no pages are found or the call fails.
 */
export async function fetchFacebookPageId(accessToken: string): Promise<string | undefined> {
  try {
    const resp = await fetch(
      `${META_BASE}/me/accounts?fields=id,name&limit=1&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!resp.ok) return undefined;
    const body = await resp.json() as { data?: Array<{ id?: string; name?: string }> };
    return body.data?.[0]?.id ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Upload an image from a URL to a Meta Ad Account.
 * Downloads the image and uploads it via the Meta Marketing API.
 * Returns the image_hash on success, which can be used in ad creatives.
 *
 * POST act_{id}/adimages — multipart/form-data with image bytes.
 * Meta also supports uploading by URL using the `url` field.
 */
export async function uploadImageToMeta(
  accessToken: string,
  adAccountId: string,
  imageUrl: string,
): Promise<{ success: boolean; imageHash?: string; error?: string }> {
  try {
    const accountId = normalizeAccountId(adAccountId);

    // Meta supports uploading by URL directly — simpler than downloading + re-uploading bytes
    const formData = new URLSearchParams();
    formData.append('access_token', accessToken);
    formData.append('url', imageUrl);

    const resp = await fetch(`${META_BASE}/${accountId}/adimages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const body = await resp.json() as {
      images?: Record<string, { hash?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!resp.ok || body.error) {
      return {
        success: false,
        error: `Image upload failed: ${body.error?.message ?? `HTTP ${resp.status}`}`,
      };
    }

    // Response format: { images: { "<filename>": { hash: "abc123..." } } }
    const images = body.images ?? {};
    const firstImage = Object.values(images)[0];
    const imageHash = firstImage?.hash;

    if (!imageHash) {
      return { success: false, error: 'Image uploaded but no hash returned' };
    }

    return { success: true, imageHash };
  } catch (err) {
    return { success: false, error: `Image upload error: ${(err as Error).message}` };
  }
}

/**
 * Create a new ad from an approved copy variant.
 * Steps:
 *   1. Create an AdCreative with the variant copy (requires pageId)
 *   2. Create a new Ad in the same ad set with a name suffix
 *
 * NOTE on pageId: Meta requires a Facebook Page ID in object_story_spec.
 * Without it, creative creation fails. Use fetchFacebookPageId() to get one.
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
    pageId?: string;
  },
): Promise<ExecutionResult> {
  try {
    // Validate required fields
    if (!creative.pageId) {
      return { success: false, error: 'Facebook Page ID is required to create ad creatives. Connect a Facebook Page in Meta Business Settings.', retryable: false };
    }

    // linkUrl is required for link ads — use a fallback if not provided
    const linkUrl = creative.linkUrl?.trim();
    if (!linkUrl) {
      return { success: false, error: `No product URL available for "${creative.name}". Add product URLs in your store.`, retryable: false };
    }

    // Step 1: Create AdCreative — uses form-urlencoded with object_story_spec as JSON string
    // Meta requires page_id inside object_story_spec for all ad creatives.
    const objectStorySpec: Record<string, unknown> = {
      page_id: creative.pageId,
      link_data: {
        message: creative.primaryText,
        name: creative.headline,
        description: creative.description ?? '',
        call_to_action: { type: creative.callToAction ?? 'LEARN_MORE', value: { link: linkUrl } },
        link: linkUrl,
        ...(creative.imageHash ? { image_hash: creative.imageHash } : {}),
      },
    };

    const creativeResult = await metaPost(accessToken, `${normalizeAccountId(adAccountId)}/adcreatives`, {
      name: `${creative.name} — GrowthOS Variant`,
      object_story_spec: JSON.stringify(objectStorySpec),
    });

    if (!creativeResult.success) {
      return { ...creativeResult, error: `Creative creation failed: ${creativeResult.error}` };
    }

    const creativeId = String(
      (creativeResult.metaResponse as Record<string, unknown>)?.id ?? '',
    );
    if (!creativeId) {
      return { success: false, error: 'Meta returned no creative ID', retryable: false };
    }

    // Step 2: Create Ad using the new creative
    const adResult = await metaPost(accessToken, `${normalizeAccountId(adAccountId)}/ads`, {
      name: `${creative.name} — GrowthOS`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: 'PAUSED', // Always create paused — user must activate manually
    });

    if (!adResult.success) {
      return { ...adResult, error: `Ad creation failed: ${adResult.error}` };
    }

    const adId = String(
      (adResult.metaResponse as Record<string, unknown>)?.id ?? '',
    );

    return {
      success: true,
      metaResponse: { creativeId, adId },
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
 * Map common currencies to their primary country code for ad targeting.
 * Used when no explicit targeting is provided — we default to the country
 * matching the ad account's currency.
 */
export const CURRENCY_COUNTRY_MAP: Record<string, string> = {
  USD: 'US', CLP: 'CL', BRL: 'BR', MXN: 'MX', ARS: 'AR', COP: 'CO',
  PEN: 'PE', EUR: 'DE', GBP: 'GB', CAD: 'CA', AUD: 'AU', JPY: 'JP',
  KRW: 'KR', INR: 'IN', NZD: 'NZ', ZAR: 'ZA', SGD: 'SG', HKD: 'HK',
};

/** Targeting specification for ad sets. */
export interface AdSetTargeting {
  readonly countries: readonly string[];
  readonly ageMin?: number;
  readonly ageMax?: number;
}

/**
 * Create a new Meta campaign.
 * POST act_{id}/campaigns — form-urlencoded.
 * Campaign is created PAUSED — caller should activate after ads are ready.
 */
export async function createMetaCampaign(
  accessToken: string,
  adAccountId: string,
  name: string,
  objective?: string,
): Promise<ExecutionResult> {
  const accountId = normalizeAccountId(adAccountId);
  // Budget is set per ad set, NOT at campaign level (no CBO).
  // special_ad_categories is required — empty array for standard ads.
  // OUTCOME_TRAFFIC is the safest default — OUTCOME_SALES requires pixel/catalog setup.
  return metaPost(accessToken, `${accountId}/campaigns`, {
    name,
    objective: objective ?? 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: '[]',
    // Budget lives at ad set level, not campaign level (no CBO).
    // Meta requires this field explicitly when not using campaign budget.
    is_adset_budget_sharing_enabled: 'false',
  });
}

/**
 * Create a new ad set for proactive ads with budget and configurable targeting.
 * POST act_{id}/adsets — form-urlencoded with budget in smallest currency unit.
 * @param targeting - Optional geo/age targeting; defaults to US, 18-65
 */
export async function createProactiveAdSet(
  accessToken: string,
  adAccountId: string,
  campaignId: string,
  productTitle: string,
  budgetSmallestUnit: number,
  targeting?: AdSetTargeting,
  pixelId?: string,
): Promise<ExecutionResult> {
  if (!Number.isInteger(budgetSmallestUnit) || budgetSmallestUnit < 1) {
    return { success: false, error: 'Daily budget must be a positive integer in smallest currency unit', retryable: false };
  }

  const countries = targeting?.countries?.length
    ? [...targeting.countries]
    : ['US'];
  const ageMin = targeting?.ageMin ?? 18;
  const ageMax = targeting?.ageMax ?? 65;

  const accountId = normalizeAccountId(adAccountId);

  // Build fields
  const fields: Record<string, string> = {
    name: `GrowthOS — ${productTitle}`,
    campaign_id: campaignId,
    daily_budget: String(budgetSmallestUnit),
    billing_event: 'IMPRESSIONS',
    optimization_goal: pixelId ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS',
    // LOWEST_COST_WITHOUT_CAP = automatic bidding, no bid cap needed.
    // Without this, Meta requires bid_amount or bid_constraints.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    status: 'PAUSED',
    targeting: JSON.stringify({ geo_locations: { countries }, age_min: ageMin, age_max: ageMax }),
  };

  // Add promoted_object with pixel if available (required for OFFSITE_CONVERSIONS)
  if (pixelId) {
    fields.promoted_object = JSON.stringify({ pixel_id: pixelId, custom_event_type: 'PURCHASE' });
  }

  return metaPost(accessToken, `${accountId}/adsets`, fields);
}

/**
 * Activate a Meta campaign (and optionally its ad sets and ads).
 * Call this AFTER all ad sets/ads are created to turn on delivery.
 * Updates campaign → ad sets → ads status from PAUSED to ACTIVE.
 */
export async function activateMetaCampaign(
  accessToken: string,
  campaignId: string,
  adSetIds: readonly string[],
  adIds: readonly string[],
): Promise<ExecutionResult> {
  const errors: string[] = [];

  // 1. Activate ads first (bottom-up: ads → ad sets → campaign)
  for (const adId of adIds) {
    const result = await metaPost(accessToken, adId, { status: 'ACTIVE' });
    if (!result.success) {
      errors.push(`Ad ${adId}: ${result.error}`);
    }
  }

  // 2. Activate ad sets
  for (const adSetId of adSetIds) {
    const result = await metaPost(accessToken, adSetId, { status: 'ACTIVE' });
    if (!result.success) {
      errors.push(`Ad set ${adSetId}: ${result.error}`);
    }
  }

  // 3. Activate campaign last
  const campaignResult = await metaPost(accessToken, campaignId, { status: 'ACTIVE' });
  if (!campaignResult.success) {
    return {
      success: false,
      error: `Failed to activate campaign: ${campaignResult.error}`,
      metaResponse: { partialErrors: errors },
    };
  }

  return {
    success: true,
    metaResponse: {
      campaignId,
      activatedAdSets: adSetIds.length,
      activatedAds: adIds.length,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    },
  };
}

/**
 * Pause a Meta campaign and all its ad sets.
 * Top-down: campaign → ad sets (ads inherit paused state from parent).
 */
export async function pauseMetaCampaign(
  accessToken: string,
  campaignId: string,
  adSetIds: readonly string[],
): Promise<ExecutionResult> {
  const errors: string[] = [];

  // 1. Pause campaign first (top-down)
  const campaignResult = await metaPost(accessToken, campaignId, { status: 'PAUSED' });
  if (!campaignResult.success) {
    errors.push(`Campaign: ${campaignResult.error}`);
  }

  // 2. Pause ad sets explicitly
  for (const adSetId of adSetIds) {
    const result = await metaPost(accessToken, adSetId, { status: 'PAUSED' });
    if (!result.success) {
      errors.push(`Ad set ${adSetId}: ${result.error}`);
    }
  }

  if (!campaignResult.success) {
    return {
      success: false,
      error: `Failed to pause campaign on Meta: ${errors.join('; ')}`,
      metaResponse: { errors },
    };
  }

  return {
    success: true,
    metaResponse: {
      campaignId,
      pausedAdSets: adSetIds.length,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    },
  };
}

// ── Internals ───────────────────────────────────────────────────

interface MetaErrorResponse {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
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
  // Meta often includes a user-friendly message with specific details
  const userDetail = error?.error_user_msg ?? error?.error_user_title ?? '';

  // Meta error code classification
  // 190: Expired/invalid token → not retryable, user must re-auth
  // 32: Rate limit → retryable with backoff
  // 200: Permission error → not retryable
  // 1487: Ad account suspended → not retryable
  // 2: Temporary error → retryable
  const retryable = code === 32 || code === 2;

  // Build error message with as much detail as possible
  const codeStr = `${code}${subcode ? `/${subcode}` : ''}`;
  let userMessage = userDetail
    ? `Meta API error (${codeStr}): ${userDetail}`
    : `Meta API error (${codeStr}): ${message}`;

  if (code === 200) {
    userMessage = `Meta permission denied (${codeStr}): ${userDetail || message}. Check that your user has Admin role on the ad account in Business Settings.`;
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
