// ──────────────────────────────────────────────────────────────
// Growth OS — Shared Week-over-Week Metrics Gathering
// Reusable data aggregation for alerts, WBR, and suggestions
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { subDays } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';
import type { AlertInput } from '@growth-os/etl';

export interface CohortSummary {
  ltvCacRatio: number;
  paybackDays: number | null;
  ltv90: number;
  d30Retention: number;
}

export interface WoWMetrics {
  alertInput: AlertInput;
  currentRevenue: number;
  previousRevenue: number;
  currentRevenueNet: number;
  previousRevenueNet: number;
  currentSpend: number;
  previousSpend: number;
  currentNewCustomers: number;
  previousNewCustomers: number;
  currentOrders: number;
  previousOrders: number;
  currentCM: number;
  previousCM: number;
  currentSessions: number;
  previousSessions: number;
  currentAOV: number;
  previousAOV: number;
  currentCAC: number;
  previousCAC: number;
  currentMER: number;
  currentCMPct: number;
  previousCMPct: number;
  funnelCurrent: { sessions: number; pdpViews: number; addToCart: number; checkouts: number; purchases: number } | null;
  funnelPrevious: { sessions: number; pdpViews: number; addToCart: number; checkouts: number; purchases: number } | null;
  channels: NonNullable<AlertInput['channels']>;
  cohortD30: number;
  baselineD30: number;
  cohortSummary: CohortSummary | null;
  kpiContext: string;
}

