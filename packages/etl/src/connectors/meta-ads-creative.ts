// ──────────────────────────────────────────────────────────────
// Growth OS — Meta Ads Creative Connector
// Fetches ad-level data with creative fields + performance metrics
// from Meta Marketing API v21.0
// ──────────────────────────────────────────────────────────────

import type { MetaConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { format, subDays } from 'date-fns';
import { generateDemoMetaAds } from './demo-meta-ads.js';

const log = createLogger('connector:meta-ads-creative');

// ── Types ────────────────────────────────────────────────────

export interface MetaAdCreativeConfig extends MetaConfig {
  organizationId: string;
}

export interface MetaCampaignData {
  campaignId: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget: number | null;
}

export interface MetaAdSetData {
  adSetId: string;
  campaignId: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  targeting: Record<string, unknown> | null;
}

export interface MetaAdData {
  adId: string;
  campaignId: string;
  adSetId: string;
  name: string;
  status: string;
  effectiveStatus: string; // Meta effective_status: actual delivery status (ACTIVE, CAMPAIGN_PAUSED, ADSET_PAUSED, etc.)
  createdTime: string | null; // ISO 8601 from Meta API (e.g. "2024-01-15T10:30:00+0000")
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  callToAction: string | null;
  creativeType: string | null;
}

export interface MetaAdInsight {
  adId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
  frequency: number | null;
}

export interface MetaAccountInfo {
  name: string;
  currency: string;
  timezone: string;
  currencyOffset: number;
}

export interface MetaAdCreativeResult {
  accountInfo: MetaAccountInfo;
  campaigns: MetaCampaignData[];
  adSets: MetaAdSetData[];
  ads: MetaAdData[];
  insights7d: MetaAdInsight[];
  insights14d: MetaAdInsight[];
}

// ── Currency offset ──────────────────────────────────────────
// Meta's Marketing API returns all monetary values (budgets, spend)
// multiplied by the currency's offset to avoid floating point.
// Most currencies use offset=100 (cents); some use 1 or 1000.
// Reference: https://developers.facebook.com/docs/marketing-api/currencies

/** Currencies with offset = 1 (no subunit or treated as whole units). */
const OFFSET_1_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Currencies with offset = 1000 (3 decimal subunit). */
const OFFSET_1000_CURRENCIES = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
]);

/**
 * Get Meta's currency offset for a given ISO 4217 currency code.
 * Meta multiplies all monetary values by this offset.
 * Divide by offset to get human-readable values.
 */
export function getCurrencyOffset(currency: string): number {
  const code = currency.toUpperCase();
  if (OFFSET_1_CURRENCIES.has(code)) return 1;
  if (OFFSET_1000_CURRENCIES.has(code)) return 1000;
  return 100; // USD, EUR, GBP, MXN, BRL, CAD, AUD, etc.
}

// ── Helper ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  headers?: Record<string, string>,
  maxRetries = 5,
): Promise<unknown> {
  let retries = 0;
  while (true) {
    const resp = await fetch(url, headers ? { headers } : undefined);

    if (resp.status === 429) {
      const backoff = Math.pow(2, retries) * 1000;
      log.warn({ backoff }, 'Rate limited by Meta, backing off');
      await sleep(backoff);
      retries++;
      if (retries > maxRetries) throw new Error('Max retries exceeded for Meta Ads Creative');
      continue;
    }

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Meta API error: ${resp.status} — ${body}`);
    }

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Meta API returned invalid JSON (status ${resp.status}): ${text.substring(0, 200)}`);
    }
  }
}

// ── Paginated fetch ──────────────────────────────────────────

async function fetchAllPages<T>(
  initialUrl: string,
  headers?: Record<string, string>,
): Promise<T[]> {
  const allData: T[] = [];
  let url: string | undefined = initialUrl;

  while (url) {
    const result = await fetchWithRetry(url, headers) as {
      data: T[];
      paging?: { next?: string };
    };
    allData.push(...result.data);
    url = result.paging?.next;
  }

  return allData;
}

