import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionResult } from './meta-executor.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  pauseAd,
  reactivateAd,
  updateAdSetBudget,
  createAdFromVariant,
} from './meta-executor.js';

const TOKEN = 'EAAtest123';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meta-executor', () => {
  describe('pauseAd', () => {
    it('sends PAUSED status to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await pauseAd(TOKEN, '123456');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('/123456');
      const body = JSON.parse(call[1].body as string);
      expect(body.status).toBe('PAUSED');
      expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
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
    it('sends ACTIVE status to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await reactivateAd(TOKEN, '123456');
      expect(result.success).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.status).toBe('ACTIVE');
    });
  });

  describe('updateAdSetBudget', () => {
    it('sends budget in cents to Meta API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await updateAdSetBudget(TOKEN, 'adset_123', 5000);
      expect(result.success).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
      expect(body.daily_budget).toBe(5000);
    });

    it('rejects budgets less than 100 cents', async () => {
      const result = await updateAdSetBudget(TOKEN, 'adset_123', 50);
      expect(result.success).toBe(false);
      expect(result.error).toContain('>= 100');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects non-integer budgets', async () => {
      const result = await updateAdSetBudget(TOKEN, 'adset_123', 50.5);
      expect(result.success).toBe(false);
      expect(result.error).toContain('integer');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createAdFromVariant', () => {
    it('creates creative then ad in two API calls', async () => {
      // First call: create creative
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'creative_789' }),
      });
      // Second call: create ad
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ad_101' }),
      });

      const result = await createAdFromVariant(TOKEN, 'act_123', 'adset_456', {
        name: 'Test Variant',
        headline: 'Buy Now',
        primaryText: 'Great product at great prices',
        description: 'Limited time offer',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.metaResponse).toEqual({
        creativeId: 'creative_789',
        adId: 'ad_101',
      });

      // Verify creative call
      const creativeCall = mockFetch.mock.calls[0]!;
      expect(creativeCall[0]).toContain('act_123/adcreatives');

      // Verify ad call — created PAUSED
      const adCall = mockFetch.mock.calls[1]!;
      expect(adCall[0]).toContain('act_123/ads');
      const adBody = JSON.parse(adCall[1].body as string);
      expect(adBody.status).toBe('PAUSED');
      expect(adBody.adset_id).toBe('adset_456');
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
      });

      expect(result.success).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);
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
  });
});
