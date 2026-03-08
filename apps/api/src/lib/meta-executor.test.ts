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
  toSmallestUnit,
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
});
