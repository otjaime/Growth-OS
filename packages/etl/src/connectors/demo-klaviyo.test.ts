// ──────────────────────────────────────────────────────────────
// Growth OS — Klaviyo Demo Data Generator Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateKlaviyoCampaigns, generateKlaviyoFlows } from './demo-klaviyo.js';
import { createContext, generateCustomers } from './demo-generator.js';

function makeCtx() {
  const ctx = createContext();
  generateCustomers(ctx, 100);
  return ctx;
}

describe('generateKlaviyoCampaigns', () => {
  it('returns deterministic output with same context', () => {
    const r1 = generateKlaviyoCampaigns(makeCtx());
    const r2 = generateKlaviyoCampaigns(makeCtx());
    expect(r1.length).toBe(r2.length);
    expect(r1[0]!.externalId).toBe(r2[0]!.externalId);
  });

  it('generates campaigns only on Tuesdays and Thursdays', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    for (const r of records) {
      // cursor is formatted as 'yyyy-MM-dd' which parses as UTC midnight
      const date = new Date(r.cursor!);
      const dayOfWeek = date.getUTCDay();
      expect([2, 4]).toContain(dayOfWeek);
    }
  });

  it('all records have source=klaviyo and entity=campaigns', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    for (const r of records) {
      expect(r.source).toBe('klaviyo');
      expect(r.entity).toBe('campaigns');
    }
  });

  it('payload has campaign_type=campaign', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    for (const r of records) {
      expect((r.payload as Record<string, unknown>).campaign_type).toBe('campaign');
    }
  });

  it('payload stats have correct structure', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    const first = records[0]!;
    const payload = first.payload as Record<string, unknown>;
    const stats = payload.stats as Record<string, unknown>;

    expect(stats).toHaveProperty('sends');
    expect(stats).toHaveProperty('opens');
    expect(stats).toHaveProperty('clicks');
    expect(stats).toHaveProperty('bounces');
    expect(stats).toHaveProperty('unsubscribes');
    expect(stats).toHaveProperty('conversions');
    expect(stats).toHaveProperty('revenue');
  });

  it('sends > 0 for all campaigns', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    for (const r of records) {
      const stats = (r.payload as Record<string, unknown>).stats as Record<string, number>;
      expect(stats.sends).toBeGreaterThan(0);
    }
  });

  it('generates roughly 2 campaigns per week', () => {
    const records = generateKlaviyoCampaigns(makeCtx());
    // 180 days ≈ 26 weeks → ~52 campaigns (2 per week)
    expect(records.length).toBeGreaterThan(40);
    expect(records.length).toBeLessThan(60);
  });
});

describe('generateKlaviyoFlows', () => {
  it('returns deterministic output with same context', () => {
    const r1 = generateKlaviyoFlows(makeCtx());
    const r2 = generateKlaviyoFlows(makeCtx());
    expect(r1.length).toBe(r2.length);
    expect(r1[0]!.externalId).toBe(r2[0]!.externalId);
  });

  it('generates 5 flows × 181 days of records', () => {
    const records = generateKlaviyoFlows(makeCtx());
    // 5 flows × 181 days
    expect(records.length).toBe(5 * 181);
  });

  it('all records have source=klaviyo and entity=flows', () => {
    const records = generateKlaviyoFlows(makeCtx());
    for (const r of records) {
      expect(r.source).toBe('klaviyo');
      expect(r.entity).toBe('flows');
    }
  });

  it('payload has campaign_type=flow', () => {
    const records = generateKlaviyoFlows(makeCtx());
    for (const r of records) {
      expect((r.payload as Record<string, unknown>).campaign_type).toBe('flow');
    }
  });

  it('has 5 distinct flow IDs', () => {
    const records = generateKlaviyoFlows(makeCtx());
    const flowIds = new Set(records.map((r) => (r.payload as Record<string, unknown>).id));
    expect(flowIds.size).toBe(5);
  });

  it('generates unique externalIds', () => {
    const records = generateKlaviyoFlows(makeCtx());
    const ids = records.map((r) => r.externalId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
