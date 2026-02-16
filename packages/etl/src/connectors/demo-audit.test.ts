// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Data Audit Tests
// Validates consistency and correctness of generated demo data
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateAllDemoData, createContext, generateCustomers } from './demo-generator.js';

const data = generateAllDemoData();

describe('Demo Data Audit', () => {
  it('generates exactly 2400 customers', () => {
    const ctx = createContext();
    generateCustomers(ctx, 2400);
    expect(ctx.customers).toHaveLength(2400);
  });

  it('Stripe charge count equals order count', () => {
    expect(data.stripeCharges.length).toBe(data.orders.length);
  });

  it('GA4 funnel is monotonically decreasing per day', () => {
    // Group by date
    const byDate = new Map<string, { sessions: number; pdp: number; atc: number; checkouts: number; purchases: number }>();
    for (const r of data.ga4Traffic) {
      const p = r.payload as Record<string, unknown>;
      const date = p.date as string;
      const existing = byDate.get(date) ?? { sessions: 0, pdp: 0, atc: 0, checkouts: 0, purchases: 0 };
      existing.sessions += parseInt(p.sessions as string);
      existing.pdp += parseInt(p.itemViews as string);
      existing.atc += parseInt(p.addToCarts as string);
      existing.checkouts += parseInt(p.checkouts as string);
      existing.purchases += parseInt(p.ecommercePurchases as string);
      byDate.set(date, existing);
    }

    for (const [, funnel] of byDate) {
      expect(funnel.sessions).toBeGreaterThanOrEqual(funnel.pdp);
      expect(funnel.pdp).toBeGreaterThanOrEqual(funnel.atc);
      expect(funnel.atc).toBeGreaterThanOrEqual(funnel.checkouts);
      expect(funnel.checkouts).toBeGreaterThanOrEqual(funnel.purchases);
    }
  });

  it('email open rate <= 100% and click rate <= open rate for all campaigns', () => {
    for (const r of [...data.klaviyoCampaigns, ...data.klaviyoFlows]) {
      const p = r.payload as Record<string, unknown>;
      const stats = p.stats as Record<string, unknown>;
      const sends = stats.sends as number;
      const opens = stats.unique_opens as number;
      const clicks = stats.unique_clicks as number;
      if (sends > 0) {
        expect(opens).toBeLessThanOrEqual(sends);
        expect(clicks).toBeLessThanOrEqual(opens);
      }
    }
  });

  it('all order dates fall within DEMO_DAYS window', () => {
    const DEMO_DAYS = parseInt(process.env.DEMO_DAYS ?? '180', 10);
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - DEMO_DAYS);

    for (const r of data.orders) {
      const p = r.payload as Record<string, unknown>;
      const orderDate = new Date(p.created_at as string);
      expect(orderDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime() - 86400000); // 1 day tolerance
      expect(orderDate.getTime()).toBeLessThanOrEqual(endDate.getTime() + 86400000);
    }
  });

  it('revenue shows positive growth trend (last 30d avg > first 30d avg)', () => {
    // Sort orders by date
    const ordersByDate = new Map<string, number>();
    for (const r of data.orders) {
      const p = r.payload as Record<string, unknown>;
      const date = (p.created_at as string).slice(0, 10);
      const rev = parseFloat(p.total_price as string);
      ordersByDate.set(date, (ordersByDate.get(date) ?? 0) + rev);
    }

    const dates = [...ordersByDate.keys()].sort();
    if (dates.length < 60) return; // Skip if too few dates

    const first30 = dates.slice(0, 30);
    const last30 = dates.slice(-30);
    const avgFirst = first30.reduce((sum, d) => sum + (ordersByDate.get(d) ?? 0), 0) / 30;
    const avgLast = last30.reduce((sum, d) => sum + (ordersByDate.get(d) ?? 0), 0) / 30;

    expect(avgLast).toBeGreaterThan(avgFirst);
  });

  it('no negative spend or revenue values in ad data', () => {
    // Check Meta
    for (const r of data.metaInsights) {
      const p = r.payload as Record<string, unknown>;
      expect(parseFloat(p.spend as string)).toBeGreaterThanOrEqual(0);
    }
    // Check Google
    for (const r of data.googleAdsInsights) {
      const p = r.payload as Record<string, unknown>;
      const metrics = p.metrics as Record<string, unknown>;
      expect(parseInt(metrics.costMicros as string)).toBeGreaterThanOrEqual(0);
    }
    // Check TikTok
    for (const r of data.tiktokInsights) {
      const p = r.payload as Record<string, unknown>;
      expect(parseFloat(p.spend as string)).toBeGreaterThanOrEqual(0);
    }
  });

  it('Stripe refund count is less than charge count', () => {
    expect(data.stripeRefunds.length).toBeLessThan(data.stripeCharges.length);
  });

  it('TikTok has exactly 3 campaigns', () => {
    const campaignIds = new Set<string>();
    for (const r of data.tiktokInsights) {
      const p = r.payload as Record<string, unknown>;
      campaignIds.add(p.campaign_id as string);
    }
    expect(campaignIds.size).toBe(3);
  });

  it('Stripe charge amounts match Shopify order amounts', () => {
    // Since charges are now generated from orders, amounts should correspond
    // (charge amount = order total_price * 100 in cents)
    for (let i = 0; i < Math.min(100, data.orders.length); i++) {
      const orderPayload = data.orders[i]!.payload as Record<string, unknown>;
      const chargePayload = data.stripeCharges[i]!.payload as Record<string, unknown>;
      const orderTotal = parseFloat(orderPayload.total_price as string);
      const chargeAmount = chargePayload.amount as number;
      expect(chargeAmount).toBe(Math.round(orderTotal * 100));
    }
  });
});