// ── Main fetch function ──────────────────────────────────────

export async function fetchMetaAdCreatives(
  config: MetaAdCreativeConfig,
): Promise<MetaAdCreativeResult> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Meta ad creatives');
    return generateDemoMetaAds();
  }

  const rawId = config.adAccountId.trim().replace(/^act_/, '');
  const accountId = `act_${rawId}`;
  const baseUrl = 'https://graph.facebook.com/v21.0';
  const authHeaders = { Authorization: `Bearer ${config.accessToken}` };

  // 0. Fetch account metadata (currency, timezone)
  log.info('Fetching Meta ad account info');
  const accountFields = 'name,currency,timezone_name';
  const rawAccount = await fetchWithRetry(
    `${baseUrl}/${accountId}?fields=${accountFields}`,
    authHeaders,
  ) as Record<string, unknown>;
  const currency = String(rawAccount.currency ?? 'USD');
  const offset = getCurrencyOffset(currency);
  const accountInfo: MetaAccountInfo = {
    name: String(rawAccount.name ?? accountId),
    currency,
    timezone: String(rawAccount.timezone_name ?? 'America/New_York'),
    currencyOffset: offset,
  };
  log.info({ currency, offset, timezone: accountInfo.timezone }, 'Account info fetched');

  // 1. Fetch campaigns
  log.info('Fetching Meta campaigns');
  const campaignFields = 'id,name,status,effective_status,objective,daily_budget';
  const rawCampaigns = await fetchAllPages<Record<string, unknown>>(
    `${baseUrl}/${accountId}/campaigns?fields=${campaignFields}&limit=500`,
    authHeaders,
  );
  const campaigns: MetaCampaignData[] = rawCampaigns.map((c) => ({
    campaignId: String(c.id),
    name: String(c.name ?? ''),
    status: String(c.effective_status ?? c.status ?? 'UNKNOWN'),
    objective: String(c.objective ?? ''),
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / offset : null, // Meta offset → human-readable
  }));
  log.info({ count: campaigns.length }, 'Fetched campaigns');

  // 2. Fetch ad sets
  log.info('Fetching Meta ad sets');
  const adSetFields = 'id,name,status,effective_status,campaign_id,daily_budget,targeting';
  const rawAdSets = await fetchAllPages<Record<string, unknown>>(
    `${baseUrl}/${accountId}/adsets?fields=${adSetFields}&limit=500`,
    authHeaders,
  );
  const adSets: MetaAdSetData[] = rawAdSets.map((a) => ({
    adSetId: String(a.id),
    campaignId: String(a.campaign_id ?? ''),
    name: String(a.name ?? ''),
    status: String(a.effective_status ?? a.status ?? 'UNKNOWN'),
    dailyBudget: a.daily_budget ? Number(a.daily_budget) / offset : null, // Meta offset → human-readable
    targeting: (a.targeting as Record<string, unknown>) ?? null,
  }));
  log.info({ count: adSets.length }, 'Fetched ad sets');

  // 3. Fetch ads with creative fields
  log.info('Fetching Meta ads with creatives');
  const adFields = 'id,name,status,effective_status,campaign_id,adset_id,created_time,creative{body,title,image_url,thumbnail_url,call_to_action_type,object_type}';
  const rawAds = await fetchAllPages<Record<string, unknown>>(
    `${baseUrl}/${accountId}/ads?fields=${encodeURIComponent(adFields)}&limit=500`,
    authHeaders,
  );
  const ads: MetaAdData[] = rawAds.map((a) => {
    const creative = (a.creative as Record<string, unknown>) ?? {};
    return {
      adId: String(a.id),
      campaignId: String(a.campaign_id ?? ''),
      adSetId: String(a.adset_id ?? ''),
      name: String(a.name ?? ''),
      status: String(a.status ?? 'UNKNOWN'),
      effectiveStatus: String(a.effective_status ?? a.status ?? 'UNKNOWN'),
      createdTime: a.created_time ? String(a.created_time) : null,
      headline: creative.title ? String(creative.title) : null,
      primaryText: creative.body ? String(creative.body) : null,
      description: null,
      imageUrl: creative.image_url ? String(creative.image_url) : null,
      thumbnailUrl: creative.thumbnail_url ? String(creative.thumbnail_url) : null,
      callToAction: creative.call_to_action_type ? String(creative.call_to_action_type) : null,
      creativeType: creative.object_type ? String(creative.object_type) : null,
    };
  });
  log.info({ count: ads.length }, 'Fetched ads with creatives');

  // 4. Fetch insights at ad level — 7d window
  const now = new Date();
  const since7d = format(subDays(now, 7), 'yyyy-MM-dd');
  const until7d = format(subDays(now, 1), 'yyyy-MM-dd');
  log.info({ since: since7d, until: until7d }, 'Fetching 7d ad insights');

  const insightFields = 'ad_id,spend,impressions,clicks,actions,action_values,frequency';
  const rawInsights7d = await fetchAllPages<Record<string, unknown>>(
    `${baseUrl}/${accountId}/insights?fields=${insightFields}&level=ad&time_range={"since":"${since7d}","until":"${until7d}"}&limit=500`,
    authHeaders,
  );
  const insights7d = parseInsights(rawInsights7d);
  log.info({ count: insights7d.length }, 'Fetched 7d insights');

  // 5. Fetch insights at ad level — 14d window (8-14 days ago)
  const since14d = format(subDays(now, 14), 'yyyy-MM-dd');
  const until14d = format(subDays(now, 8), 'yyyy-MM-dd');
  log.info({ since: since14d, until: until14d }, 'Fetching 14d ad insights');

  const rawInsights14d = await fetchAllPages<Record<string, unknown>>(
    `${baseUrl}/${accountId}/insights?fields=${insightFields}&level=ad&time_range={"since":"${since14d}","until":"${until14d}"}&limit=500`,
    authHeaders,
  );
  const insights14d = parseInsights(rawInsights14d);
  log.info({ count: insights14d.length }, 'Fetched 14d insights');

  return { accountInfo, campaigns, adSets, ads, insights7d, insights14d };
}

