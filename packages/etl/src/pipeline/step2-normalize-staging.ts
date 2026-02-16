// ──────────────────────────────────────────────────────────────
// Growth OS — Step 2: Normalize to Staging
// Reads raw_events and writes normalized stg_* tables
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';
import { mapChannelFromOrder, mapGA4ChannelToSlug } from './channel-mapping.js';

const log = createLogger('pipeline:normalize-staging');

export async function normalizeStaging(): Promise<{
  orders: number;
  customers: number;
  spend: number;
  traffic: number;
  email: number;
}> {
  log.info('Starting staging normalization');

  const orders = await normalizeOrders();
  const customers = await normalizeCustomers();
  const spend = await normalizeSpend();
  const traffic = await normalizeTraffic();
  const email = await normalizeEmail();
  await normalizeStripePayments();

  log.info({ orders, customers, spend, traffic, email }, 'Staging normalization complete');
  return { orders, customers, spend, traffic, email };
}

// ── Orders ──────────────────────────────────────────────────
async function normalizeOrders(): Promise<number> {
  let count = 0;
  const BATCH = 200;
  let skip = 0;

  // Process in batches to avoid loading all events into memory at once
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rawOrders = await prisma.rawEvent.findMany({
      where: { source: 'shopify', entity: 'orders' },
      orderBy: { fetchedAt: 'desc' },
      take: BATCH,
      skip,
    });
    if (rawOrders.length === 0) break;
    skip += rawOrders.length;

    await prisma.$transaction(async (tx) => {
      const batch = rawOrders;
      for (const raw of batch) {
        const p = raw.payloadJson as Record<string, unknown>;

        // Handle both GraphQL camelCase and demo snake_case formats
        const customer = p.customer as Record<string, unknown> | null;

        // Line items: GraphQL returns { edges: [{ node: {...} }] }, demo returns array
        const lineItemsRaw = p.line_items as Array<Record<string, unknown>> | undefined;
        const lineItemsGql = p.lineItems as { edges?: Array<{ node: Record<string, unknown> }> } | undefined;
        const lineItems = lineItemsRaw ?? lineItemsGql?.edges?.map((e) => e.node);

        // Shipping address: GraphQL camelCase vs demo snake_case
        const shippingAddr = (p.shipping_address ?? p.shippingAddress) as Record<string, unknown> | null;

        // Landing/referring: GraphQL uses landingPageUrl/referrerUrl, demo uses landing_site/referring_site
        const landingSite = ((p.landing_site ?? p.landingPageUrl) as string) ?? '';
        const referringSite = ((p.referring_site ?? p.referrerUrl) as string) ?? '';
        const sourceName = ((p.source_name ?? p.sourceName) as string) ?? '';

        // Parse UTM params from landing site
        const utmParams = parseUtmParams(landingSite);

        // Extract Shopify's structured attribution (most reliable)
        const journey = p.customerJourneySummary as {
          lastVisit?: {
            source?: string;
            sourceType?: string;
            utmParameters?: { source?: string; medium?: string; campaign?: string };
          };
        } | null;

        const shopifySource = journey?.lastVisit?.source?.toLowerCase() ?? '';
        const shopifySourceType = journey?.lastVisit?.sourceType?.toLowerCase() ?? '';
        const shopifyUtm = journey?.lastVisit?.utmParameters;

        const channelRaw = mapChannelFromOrder({
          sourceName,
          shopifySource,
          shopifySourceType,
          utmSource: shopifyUtm?.source ?? utmParams.utm_source,
          utmMedium: shopifyUtm?.medium ?? utmParams.utm_medium,
          referringSite,
          gclid: utmParams.gclid,
          fbclid: utmParams.fbclid,
        });

        // Revenue: GraphQL uses totalPriceSet.shopMoney.amount, demo uses total_price
        const totalPriceSet = p.totalPriceSet as { shopMoney?: { amount?: string; currencyCode?: string } } | undefined;
        const totalDiscountsSet = p.totalDiscountsSet as { shopMoney?: { amount?: string } } | undefined;
        const revenueGross = parseFloat(totalPriceSet?.shopMoney?.amount ?? (p.total_price as string) ?? '0');
        const discounts = parseFloat(totalDiscountsSet?.shopMoney?.amount ?? (p.total_discounts as string) ?? '0');
        const refunds = parseFloat((p.total_refunds as string) ?? '0');
        const revenueNet = revenueGross - discounts - refunds;

        // Order ID: GraphQL uses name or id (GID), demo uses order_number
        const orderId = (p.order_number as number)?.toString() ?? (p.name as string) ?? (p.id as string);
        const customerId = customer
          ? String(customer.id).replace('gid://shopify/Customer/', '')
          : null;

        // Date: GraphQL uses createdAt, demo uses created_at
        const dateStr = (p.created_at ?? p.createdAt) as string | undefined;
        const orderDate = dateStr ? new Date(dateStr) : new Date();
        if (isNaN(orderDate.getTime())) {
          log.warn({ orderId, dateStr }, 'Invalid order date, skipping');
          continue;
        }

        // Tags: GraphQL returns string[], demo returns comma-separated string
        const tags = Array.isArray(p.tags) ? (p.tags as string[]).join(',') : ((p.tags as string) ?? '');

        // Region: GraphQL uses provinceCode, demo uses province_code
        const region = shippingAddr
          ? ((shippingAddr.province_code ?? shippingAddr.provinceCode) as string) ?? null
          : null;

        // Currency: GraphQL uses totalPriceSet.shopMoney.currencyCode, demo uses currency
        const currency = totalPriceSet?.shopMoney?.currencyCode ?? (p.currency as string) ?? 'USD';

        await tx.stgOrder.upsert({
          where: { orderId },
          create: {
            orderId,
            orderDate,
            customerId,
            email: (customer?.email as string) ?? null,
            revenueGross,
            discounts,
            refunds,
            revenueNet,
            currency,
            sourceName: sourceName || null,
            landingSite: landingSite || null,
            referringSite: referringSite || null,
            utmSource: utmParams.utm_source || null,
            utmMedium: utmParams.utm_medium || null,
            utmCampaign: (shopifyUtm?.campaign ?? utmParams.utm_campaign) || null,
            channelRaw,
            region,
            lineItemsJson: lineItems ? (lineItems as unknown as Record<string, string>[]) : undefined,
            isNewCustomer: tags.includes('new_customer'),
          },
          update: {
            revenueGross,
            discounts,
            refunds,
            revenueNet,
            channelRaw,
            lineItemsJson: lineItems ? (lineItems as unknown as Record<string, string>[]) : undefined,
          },
        });
        count++;
      }
    }, {
      maxWait: 30000,
      timeout: 60000,
    });
  }

  log.info({ count }, 'Orders normalized');
  return count;
}

