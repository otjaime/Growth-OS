// ──────────────────────────────────────────────────────────────
// Growth OS — Demo Data Generator
// Deterministic mock data with realistic patterns + anomalies
// Uses seeded RNG so every run produces the same data
// ──────────────────────────────────────────────────────────────

import seedrandom from 'seedrandom';
import { addDays, format, subDays, differenceInDays } from 'date-fns';
import type { RawRecord } from '../types.js';
import { CATEGORY_MARGINS } from '../types.js';

const SEED = process.env.DEMO_SEED ?? '42';
const DEMO_DAYS = parseInt(process.env.DEMO_DAYS ?? '180', 10);

const CATEGORIES = ['apparel', 'beauty', 'home', 'electronics', 'food'];
const REGIONS = ['US-East', 'US-West', 'US-Central', 'EU-West', 'EU-North', 'APAC'];
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Casey', 'Morgan', 'Taylor', 'Riley', 'Quinn',
  'Drew', 'Blake', 'Sage', 'Reese', 'Jamie', 'Avery', 'Parker', 'Hayden',
  'Dakota', 'Skyler', 'Emerson', 'Rowan', 'Charlie', 'Finley', 'Harley', 'Jesse',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
];

interface DemoContext {
  rng: seedrandom.PRNG;
  endDate: Date;
  startDate: Date;
  customers: DemoCustomer[];
}

interface DemoCustomer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  region: string;
  acquisitionChannel: string;
  firstOrderDate: Date;
}

function createContext(): DemoContext {
  const rng = seedrandom(SEED);
  const now = new Date();
  // Truncate to start of day so consecutive calls within the same day
  // produce identical timestamps (fixes determinism test flakiness).
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = subDays(endDate, DEMO_DAYS);
  return { rng, endDate, startDate, customers: [] };
}

function pick<T>(arr: T[], rng: seedrandom.PRNG): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randInt(min: number, max: number, rng: seedrandom.PRNG): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, rng: seedrandom.PRNG): number {
  return rng() * (max - min) + min;
}

function generateCustomers(ctx: DemoContext, count: number): DemoCustomer[] {
  const channels = ['meta', 'google', 'organic', 'email', 'direct', 'affiliate'];
  const channelWeights = [0.30, 0.25, 0.20, 0.10, 0.10, 0.05];

  for (let i = 0; i < count; i++) {
    const r = ctx.rng();
    let cumWeight = 0;
    let channel = 'organic';
    for (let j = 0; j < channelWeights.length; j++) {
      cumWeight += channelWeights[j]!;
      if (r < cumWeight) {
        channel = channels[j]!;
        break;
      }
    }

    const daysOffset = randInt(0, DEMO_DAYS, ctx.rng);
    const customer: DemoCustomer = {
      id: `cust_${String(i + 1).padStart(6, '0')}`,
      email: `${pick(FIRST_NAMES, ctx.rng).toLowerCase()}.${pick(LAST_NAMES, ctx.rng).toLowerCase()}${randInt(1, 999, ctx.rng)}@example.com`,
      firstName: pick(FIRST_NAMES, ctx.rng),
      lastName: pick(LAST_NAMES, ctx.rng),
      region: pick(REGIONS, ctx.rng),
      acquisitionChannel: channel,
      firstOrderDate: addDays(ctx.startDate, daysOffset),
    };
    ctx.customers.push(customer);
  }
  return ctx.customers;
}