function parseInsights(raw: Record<string, unknown>[]): MetaAdInsight[] {
  // Group by ad_id (insights may come per-day, we aggregate)
  const byAd = new Map<string, MetaAdInsight>();

  for (const row of raw) {
    const adId = String(row.ad_id ?? '');
    if (!adId) continue;

    const existing = byAd.get(adId) ?? {
      adId,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      roas: null,
      ctr: null,
      cpc: null,
      frequency: null,
    };

    existing.spend += Number(row.spend ?? 0);
    existing.impressions += Number(row.impressions ?? 0);
    existing.clicks += Number(row.clicks ?? 0);

    // Parse actions for purchases
    const actions = (row.actions as Array<{ action_type: string; value: string }>) ?? [];
    const purchaseAction = actions.find((a) => a.action_type === 'purchase');
    if (purchaseAction) existing.conversions += Number(purchaseAction.value);

    // Parse action_values for revenue
    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) ?? [];
    const purchaseValue = actionValues.find((a) => a.action_type === 'purchase');
    if (purchaseValue) existing.revenue += Number(purchaseValue.value);

    // frequency is averaged, take the latest
    if (row.frequency) existing.frequency = Number(row.frequency);

    byAd.set(adId, existing);
  }

  // Compute derived metrics
  for (const insight of byAd.values()) {
    insight.roas = insight.spend > 0 ? Math.round((insight.revenue / insight.spend) * 10000) / 10000 : null;
    insight.ctr = insight.impressions > 0 ? Math.round((insight.clicks / insight.impressions) * 1000000) / 1000000 : null;
    insight.cpc = insight.clicks > 0 ? Math.round((insight.spend / insight.clicks) * 100) / 100 : null;
  }

  return Array.from(byAd.values());
}
