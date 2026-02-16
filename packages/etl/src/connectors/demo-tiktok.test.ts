// ──────────────────────────────────────────────────────────────
// Growth OS — TikTok Demo Data Generator Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateTikTokInsights } from './demo-tiktok.js';
import { createContext, generateCustomers } from './demo-generator.js';

function makeCtx() {
  const ctx = createContext();
  generateCustomers(ctx, 100);
  return ctx;
}

describe('generateTikTokInsights', () => {
  it('returns deterministic output with same context', () => {
    const r1 = generateTikTokInsights(makeCtx());
    const r2 = generateTikTokInsights(makeCtx());
    expect(r1.length).toBe(r2.length);
    expect(r1[0]!.externalId).toBe(r2[0]!.externalId);
    expect(r1[0]!.payload).toEqual(r2[0]!.payload);
  });

  it('generates records for 3 campaigns × 181 days', () => {
    const records = generateTikTokInsights(makeCtx());
    // 3 campaigns × 181 days (0..180 inclusive)
    expect(records.length).toBe(3 * 181);
  });

  it('all records have source=tiktok and entity=insights', () => {
    const records = generateTikTokInsights(makeCtx());
    for (const r of records) {
      expect(r.source).toBe('tiktok');
      expect(r.entity).toBe('insights');
    }
  });

  it('payload has correct TikTok Marketing API shape', () => {
    const records = generateTikTokInsights(makeCtx());
    const first = records[0]!;
    const payload = first.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('advertiser_id');
    expect(payload).toHaveProperty('campaign_id');
    expect(payload).toHaveProperty('campaign_name');
    expect(payload).toHaveProperty('stat_time_day');
    expect(payload).toHaveProperty('spend');
    expect(payload).toHaveProperty('impressions');
    expect(payload).toHaveProperty('clicks');
    expect(payload).toHaveProperty('conversions');
    expect(payload).toHaveProperty('conversion_cost');
  });

  it('spend values are positive and reasonable', () => {
    const records = generateTikTokInsights(makeCtx());
    for (const r of records) {
      const spend = Number((r.payload as Record<string, unknown>).spend);
      expect(spend).toBeGreaterThan(0);
      expect(spend).toBeLessThan(1000); // No single day should exceed ~$600
    }
  });

  it('has 3 distinct campaigns', () => {
    const records = generateTikTokInsights(makeCtx());
    const campaignIds = new Set(records.map((r) => (r.payload as Record<string, unknown>).campaign_id));
    expect(campaignIds.size).toBe(3);
  });

  it('externalId combines campaign and date', () => {
    const records = generateTikTokInsights(makeCtx());
    const first = records[0]!;
    expect(first.externalId).toMatch(/^tt_camp_\d+_\d{4}-\d{2}-\d{2}$/);
  });

  it('generates unique externalIds', () => {
    const records = generateTikTokInsights(makeCtx());
    const ids = records.map((r) => r.externalId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
