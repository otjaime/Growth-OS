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
}> {
  log.info('Starting staging normalization');

  const orders = await normalizeOrders();
  const customers = await normalizeCustomers();
  const spend = await normalizeSpend();
  const traffic = await normalizeTraffic();

  log.info({ orders, customers, spend, traffic }, 'Staging normalization complete');
  return { orders, customers, spend, traffic };
}

// ── Orders ──────────────────────────────────────────────────
async function normalizeOrders(): Promise<number> {
  const rawOrders = await prisma.rawEvent.findMany({
    where: { source: 'shopify', entity: 'orders' },
    orderBy: { fetchedAt: 'desc' },
  });

  let count = 0;
  const BATCH = 200;

  for (let i = 0; i < rawOrders.length; i += BATCH) {
    const batch = rawOrders.slice(i, i + BATCH);
    await prisma.$transaction(async (tx) => {
      for (const raw of batch) {
        const p = raw.payloadJson as Record<string, unknown>;
        const customer = p.customer as Record<string, unknown> | null;
        const lineItems = p.line_items as Array<Record<string, unknown>> | undefined;
        const shippingAddr = p.shipping_address as Record<string, unknown> | null;
        const landingSite = (p.landing_site as string) ?? '';

        // Parse UTM params from landing_site
        const utmParams = parseUtmParams(landingSite);
        const channelRaw = mapChannelFromOrder({
          sourceName: (p.source_name as string) ?? '',
          utmSource: utmParams.utm_source,
          utmMedium: utmParams.utm_medium,
          referringSite: (p.referring_site as string) ?? '',
        });

        const revenueGross = parseFloat((p.total_price as string) ?? '0');
        const discounts = parseFloat((p.total_discounts as string) ?? '0');
        const refunds = parseFloat((p.total_refunds as string) ?? '0');
        const revenueNet = revenueGross - discounts - refunds;

        const orderId = (p.order_number as number)?.toString() ?? (p.id as string);
        const customerId = customer
          ? (customer.id as string)?.replace('gid://shopify/Customer/', '')
          : null;

        await tx.stgOrder.upsert({
          where: { orderId },
          create: {
            orderId,
            orderDate: new Date(p.created_at as string),
            customerId,
            email: (customer?.email as string) ?? null,
            revenueGross,
            discounts,
            refunds,
            revenueNet,
            currency: (p.currency as string) ?? 'USD',
            sourceName: (p.source_name as string) ?? null,
            landingSite: landingSite || null,
            referringSite: (p.referring_site as string) ?? null,
            utmSource: utmParams.utm_source || null,
            utmMedium: utmParams.utm_medium || null,
            utmCampaign: utmParams.utm_campaign || null,
            channelRaw,
            region: (shippingAddr?.province_code as string) ?? null,
            lineItemsJson: lineItems ? (lineItems as unknown as Record<string, string>[]) : undefined,
            isNewCustomer: ((p.tags as string) ?? '').includes('new_customer'),
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
  const rawCustomers = await prisma.rawEvent.findMany({
    where: { source: 'shopify', entity: 'customers' },
  });

  let count = 0;
  for (const raw of rawCustomers) {
    const p = raw.payloadJson as Record<string, unknown>;
    const customerId = (p.id as string)?.replace('gid://shopify/Customer/', '') ?? raw.externalId!;
    const addr = p.default_address as Record<string, unknown> | null;

    await prisma.stgCustomer.upsert({
      where: { customerId },
      create: {
        customerId,
        email: (p.email as string) ?? null,
        firstOrderDate: p.created_at ? new Date(p.created_at as string) : null,
        region: (addr?.province_code as string) ?? null,
        totalOrders: (p.orders_count as number) ?? 0,
        totalRevenue: parseFloat((p.total_spent as string) ?? '0'),
      },
      update: {
        totalOrders: (p.orders_count as number) ?? 0,
        totalRevenue: parseFloat((p.total_spent as string) ?? '0'),
      },
    });
    count++;
  }

  log.info({ count }, 'Customers normalized');
  return count;
}

// ── Spend (Meta + Google Ads) ───────────────────────────────
async function normalizeSpend(): Promise<number> {
  // Meta
  const metaRaw = await prisma.rawEvent.findMany({
    where: { source: 'meta', entity: 'insights' },
  });

  let count = 0;
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

  // Google Ads
  const gadsRaw = await prisma.rawEvent.findMany({
    where: { source: 'google_ads', entity: 'campaign_performance' },
  });

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

  log.info({ count }, 'Spend normalized');
  return count;
}

// ── Traffic (GA4) ───────────────────────────────────────────
async function normalizeTraffic(): Promise<number> {
  const ga4Raw = await prisma.rawEvent.findMany({
    where: { source: 'ga4', entity: 'traffic' },
  });

  let count = 0;
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
        pdpViews: parseInt((p.screenPageViews as string) ?? '0', 10),
        addToCart: parseInt((p.addToCarts as string) ?? '0', 10),
        checkouts: parseInt((p.checkouts as string) ?? '0', 10),
        purchases: parseInt((p.ecommercePurchases as string) ?? '0', 10),
      },
      update: {
        sessions: parseInt((p.sessions as string) ?? '0', 10),
        pdpViews: parseInt((p.screenPageViews as string) ?? '0', 10),
        addToCart: parseInt((p.addToCarts as string) ?? '0', 10),
        checkouts: parseInt((p.checkouts as string) ?? '0', 10),
        purchases: parseInt((p.ecommercePurchases as string) ?? '0', 10),
      },
    });
    count++;
  }

  log.info({ count }, 'Traffic normalized');
  return count;
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