// ── Customers ───────────────────────────────────────────────
async function normalizeCustomers(): Promise<number> {
  let count = 0;
  const BATCH = 500;
  let skip = 0;

  while (true) {
    const rawCustomers = await prisma.rawEvent.findMany({
      where: { source: 'shopify', entity: 'customers' },
      take: BATCH,
      skip,
    });
    if (rawCustomers.length === 0) break;
    skip += rawCustomers.length;

  for (const raw of rawCustomers) {
    const p = raw.payloadJson as Record<string, unknown>;
    const customerId = String(p.id).replace('gid://shopify/Customer/', '') ?? raw.externalId!;
    const addr = (p.default_address ?? p.defaultAddress) as Record<string, unknown> | null;

    // Date: GraphQL uses createdAt, demo uses created_at
    const dateStr = (p.created_at ?? p.createdAt) as string | undefined;
    const firstOrderDate = dateStr ? new Date(dateStr) : null;

    await prisma.stgCustomer.upsert({
      where: { customerId },
      create: {
        customerId,
        email: (p.email as string) ?? null,
        firstOrderDate: firstOrderDate && !isNaN(firstOrderDate.getTime()) ? firstOrderDate : null,
        region: ((addr?.province_code ?? addr?.provinceCode) as string) ?? null,
        totalOrders: ((p.orders_count ?? p.ordersCount ?? p.numberOfOrders) as number) ?? 0,
        totalRevenue: parseFloat(((p.total_spent ?? p.totalSpent) as string) ?? '0'),
      },
      update: {
        totalOrders: ((p.orders_count ?? p.ordersCount ?? p.numberOfOrders) as number) ?? 0,
        totalRevenue: parseFloat(((p.total_spent ?? p.totalSpent) as string) ?? '0'),
      },
    });
    count++;
  }
  } // end while

  log.info({ count }, 'Customers normalized');
  return count;
}

