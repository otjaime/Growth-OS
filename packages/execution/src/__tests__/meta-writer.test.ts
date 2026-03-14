import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaAdExecutor } from '../meta-writer.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MetaAdExecutor', () => {
  let executor: MetaAdExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new MetaAdExecutor('test-token', 'act_12345');
  });

  describe('pauseCampaign', () => {
    it('returns success when API responds ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await executor.pauseCampaign('camp_123');
      expect(result).toEqual({ success: true });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('v21.0/camp_123');
      expect(options.method).toBe('POST');
      const body = new URLSearchParams(options.body as string);
      expect(body.get('status')).toBe('PAUSED');
      expect(body.get('access_token')).toBe('test-token');
    });

    it('returns error when API responds with error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid campaign ID' } }),
      });

      const result = await executor.pauseCampaign('camp_bad');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid campaign ID');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await executor.pauseCampaign('camp_123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('handles non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await executor.pauseCampaign('camp_123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('scaleBudget', () => {
    it('posts daily_budget in cents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await executor.scaleBudget('camp_123', 50.75);
      expect(result).toEqual({ success: true });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(options.body as string);
      expect(body.get('daily_budget')).toBe('5075');
    });

    it('returns error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Insufficient permissions' } }),
      });

      const result = await executor.scaleBudget('camp_123', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions');
    });

    it('returns error on exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await executor.scaleBudget('camp_123', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('getCampaignMetrics', () => {
    it('parses insights response correctly', async () => {
      // First call: insights
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              spend: '150.50',
              impressions: '10000',
              clicks: '500',
              actions: [
                { action_type: 'offsite_conversion.fb_pixel_purchase', value: '25' },
                { action_type: 'link_click', value: '500' },
              ],
              action_values: [
                { action_type: 'offsite_conversion.fb_pixel_purchase', value: '750.00' },
              ],
            },
          ],
        }),
      });
      // Second call: created_time
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          created_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const metrics = await executor.getCampaignMetrics('camp_123');

      expect(metrics.spend).toBeCloseTo(150.5);
      expect(metrics.impressions).toBe(10000);
      expect(metrics.clicks).toBe(500);
      expect(metrics.conversions).toBe(25);
      expect(metrics.revenue).toBe(750);
      expect(metrics.roas).toBeCloseTo(750 / 150.5, 2);
      expect(metrics.ctr).toBeCloseTo(500 / 10000, 4);
      expect(metrics.cvr).toBeCloseTo(25 / 500, 4);
      expect(metrics.daysRunning).toBe(5);
    });

    it('returns zeros when no data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const metrics = await executor.getCampaignMetrics('camp_empty');

      expect(metrics.spend).toBe(0);
      expect(metrics.revenue).toBe(0);
      expect(metrics.roas).toBe(0);
      expect(metrics.conversions).toBe(0);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal server error' } }),
      });

      await expect(executor.getCampaignMetrics('camp_err')).rejects.toThrow('Meta API error');
    });
  });
});
