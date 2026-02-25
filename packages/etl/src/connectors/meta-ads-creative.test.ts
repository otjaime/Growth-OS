// ──────────────────────────────────────────────────────────────
// Growth OS — Meta Ads Creative Connector Tests
// Tests demo data generation and connector output structure
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateDemoMetaAds } from './demo-meta-ads.js';

describe('generateDemoMetaAds', () => {
  const result = generateDemoMetaAds();

  it('returns campaigns', () => {
    expect(result.campaigns.length).toBeGreaterThan(0);
    for (const camp of result.campaigns) {
      expect(camp.campaignId).toBeTruthy();
      expect(camp.name).toBeTruthy();
      expect(camp.status).toMatch(/^(ACTIVE|PAUSED)$/);
      expect(camp.objective).toBeTruthy();
    }
  });

  it('returns ad sets linked to campaigns', () => {
    expect(result.adSets.length).toBeGreaterThan(0);
    const campaignIds = new Set(result.campaigns.map((c) => c.campaignId));
    for (const adSet of result.adSets) {
      expect(adSet.adSetId).toBeTruthy();
      expect(campaignIds.has(adSet.campaignId)).toBe(true);
      expect(adSet.dailyBudget).toBeGreaterThan(0);
    }
  });

  it('returns ads with creative fields', () => {
    expect(result.ads.length).toBeGreaterThanOrEqual(8);
    for (const ad of result.ads) {
      expect(ad.adId).toBeTruthy();
      expect(ad.name).toBeTruthy();
      expect(ad.headline).toBeTruthy();
      expect(ad.primaryText).toBeTruthy();
      expect(ad.callToAction).toBeTruthy();
      expect(['IMAGE', 'VIDEO', 'CAROUSEL']).toContain(ad.creativeType);
    }
  });

  it('returns 7d insights for each ad', () => {
    expect(result.insights7d.length).toBe(result.ads.length);
    const adIds = new Set(result.ads.map((a) => a.adId));
    for (const insight of result.insights7d) {
      expect(adIds.has(insight.adId)).toBe(true);
      expect(insight.spend).toBeGreaterThanOrEqual(0);
      expect(insight.impressions).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns 14d insights for each ad', () => {
    expect(result.insights14d.length).toBe(result.ads.length);
    for (const insight of result.insights14d) {
      expect(insight.adId).toBeTruthy();
    }
  });

  it('computes ROAS correctly for active ads with spend', () => {
    const activeInsights = result.insights7d.filter((i) => i.spend > 0);
    expect(activeInsights.length).toBeGreaterThan(0);
    for (const insight of activeInsights) {
      expect(insight.roas).not.toBeNull();
      expect(insight.roas!).toBeCloseTo(insight.revenue / insight.spend, 2);
    }
  });

  it('computes CTR correctly', () => {
    const withImpressions = result.insights7d.filter((i) => i.impressions > 0);
    expect(withImpressions.length).toBeGreaterThan(0);
    for (const insight of withImpressions) {
      expect(insight.ctr).not.toBeNull();
      expect(insight.ctr!).toBeCloseTo(insight.clicks / insight.impressions, 4);
    }
  });

  it('is deterministic (same seed produces same output)', () => {
    const result2 = generateDemoMetaAds();
    expect(result.campaigns.length).toBe(result2.campaigns.length);
    expect(result.ads.length).toBe(result2.ads.length);
    // Check first ad IDs match
    expect(result.ads[0]!.adId).toBe(result2.ads[0]!.adId);
    expect(result.ads[0]!.headline).toBe(result2.ads[0]!.headline);
  });

  it('ads link to valid campaign and adSet IDs', () => {
    const campaignIds = new Set(result.campaigns.map((c) => c.campaignId));
    const adSetIds = new Set(result.adSets.map((a) => a.adSetId));
    for (const ad of result.ads) {
      expect(campaignIds.has(ad.campaignId)).toBe(true);
      expect(adSetIds.has(ad.adSetId)).toBe(true);
    }
  });
});