// ── Spend (Meta + Google Ads) ───────────────────────────────
async function normalizeSpend(): Promise<number> {
  let count = 0;
  const BATCH = 500;

  // Meta
  let skip = 0;
  while (true) {
    const metaRaw = await prisma.rawEvent.findMany({
      where: { source: 'meta', entity: 'insights' },
      take: BATCH,
      skip,
    });
    if (metaRaw.length === 0) break;
    skip += metaRaw.length;

  for (const raw of metaRaw) {
    const p = raw.payloadJson as Record<string, unknown>;
    const date = new Date((p.date_start as string) + 'T00:00:00Z');
    const campaignId = (p.campaign_id as string) ?? '';
    const campaignName = (p.campaign_name as string) ?? '';
    const spend = parseFloat((p.spend as string) ?? '0');
    const impressions = parseInt((p.impressions as string) ?? '0', 10);
    const clicks = parseInt((p.clicks as string) ?? '0', 10);

    const actions = (p.actions as Array<{ action_type: string; value: string }>) ?? [];
    const actionValues = (p.action_values as Array<{ action_type: string; value: string }>) ?? [];
    const purchaseAction = actions.find((a) => a.action_type === 'purchase');
    const purchaseValue = actionValues.find((a) => a.action_type === 'purchase');

    await prisma.stgSpend.upsert({
      where: { date_source_campaignId: { date, source: 'meta', campaignId } },
      create: {
        date,
        source: 'meta',
        campaignId,
        campaignName,
        spend,
        impressions,
        clicks,
        conversions: purchaseAction ? parseInt(purchaseAction.value, 10) : 0,
        conversionValue: purchaseValue ? parseFloat(purchaseValue.value) : 0,
      },
      update: { spend, impressions, clicks },
    });
    count++;
  }
  } // end meta while

  // Google Ads
  skip = 0;
  while (true) {
    const gadsRaw = await prisma.rawEvent.findMany({
      where: { source: 'google_ads', entity: 'campaign_performance' },
      take: BATCH,
      skip,
    });
    if (gadsRaw.length === 0) break;
    skip += gadsRaw.length;

  for (const raw of gadsRaw) {
    const p = raw.payloadJson as Record<string, unknown>;
    const campaign = p.campaign as Record<string, unknown>;
    const segments = p.segments as Record<string, unknown>;
    const metrics = p.metrics as Record<string, unknown>;

    const date = new Date((segments.date as string) + 'T00:00:00Z');
    const campaignId = (campaign.id as string) ?? '';
    const campaignName = (campaign.name as string) ?? '';
    const spend = parseInt((metrics.costMicros as string) ?? '0', 10) / 1_000_000;

    await prisma.stgSpend.upsert({
      where: { date_source_campaignId: { date, source: 'google_ads', campaignId } },
      create: {
        date,
        source: 'google_ads',
        campaignId,
        campaignName,
        spend,
        impressions: parseInt((metrics.impressions as string) ?? '0', 10),
        clicks: parseInt((metrics.clicks as string) ?? '0', 10),
        conversions: parseInt((metrics.conversions as string) ?? '0', 10),
        conversionValue: parseFloat((metrics.conversionsValue as string) ?? '0'),
      },
      update: {
        spend,
        impressions: parseInt((metrics.impressions as string) ?? '0', 10),
        clicks: parseInt((metrics.clicks as string) ?? '0', 10),
      },
    });
    count++;
  }
  } // end google_ads while

  // TikTok
  skip = 0;
  while (true) {
    const ttRaw = await prisma.rawEvent.findMany({
      where: { source: 'tiktok', entity: 'insights' },
      take: BATCH,
      skip,
    });
    if (ttRaw.length === 0) break;
    skip += ttRaw.length;

  for (const raw of ttRaw) {
    const p = raw.payloadJson as Record<string, unknown>;
    const date = new Date((p.stat_time_day as string) + 'T00:00:00Z');
    const campaignId = (p.campaign_id as string) ?? '';
    const campaignName = (p.campaign_name as string) ?? '';
    const spend = parseFloat((p.spend as string) ?? '0');
    const impressions = parseInt((p.impressions as string) ?? '0', 10);
    const clicks = parseInt((p.clicks as string) ?? '0', 10);
    const conversions = parseInt((p.conversions as string) ?? '0', 10);

    await prisma.stgSpend.upsert({
      where: { date_source_campaignId: { date, source: 'tiktok', campaignId } },
      create: {
        date,
        source: 'tiktok',
        campaignId,
        campaignName,
        spend,
        impressions,
        clicks,
        conversions,
        conversionValue: 0,
      },
      update: { spend, impressions, clicks, conversions },
    });
    count++;
  }
  } // end tiktok while

  log.info({ count }, 'Spend normalized');
  return count;
}

