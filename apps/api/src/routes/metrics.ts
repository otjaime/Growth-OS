// ──────────────────────────────────────────────────────────────
// Growth OS — Metrics API Routes
// Serves precomputed mart data for dashboard
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@growth-os/database';
import { subDays, addDays, differenceInDays, format } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';
import { forecast } from '@growth-os/etl';

export async function metricsRoutes(app: FastifyInstance) {
  // ── Executive Summary KPIs ────────────────────────────────
  app.get('/metrics/summary', {
    schema: {
      tags: ['metrics'],
      summary: 'Executive summary KPIs',
      description: 'Returns revenue, spend, orders, CAC, MER, contribution margin, and other KPIs for current vs previous period',
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Period in days (default 7)' } },
      },
    },
  }, async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date();
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

    // GM-level metrics from latest cohort
    const latestCohort = await prisma.cohort.findFirst({ orderBy: { cohortMonth: 'desc' } });
    const currentCogs = currentOrders.reduce((s, o) => s + Number(o.cogs), 0);
    const grossMarginPct = cur.revenueNet > 0 ? (cur.revenueNet - currentCogs) / cur.revenueNet : 0;

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
        grossMarginPct: { value: grossMarginPct },
        ltvCacRatio: { value: latestCohort && Number(latestCohort.avgCac) > 0 ? Number(latestCohort.ltv180) / Number(latestCohort.avgCac) : 0 },
        paybackDays: { value: latestCohort?.paybackDays ?? null },
        retentionD30: { value: latestCohort ? Number(latestCohort.d30Retention) : 0 },
        ltv90: { value: latestCohort ? Number(latestCohort.ltv90) : 0 },
      },
    };
  });

  // ── Daily timeseries for sparklines ───────────────────────
  app.get('/metrics/timeseries', {
    schema: {
      tags: ['metrics'],
      summary: 'Daily timeseries data',
      description: 'Returns daily revenue, spend, traffic, and margin timeseries for charts',
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Lookback in days (default 30)' } },
      },
    },
  }, async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '30', 10);
    const now = new Date();
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

    const dailyMargin = await prisma.$queryRaw<
      Array<{ date: Date; cm: number; revenue_net: number }>
    >`
      SELECT order_date as date,
             SUM(contribution_margin)::float as cm,
             SUM(revenue_net)::float as revenue_net
      FROM fact_orders
      WHERE order_date >= ${start} AND order_date <= ${now}
      GROUP BY order_date ORDER BY order_date
    `;

    return { dailyRevenue, dailySpend, dailyTraffic, dailyMargin };
  });

  // ── Channel Performance ───────────────────────────────────
  app.get('/metrics/channels', {
    schema: {
      tags: ['metrics'],
      summary: 'Channel performance breakdown',
      description: 'Returns per-channel spend, revenue, CAC, ROAS, and contribution margin',
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Period in days (default 7)' } },
      },
    },
  }, async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date();
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
        channelProfit: curCM - curSpend,
        channelShare: 0,
      });
    }

    // Compute channel share as % of total revenue
    const totalRevenue = result.reduce((s, r) => s + r.revenue, 0);
    for (const r of result) {
      r.channelShare = totalRevenue > 0 ? r.revenue / totalRevenue : 0;
    }

    return { channels: result.sort((a, b) => b.revenue - a.revenue) };
  });

  // ── Funnel ────────────────────────────────────────────────
  app.get('/metrics/funnel', {
    schema: {
      tags: ['metrics'],
      summary: 'Conversion funnel',
      description: 'Returns sessions → PDP views → add-to-cart → checkout → purchase funnel with conversion rates',
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Period in days (default 7)' } },
      },
    },
  }, async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '7', 10);
    const now = new Date();
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
  app.get('/metrics/cohorts', {
    schema: {
      tags: ['metrics'],
      summary: 'Cohort retention data',
      description: 'Returns all cohorts with retention rates (D7, D30, D60, D90), LTV, and CAC',
    },
  }, async () => {
    const cohorts = await prisma.cohort.findMany({
      orderBy: { cohortMonth: 'desc' },
    });

    return { cohorts };
  });

  // ── Cohort Snapshot (latest + trends) ─────────────────────
  app.get('/metrics/cohort-snapshot', {
    schema: {
      tags: ['metrics'],
      summary: 'Latest cohort snapshot',
      description: 'Returns the latest cohort with LTV/CAC ratio and recent cohort trends',
    },
  }, async () => {
    const latest = await prisma.cohort.findFirst({ orderBy: { cohortMonth: 'desc' } });

    if (!latest) {
      return { latest: null, recentCohorts: [] };
    }

    const avgCac = Number(latest.avgCac);
    const ltv180 = Number(latest.ltv180);
    const ltvCacRatio = avgCac > 0 ? ltv180 / avgCac : 0;

    const recentCohorts = await prisma.cohort.findMany({
      orderBy: { cohortMonth: 'desc' },
      take: 3,
      select: {
        cohortMonth: true,
        d30Retention: true,
        ltv90: true,
        cohortSize: true,
      },
    });

    return {
      latest: {
        cohortMonth: latest.cohortMonth,
        cohortSize: latest.cohortSize,
        d7Retention: Number(latest.d7Retention),
        d30Retention: Number(latest.d30Retention),
        d60Retention: Number(latest.d60Retention),
        d90Retention: Number(latest.d90Retention),
        ltv30: Number(latest.ltv30),
        ltv90: Number(latest.ltv90),
        ltv180: ltv180,
        avgCac: avgCac,
        paybackDays: latest.paybackDays,
        ltvCacRatio: Math.round(ltvCacRatio * 10) / 10,
      },
      recentCohorts: recentCohorts.map((c) => ({
        cohortMonth: c.cohortMonth,
        d30Retention: Number(c.d30Retention),
        ltv90: Number(c.ltv90),
        cohortSize: c.cohortSize,
      })),
    };
  });

  // ── Unit Economics ────────────────────────────────────────
  app.get('/metrics/unit-economics', {
    schema: {
      tags: ['metrics'],
      summary: 'Unit economics breakdown',
      description: 'Returns P&L waterfall: revenue, COGS, shipping, ops, discounts, contribution margin, and CAC',
      querystring: {
        type: 'object',
        properties: { days: { type: 'string', description: 'Period in days (default 30)' } },
      },
    },
  }, async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days ?? '30', 10);
    const now = new Date();
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

  // ── Revenue / KPI Forecast ──────────────────────────────────
  app.get('/metrics/forecast', {
    schema: {
      tags: ['forecast'],
      summary: 'KPI forecast with confidence intervals',
      description: 'Holt-Winters double exponential smoothing forecast for revenue, orders, or spend with 80% and 95% confidence intervals',
      querystring: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['revenue', 'orders', 'spend'], description: 'Metric to forecast (default revenue)' },
          horizon: { type: 'string', description: 'Forecast days 1-90 (default 30)' },
        },
      },
    },
  }, async (request) => {
    const query = request.query as { metric?: string; horizon?: string };
    const metric = query.metric ?? 'revenue';
    const horizon = Math.min(Math.max(parseInt(query.horizon ?? '30', 10) || 30, 1), 90);

    if (!['revenue', 'orders', 'spend'].includes(metric)) {
      return { error: 'Invalid metric. Must be revenue, orders, or spend.' };
    }

    const now = new Date();
    const start = subDays(now, 180);

    let dailyData: Array<{ date: Date; value: number }>;

    if (metric === 'revenue') {
      dailyData = await prisma.$queryRaw<Array<{ date: Date; value: number }>>`
        SELECT order_date as date, SUM(revenue_net)::float as value
        FROM fact_orders
        WHERE order_date >= ${start} AND order_date <= ${now}
        GROUP BY order_date ORDER BY order_date
      `;
    } else if (metric === 'orders') {
      dailyData = await prisma.$queryRaw<Array<{ date: Date; value: number }>>`
        SELECT order_date as date, COUNT(*)::float as value
        FROM fact_orders
        WHERE order_date >= ${start} AND order_date <= ${now}
        GROUP BY order_date ORDER BY order_date
      `;
    } else {
      dailyData = await prisma.$queryRaw<Array<{ date: Date; value: number }>>`
        SELECT date, SUM(spend)::float as value
        FROM fact_spend
        WHERE date >= ${start} AND date <= ${now}
        GROUP BY date ORDER BY date
      `;
    }

    // Fill date gaps with 0 (missing days = zero activity, not missing data)
    const filled = fillDateGaps(dailyData, start, now);
    const values = filled.map((d) => d.value);

    const result = forecast(values, { horizon });

    if (!result) {
      return {
        metric,
        horizon,
        historical: filled.map((d) => ({ date: format(d.date, 'yyyy-MM-dd'), value: d.value })),
        forecast: null,
        error: 'Insufficient data for forecasting (need at least 14 days)',
      };
    }

    const lastDate = filled[filled.length - 1]!.date;
    const forecastDates = Array.from({ length: horizon }, (_, i) =>
      format(addDays(lastDate, i + 1), 'yyyy-MM-dd'),
    );

    return {
      metric,
      horizon,
      parameters: { alpha: +result.alpha.toFixed(3), beta: +result.beta.toFixed(3), mse: Math.round(result.mse) },
      historical: filled.map((d) => ({
        date: format(d.date, 'yyyy-MM-dd'),
        value: Math.round(d.value * 100) / 100,
      })),
      forecast: forecastDates.map((date, i) => ({
        date,
        value: Math.round(result.forecast[i]! * 100) / 100,
        lower80: Math.round(result.lower80[i]! * 100) / 100,
        upper80: Math.round(result.upper80[i]! * 100) / 100,
        lower95: Math.round(result.lower95[i]! * 100) / 100,
        upper95: Math.round(result.upper95[i]! * 100) / 100,
      })),
    };
  });

  // ── Cohort LTV Projections ────────────────────────────────
  app.get('/metrics/cohort-projections', {
    schema: {
      tags: ['metrics'],
      summary: 'Cohort LTV projections',
      description: 'Projects retention and LTV for immature cohorts using decay ratios from mature cohorts',
    },
  }, async () => {
    const cohorts = await prisma.cohort.findMany({ orderBy: { cohortMonth: 'desc' } });
    if (cohorts.length === 0) return { projections: [] };

    // Compute age of each cohort in days
    const now = Date.now();
    const withAge = cohorts.map((c) => {
      const [y, m] = c.cohortMonth.split('-').map(Number);
      const monthEnd = new Date(Date.UTC(y!, m!, 1));
      const ageDays = Math.floor((now - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
      return { ...c, ageDays };
    });

    // Mature cohorts: those with >= 90 days of age (have real D90 data)
    const mature = withAge.filter((c) => c.ageDays >= 90);

    // Compute average retention decay ratios from mature cohorts
    let avgD30toD7 = 0.5;
    let avgD60toD30 = 0.7;
    let avgD90toD60 = 0.8;
    let avgLtv90toLtv30 = 2.0;
    let avgLtv180toLtv90 = 1.5;

    if (mature.length > 0) {
      const d30toD7Vals = mature.filter((c) => Number(c.d7Retention) > 0).map((c) => Number(c.d30Retention) / Number(c.d7Retention));
      const d60toD30Vals = mature.filter((c) => Number(c.d30Retention) > 0).map((c) => Number(c.d60Retention) / Number(c.d30Retention));
      const d90toD60Vals = mature.filter((c) => Number(c.d60Retention) > 0).map((c) => Number(c.d90Retention) / Number(c.d60Retention));
      const ltv90to30Vals = mature.filter((c) => Number(c.ltv30) > 0).map((c) => Number(c.ltv90) / Number(c.ltv30));
      const matureLtv180 = mature.filter((c) => c.ageDays >= 180 && Number(c.ltv90) > 0);
      const ltv180to90Vals = matureLtv180.map((c) => Number(c.ltv180) / Number(c.ltv90));

      if (d30toD7Vals.length > 0) avgD30toD7 = d30toD7Vals.reduce((a, b) => a + b, 0) / d30toD7Vals.length;
      if (d60toD30Vals.length > 0) avgD60toD30 = d60toD30Vals.reduce((a, b) => a + b, 0) / d60toD30Vals.length;
      if (d90toD60Vals.length > 0) avgD90toD60 = d90toD60Vals.reduce((a, b) => a + b, 0) / d90toD60Vals.length;
      if (ltv90to30Vals.length > 0) avgLtv90toLtv30 = ltv90to30Vals.reduce((a, b) => a + b, 0) / ltv90to30Vals.length;
      if (ltv180to90Vals.length > 0) avgLtv180toLtv90 = ltv180to90Vals.reduce((a, b) => a + b, 0) / ltv180to90Vals.length;
    }

    // Build projections for each cohort
    const projections = withAge.map((c) => {
      const d7 = Number(c.d7Retention);
      const d30Actual = c.ageDays >= 30 ? Number(c.d30Retention) : null;
      const d60Actual = c.ageDays >= 60 ? Number(c.d60Retention) : null;
      const d90Actual = c.ageDays >= 90 ? Number(c.d90Retention) : null;

      const d30Projected = d30Actual === null ? d7 * avgD30toD7 : null;
      const d30 = d30Actual ?? d30Projected ?? 0;
      const d60Projected = d60Actual === null ? d30 * avgD60toD30 : null;
      const d60 = d60Actual ?? d60Projected ?? 0;
      const d90Projected = d90Actual === null ? d60 * avgD90toD60 : null;

      const ltv30Actual = c.ageDays >= 30 ? Number(c.ltv30) : null;
      const ltv90Actual = c.ageDays >= 90 ? Number(c.ltv90) : null;
      const ltv180Actual = c.ageDays >= 180 ? Number(c.ltv180) : null;

      const ltv30Projected = ltv30Actual === null && Number(c.ltv30) === 0 ? 20 : null;
      const ltv30 = ltv30Actual ?? (Number(c.ltv30) || 20);
      const ltv90Projected = ltv90Actual === null ? ltv30 * avgLtv90toLtv30 : null;
      const ltv90 = ltv90Actual ?? ltv90Projected ?? 0;
      const ltv180Projected = ltv180Actual === null ? ltv90 * avgLtv180toLtv90 : null;

      return {
        cohortMonth: c.cohortMonth,
        cohortSize: c.cohortSize,
        ageDays: c.ageDays,
        retention: {
          d7: { value: d7, projected: false },
          d30: { value: d30Actual ?? (d30Projected ?? 0), projected: d30Actual === null },
          d60: { value: d60Actual ?? (d60Projected ?? 0), projected: d60Actual === null },
          d90: { value: d90Actual ?? (d90Projected ?? 0), projected: d90Actual === null },
        },
        ltv: {
          ltv30: { value: ltv30Actual ?? ltv30, projected: ltv30Actual === null },
          ltv90: { value: ltv90Actual ?? (ltv90Projected ?? 0), projected: ltv90Actual === null },
          ltv180: { value: ltv180Actual ?? (ltv180Projected ?? 0), projected: ltv180Actual === null },
        },
        avgCac: Number(c.avgCac),
        paybackDays: c.paybackDays,
      };
    });

    return {
      projections,
      decayRatios: {
        d30toD7: +avgD30toD7.toFixed(3),
        d60toD30: +avgD60toD30.toFixed(3),
        d90toD60: +avgD90toD60.toFixed(3),
        ltv90toLtv30: +avgLtv90toLtv30.toFixed(3),
        ltv180toLtv90: +avgLtv180toLtv90.toFixed(3),
        matureCohortCount: mature.length,
      },
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function fillDateGaps(
  data: Array<{ date: Date; value: number }>,
  start: Date,
  end: Date,
): Array<{ date: Date; value: number }> {
  const map = new Map<string, number>();
  for (const row of data) {
    map.set(format(row.date, 'yyyy-MM-dd'), row.value);
  }
  const totalDays = differenceInDays(end, start);
  const filled: Array<{ date: Date; value: number }> = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(start, i);
    const key = format(d, 'yyyy-MM-dd');
    filled.push({ date: d, value: map.get(key) ?? 0 });
  }
  return filled;
}
