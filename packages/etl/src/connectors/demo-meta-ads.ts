// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Meta Ad Creatives Generator
// Deterministic mock ad-level data with realistic creative fields
// and performance metrics (7d + 14d windows)
// ──────────────────────────────────────────────────────────────

import seedrandom from 'seedrandom';
import type {
  MetaAdCreativeResult,
  MetaCampaignData,
  MetaAdSetData,
  MetaAdData,
  MetaAdInsight,
} from './meta-ads-creative.js';

const SEED = process.env.DEMO_SEED ?? '42-meta-ads';

function randFloat(min: number, max: number, rng: seedrandom.PRNG): number {
  return rng() * (max - min) + min;
}

function randInt(min: number, max: number, rng: seedrandom.PRNG): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[], rng: seedrandom.PRNG): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// ── Creative copy pools ──────────────────────────────────────

const HEADLINES = [
  'Shop the Collection',
  'Summer Sale — 30% Off',
  'Best Sellers Under $50',
  'Free Shipping Today',
  'New Arrivals Just Dropped',
  'Limited Edition Drop',
  'Your Skin Deserves Better',
  'Upgrade Your Routine',
  'Customer Favorite',
  'Flash Sale — 24 Hours',
];

const PRIMARY_TEXTS = [
  'Discover our best-selling products loved by thousands of customers. Shop now and get free shipping on orders over $50.',
  'Transform your daily routine with our award-winning formulas. 100% satisfaction guaranteed.',
  'Join 50,000+ happy customers. See why everyone is switching to our premium collection.',
  'Limited time offer: Get 30% off your first order. Use code WELCOME30 at checkout.',
  'Handcrafted with premium ingredients. Sustainable packaging. Cruelty-free always.',
  'Back in stock! Our most popular items are selling fast. Don\'t miss out this time.',
  'Your friends are already obsessed. Join the movement and experience the difference.',
  'We spent 2 years perfecting this formula. The results speak for themselves.',
];

const DESCRIPTIONS = [
  'Shop now at our online store',
  'Free returns within 30 days',
  'Premium quality, affordable price',
  'Sustainably sourced materials',
];

const CALL_TO_ACTIONS = [
  'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'BUY_NOW', 'GET_OFFER',
];

const CREATIVE_TYPES = ['IMAGE', 'VIDEO', 'CAROUSEL'];

// ── Demo campaign structure ──────────────────────────────────

interface DemoCampaign {
  id: string;
  name: string;
  objective: string;
  status: 'ACTIVE' | 'PAUSED';
  adSets: DemoAdSet[];
}

interface DemoAdSet {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  dailyBudget: number;
  ads: DemoAd[];
}

interface DemoAd {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  creativeType: string;
}

const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: 'meta_camp_001',
    name: 'PROS_TOF_Broad — Summer Collection',
    objective: 'CONVERSIONS',
    status: 'ACTIVE',
    adSets: [
      {
        id: 'meta_adset_001', name: 'Broad — US 25-54 F', status: 'ACTIVE', dailyBudget: 150,
        ads: [
          { id: 'meta_ad_001', name: 'TOF Broad — Lifestyle Video', status: 'ACTIVE', creativeType: 'VIDEO' },
          { id: 'meta_ad_002', name: 'TOF Broad — Carousel Bestsellers', status: 'ACTIVE', creativeType: 'CAROUSEL' },
          { id: 'meta_ad_003', name: 'TOF Broad — Static Image v1', status: 'PAUSED', creativeType: 'IMAGE' },
        ],
      },
      {
        id: 'meta_adset_002', name: 'Broad — US 18-34 M', status: 'ACTIVE', dailyBudget: 100,
        ads: [
          { id: 'meta_ad_004', name: 'TOF Broad — UGC Testimonial', status: 'ACTIVE', creativeType: 'VIDEO' },
        ],
      },
    ],
  },
  {
    id: 'meta_camp_002',
    name: 'RET_BOF_DPA — Dynamic Retargeting',
    objective: 'PRODUCT_CATALOG_SALES',
    status: 'ACTIVE',
    adSets: [
      {
        id: 'meta_adset_003', name: 'DPA — Cart Abandoners 7d', status: 'ACTIVE', dailyBudget: 80,
        ads: [
          { id: 'meta_ad_005', name: 'DPA — Cart Reminder Image', status: 'ACTIVE', creativeType: 'IMAGE' },
          { id: 'meta_ad_006', name: 'DPA — Last Chance Carousel', status: 'ACTIVE', creativeType: 'CAROUSEL' },
        ],
      },
      {
        id: 'meta_adset_004', name: 'DPA — Viewers 14d', status: 'ACTIVE', dailyBudget: 60,
        ads: [
          { id: 'meta_ad_007', name: 'DPA — You Left Something Behind', status: 'ACTIVE', creativeType: 'IMAGE' },
        ],
      },
    ],
  },
  {
    id: 'meta_camp_003',
    name: 'PROS_MOF_Lookalike — Scale',
    objective: 'CONVERSIONS',
    status: 'ACTIVE',
    adSets: [
      {
        id: 'meta_adset_005', name: 'LAL 1% — Purchasers', status: 'ACTIVE', dailyBudget: 200,
        ads: [
          { id: 'meta_ad_008', name: 'MOF LAL — Social Proof Video', status: 'ACTIVE', creativeType: 'VIDEO' },
          { id: 'meta_ad_009', name: 'MOF LAL — Before/After Carousel', status: 'ACTIVE', creativeType: 'CAROUSEL' },
          { id: 'meta_ad_010', name: 'MOF LAL — Static Offer', status: 'ACTIVE', creativeType: 'IMAGE' },
        ],
      },
    ],
  },
];

