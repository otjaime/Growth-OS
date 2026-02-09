// ──────────────────────────────────────────────────────────────
// Growth OS — Metrics API Routes
// Serves precomputed mart data for dashboard
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@growth-os/database';
import { subDays, format } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';

export async function metricsRoutes(app: FastifyInstance) {
  // ── Executive Summary KPIs ────────────────────────────────
  app.get('/metrics/summary', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date('2026-02-09'); // Fixed for demo determinism
    const currentStart = subDays(now, days);
    const previousStart = subDays(currentStart, days);

    // Current period
    const currentOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: currentStart, lte: now } },
    });
    const previousOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: previousStart, lt: currentStart } },
    });

    const currentSpendAgg = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: currentStart, lte: now } },
    });
    const previousSpendAgg = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: previousStart, lt: currentStart } },
    });

    const currentTrafficAgg = await prisma.factTraffic.aggregate({
      _sum: { sessions: true, purchases: true },
      where: { date: { gte: currentStart, lte: now } },
    });
    const previousTrafficAgg = await prisma.factTraffic.aggregate({
      _sum: { sessions: true, purchases: true },
      where: { date: { gte: previousStart, lt: currentStart } },
    });

    const cur = {
      revenueGross: currentOrders.reduce((s, o) => s + Number(o.revenueGross), 0),
      revenueNet: currentOrders.reduce((s, o) => s + Number(o.revenueNet), 0),
      contributionMargin: currentOrders.reduce((s, o) => s + Number(o.contributionMargin), 0),
      orders: currentOrders.length,
      newCustomers: currentOrders.filter((o) => o.isNewCustomer).length,
      spend: Number(currentSpendAgg._sum.spend ?? 0),
      sessions: currentTrafficAgg._sum.sessions ?? 0,
    };

    const prev = {
      revenueGross: previousOrders.reduce((s, o) => s + Number(o.revenueGross), 0),
      revenueNet: previousOrders.reduce((s, o) => s + Number(o.revenueNet), 0),
      contributionMargin: previousOrders.reduce((s, o) => s + Number(o.contributionMargin), 0),
      orders: previousOrders.length,
      newCustomers: previousOrders.filter((o) => o.isNewCustomer).length,
      spend: Number(previousSpendAgg._sum.spend ?? 0),
      sessions: previousTrafficAgg._sum.sessions ?? 0,
    };

    return {
      period: { start: format(currentStart, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd'), days },
      kpis: {
        revenueGross: { value: cur.revenueGross, change: kpiCalcs.kpis.percentChange(cur.revenueGross, prev.revenueGross) },
        revenueNet: { value: cur.revenueNet, change: kpiCalcs.kpis.percentChange(cur.revenueNet, prev.revenueNet) },
        orders: { value: cur.orders, change: kpiCalcs.kpis.percentChange(cur.orders, prev.orders) },
        aov: { value: kpiCalcs.kpis.aov(cur.revenueNet, cur.orders), change: kpiCalcs.kpis.percentChange(kpiCalcs.kpis.aov(cur.revenueNet, cur.orders), kpiCalcs.kpis.aov(prev.revenueNet, prev.orders)) },
        contributionMargin: { value: cur.contributionMargin, change: kpiCalcs.kpis.percentChange(cur.contributionMargin, prev.contributionMargin) },
        cmPct: { value: kpiCalcs.kpis.contributionMarginPct(cur.contributionMargin, cur.revenueNet), change: kpiCalcs.kpis.percentagePointChange(kpiCalcs.kpis.contributionMarginPct(cur.contributionMargin, cur.revenueNet), kpiCalcs.kpis.contributionMarginPct(prev.contributionMargin, prev.revenueNet)) },
        blendedCac: { value: kpiCalcs.kpis.blendedCac(cur.spend, cur.newCustomers), change: kpiCalcs.kpis.percentChange(kpiCalcs.kpis.blendedCac(cur.spend, cur.newCustomers), kpiCalcs.kpis.blendedCac(prev.spend, prev.newCustomers)) },
        mer: { value: kpiCalcs.kpis.mer(cur.revenueGross, cur.spend), change: kpiCalcs.kpis.percentChange(kpiCalcs.kpis.mer(cur.revenueGross, cur.spend), kpiCalcs.kpis.mer(prev.revenueGross, prev.spend)) },
        newCustomers: { value: cur.newCustomers, change: kpiCalcs.kpis.percentChange(cur.newCustomers, prev.newCustomers) },
        sessions: { value: cur.sessions, change: kpiCalcs.kpis.percentChange(cur.sessions, prev.sessions) },
        spend: { value: cur.spend, change: kpiCalcs.kpis.percentChange(cur.spend, prev.spend) },
      },
    };
  });

  // ── Daily timeseries for sparklines ───────────────────────
  app.get('/metrics/timeseries', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '30', 10);
    const now = new Date('2026-02-09');
    const start = subDays(now, days);

    const dailyRevenue = await prisma.$queryRaw<
      Array<{ date: Date; revenue: number; orders: number; new_customers: number }>
    >`
      SELECT order_date as date, 
             SUM(revenue_net)::float as revenue,
             COUNT(*)::int as orders,
             SUM(CASE WHEN is_new_customer THEN 1 ELSE 0 END)::int as new_customers
      FROM fact_orders
      WHERE order_date >= ${start} AND order_date <= ${now}
      GROUP BY order_date
      ORDER BY order_date
    `;

    const dailySpend = await prisma.$queryRaw<
      Array<{ date: Date; spend: number }>
    >`
      SELECT date, SUM(spend)::float as spend
      FROM fact_spend
      WHERE date >= ${start} AND date <= ${now}
      GROUP BY date ORDER BY date
    `;

    const dailyTraffic = await prisma.$queryRaw<
      Array<{ date: Date; sessions: number }>
    >`
      SELECT date, SUM(sessions)::int as sessions
      FROM fact_traffic
      WHERE date >= ${start} AND date <= ${now}
      GROUP BY date ORDER BY date
    `;

    return { dailyRevenue, dailySpend, dailyTraffic };
  });

  // ── Channel Performance ───────────────────────────────────
  app.get('/metrics/channels', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date('2026-02-09');
    const currentStart = subDays(now, days);
    const previousStart = subDays(currentStart, days);

    const channels = await prisma.dimChannel.findMany();
    const result = [];

    for (const channel of channels) {
      // Current period
      const curOrders = await prisma.factOrder.findMany({
        where: { channelId: channel.id, orderDate: { gte: currentStart, lte: now } },
      });
      const curSpendAgg = await prisma.factSpend.aggregate({
        _sum: { spend: true, impressions: true, clicks: true },
        where: { channelId: channel.id, date: { gte: currentStart, lte: now } },
      });

      // Previous period
      const prevOrders = await prisma.factOrder.findMany({
        where: { channelId: channel.id, orderDate: { gte: previousStart, lt: currentStart } },
      });
      const prevSpendAgg = await prisma.factSpend.aggregate({
        _sum: { spend: true },
        where: { channelId: channel.id, date: { gte: previousStart, lt: currentStart } },
      });

      const curRevenue = curOrders.reduce((s, o) => s + Number(o.revenueNet), 0);
      const curSpend = Number(curSpendAgg._sum.spend ?? 0);
      const curNewCust = curOrders.filter((o) => o.isNewCustomer).length;
      const curCM = curOrders.reduce((s, o) => s + Number(o.contributionMargin), 0);
      const prevRevenue = prevOrders.reduce((s, o) => s + Number(o.revenueNet), 0);
      const prevSpend = Number(prevSpendAgg._sum.spend ?? 0);

      result.push({
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        spend: curSpend,
        revenue: curRevenue,
        orders: curOrders.length,
        newCustomers: curNewCust,
        returningCustomers: curOrders.length - curNewCust,
        cac: kpiCalcs.kpis.channelCac(curSpend, curNewCust),
        roas: kpiCalcs.kpis.roas(curRevenue, curSpend),
        mer: kpiCalcs.kpis.mer(curRevenue, curSpend),
        contributionMargin: curCM,
        cmPct: kpiCalcs.kpis.contributionMarginPct(curCM, curRevenue),
        impressions: curSpendAgg._sum.impressions ?? 0,
        clicks: curSpendAgg._sum.clicks ?? 0,
        revenueChange: kpiCalcs.kpis.percentChange(curRevenue, prevRevenue),
        spendChange: kpiCalcs.kpis.percentChange(curSpend, prevSpend),
      });
    }

    return { channels: result.sort((a, b) => b.revenue - a.revenue) };
  });

  // ── Funnel ────────────────────────────────────────────────
  app.get('/metrics/funnel', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date('2026-02-09');
    const start = subDays(now, days);

    const agg = await prisma.factTraffic.aggregate({
      _sum: {
        sessions: true,
        pdpViews: true,
        addToCart: true,
        checkouts: true,
        purchases: true,
      },
      where: { date: { gte: start, lte: now } },
    });

    const traffic = {
      sessions: agg._sum.sessions ?? 0,
      pdpViews: agg._sum.pdpViews ?? 0,
      addToCart: agg._sum.addToCart ?? 0,
      checkouts: agg._sum.checkouts ?? 0,
      purchases: agg._sum.purchases ?? 0,
    };

    return {
      funnel: traffic,
      cvr: kpiCalcs.kpis.funnelCvr(traffic),
    };
  });

  // ── Cohorts ───────────────────────────────────────────────
  app.get('/metrics/cohorts', async () => {
    const cohorts = await prisma.cohort.findMany({
      orderBy: { cohortMonth: 'desc' },
    });

    return { cohorts };
  });

  // ── Unit Economics ────────────────────────────────────────
  app.get('/metrics/unit-economics', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '30', 10);
    const now = new Date('2026-02-09');
    const start = subDays(now, days);

    const orders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: start, lte: now } },
    });

    const totalRevNet = orders.reduce((s, o) => s + Number(o.revenueNet), 0);
    const totalCogs = orders.reduce((s, o) => s + Number(o.cogs), 0);
    const totalShipping = orders.reduce((s, o) => s + Number(o.shippingCost), 0);
    const totalOps = orders.reduce((s, o) => s + Number(o.opsCost), 0);
    const totalCM = orders.reduce((s, o) => s + Number(o.contributionMargin), 0);
    const totalDiscounts = orders.reduce((s, o) => s + Number(o.discounts), 0);
    const totalRefunds = orders.reduce((s, o) => s + Number(o.refunds), 0);

    const spendAgg = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: start, lte: now } },
    });
    const totalSpend = Number(spendAgg._sum.spend ?? 0);
    const newCust = orders.filter((o) => o.isNewCustomer).length;

    return {
      breakdown: {
        revenueNet: totalRevNet,
        cogs: totalCogs,
        cogsPercent: totalRevNet > 0 ? totalCogs / totalRevNet : 0,
        shipping: totalShipping,
        shippingPercent: totalRevNet > 0 ? totalShipping / totalRevNet : 0,
        opsCost: totalOps,
        opsPercent: totalRevNet > 0 ? totalOps / totalRevNet : 0,
        discounts: totalDiscounts,
        refunds: totalRefunds,
        contributionMargin: totalCM,
        cmPercent: totalRevNet > 0 ? totalCM / totalRevNet : 0,
        marketingSpend: totalSpend,
        blendedCac: kpiCalcs.kpis.blendedCac(totalSpend, newCust),
        orderCount: orders.length,
        avgOrderValue: kpiCalcs.kpis.aov(totalRevNet, orders.length),
      },
    };
  });
}
