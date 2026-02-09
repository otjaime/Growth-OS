// ──────────────────────────────────────────────────────────────
// Growth OS — Connector Contract Tests
// Verifies that connector functions handle API responses correctly
// Uses mock fetch (no real API calls)
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ShopifyConfig, MetaConfig, GoogleAdsConfig, GA4Config } from '../types.js';

describe('Shopify Connector', () => {
  describe('demo mode', () => {
    it('returns mock records without API call', async () => {
      const { fetchShopifyOrders } = await import('./shopify.js');
      const config: ShopifyConfig = {
        source: 'shopify',
        isDemoMode: true,
        shopDomain: 'test.myshopify.com',
        accessToken: 'fake-token',
      };
      const result = await fetchShopifyOrders(config);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records[0]!.source).toBe('shopify');
      expect(result.records[0]!.entity).toBe('order');
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('live mode (mocked fetch)', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('handles 429 rate limit with retry', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return new Response(JSON.stringify({
          data: {
            orders: {
              edges: [{
                cursor: 'c1',
                node: {
                  id: 'gid://shopify/Order/1',
                  name: '#1001',
                  createdAt: '2025-01-01T00:00:00Z',
                  totalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'USD' } },
                  subtotalPriceSet: { shopMoney: { amount: '90.00', currencyCode: 'USD' } },
                  totalDiscountsSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } },
                  customer: { id: 'gid://shopify/Customer/1', email: 'test@test.com' },
                  lineItems: { edges: [] },
                },
              }],
              pageInfo: { hasNextPage: false },
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const { fetchShopifyOrders } = await import('./shopify.js');
      const config: ShopifyConfig = {
        source: 'shopify',
        isDemoMode: false,
        shopDomain: 'test.myshopify.com',
        accessToken: 'real-token',
      };
      const result = await fetchShopifyOrders(config);
      expect(callCount).toBe(2);
      expect(result.records.length).toBe(1);
    });

    it('throws on non-429 error', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response('Server Error', { status: 500 });
      }) as typeof fetch;

      const { fetchShopifyOrders } = await import('./shopify.js');
      const config: ShopifyConfig = {
        source: 'shopify',
        isDemoMode: false,
        shopDomain: 'test.myshopify.com',
        accessToken: 'real-token',
      };

      await expect(fetchShopifyOrders(config)).rejects.toThrow('Shopify API error');
    });
  });
});

describe('Meta Connector', () => {
  describe('demo mode', () => {
    it('returns mock records without API call', async () => {
      const { fetchMetaInsights } = await import('./meta.js');
      const config: MetaConfig = {
        source: 'meta',
        isDemoMode: true,
        accessToken: 'fake',
        adAccountId: 'act_123',
      };
      const result = await fetchMetaInsights(config);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records[0]!.source).toBe('meta');
      expect(result.records[0]!.entity).toBe('campaign_insight');
    });
  });
});

describe('Google Ads Connector', () => {
  describe('demo mode', () => {
    it('returns mock records without API call', async () => {
      const { fetchGoogleAdsInsights } = await import('./google-ads.js');
      const config: GoogleAdsConfig = {
        source: 'google_ads',
        isDemoMode: true,
        accessToken: 'fake',
        refreshToken: 'fake',
        clientId: 'fake',
        clientSecret: 'fake',
        customerId: '123',
        developerToken: 'fake',
      };
      const result = await fetchGoogleAdsInsights(config);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records[0]!.source).toBe('google_ads');
    });
  });
});

describe('GA4 Connector', () => {
  describe('demo mode', () => {
    it('returns mock records without API call', async () => {
      const { fetchGA4Traffic } = await import('./ga4.js');
      const config: GA4Config = {
        source: 'ga4',
        isDemoMode: true,
        accessToken: 'fake',
        refreshToken: 'fake',
        clientId: 'fake',
        clientSecret: 'fake',
        propertyId: '123',
      };
      const result = await fetchGA4Traffic(config);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records[0]!.source).toBe('ga4');
      expect(result.records[0]!.entity).toBe('traffic');
    });
  });
});
