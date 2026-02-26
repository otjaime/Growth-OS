// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Autopilot Data Seeder
// Seeds MetaAdAccount, MetaCampaign, MetaAdSet, MetaAd, and Diagnosis
// tables so the Autopilot page has data to display.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { createLogger } from './logger.js';

const log = createLogger('demo:autopilot');

export async function seedDemoAutopilot(organizationId?: string): Promise<number> {
  let orgId: string;

  if (organizationId) {
    // Use the provided organization (e.g., from the authenticated user)
    orgId = organizationId;
  } else {
    // Fallback: ensure a demo organization exists
    const org = await prisma.organization.upsert({
      where: { clerkOrgId: 'demo_org' },
      update: {},
      create: {
        name: 'Demo Store',
        clerkOrgId: 'demo_org',
        plan: 'GROWTH',
      },
    });
    orgId = org.id;
  }

  // ── MetaAdAccount ──
  const account = await prisma.metaAdAccount.upsert({
    where: { organizationId_adAccountId: { organizationId: orgId, adAccountId: 'act_123456789' } },
    update: {},
    create: {
      organizationId: orgId,
      adAccountId: 'act_123456789',
      name: 'Growth Store — Main',
      currency: 'USD',
      timezone: 'America/New_York',
      status: 'ACTIVE',
    },
  });

  // ── Campaigns ──
  const campaignDefs = [
    { campaignId: 'camp_001', name: 'Summer Sale — TOF', objective: 'CONVERSIONS', dailyBudget: 250 },
    { campaignId: 'camp_002', name: 'Retargeting — ATC Abandoners', objective: 'CONVERSIONS', dailyBudget: 150 },
    { campaignId: 'camp_003', name: 'Brand Awareness — Lookalike', objective: 'REACH', dailyBudget: 100 },
    { campaignId: 'camp_004', name: 'New Collection Launch', objective: 'CONVERSIONS', dailyBudget: 300 },
  ];

  const campaigns: Array<{ id: string; campaignId: string; name: string }> = [];
  for (const def of campaignDefs) {
    const c = await prisma.metaCampaign.upsert({
      where: { organizationId_campaignId: { organizationId: orgId, campaignId: def.campaignId } },
      update: {},
      create: {
        organizationId: orgId,
        accountId: account.id,
        campaignId: def.campaignId,
        name: def.name,
        objective: def.objective,
        dailyBudget: def.dailyBudget,
        status: 'ACTIVE',
      },
    });
    campaigns.push({ id: c.id, campaignId: def.campaignId, name: def.name });
  }

  // ── Ad Sets ──
  const adSetDefs = [
    { adSetId: 'as_001', campaignIdx: 0, name: 'Women 25-44 — Interest', dailyBudget: 125 },
    { adSetId: 'as_002', campaignIdx: 0, name: 'Men 25-44 — Broad', dailyBudget: 125 },
    { adSetId: 'as_003', campaignIdx: 1, name: 'Cart Abandoners 7d', dailyBudget: 80 },
    { adSetId: 'as_004', campaignIdx: 1, name: 'Product Viewers 14d', dailyBudget: 70 },
    { adSetId: 'as_005', campaignIdx: 2, name: 'Lookalike 1% — Purchasers', dailyBudget: 60 },
    { adSetId: 'as_006', campaignIdx: 2, name: 'Lookalike 3% — ATC', dailyBudget: 40 },
    { adSetId: 'as_007', campaignIdx: 3, name: 'New Collection — Core Audience', dailyBudget: 200 },
    { adSetId: 'as_008', campaignIdx: 3, name: 'New Collection — Existing Customers', dailyBudget: 100 },
  ];

  const adSets: Array<{ id: string; adSetId: string; campaignId: string }> = [];
  for (const def of adSetDefs) {
    const camp = campaigns[def.campaignIdx]!;
    const as = await prisma.metaAdSet.upsert({
      where: { organizationId_adSetId: { organizationId: orgId, adSetId: def.adSetId } },
      update: {},
      create: {
        organizationId: orgId,
        accountId: account.id,
        campaignId: camp.id,
        adSetId: def.adSetId,
        name: def.name,
        dailyBudget: def.dailyBudget,
        status: 'ACTIVE',
        targetingJson: { age_min: 25, age_max: 44, genders: [1, 2], countries: ['US'] },
      },
    });
    adSets.push({ id: as.id, adSetId: def.adSetId, campaignId: camp.id });
  }

  // ── Ads with varying performance profiles ──
  const now = new Date();
  const adDefs = [
    // Campaign 1 — Summer Sale TOF
    { adId: 'ad_001', adSetIdx: 0, name: 'Summer Sale — Hero Image', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'Up to 40% Off Summer Essentials', primaryText: 'Don\'t miss our biggest sale of the season. Shop now and save on premium basics.',
      spend7d: 420, impressions7d: 38000, clicks7d: 760, conversions7d: 18, revenue7d: 1620, spend14d: 380, impressions14d: 35000, clicks14d: 700, conversions14d: 22, revenue14d: 1980 },
    { adId: 'ad_002', adSetIdx: 0, name: 'Summer Sale — Carousel', creativeType: 'CAROUSEL', status: 'ACTIVE' as const,
      headline: 'Best Sellers Under $50', primaryText: 'Curated picks from our summer collection. Free shipping on orders over $75.',
      spend7d: 380, impressions7d: 42000, clicks7d: 840, conversions7d: 24, revenue7d: 2160, spend14d: 360, impressions14d: 40000, clicks14d: 800, conversions14d: 26, revenue14d: 2340 },
    { adId: 'ad_003', adSetIdx: 1, name: 'Summer Sale — UGC Video', creativeType: 'VIDEO', status: 'ACTIVE' as const,
      headline: 'Real Customers Love It', primaryText: 'See why thousands of customers are raving about our products.',
      spend7d: 310, impressions7d: 28000, clicks7d: 420, conversions7d: 8, revenue7d: 560, spend14d: 290, impressions14d: 26000, clicks14d: 390, conversions14d: 14, revenue14d: 980 },
    // Campaign 2 — Retargeting
    { adId: 'ad_004', adSetIdx: 2, name: 'Cart Reminder — Dynamic', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'You Left Something Behind', primaryText: 'Complete your order and get 10% off with code COMEBACK10.',
      spend7d: 180, impressions7d: 12000, clicks7d: 480, conversions7d: 38, revenue7d: 3420, spend14d: 160, impressions14d: 11000, clicks14d: 440, conversions14d: 35, revenue14d: 3150 },
    { adId: 'ad_005', adSetIdx: 3, name: 'Product Viewer — Best Seller', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'Still Thinking About It?', primaryText: 'Our best-selling items are going fast. Don\'t wait!',
      spend7d: 150, impressions7d: 10000, clicks7d: 350, conversions7d: 22, revenue7d: 1760, spend14d: 140, impressions14d: 9500, clicks14d: 330, conversions14d: 20, revenue14d: 1600 },
    // Campaign 3 — Brand Awareness
    { adId: 'ad_006', adSetIdx: 4, name: 'Brand Story — Video', creativeType: 'VIDEO', status: 'ACTIVE' as const,
      headline: 'Built for the Modern Lifestyle', primaryText: 'We create everyday essentials that are sustainably sourced and built to last.',
      spend7d: 200, impressions7d: 55000, clicks7d: 550, conversions7d: 4, revenue7d: 280, spend14d: 190, impressions14d: 52000, clicks14d: 520, conversions14d: 5, revenue14d: 350 },
    { adId: 'ad_007', adSetIdx: 5, name: 'Testimonial Compilation', creativeType: 'VIDEO', status: 'ACTIVE' as const,
      headline: '5-Star Reviews Speak for Themselves', primaryText: 'Join 50,000+ happy customers who made the switch.',
      spend7d: 140, impressions7d: 40000, clicks7d: 360, conversions7d: 3, revenue7d: 210, spend14d: 130, impressions14d: 38000, clicks14d: 342, conversions14d: 3, revenue14d: 210 },
    // Campaign 4 — New Collection
    { adId: 'ad_008', adSetIdx: 6, name: 'New Collection — Lifestyle Shot', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'Introducing the Fall/Winter Line', primaryText: 'Elevated basics meet modern design. Shop the new collection now.',
      spend7d: 520, impressions7d: 48000, clicks7d: 960, conversions7d: 32, revenue7d: 3840, spend14d: 480, impressions14d: 45000, clicks14d: 900, conversions14d: 30, revenue14d: 3600 },
    { adId: 'ad_009', adSetIdx: 6, name: 'New Collection — Product Grid', creativeType: 'CAROUSEL', status: 'ACTIVE' as const,
      headline: 'Mix & Match Your Style', primaryText: '12 new pieces, endless combinations. Find your perfect look.',
      spend7d: 450, impressions7d: 44000, clicks7d: 880, conversions7d: 28, revenue7d: 3080, spend14d: 420, impressions14d: 42000, clicks14d: 840, conversions14d: 26, revenue14d: 2860 },
    { adId: 'ad_010', adSetIdx: 7, name: 'VIP Early Access', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'Exclusive: 24h Early Access', primaryText: 'As a valued customer, you get first pick of our new collection.',
      spend7d: 220, impressions7d: 15000, clicks7d: 600, conversions7d: 42, revenue7d: 5040, spend14d: 200, impressions14d: 14000, clicks14d: 560, conversions14d: 40, revenue14d: 4800 },
    // Paused / poor performers
    { adId: 'ad_011', adSetIdx: 0, name: 'Summer Sale — Old Creative', creativeType: 'IMAGE', status: 'PAUSED' as const,
      headline: 'Summer Deals Await', primaryText: 'Check out our summer sale.',
      spend7d: 0, impressions7d: 0, clicks7d: 0, conversions7d: 0, revenue7d: 0, spend14d: 280, impressions14d: 30000, clicks14d: 300, conversions14d: 3, revenue14d: 210 },
    { adId: 'ad_012', adSetIdx: 4, name: 'Generic Brand Ad', creativeType: 'IMAGE', status: 'ACTIVE' as const,
      headline: 'Shop Now', primaryText: 'Quality products at great prices.',
      spend7d: 160, impressions7d: 45000, clicks7d: 180, conversions7d: 1, revenue7d: 70, spend14d: 150, impressions14d: 42000, clicks14d: 168, conversions14d: 1, revenue14d: 70 },
  ];

  const ads: Array<{ id: string; adId: string; name: string }> = [];
  for (const def of adDefs) {
    const adSet = adSets[def.adSetIdx]!;
    const roas7d = def.spend7d > 0 ? def.revenue7d / def.spend7d : 0;
    const ctr7d = def.impressions7d > 0 ? def.clicks7d / def.impressions7d : 0;
    const cpc7d = def.clicks7d > 0 ? def.spend7d / def.clicks7d : 0;
    const freq7d = def.impressions7d > 0 ? def.impressions7d / (def.clicks7d > 0 ? def.clicks7d * 8 : def.impressions7d / 3) : 0;
    const roas14d = def.spend14d > 0 ? def.revenue14d / def.spend14d : 0;
    const ctr14d = def.impressions14d > 0 ? def.clicks14d / def.impressions14d : 0;
    const cpc14d = def.clicks14d > 0 ? def.spend14d / def.clicks14d : 0;
    const freq14d = def.impressions14d > 0 ? def.impressions14d / (def.clicks14d > 0 ? def.clicks14d * 8 : def.impressions14d / 3) : 0;

    const ad = await prisma.metaAd.upsert({
      where: { organizationId_adId: { organizationId: orgId, adId: def.adId } },
      update: {
        spend7d: def.spend7d, impressions7d: def.impressions7d, clicks7d: def.clicks7d,
        conversions7d: def.conversions7d, revenue7d: def.revenue7d,
        roas7d: Math.round(roas7d * 10000) / 10000,
        ctr7d: Math.round(ctr7d * 1000000) / 1000000,
        cpc7d: Math.round(cpc7d * 100) / 100,
        frequency7d: Math.round(freq7d * 10000) / 10000,
        spend14d: def.spend14d, impressions14d: def.impressions14d, clicks14d: def.clicks14d,
        conversions14d: def.conversions14d, revenue14d: def.revenue14d,
        roas14d: Math.round(roas14d * 10000) / 10000,
        ctr14d: Math.round(ctr14d * 1000000) / 1000000,
        cpc14d: Math.round(cpc14d * 100) / 100,
        frequency14d: Math.round(freq14d * 10000) / 10000,
        lastSyncAt: now,
      },
      create: {
        organizationId: orgId,
        accountId: account.id,
        campaignId: adSet.campaignId,
        adSetId: adSet.id,
        adId: def.adId,
        name: def.name,
        status: def.status,
        headline: def.headline,
        primaryText: def.primaryText,
        creativeType: def.creativeType,
        callToAction: 'SHOP_NOW',
        spend7d: def.spend7d, impressions7d: def.impressions7d, clicks7d: def.clicks7d,
        conversions7d: def.conversions7d, revenue7d: def.revenue7d,
        roas7d: Math.round(roas7d * 10000) / 10000,
        ctr7d: Math.round(ctr7d * 1000000) / 1000000,
        cpc7d: Math.round(cpc7d * 100) / 100,
        frequency7d: Math.round(freq7d * 10000) / 10000,
        spend14d: def.spend14d, impressions14d: def.impressions14d, clicks14d: def.clicks14d,
        conversions14d: def.conversions14d, revenue14d: def.revenue14d,
        roas14d: Math.round(roas14d * 10000) / 10000,
        ctr14d: Math.round(ctr14d * 1000000) / 1000000,
        cpc14d: Math.round(cpc14d * 100) / 100,
        frequency14d: Math.round(freq14d * 10000) / 10000,
        lastSyncAt: now,
      },
    });
    ads.push({ id: ad.id, adId: def.adId, name: def.name });
  }

  // ── Diagnoses — realistic problems ──
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 3);

  const diagDefs = [
    // ad_003 — UGC Video: low ROAS, high spend
    { adIdx: 2, ruleId: 'low_roas', severity: 'CRITICAL' as const, actionType: 'PAUSE_AD' as const,
      title: 'ROAS below 2x threshold',
      message: 'Ad "Summer Sale — UGC Video" has a 7d ROAS of 1.81x vs. target 2.0x, spending $310/week with declining conversions (8 vs 14 prior period). Consider pausing or refreshing the creative.' },
    // ad_012 — Generic Brand Ad: terrible ROAS, wasting spend
    { adIdx: 11, ruleId: 'negative_roi', severity: 'CRITICAL' as const, actionType: 'PAUSE_AD' as const,
      title: 'Negative ROI — spending $160/wk for $70 revenue',
      message: 'Ad "Generic Brand Ad" has a ROAS of 0.44x — losing $90/week. The CTR (0.40%) is well below account average (1.7%). Recommend immediate pause.' },
    // ad_006 — Brand Story: high frequency, creative fatigue
    { adIdx: 5, ruleId: 'creative_fatigue', severity: 'WARNING' as const, actionType: 'GENERATE_COPY_VARIANTS' as const,
      title: 'Creative fatigue detected — frequency 3.2x',
      message: 'Ad "Brand Story — Video" frequency has reached 3.2x over 7 days. CTR dropped from 1.0% to 0.8%. Generate fresh copy variants to re-engage the audience.' },
    // ad_001 — Summer Sale Hero: declining performance
    { adIdx: 0, ruleId: 'performance_decline', severity: 'WARNING' as const, actionType: 'REFRESH_CREATIVE' as const,
      title: 'Conversion rate declining 18% WoW',
      message: 'Ad "Summer Sale — Hero Image" conversions dropped from 22 to 18 (18% decline) while spend increased 11%. Consider refreshing the creative or adjusting targeting.' },
    // ad_010 — VIP Early Access: performing well, scale opportunity
    { adIdx: 9, ruleId: 'scale_opportunity', severity: 'INFO' as const, actionType: 'INCREASE_BUDGET' as const,
      title: 'Top performer — ROAS 22.9x, budget constrained',
      message: 'Ad "VIP Early Access" is the top performer with 22.9x ROAS and 4.0% CTR. Current daily budget is $100 — consider increasing to capture more conversions.' },
    // ad_007 — Testimonial: low CTR for awareness
    { adIdx: 6, ruleId: 'low_ctr', severity: 'INFO' as const, actionType: 'GENERATE_COPY_VARIANTS' as const,
      title: 'Below-average CTR for awareness campaign',
      message: 'Ad "Testimonial Compilation" CTR is 0.9% vs campaign average 1.2%. The headline may need refreshing for better hook rate.' },
  ];

  let diagCount = 0;
  for (const def of diagDefs) {
    const ad = ads[def.adIdx]!;
    await prisma.diagnosis.upsert({
      where: { organizationId_adId_ruleId: { organizationId: orgId, adId: ad.id, ruleId: def.ruleId } },
      update: { title: def.title, message: def.message, severity: def.severity },
      create: {
        organizationId: orgId,
        adId: ad.id,
        ruleId: def.ruleId,
        severity: def.severity,
        title: def.title,
        message: def.message,
        actionType: def.actionType,
        status: 'PENDING',
        expiresAt,
      },
    });
    diagCount++;
  }

  const totalSeeded = campaigns.length + adSets.length + ads.length + diagCount;
  log.info({
    orgId,
    accounts: 1,
    campaigns: campaigns.length,
    adSets: adSets.length,
    ads: ads.length,
    diagnoses: diagCount,
  }, 'Demo autopilot data seeded');

  return totalSeeded;
}
