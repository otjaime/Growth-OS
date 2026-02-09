// ──────────────────────────────────────────────────────────────
// Growth OS — Step 3: Build Marts
// Reads staging tables and builds dim_*/fact_*/cohorts
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';
import { CATEGORY_MARGINS, SHIPPING_COST_RATE, OPS_COST_RATE } from '../types.js';
import { mapGA4ChannelToSlug } from './channel-mapping.js';

const log = createLogger('pipeline:build-marts');

export async function buildMarts(): Promise<{
  campaigns: number;
  customers: number;
  orders: number;
  spend: number;
  traffic: number;
  cohorts: number;
}> {
  log.info('Building mart tables');

  const campaigns = await buildDimCampaign();
  const customers = await buildDimCustomer();
  const orders = await buildFactOrders();
  const spend = await buildFactSpend();
  const traffic = await buildFactTraffic();
  const cohorts = await buildCohorts();

  log.info({ campaigns, customers, orders, spend, traffic, cohorts }, 'Marts built');
  return { campaigns, customers, orders, spend, traffic, cohorts };
}

// ── dim_campaign ────────────────────────────────────────────
async function buildDimCampaign(): Promise<number> {
  const stgSpend = await prisma.stgSpend.findMany({
    distinct: ['source', 'campaignId'],
    select: { source: true, campaignId: true, campaignName: true },
  });

  let count = 0;
  for (const row of stgSpend) {
    const channelSlug = row.source === 'meta' ? 'meta' : 'google';
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
    Array<{ customer_id: string; first_date: Date; channel: string }>
  >`
    SELECT customer_id, MIN(order_date) as first_date, 
           (ARRAY_AGG(channel_raw ORDER BY order_date))[1] as channel
    FROM stg_orders 
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  `;

  const firstOrderMap = new Map(firstOrders.map((r) => [r.customer_id, r]));

  let count = 0;
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

  log.info({ count }, 'dim_customer built');
  return count;
}

// ── fact_orders ─────────────────────────────────────────────
async function buildFactOrders(): Promise<number> {
  const stgOrders = await prisma.stgOrder.findMany();
  const channels = await prisma.dimChannel.findMany();
  const channelMap = new Map(channels.map((c) => [c.slug, c.id]));

  let count = 0;
  for (const order of stgOrders) {
    const channelSlug = order.channelRaw ?? 'direct';
    const channelId = channelMap.get(channelSlug) ?? channelMap.get('other') ?? null;

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
    if (lineItems) {
      for (const item of lineItems) {
        const category = ((item.product_type as string) ?? 'default').toLowerCase();
        const margin = CATEGORY_MARGINS[category] ?? CATEGORY_MARGINS['default']!;
        const price = parseFloat((item.price as string) ?? '0');
        cogs += price * (1 - margin);
      }
    } else {
      cogs = Number(order.revenueGross) * (1 - CATEGORY_MARGINS['default']!);
    }

    const revenueNet = Number(order.revenueNet);
    const shippingCost = revenueNet * SHIPPING_COST_RATE;
    const opsCost = revenueNet * OPS_COST_RATE;
    const contributionMargin = revenueNet - cogs - shippingCost - opsCost;

    await prisma.factOrder.upsert({
      where: { orderId: order.orderId },
      create: {
        orderId: order.orderId,
        orderDate: order.orderDate,
        customerId: order.customerId,
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
        category: lineItems?.[0] ? (lineItems[0].product_type as string) : null,
        region: order.region,
        isNewCustomer: order.isNewCustomer,
      },
      update: {
        revenueGross: order.revenueGross,
        discounts: order.discounts,
        refunds: order.refunds,
        revenueNet: order.revenueNet,
        cogs: Math.round(cogs * 100) / 100,
        contributionMargin: Math.round(contributionMargin * 100) / 100,
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
    const channelSlug = row.source === 'meta' ? 'meta' : 'google';
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

  let count = 0;
  for (const row of stgTraffic) {
    const channelSlug = mapGA4ChannelToSlug(row.channelRaw ?? 'Other');
    const channelId = channelMap.get(channelSlug) ?? channelMap.get('other');
    if (!channelId) continue;

    await prisma.factTraffic.upsert({
      where: { date_channelId: { date: row.date, channelId } },
      create: {
        date: row.date,
        channelId,
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

// ── Cohorts ─────────────────────────────────────────────────
async function buildCohorts(): Promise<number> {
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

    // Calculate retention (repeat purchase within D days)
    const cohortCustomers = await prisma.dimCustomer.findMany({
      where: { cohortMonth: cm.cohort_month },
      select: { customerId: true, firstOrderDate: true },
    });

    const customerIds = cohortCustomers.map((c) => c.customerId);

    // Get all orders for these customers
    const orders = await prisma.factOrder.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, orderDate: true },
      orderBy: { orderDate: 'asc' },
    });

    // Build customer -> order dates map
    const customerOrders = new Map<string, Date[]>();
    for (const o of orders) {
      if (!o.customerId) continue;
      const dates = customerOrders.get(o.customerId) ?? [];
      dates.push(o.orderDate);
      customerOrders.set(o.customerId, dates);
    }

    const cohortSize = cm.cohort_size;
    // Use Sets to count unique customers per retention window (not per order)
    const d7Set = new Set<string>();
    const d30Set = new Set<string>();
    const d60Set = new Set<string>();
    const d90Set = new Set<string>();
    let totalRev30 = 0, totalRev90 = 0, totalRev180 = 0;

    for (const cust of cohortCustomers) {
      const dates = customerOrders.get(cust.customerId) ?? [];
      const firstDate = cust.firstOrderDate;
      if (!firstDate || dates.length <= 1) continue;

      const repeatDates = dates.slice(1);
      for (const rd of repeatDates) {
        const daysDiff = Math.floor(
          (rd.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysDiff <= 7) d7Set.add(cust.customerId);
        if (daysDiff <= 30) d30Set.add(cust.customerId);
        if (daysDiff <= 60) d60Set.add(cust.customerId);
        if (daysDiff <= 90) d90Set.add(cust.customerId);
      }
    }

    const d7 = d7Set.size;
    const d30 = d30Set.size;
    const d60 = d60Set.size;
    const d90 = d90Set.size;

    // LTV: total revenue for cohort within time windows
    for (const cust of cohortCustomers) {
      const custOrders = await prisma.factOrder.findMany({
        where: { customerId: cust.customerId },
        select: { orderDate: true, revenueNet: true },
      });
      const firstDate = cust.firstOrderDate;
      if (!firstDate) continue;

      for (const o of custOrders) {
        const daysDiff = Math.floor(
          (o.orderDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const rev = Number(o.revenueNet);
        if (daysDiff <= 30) totalRev30 += rev;
        if (daysDiff <= 90) totalRev90 += rev;
        if (daysDiff <= 180) totalRev180 += rev;
      }
    }

    // Get average CAC for this cohort
    const [yearStr, monthStr] = cm.cohort_month.split('-');
    const monthStart = new Date(`${yearStr}-${monthStr}-01T00:00:00Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

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

    // Payback days: rough estimate (CAC / daily avg contribution)
    const dailyContrib = ltv30 > 0 ? (ltv30 * 0.35) / 30 : 1; // 35% margin estimate
    const paybackDays = avgCac > 0 && dailyContrib > 0 ? Math.round(avgCac / dailyContrib) : null;

    await prisma.cohort.upsert({
      where: { cohortMonth: cm.cohort_month },
      create: {
        cohortMonth: cm.cohort_month,
        cohortSize,
        d7Retention: cohortSize > 0 ? d7 / cohortSize : 0,
        d30Retention: cohortSize > 0 ? d30 / cohortSize : 0,
        d60Retention: cohortSize > 0 ? d60 / cohortSize : 0,
        d90Retention: cohortSize > 0 ? d90 / cohortSize : 0,
        ltv30: Math.round(ltv30 * 100) / 100,
        ltv90: Math.round(ltv90 * 100) / 100,
        ltv180: Math.round(ltv180 * 100) / 100,
        paybackDays,
        avgCac: Math.round(avgCac * 100) / 100,
      },
      update: {
        cohortSize,
        d7Retention: cohortSize > 0 ? d7 / cohortSize : 0,
        d30Retention: cohortSize > 0 ? d30 / cohortSize : 0,
        d60Retention: cohortSize > 0 ? d60 / cohortSize : 0,
        d90Retention: cohortSize > 0 ? d90 / cohortSize : 0,
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
