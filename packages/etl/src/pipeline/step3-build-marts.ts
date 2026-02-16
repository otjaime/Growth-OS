// ──────────────────────────────────────────────────────────────
// Growth OS — Step 3: Build Marts
// Reads staging tables and builds dim_*/fact_*/cohorts
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';
import { CATEGORY_MARGINS, SHIPPING_COST_RATE, OPS_COST_RATE } from '../types.js';
import { mapGA4ChannelToSlug } from './channel-mapping.js';
import { computeRFMScores } from '../segmentation.js';

const log = createLogger('pipeline:build-marts');

export async function buildMarts(): Promise<{
  campaigns: number;
  customers: number;
  orders: number;
  spend: number;
  traffic: number;
  email: number;
  cohorts: number;
}> {
  log.info('Building mart tables');

  // Ensure dim_channel is always seeded (required by all downstream mart builders)
  await seedChannels();

  const campaigns = await buildDimCampaign();
  const customers = await buildDimCustomer();
  await updateRFMScores();
  const orders = await buildFactOrders();
  const spend = await buildFactSpend();
  const traffic = await buildFactTraffic();
  const email = await buildFactEmail();
  const cohorts = await buildCohorts();

  log.info({ campaigns, customers, orders, spend, traffic, email, cohorts }, 'Marts built');
  return { campaigns, customers, orders, spend, traffic, email, cohorts };
}

// ── seed dim_channel ────────────────────────────────────────
async function seedChannels(): Promise<void> {
  const channels = [
    { slug: 'meta', name: 'Meta Ads' },
    { slug: 'google', name: 'Google Ads' },
    { slug: 'tiktok', name: 'TikTok Ads' },
    { slug: 'email', name: 'Email' },
    { slug: 'organic', name: 'Organic' },
    { slug: 'affiliate', name: 'Affiliate' },
    { slug: 'direct', name: 'Direct' },
    { slug: 'other', name: 'Other' },
  ];
  for (const ch of channels) {
    await prisma.dimChannel.upsert({
      where: { slug: ch.slug },
      update: { name: ch.name },
      create: ch,
    });
  }
  log.info('dim_channel seeded');
}

// ── dim_campaign ────────────────────────────────────────────
async function buildDimCampaign(): Promise<number> {
  const stgSpend = await prisma.stgSpend.findMany({
    distinct: ['source', 'campaignId'],
    select: { source: true, campaignId: true, campaignName: true },
  });

  let count = 0;
  for (const row of stgSpend) {
    const channelSlug = row.source === 'meta' ? 'meta' : row.source === 'tiktok' ? 'tiktok' : 'google';
    const channel = await prisma.dimChannel.findUnique({ where: { slug: channelSlug } });
    if (!channel) continue;

    await prisma.dimCampaign.upsert({
      where: { source_campaignId: { source: row.source, campaignId: row.campaignId } },
      create: {
        source: row.source,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        channelId: channel.id,
      },
      update: { campaignName: row.campaignName },
    });
    count++;
  }

  log.info({ count }, 'dim_campaign built');
  return count;
}