export async function gatherWeekOverWeekData(days: number = 7): Promise<WoWMetrics> {
  const now = new Date();
  const currentStart = subDays(now, days);
  const previousStart = subDays(currentStart, days);

  // Orders
  const currentOrders = await prisma.factOrder.findMany({
    where: { orderDate: { gte: currentStart, lte: now } },
  });
  const previousOrders = await prisma.factOrder.findMany({
    where: { orderDate: { gte: previousStart, lt: currentStart } },
  });

  // Spend
  const curSpendAgg = await prisma.factSpend.aggregate({
    _sum: { spend: true },
    where: { date: { gte: currentStart, lte: now } },
  });
  const prevSpendAgg = await prisma.factSpend.aggregate({
    _sum: { spend: true },
    where: { date: { gte: previousStart, lt: currentStart } },
  });

  // Traffic (current + previous for funnel)
  const curTrafficAgg = await prisma.factTraffic.aggregate({
    _sum: { sessions: true, pdpViews: true, addToCart: true, checkouts: true, purchases: true },
    where: { date: { gte: currentStart, lte: now } },
  });
  const prevTrafficAgg = await prisma.factTraffic.aggregate({
    _sum: { sessions: true, pdpViews: true, addToCart: true, checkouts: true, purchases: true },
    where: { date: { gte: previousStart, lt: currentStart } },
  });

  // Compute blended metrics
  const curRevenue = currentOrders.reduce((s, o) => s + Number(o.revenueGross), 0);
  const prevRevenue = previousOrders.reduce((s, o) => s + Number(o.revenueGross), 0);
  const curRevenueNet = currentOrders.reduce((s, o) => s + Number(o.revenueNet), 0);
  const prevRevenueNet = previousOrders.reduce((s, o) => s + Number(o.revenueNet), 0);
  const curCM = currentOrders.reduce((s, o) => s + Number(o.contributionMargin), 0);
  const prevCM = previousOrders.reduce((s, o) => s + Number(o.contributionMargin), 0);
  const curSpend = Number(curSpendAgg._sum.spend ?? 0);
  const prevSpend = Number(prevSpendAgg._sum.spend ?? 0);
  const curNewCust = currentOrders.filter((o) => o.isNewCustomer).length;
  const prevNewCust = previousOrders.filter((o) => o.isNewCustomer).length;
  const curSessions = curTrafficAgg._sum.sessions ?? 0;
  const prevSessions = prevTrafficAgg._sum.sessions ?? 0;
  const curAOV = kpiCalcs.kpis.aov(curRevenueNet, currentOrders.length);
  const prevAOV = kpiCalcs.kpis.aov(prevRevenueNet, previousOrders.length);
  const curCAC = kpiCalcs.kpis.blendedCac(curSpend, curNewCust);
  const prevCAC = kpiCalcs.kpis.blendedCac(prevSpend, prevNewCust);
  const curMER = kpiCalcs.kpis.mer(curRevenue, curSpend);
  const curCMPct = kpiCalcs.kpis.contributionMarginPct(curCM, curRevenueNet);
  const prevCMPct = kpiCalcs.kpis.contributionMarginPct(prevCM, prevRevenueNet);

  // Per-channel breakdowns
  const channelSpendCur = await prisma.factSpend.groupBy({
    by: ['channelId'],
    _sum: { spend: true },
    where: { date: { gte: currentStart, lte: now } },
  });
  const channelSpendPrev = await prisma.factSpend.groupBy({
    by: ['channelId'],
    _sum: { spend: true },
    where: { date: { gte: previousStart, lt: currentStart } },
  });
  const dimChannels = await prisma.dimChannel.findMany();
  const channelMap = new Map(dimChannels.map((c) => [c.id, c.slug]));

  const channelRevCur = new Map<string, { revenue: number; newCust: number }>();
  const channelRevPrev = new Map<string, { revenue: number; newCust: number }>();
  for (const o of currentOrders) {
    const slug = (o.channelId && channelMap.get(o.channelId)) ?? 'other';
    const entry = channelRevCur.get(slug) ?? { revenue: 0, newCust: 0 };
    entry.revenue += Number(o.revenueGross);
    if (o.isNewCustomer) entry.newCust++;
    channelRevCur.set(slug, entry);
  }
  for (const o of previousOrders) {
    const slug = (o.channelId && channelMap.get(o.channelId)) ?? 'other';
    const entry = channelRevPrev.get(slug) ?? { revenue: 0, newCust: 0 };
    entry.revenue += Number(o.revenueGross);
    if (o.isNewCustomer) entry.newCust++;
    channelRevPrev.set(slug, entry);
  }

  const spendCurMap = new Map<string, number>();
  const spendPrevMap = new Map<string, number>();
  for (const row of channelSpendCur) {
    const slug = channelMap.get(row.channelId) ?? 'other';
    spendCurMap.set(slug, (spendCurMap.get(slug) ?? 0) + Number(row._sum.spend ?? 0));
  }
  for (const row of channelSpendPrev) {
    const slug = channelMap.get(row.channelId) ?? 'other';
    spendPrevMap.set(slug, (spendPrevMap.get(slug) ?? 0) + Number(row._sum.spend ?? 0));
  }

  const allSlugs = new Set([...spendCurMap.keys(), ...spendPrevMap.keys(), ...channelRevCur.keys(), ...channelRevPrev.keys()]);
  const channelBreakdowns: NonNullable<AlertInput['channels']> = [];
  for (const slug of allSlugs) {
    channelBreakdowns.push({
      name: slug,
      currentSpend: spendCurMap.get(slug) ?? 0,
      currentRevenue: channelRevCur.get(slug)?.revenue ?? 0,
      previousSpend: spendPrevMap.get(slug) ?? 0,
      previousRevenue: channelRevPrev.get(slug)?.revenue ?? 0,
      currentNewCustomers: channelRevCur.get(slug)?.newCust ?? 0,
      previousNewCustomers: channelRevPrev.get(slug)?.newCust ?? 0,
    });
  }

  // Cohort data
  const cohorts = await prisma.cohort.findMany({ orderBy: { cohortMonth: 'desc' } });
  const baselineD30 = cohorts.length > 0
    ? cohorts.reduce((s, c) => s + Number(c.d30Retention), 0) / cohorts.length
    : 0.15;
  const latestCohort = cohorts[0];
  const currentD30 = latestCohort ? Number(latestCohort.d30Retention) : baselineD30;

  // Cohort summary for WBR and other consumers
  const cohortSummary: CohortSummary | null = latestCohort ? {
    ltvCacRatio: Number(latestCohort.avgCac) > 0
      ? Math.round((Number(latestCohort.ltv180) / Number(latestCohort.avgCac)) * 10) / 10
      : 0,
    paybackDays: latestCohort.paybackDays,
    ltv90: Number(latestCohort.ltv90),
    d30Retention: Number(latestCohort.d30Retention),
  } : null;

  // Build alert input
  const alertInput: AlertInput = {
    currentRevenue: curRevenue,
    currentSpend: curSpend,
    currentNewCustomers: curNewCust,
    currentTotalOrders: currentOrders.length,
    currentContributionMargin: curCM,
    currentRevenueNet: curRevenueNet,
    currentD30Retention: currentD30,
    previousRevenue: prevRevenue,
    previousSpend: prevSpend,
    previousNewCustomers: prevNewCust,
    previousTotalOrders: previousOrders.length,
    previousContributionMargin: prevCM,
    previousRevenueNet: prevRevenueNet,
    previousD30Retention: baselineD30,
    baselineD30Retention: baselineD30,
    channels: channelBreakdowns,
  };

  // Build funnel objects
  const funnelCurrent = curSessions > 0 ? {
    sessions: curSessions,
    pdpViews: curTrafficAgg._sum.pdpViews ?? 0,
    addToCart: curTrafficAgg._sum.addToCart ?? 0,
    checkouts: curTrafficAgg._sum.checkouts ?? 0,
    purchases: curTrafficAgg._sum.purchases ?? 0,
  } : null;
  const funnelPrevious = prevSessions > 0 ? {
    sessions: prevSessions,
    pdpViews: prevTrafficAgg._sum.pdpViews ?? 0,
    addToCart: prevTrafficAgg._sum.addToCart ?? 0,
    checkouts: prevTrafficAgg._sum.checkouts ?? 0,
    purchases: prevTrafficAgg._sum.purchases ?? 0,
  } : null;

  // Build formatted KPI context for LLM prompts
  const kpiContext = [
    `CURRENT BUSINESS METRICS (last ${days} days):`,
    `- Revenue: $${curRevenue.toFixed(0)} (${curRevenue > prevRevenue ? '+' : ''}${(kpiCalcs.kpis.percentChange(curRevenue, prevRevenue) * 100).toFixed(1)}% WoW)`,
    `- Orders: ${currentOrders.length}`,
    `- Blended CAC: $${curCAC.toFixed(0)}`,
    `- MER: ${curMER.toFixed(2)}x`,
    `- CM%: ${(curCMPct * 100).toFixed(1)}%`,
    `- AOV: $${curAOV.toFixed(0)}`,
    `- Sessions: ${curSessions.toLocaleString()}`,
    `- New Customers: ${curNewCust}`,
    ``,
    `CHANNEL PERFORMANCE:`,
    ...channelBreakdowns.map((ch) => {
      const chCAC = ch.currentNewCustomers > 0 ? (ch.currentSpend / ch.currentNewCustomers).toFixed(0) : 'N/A';
      const chROAS = ch.currentSpend > 0 ? (ch.currentRevenue / ch.currentSpend).toFixed(2) : 'N/A';
      return `- ${ch.name}: Spend $${ch.currentSpend.toFixed(0)}, Revenue $${ch.currentRevenue.toFixed(0)}, CAC $${chCAC}, ROAS ${chROAS}x`;
    }),
  ].join('\n');

  return {
    alertInput,
    currentRevenue: curRevenue,
    previousRevenue: prevRevenue,
    currentRevenueNet: curRevenueNet,
    previousRevenueNet: prevRevenueNet,
    currentSpend: curSpend,
    previousSpend: prevSpend,
    currentNewCustomers: curNewCust,
    previousNewCustomers: prevNewCust,
    currentOrders: currentOrders.length,
    previousOrders: previousOrders.length,
    currentCM: curCM,
    previousCM: prevCM,
    currentSessions: curSessions,
    previousSessions: prevSessions,
    currentAOV: curAOV,
    previousAOV: prevAOV,
    currentCAC: curCAC,
    previousCAC: prevCAC,
    currentMER: curMER,
    currentCMPct: curCMPct,
    previousCMPct: prevCMPct,
    funnelCurrent,
    funnelPrevious,
    channels: channelBreakdowns,
    cohortD30: currentD30,
    baselineD30,
    cohortSummary,
    kpiContext,
  };
}