// ── Shopify Orders ──────────────────────────────────────────
export function generateShopifyOrders(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();
  if (c.customers.length === 0) generateCustomers(c, 2400);
  const records: RawRecord[] = [];
  let orderId = 1000;

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    // Base orders per day: ~25-45, with growth trend + seasonality
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.4;
    const dayOfWeek = date.getDay();
    const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 1.15 : 1.0;
    // Anomaly: spike in week ~20 (Black Friday sim), dip in week ~8
    const weekNum = Math.floor(day / 7);
    let anomaly = 1.0;
    if (weekNum >= 19 && weekNum <= 21) anomaly = 1.6; // Sales spike
    if (weekNum === 8) anomaly = 0.6; // Dip week

    const baseOrders = Math.round(30 * growthFactor * weekendBoost * anomaly + randFloat(-5, 5, c.rng));
    const numOrders = Math.max(5, baseOrders);

    for (let o = 0; o < numOrders; o++) {
      orderId++;
      const customer = pick(c.customers, c.rng);
      const isRepeat = customer.firstOrderDate < date;
      const isNewCustomer = !isRepeat || differenceInDays(date, customer.firstOrderDate) < 1;
      const category = pick(CATEGORIES, c.rng);
      const numItems = randInt(1, 4, c.rng);
      const itemPrice = randFloat(15, 180, c.rng);
      const revenueGross = Math.round(numItems * itemPrice * 100) / 100;
      const discountRate = c.rng() < 0.25 ? randFloat(0.05, 0.20, c.rng) : 0;
      const discounts = Math.round(revenueGross * discountRate * 100) / 100;
      const refundRate = c.rng() < 0.08 ? randFloat(0.3, 1.0, c.rng) : 0;
      const refunds = Math.round(revenueGross * refundRate * 100) / 100;

      // Channel mapping from UTM
      let sourceName = 'web';
      let utmSource: string | null = null;
      let utmMedium: string | null = null;
      let utmCampaign: string | null = null;

      if (customer.acquisitionChannel === 'meta') {
        sourceName = 'web';
        utmSource = 'facebook';
        utmMedium = 'cpc';
        utmCampaign = pick(['PROS_TOF_Broad', 'RET_BOF_DPA', 'PROS_MOF_Lookalike', 'BRAND_Awareness'], c.rng);
      } else if (customer.acquisitionChannel === 'google') {
        sourceName = 'web';
        utmSource = 'google';
        utmMedium = 'cpc';
        utmCampaign = pick(['Brand_Search', 'NonBrand_Generic', 'Shopping_Smart', 'PMax_AllProducts'], c.rng);
      } else if (customer.acquisitionChannel === 'email') {
        utmSource = 'klaviyo';
        utmMedium = 'email';
        utmCampaign = pick(['Welcome_Series', 'Abandoned_Cart', 'Weekly_Newsletter', 'VIP_Offer'], c.rng);
      } else if (customer.acquisitionChannel === 'organic') {
        utmSource = null;
        utmMedium = null;
      } else if (customer.acquisitionChannel === 'affiliate') {
        utmSource = 'affiliate';
        utmMedium = 'referral';
      }

      // Build customerJourneySummary matching Shopify's GraphQL format
      const journeySource = utmSource === 'facebook' ? 'facebook'
        : utmSource === 'google' ? 'google'
        : utmSource === 'klaviyo' ? 'klaviyo'
        : utmSource === 'affiliate' ? 'affiliate'
        : null;
      const journeySourceType = utmSource === 'facebook' ? 'SOCIAL'
        : utmSource === 'google' ? 'SEARCH'
        : utmSource === 'klaviyo' ? 'EMAIL'
        : utmSource === 'affiliate' ? 'REFERRAL'
        : customer.acquisitionChannel === 'direct' ? 'DIRECT'
        : customer.acquisitionChannel === 'organic' ? 'SEARCH'
        : 'UNKNOWN';

      const customerJourneySummary = journeySource ? {
        firstVisit: {
          source: journeySource,
          sourceType: journeySourceType,
          utmParameters: utmSource ? { source: utmSource, medium: utmMedium, campaign: utmCampaign } : null,
        },
        lastVisit: {
          source: journeySource,
          sourceType: journeySourceType,
          utmParameters: utmSource ? { source: utmSource, medium: utmMedium, campaign: utmCampaign } : null,
        },
      } : (customer.acquisitionChannel === 'organic' ? {
        firstVisit: { source: 'google', sourceType: 'SEARCH', utmParameters: { source: 'google', medium: 'organic', campaign: null } },
        lastVisit: { source: 'google', sourceType: 'SEARCH', utmParameters: { source: 'google', medium: 'organic', campaign: null } },
      } : null);

      const order = {
        id: `gid://shopify/Order/${orderId}`,
        order_number: orderId,
        created_at: format(date, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        updated_at: format(date, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        customer: {
          id: `gid://shopify/Customer/${customer.id.replace('cust_', '')}`,
          email: customer.email,
          first_name: customer.firstName,
          last_name: customer.lastName,
        },
        total_price: String(revenueGross),
        subtotal_price: String(revenueGross - discounts),
        total_discounts: String(discounts),
        total_refunds: String(refunds),
        currency: 'USD',
        source_name: sourceName,
        landing_site: utmSource ? `/?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}` : '/',
        referring_site: utmSource === 'facebook' ? 'https://www.facebook.com/' : utmSource === 'google' ? 'https://www.google.com/' : null,
        customerJourneySummary,
        line_items: Array.from({ length: numItems }, (_, i) => ({
          id: `li_${orderId}_${i}`,
          title: `${category.charAt(0).toUpperCase() + category.slice(1)} Item ${randInt(100, 999, c.rng)}`,
          quantity: 1,
          price: String(Math.round(itemPrice * 100) / 100),
          product_type: category,
        })),
        shipping_address: { province_code: customer.region },
        tags: isNewCustomer ? 'new_customer' : '',
      };

      records.push({
        source: 'shopify',
        entity: 'orders',
        externalId: String(orderId),
        cursor: format(date, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        payload: order as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}

// ── Shopify Customers ──────────────────────────────────────
export function generateShopifyCustomers(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();
  if (c.customers.length === 0) generateCustomers(c, 2400);

  return c.customers.map((cust) => ({
    source: 'shopify',
    entity: 'customers',
    externalId: cust.id.replace('cust_', ''),
    cursor: format(cust.firstOrderDate, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    payload: {
      id: `gid://shopify/Customer/${cust.id.replace('cust_', '')}`,
      email: cust.email,
      first_name: cust.firstName,
      last_name: cust.lastName,
      created_at: format(cust.firstOrderDate, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      orders_count: randInt(1, 8, c.rng),
      total_spent: String(randFloat(50, 2000, c.rng).toFixed(2)),
      default_address: { province_code: cust.region },
      tags: '',
    } as unknown as Record<string, unknown>,
  }));
}

// ── Meta Ads Insights ──────────────────────────────────────
export function generateMetaInsights(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();
  const records: RawRecord[] = [];
  const campaigns = [
    { id: 'meta_camp_001', name: 'PROS_TOF_Broad' },
    { id: 'meta_camp_002', name: 'RET_BOF_DPA' },
    { id: 'meta_camp_003', name: 'PROS_MOF_Lookalike' },
    { id: 'meta_camp_004', name: 'BRAND_Awareness' },
  ];

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const weekNum = Math.floor(day / 7);
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.3;

    for (const camp of campaigns) {
      // Base spend per campaign per day: $80-$300
      let baseSpend = randFloat(80, 300, c.rng) * growthFactor;
      // Anomaly: spend spike week 15 but poor ROAS
      if (weekNum >= 14 && weekNum <= 16 && camp.id === 'meta_camp_001') {
        baseSpend *= 2.0;
      }

      const spend = Math.round(baseSpend * 100) / 100;
      const cpm = randFloat(8, 25, c.rng);
      const impressions = Math.round((spend / cpm) * 1000);
      const ctr = randFloat(0.008, 0.035, c.rng);
      const clicks = Math.round(impressions * ctr);
      const cvr = camp.name.includes('RET') ? randFloat(0.02, 0.06, c.rng) : randFloat(0.005, 0.02, c.rng);
      const conversions = Math.max(0, Math.round(clicks * cvr));
      const aov = randFloat(60, 150, c.rng);
      const conversionValue = Math.round(conversions * aov * 100) / 100;

      records.push({
        source: 'meta',
        entity: 'insights',
        externalId: `${camp.id}_${format(date, 'yyyy-MM-dd')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          campaign_id: camp.id,
          campaign_name: camp.name,
          date_start: format(date, 'yyyy-MM-dd'),
          date_stop: format(date, 'yyyy-MM-dd'),
          spend: String(spend),
          impressions: String(impressions),
          clicks: String(clicks),
          actions: [
            { action_type: 'purchase', value: String(conversions) },
          ],
          action_values: [
            { action_type: 'purchase', value: String(conversionValue) },
          ],
          account_id: 'act_demo_123',
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}

// ── Google Ads Insights ────────────────────────────────────
export function generateGoogleAdsInsights(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();
  const records: RawRecord[] = [];
  const campaigns = [
    { id: 'gads_camp_001', name: 'Brand_Search' },
    { id: 'gads_camp_002', name: 'NonBrand_Generic' },
    { id: 'gads_camp_003', name: 'Shopping_Smart' },
    { id: 'gads_camp_004', name: 'PMax_AllProducts' },
  ];

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.25;
    const weekNum = Math.floor(day / 7);

    for (const camp of campaigns) {
      let baseSpend = randFloat(60, 250, c.rng) * growthFactor;
      // Anomaly: Google CPC spike week 22
      if (weekNum >= 21 && weekNum <= 23) baseSpend *= 1.4;

      const spend = Math.round(baseSpend * 100) / 100;
      const impressions = randInt(800, 15000, c.rng);
      const ctr = camp.name.includes('Brand') ? randFloat(0.05, 0.12, c.rng) : randFloat(0.015, 0.04, c.rng);
      const clicks = Math.round(impressions * ctr);
      const cvr = camp.name.includes('Brand') ? randFloat(0.04, 0.08, c.rng) : randFloat(0.01, 0.03, c.rng);
      const conversions = Math.max(0, Math.round(clicks * cvr));
      const conversionValue = Math.round(conversions * randFloat(70, 160, c.rng) * 100) / 100;

      records.push({
        source: 'google_ads',
        entity: 'campaign_performance',
        externalId: `${camp.id}_${format(date, 'yyyy-MM-dd')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          campaign: {
            resourceName: `customers/demo/campaigns/${camp.id}`,
            id: camp.id,
            name: camp.name,
          },
          segments: { date: format(date, 'yyyy-MM-dd') },
          metrics: {
            costMicros: String(Math.round(spend * 1_000_000)),
            impressions: String(impressions),
            clicks: String(clicks),
            conversions: String(conversions),
            conversionsValue: String(conversionValue),
          },
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}

// ── GA4 Sessions & Funnel ─────────────────────────────────
export function generateGA4Traffic(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? createContext();
  const records: RawRecord[] = [];
  const channelGroups = ['Organic Search', 'Paid Search', 'Paid Social', 'Email', 'Direct', 'Referral'];
  const channelWeights = [0.30, 0.22, 0.20, 0.10, 0.12, 0.06];

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.35;
    const dayOfWeek = date.getDay();
    const weekdayFactor = dayOfWeek === 0 || dayOfWeek === 6 ? 0.85 : 1.0;
    const weekNum = Math.floor(day / 7);
    let anomaly = 1.0;
    if (weekNum >= 19 && weekNum <= 21) anomaly = 1.45; // Traffic spike matching order spike
    if (weekNum === 10) anomaly = 0.7; // traffic dip
    const totalSessions = Math.round(1800 * growthFactor * weekdayFactor * anomaly + randFloat(-200, 200, c.rng));

    for (let ch = 0; ch < channelGroups.length; ch++) {
      const sessions = Math.max(10, Math.round(totalSessions * channelWeights[ch]! + randFloat(-30, 30, c.rng)));
      // Funnel conversion rates
      const pdpRate = randFloat(0.55, 0.75, c.rng);
      const atcRate = randFloat(0.15, 0.30, c.rng);
      const checkoutRate = randFloat(0.50, 0.75, c.rng);
      const purchaseRate = randFloat(0.55, 0.80, c.rng);

      const pdpViews = Math.round(sessions * pdpRate);
      const addToCart = Math.round(pdpViews * atcRate);
      const checkouts = Math.round(addToCart * checkoutRate);
      const purchases = Math.round(checkouts * purchaseRate);

      records.push({
        source: 'ga4',
        entity: 'traffic',
        externalId: `${format(date, 'yyyy-MM-dd')}_${channelGroups[ch]}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          date: format(date, 'yyyy-MM-dd'),
          sessionDefaultChannelGroup: channelGroups[ch],
          sessions: String(sessions),
          itemViews: String(pdpViews),
          addToCarts: String(addToCart),
          checkouts: String(checkouts),
          ecommercePurchases: String(purchases),
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}

// ── Full Demo Context ──────────────────────────────────────
export function generateAllDemoData(): {
  orders: RawRecord[];
  customers: RawRecord[];
  metaInsights: RawRecord[];
  googleAdsInsights: RawRecord[];
  ga4Traffic: RawRecord[];
} {
  const ctx = createContext();
  generateCustomers(ctx, 2400);

  return {
    orders: generateShopifyOrders(ctx),
    customers: generateShopifyCustomers(ctx),
    metaInsights: generateMetaInsights(ctx),
    googleAdsInsights: generateGoogleAdsInsights(ctx),
    ga4Traffic: generateGA4Traffic(ctx),
  };
}