// ── dim_customer ────────────────────────────────────────────
async function buildDimCustomer(): Promise<number> {
  const stgCustomers = await prisma.stgCustomer.findMany();
  // Also get first-order info from stg_orders
  const firstOrders = await prisma.$queryRaw<
    Array<{ customer_id: string; first_date: Date; channel: string; email: string | null; region: string | null; order_count: number; total_rev: number }>
  >`
    SELECT customer_id, MIN(order_date) as first_date,
           (ARRAY_AGG(channel_raw ORDER BY order_date))[1] as channel,
           (ARRAY_AGG(email ORDER BY order_date))[1] as email,
           (ARRAY_AGG(region ORDER BY order_date))[1] as region,
           COUNT(*)::int as order_count,
           COALESCE(SUM(revenue_net), 0)::numeric as total_rev
    FROM stg_orders
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  `;

  const firstOrderMap = new Map(firstOrders.map((r) => [r.customer_id, r]));
  const stgCustomerIds = new Set(stgCustomers.map((c) => c.customerId));

  let count = 0;

  // 1. Upsert from stg_customers (dedicated customer sync)
  for (const cust of stgCustomers) {
    const fo = firstOrderMap.get(cust.customerId);
    const firstDate = fo?.first_date ?? cust.firstOrderDate;
    const cohortMonth = firstDate
      ? `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}`
      : null;

    await prisma.dimCustomer.upsert({
      where: { customerId: cust.customerId },
      create: {
        customerId: cust.customerId,
        firstOrderDate: firstDate,
        acquisitionChannel: fo?.channel ?? cust.acquisitionChannel,
        region: cust.region,
        isNewCustomer: true,
        cohortMonth,
        totalOrders: cust.totalOrders,
        totalRevenue: cust.totalRevenue,
      },
      update: {
        totalOrders: cust.totalOrders,
        totalRevenue: cust.totalRevenue,
        cohortMonth,
      },
    });
    count++;
  }

  // 2. Create dim_customer entries from orders for customers not in stg_customers.
  //    This handles the case where the customer sync is unavailable (e.g. Shopify
  //    GraphQL customer endpoint not implemented) but orders contain customer data.
  for (const fo of firstOrders) {
    if (stgCustomerIds.has(fo.customer_id)) continue; // already handled above

    const cohortMonth = fo.first_date
      ? `${fo.first_date.getFullYear()}-${String(fo.first_date.getMonth() + 1).padStart(2, '0')}`
      : null;

    await prisma.dimCustomer.upsert({
      where: { customerId: fo.customer_id },
      create: {
        customerId: fo.customer_id,
        firstOrderDate: fo.first_date,
        acquisitionChannel: fo.channel ?? null,
        region: fo.region ?? null,
        isNewCustomer: true,
        cohortMonth,
        totalOrders: fo.order_count,
        totalRevenue: fo.total_rev,
      },
      update: {
        totalOrders: fo.order_count,
        totalRevenue: fo.total_rev,
        cohortMonth,
      },
    });
    count++;
  }

  log.info({ count }, 'dim_customer built');
  return count;
}

// ── RFM scoring ────────────────────────────────────────────
async function updateRFMScores(): Promise<void> {
  const customers = await prisma.dimCustomer.findMany({
    select: { customerId: true, totalOrders: true, totalRevenue: true },
  });

  // Get last order date per customer from fact_orders
  const lastOrders = await prisma.$queryRaw<
    Array<{ customer_id: string; last_date: Date }>
  >`
    SELECT customer_id, MAX(order_date) as last_date
    FROM fact_orders
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  `;
  // If fact_orders hasn't been built yet, try stg_orders
  const lastOrdersFallback = lastOrders.length === 0
    ? await prisma.$queryRaw<
        Array<{ customer_id: string; last_date: Date }>
      >`
        SELECT customer_id, MAX(order_date) as last_date
        FROM stg_orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      `
    : [];
  const lastOrderMap = new Map(
    (lastOrders.length > 0 ? lastOrders : lastOrdersFallback).map((r) => [r.customer_id, r.last_date]),
  );

  const rfmInput = customers
    .filter((c) => lastOrderMap.has(c.customerId))
    .map((c) => ({
      customerId: c.customerId,
      lastOrderDate: lastOrderMap.get(c.customerId)!,
      totalOrders: c.totalOrders,
      totalRevenue: Number(c.totalRevenue),
    }));

  if (rfmInput.length === 0) {
    log.info('No customers with orders for RFM scoring');
    return;
  }

  const rfmResults = computeRFMScores(rfmInput);

  for (const r of rfmResults) {
    await prisma.dimCustomer.update({
      where: { customerId: r.customerId },
      data: {
        lastOrderDate: lastOrderMap.get(r.customerId) ?? null,
        rfmRecency: r.rfmScores.recency,
        rfmFrequency: r.rfmScores.frequency,
        rfmMonetary: r.rfmScores.monetary,
        segment: r.segment,
      },
    });
  }

  log.info({ count: rfmResults.length }, 'RFM scores updated');
}