// ── Traffic (GA4) ───────────────────────────────────────────
async function normalizeTraffic(): Promise<number> {
  let count = 0;
  const BATCH = 500;
  let skip = 0;

  while (true) {
    const ga4Raw = await prisma.rawEvent.findMany({
      where: { source: 'ga4', entity: 'traffic' },
      take: BATCH,
      skip,
    });
    if (ga4Raw.length === 0) break;
    skip += ga4Raw.length;

  for (const raw of ga4Raw) {
    const p = raw.payloadJson as Record<string, unknown>;
    const date = new Date((p.date as string) + 'T00:00:00Z');
    const channelRaw = (p.sessionDefaultChannelGroup as string) ?? 'Other';

    await prisma.stgTraffic.upsert({
      where: { date_source_channelRaw: { date, source: 'ga4', channelRaw } },
      create: {
        date,
        source: 'ga4',
        channelRaw,
        sessions: parseInt((p.sessions as string) ?? '0', 10),
        pdpViews: parseInt((p.itemViews as string) ?? '0', 10),
        addToCart: parseInt((p.addToCarts as string) ?? '0', 10),
        checkouts: parseInt((p.checkouts as string) ?? '0', 10),
        purchases: parseInt((p.ecommercePurchases as string) ?? '0', 10),
      },
      update: {
        sessions: parseInt((p.sessions as string) ?? '0', 10),
        pdpViews: parseInt((p.itemViews as string) ?? '0', 10),
        addToCart: parseInt((p.addToCarts as string) ?? '0', 10),
        checkouts: parseInt((p.checkouts as string) ?? '0', 10),
        purchases: parseInt((p.ecommercePurchases as string) ?? '0', 10),
      },
    });
    count++;
  }
  } // end while

  log.info({ count }, 'Traffic normalized');
  return count;
}

// ── Email (Klaviyo) ──────────────────────────────────────────
async function normalizeEmail(): Promise<number> {
  let count = 0;
  const BATCH = 500;
  let skip = 0;

  while (true) {
    const klaviyoRaw = await prisma.rawEvent.findMany({
      where: { source: 'klaviyo' },
      take: BATCH,
      skip,
    });
    if (klaviyoRaw.length === 0) break;
    skip += klaviyoRaw.length;

    for (const raw of klaviyoRaw) {
      const p = raw.payloadJson as Record<string, unknown>;
      const sendTime = (p.send_time as string) ?? '';
      const date = new Date(sendTime.split('T')[0] + 'T00:00:00Z');
      const campaignId = (p.id as string) ?? '';
      const campaignName = (p.name as string) ?? '';
      const campaignType = (p.campaign_type as string) ?? 'campaign';
      const stats = (p.stats as Record<string, number>) ?? {};

      await prisma.stgEmail.upsert({
        where: { date_source_campaignId: { date, source: 'klaviyo', campaignId } },
        create: {
          date,
          source: 'klaviyo',
          campaignId,
          campaignName,
          campaignType,
          sends: stats.sends ?? 0,
          opens: stats.opens ?? 0,
          clicks: stats.clicks ?? 0,
          bounces: stats.bounces ?? 0,
          unsubscribes: stats.unsubscribes ?? 0,
          conversions: stats.conversions ?? 0,
          revenue: stats.revenue ?? 0,
        },
        update: {
          sends: stats.sends ?? 0,
          opens: stats.opens ?? 0,
          clicks: stats.clicks ?? 0,
          bounces: stats.bounces ?? 0,
          unsubscribes: stats.unsubscribes ?? 0,
          conversions: stats.conversions ?? 0,
          revenue: stats.revenue ?? 0,
        },
      });
      count++;
    }
  }

  log.info({ count }, 'Email normalized');
  return count;
}

// ── Stripe Payments (enrich orders) ────────────────────────
async function normalizeStripePayments(): Promise<void> {
  const BATCH = 500;
  let skip = 0;

  while (true) {
    const stripeRaw = await prisma.rawEvent.findMany({
      where: { source: 'stripe', entity: 'charges' },
      take: BATCH,
      skip,
    });
    if (stripeRaw.length === 0) break;
    skip += stripeRaw.length;

    for (const raw of stripeRaw) {
      const p = raw.payloadJson as Record<string, unknown>;
      const metadata = (p.metadata as Record<string, string>) ?? {};
      const orderId = metadata.order_id;
      if (!orderId) continue;

      const paymentMethodDetails = p.payment_method_details as Record<string, unknown> | undefined;
      const card = paymentMethodDetails?.card as Record<string, unknown> | undefined;
      const paymentMethod = card?.brand
        ? `card_${card.brand as string}`
        : (paymentMethodDetails?.type as string) ?? 'unknown';
      const paymentStatus = (p.status as string) ?? 'unknown';

      // Try to enrich the matching stg_order
      try {
        await prisma.stgOrder.update({
          where: { orderId },
          data: { paymentMethod, paymentStatus },
        });
      } catch {
        // Order not found is OK — Stripe charges may not match 1:1
      }
    }
  }

  log.info('Stripe payments enriched');
}

// ── Helpers ─────────────────────────────────────────────────
function parseUtmParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const queryString = url.includes('?') ? url.split('?')[1] : '';
    if (!queryString) return params;
    const searchParams = new URLSearchParams(queryString);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }
  } catch {
    // ignore malformed URLs
  }
  return params;
}
