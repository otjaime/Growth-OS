// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Data Generator Tests
// Ensures deterministic generation + data shape correctness
// ──────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateShopifyOrders,
  generateShopifyCustomers,
  generateMetaInsights,
  generateGoogleAdsInsights,
  generateGA4Traffic,
  generateAllDemoData,
} from './demo-generator.js';

describe('Demo Data Generator', () => {
  describe('deterministic output', () => {
    it('produces the same data on consecutive runs', () => {
      const run1 = generateAllDemoData();
      const run2 = generateAllDemoData();
      expect(run1.orders.length).toBe(run2.orders.length);
      expect(run1.customers.length).toBe(run2.customers.length);
      expect(run1.metaInsights.length).toBe(run2.metaInsights.length);
      expect(run1.googleAdsInsights.length).toBe(run2.googleAdsInsights.length);
      expect(run1.ga4Traffic.length).toBe(run2.ga4Traffic.length);
    });

    it('produces identical first-record payloads across runs', () => {
      const run1 = generateAllDemoData();
      const run2 = generateAllDemoData();
      // Verify actual payload values match, not just counts
      expect(run1.orders[0]!.payload).toEqual(run2.orders[0]!.payload);
      expect(run1.customers[0]!.payload).toEqual(run2.customers[0]!.payload);
      expect(run1.metaInsights[0]!.payload).toEqual(run2.metaInsights[0]!.payload);
      expect(run1.googleAdsInsights[0]!.payload).toEqual(run2.googleAdsInsights[0]!.payload);
      expect(run1.ga4Traffic[0]!.payload).toEqual(run2.ga4Traffic[0]!.payload);
    });

    it('produces identical last-record payloads across runs', () => {
      const run1 = generateAllDemoData();
      const run2 = generateAllDemoData();
      const lastIdx = run1.orders.length - 1;
      expect(run1.orders[lastIdx]!.externalId).toBe(run2.orders[lastIdx]!.externalId);
      expect(run1.orders[lastIdx]!.payload).toEqual(run2.orders[lastIdx]!.payload);
    });
  });

  describe('generateShopifyOrders', () => {
    it('returns RawRecord array', () => {
      const records = generateShopifyOrders();
      expect(records.length).toBeGreaterThan(100);
      expect(records[0]!.source).toBe('shopify');
      expect(records[0]!.entity).toBe('orders');
    });

    it('has required payload fields', () => {
      const records = generateShopifyOrders();
      const payload = records[0]!.payload;
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('total_price');
      expect(payload).toHaveProperty('created_at');
      expect(payload).toHaveProperty('line_items');
    });

    it('has positive order values', () => {
      const records = generateShopifyOrders();
      for (const r of records.slice(0, 50)) {
        expect(Number(r.payload.total_price)).toBeGreaterThan(0);
      }
    });
  });

  describe('generateShopifyCustomers', () => {
    it('returns customer records', () => {
      const records = generateShopifyCustomers();
      expect(records.length).toBeGreaterThan(100);
      expect(records[0]!.source).toBe('shopify');
      expect(records[0]!.entity).toBe('customers');
    });

    it('has required payload fields', () => {
      const payload = generateShopifyCustomers()[0]!.payload;
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('first_name');
      expect(payload).toHaveProperty('last_name');
    });
  });

  describe('generateMetaInsights', () => {
    it('returns Meta campaign insights', () => {
      const records = generateMetaInsights();
      expect(records.length).toBeGreaterThan(0);
      expect(records[0]!.source).toBe('meta');
      expect(records[0]!.entity).toBe('insights');
    });

    it('has required payload fields', () => {
      const payload = generateMetaInsights()[0]!.payload;
      expect(payload).toHaveProperty('campaign_id');
      expect(payload).toHaveProperty('campaign_name');
      expect(payload).toHaveProperty('spend');
      expect(payload).toHaveProperty('impressions');
      expect(payload).toHaveProperty('clicks');
      expect(payload).toHaveProperty('date_start');
    });

    it('has non-negative spend values', () => {
      const records = generateMetaInsights();
      for (const r of records.slice(0, 50)) {
        expect(Number(r.payload.spend)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('generateGoogleAdsInsights', () => {
    it('returns Google Ads campaign insights', () => {
      const records = generateGoogleAdsInsights();
      expect(records.length).toBeGreaterThan(0);
      expect(records[0]!.source).toBe('google_ads');
      expect(records[0]!.entity).toBe('campaign_performance');
    });

    it('has required payload fields', () => {
      const payload = generateGoogleAdsInsights()[0]!.payload;
      expect(payload).toHaveProperty('campaign');
      expect(payload).toHaveProperty('segments');
      expect(payload).toHaveProperty('metrics');
    });
  });

  describe('generateGA4Traffic', () => {
    it('returns GA4 traffic records', () => {
      const records = generateGA4Traffic();
      expect(records.length).toBeGreaterThan(0);
      expect(records[0]!.source).toBe('ga4');
      expect(records[0]!.entity).toBe('traffic');
    });

    it('has required payload fields', () => {
      const payload = generateGA4Traffic()[0]!.payload;
      expect(payload).toHaveProperty('date');
      expect(payload).toHaveProperty('sessionDefaultChannelGroup');
      expect(payload).toHaveProperty('sessions');
    });
  });

  describe('generateAllDemoData', () => {
    it('returns all data types', () => {
      const data = generateAllDemoData();
      expect(data).toHaveProperty('orders');
      expect(data).toHaveProperty('customers');
      expect(data).toHaveProperty('metaInsights');
      expect(data).toHaveProperty('googleAdsInsights');
      expect(data).toHaveProperty('ga4Traffic');
    });

    it('generates realistic volume', () => {
      const data = generateAllDemoData();
      // 2400 customers + ~500 pre-scheduled repeats ≈ 2900
      expect(data.orders.length).toBeGreaterThan(2500);
      expect(data.customers.length).toBeGreaterThan(1000);
      // 4 Meta campaigns * 180 days = 720
      expect(data.metaInsights.length).toBeGreaterThanOrEqual(700);
      // 4 Google Ads campaigns * 180 days = 720
      expect(data.googleAdsInsights.length).toBeGreaterThanOrEqual(700);
      // 6 channel groups * 180 days = 1080
      expect(data.ga4Traffic.length).toBeGreaterThanOrEqual(1000);
    });
  });
});