// ── Generator ────────────────────────────────────────────────

export function generateDemoMetaAds(): MetaAdCreativeResult {
  const rng = seedrandom(SEED);

  const campaigns: MetaCampaignData[] = [];
  const adSets: MetaAdSetData[] = [];
  const ads: MetaAdData[] = [];
  const insights7d: MetaAdInsight[] = [];
  const insights14d: MetaAdInsight[] = [];

  for (const camp of DEMO_CAMPAIGNS) {
    campaigns.push({
      campaignId: camp.id,
      name: camp.name,
      status: camp.status,
      objective: camp.objective,
      dailyBudget: camp.adSets.reduce((sum, as) => sum + as.dailyBudget, 0),
    });

    for (const adSet of camp.adSets) {
      adSets.push({
        adSetId: adSet.id,
        campaignId: camp.id,
        name: adSet.name,
        status: adSet.status,
        dailyBudget: adSet.dailyBudget,
        targeting: { age_min: 18, age_max: 54, genders: [1, 2], geo_locations: { countries: ['US'] } },
      });

      for (const ad of adSet.ads) {
        // Demo ads created 30 days ago
        const demoCreatedTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        // In demo, effective_status mirrors the cascade: if campaign or adset is paused, ad is paused too
        const demoEffective = camp.status !== 'ACTIVE' ? 'CAMPAIGN_PAUSED'
          : adSet.status !== 'ACTIVE' ? 'ADSET_PAUSED'
          : ad.status;
        ads.push({
          adId: ad.id,
          campaignId: camp.id,
          adSetId: adSet.id,
          name: ad.name,
          status: ad.status,
          effectiveStatus: demoEffective,
          createdTime: demoCreatedTime,
          headline: pick(HEADLINES, rng),
          primaryText: pick(PRIMARY_TEXTS, rng),
          description: pick(DESCRIPTIONS, rng),
          imageUrl: `https://demo.growthOS.app/creatives/${ad.id}.jpg`,
          thumbnailUrl: `https://demo.growthOS.app/creatives/${ad.id}_thumb.jpg`,
          callToAction: pick(CALL_TO_ACTIONS, rng),
          creativeType: ad.creativeType,
        });

        // Generate 7d metrics
        const isRetargeting = camp.name.includes('RET');
        const isActive = ad.status === 'ACTIVE';

        // 7d window metrics
        const spend7 = isActive ? Math.round(randFloat(50, 500, rng) * 100) / 100 : 0;
        const impressions7 = isActive ? randInt(2000, 40000, rng) : 0;
        const ctr7 = isRetargeting ? randFloat(0.012, 0.035, rng) : randFloat(0.006, 0.025, rng);
        const clicks7 = Math.round(impressions7 * ctr7);
        const cvr7 = isRetargeting ? randFloat(0.02, 0.06, rng) : randFloat(0.005, 0.02, rng);
        const conversions7 = Math.max(0, Math.round(clicks7 * cvr7));
        const aov7 = randFloat(60, 150, rng);
        const revenue7 = Math.round(conversions7 * aov7 * 100) / 100;
        const frequency7 = isActive ? Math.round(randFloat(1.2, 6.0, rng) * 100) / 100 : null;

        insights7d.push({
          adId: ad.id,
          spend: spend7,
          impressions: impressions7,
          clicks: clicks7,
          conversions: conversions7,
          revenue: revenue7,
          roas: spend7 > 0 ? Math.round((revenue7 / spend7) * 10000) / 10000 : null,
          ctr: impressions7 > 0 ? Math.round((clicks7 / impressions7) * 1000000) / 1000000 : null,
          cpc: clicks7 > 0 ? Math.round((spend7 / clicks7) * 100) / 100 : null,
          frequency: frequency7,
        });

        // 14d window metrics (previous period — slightly different performance)
        const spend14 = isActive ? Math.round(randFloat(50, 500, rng) * 100) / 100 : 0;
        const impressions14 = isActive ? randInt(2000, 40000, rng) : 0;
        const ctr14 = isRetargeting ? randFloat(0.014, 0.04, rng) : randFloat(0.008, 0.028, rng);
        const clicks14 = Math.round(impressions14 * ctr14);
        const cvr14 = isRetargeting ? randFloat(0.025, 0.07, rng) : randFloat(0.008, 0.025, rng);
        const conversions14 = Math.max(0, Math.round(clicks14 * cvr14));
        const aov14 = randFloat(60, 150, rng);
        const revenue14 = Math.round(conversions14 * aov14 * 100) / 100;
        const frequency14 = isActive ? Math.round(randFloat(1.0, 4.5, rng) * 100) / 100 : null;

        insights14d.push({
          adId: ad.id,
          spend: spend14,
          impressions: impressions14,
          clicks: clicks14,
          conversions: conversions14,
          revenue: revenue14,
          roas: spend14 > 0 ? Math.round((revenue14 / spend14) * 10000) / 10000 : null,
          ctr: impressions14 > 0 ? Math.round((clicks14 / impressions14) * 1000000) / 1000000 : null,
          cpc: clicks14 > 0 ? Math.round((spend14 / clicks14) * 100) / 100 : null,
          frequency: frequency14,
        });
      }
    }
  }

  return { campaigns, adSets, ads, insights7d, insights14d };
}
