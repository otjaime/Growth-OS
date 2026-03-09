import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionResult } from './meta-executor.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  pauseAd,
  reactivateAd,
  updateAdSetBudget,
  updateCampaignBudget,
  createAdFromVariant,
  createMetaCampaign,
  createProactiveAdSet,
  fetchFacebookPageId,
  fetchEligiblePageId,
  toSmallestUnit,
  activateMetaCampaign,
  pauseMetaCampaign,
  uploadImageToMeta,
} from './meta-executor.js';

const TOKEN = 'EAAtest123';

/** Parse a form-urlencoded body string into a record. */
function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meta-executor', () => {
  describe('pauseAd', () => {
    it('sends PAUSED status via form-urlencoded to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await pauseAd(TOKEN, '123456');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('/123456');
      const body = parseForm(call[1].body as string);
      expect(body.status).toBe('PAUSED');
      expect(body.access_token).toBe(TOKEN);
      // Should NOT use Bearer header — uses access_token as form field
      expect(call[1].headers?.Authorization).toBeUndefined();
      expect(call[1].headers?.['Content-Type'] ?? call[1].headers?.['content-type']).toBe('application/x-www-form-urlencoded');
    });

    it('returns error on Meta API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid ad', code: 100 } }),
      });

      const result = await pauseAd(TOKEN, '123456');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Meta API error');
      expect(result.errorCode).toBe(100);
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await pauseAd(TOKEN, '123456');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
      expect(result.retryable).toBe(true);
    });
  });

  describe('reactivateAd', () => {
    it('sends ACTIVE status via form-urlencoded to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await reactivateAd(TOKEN, '123456');
      expect(result.success).toBe(true);

      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      expect(body.status).toBe('ACTIVE');
      expect(body.access_token).toBe(TOKEN);
    });
  });

  describe('updateAdSetBudget', () => {
    it('sends budget via form-urlencoded to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await updateAdSetBudget(TOKEN, 'adset_123', 5000);
      expect(result.success).toBe(true);

      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      expect(body.daily_budget).toBe('5000');
      expect(body.access_token).toBe(TOKEN);
    });

    it('rejects budgets less than 1', async () => {
      const result = await updateAdSetBudget(TOKEN, 'adset_123', 0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects non-integer budgets', async () => {
      const result = await updateAdSetBudget(TOKEN, 'adset_123', 50.5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateCampaignBudget', () => {
    it('sends budget via form-urlencoded to campaign', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await updateCampaignBudget(TOKEN, 'campaign_123', 10000);
      expect(result.success).toBe(true);

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('/campaign_123');
      const body = parseForm(call[1].body as string);
      expect(body.daily_budget).toBe('10000');
      expect(body.access_token).toBe(TOKEN);
    });

    it('tags response as campaign-level', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await updateCampaignBudget(TOKEN, 'campaign_123', 10000);
      expect(result.success).toBe(true);
      expect((result.metaResponse as Record<string, unknown>).level).toBe('campaign');
    });

    it('rejects budgets less than 1', async () => {
      const result = await updateCampaignBudget(TOKEN, 'campaign_123', 0);
      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createAdFromVariant', () => {
    it('creates creative then ad in two API calls', async () => {
      // First call: create creative (form-urlencoded with object_story_spec JSON)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'creative_789' }),
      });
      // Second call: create ad (form-urlencoded)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ad_101' }),
      });

      const result = await createAdFromVariant(TOKEN, 'act_123', 'adset_456', {
        name: 'Test Variant',
        headline: 'Buy Now',
        primaryText: 'Great product at great prices',
        description: 'Limited time offer',
        linkUrl: 'https://shop.example.com/product',
        pageId: 'page_555',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.metaResponse).toEqual({
        creativeId: 'creative_789',
        adId: 'ad_101',
      });

      // Verify creative call — form-urlencoded with object_story_spec
      const creativeCall = mockFetch.mock.calls[0]!;
      expect(creativeCall[0]).toContain('act_123/adcreatives');
      const creativeBody = parseForm(creativeCall[1].body as string);
      expect(creativeBody.access_token).toBe(TOKEN);
      const storySpec = JSON.parse(creativeBody.object_story_spec ?? '{}');
      expect(storySpec.page_id).toBe('page_555');
      expect(storySpec.link_data.link).toBe('https://shop.example.com/product');
      expect(storySpec.link_data.message).toBe('Great product at great prices');

      // Verify ad call — created PAUSED, uses form-urlencoded
      const adCall = mockFetch.mock.calls[1]!;
      expect(adCall[0]).toContain('act_123/ads');
      const adBody = parseForm(adCall[1].body as string);
      expect(adBody.status).toBe('PAUSED');
      expect(adBody.adset_id).toBe('adset_456');
      expect(adBody.access_token).toBe(TOKEN);
    });

    it('returns error when pageId is missing', async () => {
      const result = await createAdFromVariant(TOKEN, 'act_123', 'adset_456', {
        name: 'Test',
        headline: 'Buy',
        primaryText: 'Great',
        linkUrl: 'https://shop.example.com/product',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Facebook Page ID is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error when linkUrl is missing', async () => {
      const result = await createAdFromVariant(TOKEN, 'act_123', 'adset_456', {
        name: 'Test',
        headline: 'Buy',
        primaryText: 'Great',
        pageId: 'page_555',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No product URL');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error when creative creation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid creative', code: 100 } }),
      });

      const result = await createAdFromVariant(TOKEN, 'act_123', 'adset_456', {
        name: 'Test',
        headline: 'Buy',
        primaryText: 'Great',
        linkUrl: 'https://shop.example.com/product',
        pageId: 'page_555',
      });

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMetaCampaign', () => {
    it('creates campaign with OUTCOME_TRAFFIC and no CBO', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'campaign_999' }),
      });

      const result = await createMetaCampaign(TOKEN, '123456', 'Test Campaign');
      expect(result.success).toBe(true);

      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      expect(body.name).toBe('Test Campaign');
      expect(body.objective).toBe('OUTCOME_TRAFFIC');
      expect(body.status).toBe('PAUSED');
      expect(body.is_adset_budget_sharing_enabled).toBe('false');
      expect(body.special_ad_categories).toBe('[]');
      expect(body.daily_budget).toBeUndefined();
    });

    it('normalizes ad account ID with act_ prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'campaign_999' }),
      });

      await createMetaCampaign(TOKEN, '123456', 'Test');
      expect(mockFetch.mock.calls[0]![0]).toContain('act_123456/campaigns');
    });
  });

  describe('createProactiveAdSet', () => {
    it('creates ad set with LOWEST_COST_WITHOUT_CAP bid strategy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'adset_888' }),
      });

      const result = await createProactiveAdSet(TOKEN, '123456', 'campaign_999', 'Test Product', 5000);
      expect(result.success).toBe(true);

      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      expect(body.campaign_id).toBe('campaign_999');
      expect(body.daily_budget).toBe('5000');
      expect(body.bid_strategy).toBe('LOWEST_COST_WITHOUT_CAP');
      expect(body.billing_event).toBe('IMPRESSIONS');
      expect(body.optimization_goal).toBe('LINK_CLICKS');
      expect(body.status).toBe('PAUSED');
    });

    it('uses OFFSITE_CONVERSIONS with pixel and promoted_object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'adset_888' }),
      });

      await createProactiveAdSet(TOKEN, '123456', 'campaign_999', 'Test', 5000, undefined, 'pixel_777');
      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      expect(body.optimization_goal).toBe('OFFSITE_CONVERSIONS');
      const promotedObj = JSON.parse(body.promoted_object ?? '{}');
      expect(promotedObj.pixel_id).toBe('pixel_777');
    });

    it('uses custom targeting when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'adset_888' }),
      });

      await createProactiveAdSet(TOKEN, '123456', 'campaign_999', 'Test', 5000, {
        countries: ['CL'],
        ageMin: 25,
        ageMax: 55,
      });
      const body = parseForm(mockFetch.mock.calls[0]![1].body as string);
      const targeting = JSON.parse(body.targeting ?? '{}');
      expect(targeting.geo_locations.countries).toEqual(['CL']);
      expect(targeting.age_min).toBe(25);
      expect(targeting.age_max).toBe(55);
    });

    it('rejects invalid budgets', async () => {
      const result = await createProactiveAdSet(TOKEN, '123456', 'campaign_999', 'Test', 0);
      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchFacebookPageId', () => {
    it('returns page ID from /me/accounts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_123', name: 'My Page' }] }),
      });

      const pageId = await fetchFacebookPageId(TOKEN);
      expect(pageId).toBe('page_123');
      expect(mockFetch.mock.calls[0]![0]).toContain('/me/accounts');
    });

    it('returns undefined when no pages found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const pageId = await fetchFacebookPageId(TOKEN);
      expect(pageId).toBeUndefined();
    });

    it('returns undefined on API error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const pageId = await fetchFacebookPageId(TOKEN);
      expect(pageId).toBeUndefined();
    });
  });

  describe('fetchEligiblePageId', () => {
    /** Helper: mock the first call (existing ads query) to return no results. */
    function mockNoActiveAds(): void {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
    }

    it('returns page from existing ads via object_story_spec (Strategy 0) — highest priority', async () => {
      // Active ads endpoint returns an ad with page_id
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ creative: { object_story_spec: { page_id: 'page_from_ad' } } }],
        }),
      });
      // Page name lookup
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Mr Pork Active' }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_from_ad', pageName: 'Mr Pork Active' });
      expect(mockFetch.mock.calls[0]![0]).toContain('/ads?');
      // URL should contain properly encoded effective_status
      expect(mockFetch.mock.calls[0]![0]).toContain('effective_status=');
    });

    it('falls back to effective_object_story_spec when object_story_spec is missing (Strategy 0)', async () => {
      // Active ads endpoint returns an ad with effective_object_story_spec only
      // (happens when system user lacks page permissions for object_story_spec)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ creative: { effective_object_story_spec: { page_id: 'page_effective' } } }],
        }),
      });
      // Page name lookup
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Mr Pork Effective' }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_effective', pageName: 'Mr Pork Effective' });
    });

    it('returns Unknown pageName when page name lookup fails (Strategy 0)', async () => {
      // Active ads endpoint returns an ad with page_id
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ creative: { object_story_spec: { page_id: 'page_no_name' } } }],
        }),
      });
      // Page name lookup fails (e.g. system user lacks page permissions)
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_no_name', pageName: 'Unknown' });
    });

    it('returns page from promote_pages when no active ads exist', async () => {
      mockNoActiveAds();
      // promote_pages returns a published page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_eligible', name: 'Eligible Page', is_published: true }] }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_eligible', pageName: 'Eligible Page' });
    });

    it('prefers published pages from promote_pages over unpublished ones', async () => {
      mockNoActiveAds();
      // promote_pages returns both restricted (unpublished) and active (published) pages
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'page_restricted', name: 'MrPork.cl', is_published: false },
            { id: 'page_good', name: 'Mr Pork', is_published: true },
          ],
        }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_good', pageName: 'Mr Pork' });
    });

    it('falls back to /me/accounts when promote_pages returns empty', async () => {
      mockNoActiveAds();
      // promote_pages returns empty
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
      // /me/accounts returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_fallback', name: 'Fallback Page', is_published: true }] }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_fallback', pageName: 'Fallback Page' });
    });

    it('falls back to /me/accounts when promote_pages request fails', async () => {
      mockNoActiveAds();
      // promote_pages fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      // /me/accounts returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_fb', name: 'FB Page' }] }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_fb', pageName: 'FB Page' });
    });

    it('returns undefined when all strategies return empty', async () => {
      mockNoActiveAds();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toBeUndefined();
    });

    it('normalizes ad account ID with act_ prefix', async () => {
      mockNoActiveAds();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_999', name: 'Test Page', is_published: true }] }),
      });

      await fetchEligiblePageId(TOKEN, 'act_123456');
      // First call is the ads query, second is promote_pages
      expect(mockFetch.mock.calls[1]![0]).toContain('act_123456/promote_pages');
      expect(mockFetch.mock.calls[1]![0]).not.toContain('act_act_');
    });

    it('defaults pageName to Unknown when name is missing', async () => {
      mockNoActiveAds();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'page_noname' }] }),
      });

      const result = await fetchEligiblePageId(TOKEN, '111606408422861');
      expect(result).toEqual({ pageId: 'page_noname', pageName: 'Unknown' });
    });
  });

  describe('toSmallestUnit', () => {
    it('converts USD to cents', () => {
      expect(toSmallestUnit(50, 'USD')).toBe(5000);
      expect(toSmallestUnit(5.99, 'USD')).toBe(599);
    });

    it('keeps CLP as-is (zero-decimal)', () => {
      expect(toSmallestUnit(5000, 'CLP')).toBe(5000);
      expect(toSmallestUnit(50, 'CLP')).toBe(50);
    });

    it('keeps JPY as-is (zero-decimal)', () => {
      expect(toSmallestUnit(1000, 'JPY')).toBe(1000);
    });

    it('is case-insensitive for currency', () => {
      expect(toSmallestUnit(100, 'clp')).toBe(100);
      expect(toSmallestUnit(100, 'usd')).toBe(10000);
    });
  });

  describe('activateMetaCampaign', () => {
    it('activates ads, then ad sets, then campaign (bottom-up)', async () => {
      // 2 ads + 1 ad set + 1 campaign = 4 calls, all succeed
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await activateMetaCampaign(
        TOKEN,
        'campaign_1',
        ['adset_1', 'adset_2'],
        ['ad_1', 'ad_2', 'ad_3'],
      );

      expect(result.success).toBe(true);
      // 3 ads + 2 ad sets + 1 campaign = 6 calls
      expect(mockFetch).toHaveBeenCalledTimes(6);

      // Verify order: ads first, then ad sets, then campaign
      const calls = mockFetch.mock.calls;
      // Calls 0-2: ads → ACTIVE
      for (let i = 0; i < 3; i++) {
        const body = parseForm(calls[i]![1].body as string);
        expect(body.status).toBe('ACTIVE');
      }
      // Call 3-4: ad sets → ACTIVE
      expect(calls[3]![0]).toContain('adset_1');
      expect(calls[4]![0]).toContain('adset_2');
      // Call 5: campaign → ACTIVE
      expect(calls[5]![0]).toContain('campaign_1');
    });

    it('returns error if campaign activation fails', async () => {
      // Ads and ad sets succeed, campaign fails
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // ad
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // ad set
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Campaign error', code: 100 } }) }); // campaign

      const result = await activateMetaCampaign(TOKEN, 'campaign_1', ['adset_1'], ['ad_1']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to activate campaign');
    });

    it('continues with warnings if some ads fail to activate', async () => {
      mockFetch
        // ad_1 fails
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'Ad error', code: 100 } }) })
        // ad_2 succeeds
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
        // ad set succeeds
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
        // campaign succeeds
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      const result = await activateMetaCampaign(TOKEN, 'campaign_1', ['adset_1'], ['ad_1', 'ad_2']);
      expect(result.success).toBe(true);
      const response = result.metaResponse as Record<string, unknown>;
      expect(response.warnings).toBeDefined();
      expect((response.warnings as string[])[0]).toContain('ad_1');
    });

    it('works with empty ad lists', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

      const result = await activateMetaCampaign(TOKEN, 'campaign_1', [], []);
      expect(result.success).toBe(true);
      // Only 1 call (campaign)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('pauseMetaCampaign', () => {
    it('pauses campaign then ad sets (top-down)', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

      const result = await pauseMetaCampaign(TOKEN, 'campaign_1', ['adset_1', 'adset_2']);
      expect(result.success).toBe(true);
      // 1 campaign + 2 ad sets = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify order: campaign first, then ad sets
      const calls = mockFetch.mock.calls;
      expect(calls[0]![0]).toContain('campaign_1');
      const body0 = parseForm(calls[0]![1].body as string);
      expect(body0.status).toBe('PAUSED');

      expect(calls[1]![0]).toContain('adset_1');
      expect(calls[2]![0]).toContain('adset_2');
    });

    it('returns error if campaign pause fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Cannot pause', code: 100 } }),
      });
      // Ad sets still attempted
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

      const result = await pauseMetaCampaign(TOKEN, 'campaign_1', ['adset_1']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to pause campaign on Meta');
    });
  });

  describe('Meta error classification', () => {
    it('marks rate limit (code 32) as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit', code: 32 } }),
      });

      const result = await pauseAd(TOKEN, '123');
      expect(result.retryable).toBe(true);
    });

    it('marks expired token (code 190) as not retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Token expired', code: 190 } }),
      });

      const result = await pauseAd(TOKEN, '123');
      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe(190);
    });

    it('marks permission error (code 200) as not retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied', code: 200 } }),
      });

      const result = await pauseAd(TOKEN, '123');
      expect(result.retryable).toBe(false);
    });

    it('marks temporary error (code 2) as retryable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Temporary', code: 2 } }),
      });

      const result = await pauseAd(TOKEN, '123');
      expect(result.retryable).toBe(true);
    });

    it('includes subcode in permission error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied', code: 200, error_subcode: 4841013 } }),
      });

      const result = await pauseAd(TOKEN, '123');
      expect(result.error).toContain('4841013');
    });
  });

  describe('uploadImageToMeta', () => {
    it('uploads an image by URL and returns image hash', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: { 'image.jpg': { hash: 'abc123hash' } },
        }),
      });

      const result = await uploadImageToMeta(TOKEN, '12345', 'https://cdn.example.com/product.jpg');

      expect(result.success).toBe(true);
      expect(result.imageHash).toBe('abc123hash');

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('act_12345/adimages');
      const body = parseForm(call[1].body);
      expect(body.url).toBe('https://cdn.example.com/product.jpg');
      expect(body.access_token).toBe(TOKEN);
    });

    it('returns error when Meta API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid image URL', code: 100 } }),
      });

      const result = await uploadImageToMeta(TOKEN, '12345', 'https://bad-url.com/img.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Image upload failed');
    });

    it('returns error when no image hash in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: {} }),
      });

      const result = await uploadImageToMeta(TOKEN, '12345', 'https://cdn.example.com/product.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('no hash returned');
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await uploadImageToMeta(TOKEN, '12345', 'https://cdn.example.com/product.jpg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('normalizes ad account ID to include act_ prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: { 'img.jpg': { hash: 'xyz789' } },
        }),
      });

      await uploadImageToMeta(TOKEN, 'act_67890', 'https://cdn.example.com/product.jpg');

      const call = mockFetch.mock.calls[0]!;
      // Should NOT double-prefix: act_act_67890
      expect(call[0]).toContain('act_67890/adimages');
      expect(call[0]).not.toContain('act_act_');
    });
  });
});