// ── fact_orders ─────────────────────────────────────────────
async function buildFactOrders(): Promise<number> {
  const stgOrders = await prisma.stgOrder.findMany();
  const channels = await prisma.dimChannel.findMany();
  const channelMap = new Map(channels.map((c) => [c.slug, c.id]));

  // Pre-load dim_customer with firstOrderDate so we can compute isNewCustomer
  // and validate FK references
  const dimCustomers = await prisma.dimCustomer.findMany({
    select: { customerId: true, firstOrderDate: true },
  });
  const validCustomerIds = new Set(dimCustomers.map((c) => c.customerId));
  const customerFirstDate = new Map(
    dimCustomers.map((c) => [c.customerId, c.firstOrderDate]),
  );

  // Pre-compute the earliest order per customer so only ONE order is flagged isNewCustomer
  const firstOrderPerCustomer = new Map<string, string>();
  const sortedOrders = [...stgOrders].sort((a, b) => {
    const da = a.orderDate?.getTime() ?? 0;
    const db = b.orderDate?.getTime() ?? 0;
    return da - db || a.orderId.localeCompare(b.orderId);
  });
  for (const order of sortedOrders) {
    if (order.customerId && !firstOrderPerCustomer.has(order.customerId)) {
      firstOrderPerCustomer.set(order.customerId, order.orderId);
    }
  }

  let count = 0;
  for (const order of stgOrders) {
    const channelSlug = order.channelRaw ?? 'direct';
    const channelId = channelMap.get(channelSlug) ?? channelMap.get('other') ?? null;
    // Only set customerId if the customer exists in dim_customer (FK constraint)
    const safeCustomerId = order.customerId && validCustomerIds.has(order.customerId)
      ? order.customerId
      : null;

    // Find campaign if UTM campaign matches
    let campaignId: string | null = null;
    if (order.utmCampaign && (channelSlug === 'meta' || channelSlug === 'google')) {
      const source = channelSlug === 'meta' ? 'meta' : 'google_ads';
      const campaign = await prisma.dimCampaign.findFirst({
        where: { source, campaignName: order.utmCampaign },
      });
      campaignId = campaign?.id ?? null;
    }

    // Estimate COGS from line items
    const lineItems = order.lineItemsJson as Array<Record<string, unknown>> | null;
    let cogs = 0;
    let firstProductType: string | null = null;
    if (lineItems) {
      for (const item of lineItems) {
        // GraphQL: product.productType, demo: product_type
        const product = item.product as Record<string, unknown> | undefined;
        const productType = (item.product_type as string) ?? (product?.productType as string) ?? 'default';
        if (!firstProductType) firstProductType = productType;
        const category = productType.toLowerCase();
        const margin = CATEGORY_MARGINS[category] ?? CATEGORY_MARGINS['default']!;
        // GraphQL: originalUnitPriceSet.shopMoney.amount, demo: price
        const priceSet = item.originalUnitPriceSet as { shopMoney?: { amount?: string } } | undefined;
        const price = parseFloat(priceSet?.shopMoney?.amount ?? (item.price as string) ?? '0');
        const qty = parseInt(String(item.quantity ?? '1'), 10);
        cogs += price * qty * (1 - margin);
      }
    } else {
      cogs = Number(order.revenueGross) * (1 - CATEGORY_MARGINS['default']!);
    }

    const revenueNet = Number(order.revenueNet);
    const shippingCost = revenueNet * SHIPPING_COST_RATE;
    const opsCost = revenueNet * OPS_COST_RATE;
    const contributionMargin = revenueNet - cogs - shippingCost - opsCost;

    // isNewCustomer = true only for the customer's very first order
    const isNewCustomer = !!(order.customerId
      && firstOrderPerCustomer.get(order.customerId) === order.orderId);

    await prisma.factOrder.upsert({
      where: { orderId: order.orderId },
      create: {
        orderId: order.orderId,
        orderDate: order.orderDate,
        customerId: safeCustomerId,
        revenueGross: order.revenueGross,
        discounts: order.discounts,
        refunds: order.refunds,
        revenueNet: order.revenueNet,
        cogs: Math.round(cogs * 100) / 100,
        shippingCost: Math.round(shippingCost * 100) / 100,
        opsCost: Math.round(opsCost * 100) / 100,
        contributionMargin: Math.round(contributionMargin * 100) / 100,
        channelId,
        campaignId,
        category: firstProductType,
        region: order.region,
        isNewCustomer,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
      update: {
        revenueGross: order.revenueGross,
        discounts: order.discounts,
        refunds: order.refunds,
        revenueNet: order.revenueNet,
        cogs: Math.round(cogs * 100) / 100,
        contributionMargin: Math.round(contributionMargin * 100) / 100,
        channelId,
        isNewCustomer,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
    });
    count++;
  }

  log.info({ count }, 'fact_orders built');
  return count;
}

// ── fact_spend ──────────────────────────────────────────────
async function buildFactSpend(): Promise<number> {
  const stgSpend = await prisma.stgSpend.findMany();
  const channels = await prisma.dimChannel.findMany();
  const channelMap = new Map(channels.map((c) => [c.slug, c.id]));

  let count = 0;
  for (const row of stgSpend) {
    const channelSlug = row.source === 'meta' ? 'meta' : row.source === 'tiktok' ? 'tiktok' : 'google';
    const channelId = channelMap.get(channelSlug);
    if (!channelId) continue;

    const campaign = await prisma.dimCampaign.findFirst({
      where: { source: row.source, campaignId: row.campaignId },
    });

    await prisma.factSpend.upsert({
      where: {
        date_channelId_campaignId: {
          date: row.date,
          channelId,
          campaignId: campaign?.id ?? 'unknown',
        },
      },
      create: {
        date: row.date,
        channelId,
        campaignId: campaign?.id,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
      },
      update: {
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
      },
    });
    count++;
  }

  log.info({ count }, 'fact_spend built');
  return count;
}

// ── fact_traffic ────────────────────────────────────────────
async function buildFactTraffic(): Promise<number> {
  const stgTraffic = await prisma.stgTraffic.findMany();
  const channels = await prisma.dimChannel.findMany();
  const channelMap = new Map(channels.map((c) => [c.slug, c.id]));

  // Pre-aggregate: multiple GA4 channels may map to the same normalized channel
  // (e.g., "Organic Search" + "Organic Social" → "organic")
  const agg = new Map<string, { date: Date; channelId: string; sessions: number; pdpViews: number; addToCart: number; checkouts: number; purchases: number }>();

  for (const row of stgTraffic) {
    const channelSlug = mapGA4ChannelToSlug(row.channelRaw ?? 'Other');
    const channelId = channelMap.get(channelSlug) ?? channelMap.get('other');
    if (!channelId) continue;

    const key = `${row.date.toISOString()}|${channelId}`;
    const existing = agg.get(key);
    if (existing) {
      existing.sessions += row.sessions;
      existing.pdpViews += row.pdpViews;
      existing.addToCart += row.addToCart;
      existing.checkouts += row.checkouts;
      existing.purchases += row.purchases;
    } else {
      agg.set(key, {
        date: row.date,
        channelId,
        sessions: row.sessions,
        pdpViews: row.pdpViews,
        addToCart: row.addToCart,
        checkouts: row.checkouts,
        purchases: row.purchases,
      });
    }
  }

  let count = 0;
  for (const row of agg.values()) {
    await prisma.factTraffic.upsert({
      where: { date_channelId: { date: row.date, channelId: row.channelId } },
      create: {
        date: row.date,
        channelId: row.channelId,
        sessions: row.sessions,
        pdpViews: row.pdpViews,
        addToCart: row.addToCart,
        checkouts: row.checkouts,
        purchases: row.purchases,
      },
      update: {
        sessions: row.sessions,
        pdpViews: row.pdpViews,
        addToCart: row.addToCart,
        checkouts: row.checkouts,
        purchases: row.purchases,
      },
    });
    count++;
  }

  log.info({ count }, 'fact_traffic built');
  return count;
}

// ── fact_email ──────────────────────────────────────────────
async function buildFactEmail(): Promise<number> {
  const stgEmail = await prisma.stgEmail.findMany();
  const channels = await prisma.dimChannel.findMany();
  const channelMap = new Map(channels.map((c) => [c.slug, c.id]));
  const emailChannelId = channelMap.get('email');
  if (!emailChannelId) {
    log.warn('Email channel not found in dim_channel, skipping fact_email');
    return 0;
  }

  let count = 0;
  for (const row of stgEmail) {
    // Find or skip campaign mapping
    let campaignId: string | null = null;
    if (row.campaignType === 'campaign') {
      const campaign = await prisma.dimCampaign.findFirst({
        where: { source: 'klaviyo', campaignId: row.campaignId },
      });
      campaignId = campaign?.id ?? null;

      // Create campaign dim entry if not found
      if (!campaignId) {
        const created = await prisma.dimCampaign.create({
          data: {
            source: 'klaviyo',
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            channelId: emailChannelId,
          },
        });
        campaignId = created.id;
      }
    }

    const openRate = row.sends > 0 ? row.opens / row.sends : 0;
    const clickRate = row.opens > 0 ? row.clicks / row.opens : 0;
    const conversionRate = row.clicks > 0 ? row.conversions / row.clicks : 0;

    await prisma.factEmail.upsert({
      where: {
        date_channelId_campaignId: {
          date: row.date,
          channelId: emailChannelId,
          campaignId: campaignId ?? 'none',
        },
      },
      create: {
        date: row.date,
        channelId: emailChannelId,
        campaignId,
        sends: row.sends,
        opens: row.opens,
        clicks: row.clicks,
        bounces: row.bounces,
        unsubscribes: row.unsubscribes,
        conversions: row.conversions,
        revenue: row.revenue,
        openRate: Math.round(openRate * 10000) / 10000,
        clickRate: Math.round(clickRate * 10000) / 10000,
        conversionRate: Math.round(conversionRate * 10000) / 10000,
      },
      update: {
        sends: row.sends,
        opens: row.opens,
        clicks: row.clicks,
        bounces: row.bounces,
        unsubscribes: row.unsubscribes,
        conversions: row.conversions,
        revenue: row.revenue,
        openRate: Math.round(openRate * 10000) / 10000,
        clickRate: Math.round(clickRate * 10000) / 10000,
        conversionRate: Math.round(conversionRate * 10000) / 10000,
      },
    });
    count++;
  }

  log.info({ count }, 'fact_email built');
  return count;
}

// ── Cohorts ─────────────────────────────────────────────────
async function buildCohorts(): Promise<number> {
  const now = new Date();

  // Get cohort months from dim_customer
  const cohortMonths = await prisma.$queryRaw<
    Array<{ cohort_month: string; cohort_size: number }>
  >`
    SELECT cohort_month, COUNT(*)::int as cohort_size
    FROM dim_customer
    WHERE cohort_month IS NOT NULL
    GROUP BY cohort_month
    ORDER BY cohort_month
  `;

  let count = 0;
  for (const cm of cohortMonths) {
    if (!cm.cohort_month) continue;

    const cohortCustomers = await prisma.dimCustomer.findMany({
      where: { cohortMonth: cm.cohort_month },
      select: { customerId: true, firstOrderDate: true },
    });

    const customerIds = cohortCustomers.map((c) => c.customerId);

    // Single batch query: all orders with revenue for all cohort customers
    const orders = await prisma.factOrder.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, orderDate: true, revenueNet: true, contributionMargin: true },
      orderBy: { orderDate: 'asc' },
    });

    // Build customer -> orders map (dates + revenue in one pass)
    const customerOrders = new Map<string, Array<{ date: Date; rev: number; cm: number }>>();
    for (const o of orders) {
      if (!o.customerId) continue;
      const list = customerOrders.get(o.customerId) ?? [];
      list.push({ date: o.orderDate, rev: Number(o.revenueNet), cm: Number(o.contributionMargin) });
      customerOrders.set(o.customerId, list);
    }

    const cohortSize = cm.cohort_size;
    const d7Set = new Set<string>();
    const d30Set = new Set<string>();
    const d60Set = new Set<string>();
    const d90Set = new Set<string>();
    let totalRev30 = 0, totalRev90 = 0, totalRev180 = 0;
    let totalCm30 = 0;

    // Determine cohort maturity: how many days since the start of the cohort month
    const [yearStr, monthStr] = cm.cohort_month.split('-');
    const monthStart = new Date(`${yearStr}-${monthStr}-01T00:00:00Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const cohortAgeDays = Math.floor(
      (now.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24),
    );

    for (const cust of cohortCustomers) {
      const custOrders = customerOrders.get(cust.customerId) ?? [];
      const firstDate = cust.firstOrderDate;
      if (!firstDate) continue;

      // LTV: accumulate ALL orders (including first) within time windows
      for (const o of custOrders) {
        const daysDiff = Math.floor(
          (o.date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysDiff <= 30) { totalRev30 += o.rev; totalCm30 += o.cm; }
        if (daysDiff <= 90) totalRev90 += o.rev;
        if (daysDiff <= 180) totalRev180 += o.rev;
      }

      // Retention: only repeat orders (skip first)
      if (custOrders.length <= 1) continue;
      const repeatOrders = custOrders.slice(1);
      for (const o of repeatOrders) {
        const daysDiff = Math.floor(
          (o.date.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysDiff <= 7) d7Set.add(cust.customerId);
        if (daysDiff <= 30) d30Set.add(cust.customerId);
        if (daysDiff <= 60) d60Set.add(cust.customerId);
        if (daysDiff <= 90) d90Set.add(cust.customerId);
      }
    }

    // Retention: use null for windows the cohort hasn't matured into yet
    const d7Ret = cohortAgeDays >= 7 ? (cohortSize > 0 ? d7Set.size / cohortSize : 0) : null;
    const d30Ret = cohortAgeDays >= 30 ? (cohortSize > 0 ? d30Set.size / cohortSize : 0) : null;
    const d60Ret = cohortAgeDays >= 60 ? (cohortSize > 0 ? d60Set.size / cohortSize : 0) : null;
    const d90Ret = cohortAgeDays >= 90 ? (cohortSize > 0 ? d90Set.size / cohortSize : 0) : null;

    // CAC: total ad spend / new customers acquired in the same month
    const totalSpendResult = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: monthStart, lt: monthEnd } },
    });

    const newCustomersResult = await prisma.factOrder.count({
      where: {
        orderDate: { gte: monthStart, lt: monthEnd },
        isNewCustomer: true,
      },
    });

    const totalSpend = Number(totalSpendResult._sum.spend ?? 0);
    const avgCac = newCustomersResult > 0 ? totalSpend / newCustomersResult : 0;
    const ltv30 = cohortSize > 0 ? totalRev30 / cohortSize : 0;
    const ltv90 = cohortSize > 0 ? totalRev90 / cohortSize : 0;
    const ltv180 = cohortSize > 0 ? totalRev180 / cohortSize : 0;

    // Payback days: use actual CM% from the cohort's orders (not hardcoded)
    const actualCmPct = totalRev30 > 0 ? totalCm30 / totalRev30 : 0;
    const dailyContrib = ltv30 > 0 && actualCmPct > 0 ? (ltv30 * actualCmPct) / 30 : 0;
    const paybackDays = avgCac > 0 && dailyContrib > 0 ? Math.round(avgCac / dailyContrib) : null;

    await prisma.cohort.upsert({
      where: { cohortMonth: cm.cohort_month },
      create: {
        cohortMonth: cm.cohort_month,
        cohortSize,
        d7Retention: d7Ret ?? 0,
        d30Retention: d30Ret ?? 0,
        d60Retention: d60Ret ?? 0,
        d90Retention: d90Ret ?? 0,
        ltv30: Math.round(ltv30 * 100) / 100,
        ltv90: Math.round(ltv90 * 100) / 100,
        ltv180: Math.round(ltv180 * 100) / 100,
        paybackDays,
        avgCac: Math.round(avgCac * 100) / 100,
      },
      update: {
        cohortSize,
        d7Retention: d7Ret ?? 0,
        d30Retention: d30Ret ?? 0,
        d60Retention: d60Ret ?? 0,
        d90Retention: d90Ret ?? 0,
        ltv30: Math.round(ltv30 * 100) / 100,
        ltv90: Math.round(ltv90 * 100) / 100,
        ltv180: Math.round(ltv180 * 100) / 100,
        paybackDays,
        avgCac: Math.round(avgCac * 100) / 100,
      },
    });
    count++;
  }

  log.info({ count }, 'Cohorts built');
  return count;
}
