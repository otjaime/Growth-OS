// ──────────────────────────────────────────────────────────────
// Growth OS — WBR (Weekly Business Review) Generation
// Auto-generates narrative summary of the week
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { subDays, format } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';
import { evaluateAlerts } from '@growth-os/etl';
import type { AlertInput } from '@growth-os/etl';

export async function wbrRoutes(app: FastifyInstance) {
  app.get('/wbr', async () => {
    const now = new Date();
    const weekStart = subDays(now, 7);
    const prevWeekStart = subDays(weekStart, 7);

    // ── Gather data ──
    const currentOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: weekStart, lte: now } },
    });
    const previousOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: prevWeekStart, lt: weekStart } },
    });

    const curSpendAgg = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: weekStart, lte: now } },
    });
    const prevSpendAgg = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: prevWeekStart, lt: weekStart } },
    });

    const curTrafficAgg = await prisma.factTraffic.aggregate({
      _sum: { sessions: true, purchases: true },
      where: { date: { gte: weekStart, lte: now } },
    });

    // ── Compute metrics ──
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

    const revenueChange = kpiCalcs.kpis.percentChange(curRevenue, prevRevenue);
    const ordersChange = kpiCalcs.kpis.percentChange(currentOrders.length, previousOrders.length);
    const spendChange = kpiCalcs.kpis.percentChange(curSpend, prevSpend);
    const curCAC = kpiCalcs.kpis.blendedCac(curSpend, curNewCust);
    const prevCAC = kpiCalcs.kpis.blendedCac(prevSpend, prevNewCust);
    const curMER = kpiCalcs.kpis.mer(curRevenue, curSpend);
    const curCMPct = kpiCalcs.kpis.contributionMarginPct(curCM, curRevenueNet);
    const prevCMPct = kpiCalcs.kpis.contributionMarginPct(prevCM, prevRevenueNet);
    const curAOV = kpiCalcs.kpis.aov(curRevenueNet, currentOrders.length);

    // ── Per-channel breakdowns for channel-level alerts ──
    const channelSpendCur = await prisma.factSpend.groupBy({
      by: ['channelId'],
      _sum: { spend: true },
      where: { date: { gte: weekStart, lte: now } },
    });
    const channelSpendPrev = await prisma.factSpend.groupBy({
      by: ['channelId'],
      _sum: { spend: true },
      where: { date: { gte: prevWeekStart, lt: weekStart } },
    });
    const channels = await prisma.dimChannel.findMany();
    const channelMap = new Map(channels.map((c) => [c.id, c.slug]));

    // Build per-channel order aggregates
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

    // Build spend maps by channel slug
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
    const channelBreakdowns: AlertInput['channels'] = [];
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

    // ── Get alerts ──
    const cohorts = await prisma.cohort.findMany({ orderBy: { cohortMonth: 'desc' } });
    const baselineD30 = cohorts.length > 0
      ? cohorts.reduce((s, c) => s + Number(c.d30Retention), 0) / cohorts.length
      : 0.15;

    // Latest cohort for unit economics
    const latestCohort = cohorts.length > 0 ? cohorts[0] : null;
    const latestD30 = latestCohort ? Number(latestCohort.d30Retention) : baselineD30;
    const ltvCacRatio = latestCohort && Number(latestCohort.avgCac) > 0
      ? Number(latestCohort.ltv180) / Number(latestCohort.avgCac)
      : 0;
    const paybackDays = latestCohort?.paybackDays ?? null;

    const alertInput: AlertInput = {
      currentRevenue: curRevenue, currentSpend: curSpend,
      currentNewCustomers: curNewCust, currentTotalOrders: currentOrders.length,
      currentContributionMargin: curCM,
      currentRevenueNet: curRevenueNet, currentD30Retention: latestD30,
      previousRevenue: prevRevenue, previousSpend: prevSpend,
      previousNewCustomers: prevNewCust, previousTotalOrders: previousOrders.length,
      previousContributionMargin: prevCM,
      previousRevenueNet: prevRevenueNet, previousD30Retention: baselineD30,
      baselineD30Retention: baselineD30,
      channels: channelBreakdowns,
    };
    const alerts = evaluateAlerts(alertInput);

    // ── Build narrative ──
    const weekLabel = `${format(weekStart, 'MMM d')} – ${format(now, 'MMM d, yyyy')}`;
    const revDir = revenueChange >= 0 ? 'up' : 'down';
    const ordDir = ordersChange >= 0 ? 'up' : 'down';

    let narrative = `# Weekly Business Review — ${weekLabel}\n\n`;
    narrative += `## What Happened\n\n`;
    narrative += `Revenue was **$${(curRevenue / 1000).toFixed(1)}K** this week, ${revDir} **${Math.abs(revenueChange * 100).toFixed(1)}%** WoW. `;
    narrative += `Orders were ${ordDir} ${Math.abs(ordersChange * 100).toFixed(1)}% at **${currentOrders.length}** total. `;
    narrative += `AOV was **$${curAOV.toFixed(0)}**. `;
    narrative += `We acquired **${curNewCust}** new customers at a blended CAC of **$${curCAC.toFixed(0)}**.\n\n`;
    narrative += `Total ad spend was **$${(curSpend / 1000).toFixed(1)}K** (${spendChange >= 0 ? '+' : ''}${(spendChange * 100).toFixed(1)}% WoW), `;
    narrative += `yielding a MER of **${curMER.toFixed(2)}x**. `;
    narrative += `Contribution margin was **${(curCMPct * 100).toFixed(1)}%** (${curCMPct > prevCMPct ? '↑' : '↓'} ${Math.abs((curCMPct - prevCMPct) * 100).toFixed(1)}pp).\n\n`;
    narrative += `Sessions: **${curSessions.toLocaleString()}**\n\n`;

    // Drivers
    narrative += `## Key Drivers\n\n`;
    if (revenueChange > 0.05) {
      narrative += `- **Revenue growth** driven by ${curNewCust > prevNewCust ? 'increased new customer acquisition' : 'stronger returning customer spend'}.\n`;
    }
    if (revenueChange < -0.05) {
      narrative += `- **Revenue decline** likely driven by ${spendChange < -0.05 ? 'reduced ad spend' : 'lower conversion rates or AOV'}.\n`;
    }
    if (Math.abs(spendChange) > 0.10) {
      narrative += `- Ad spend ${spendChange > 0 ? 'increased' : 'decreased'} significantly — monitor channel efficiency.\n`;
    }
    if (curCMPct < prevCMPct - 0.02) {
      narrative += `- Contribution margin declining — check discount rates and product mix.\n`;
    }
    narrative += `\n`;

    // Risks
    narrative += `## Risks\n\n`;
    if (alerts.length > 0) {
      for (const alert of alerts) {
        narrative += `- **${alert.title}**: ${alert.description}\n`;
      }
    } else {
      narrative += `- No significant metric alerts this week.\n`;
    }
    narrative += `\n`;

    // Unit Economics
    narrative += `## Unit Economics\n\n`;
    if (latestCohort) {
      const ratioLabel = ltvCacRatio >= 3 ? 'healthy' : ltvCacRatio >= 2 ? 'monitor' : 'critical';
      narrative += `- LTV:CAC ratio: **${ltvCacRatio.toFixed(1)}x** (${ratioLabel})\n`;
      narrative += `- Payback period: **${paybackDays !== null ? `${paybackDays} days` : 'N/A'}**\n`;
      narrative += `- LTV (90-day): **$${Number(latestCohort.ltv90).toFixed(0)}**\n`;
      narrative += `- D30 Retention: **${(Number(latestCohort.d30Retention) * 100).toFixed(1)}%**\n`;
    } else {
      narrative += `- No cohort data available yet.\n`;
    }
    narrative += `\n`;

    // Priorities
    narrative += `## Next Week Priorities\n\n`;
    const priorities: string[] = [];
    if (alerts.some((a) => a.id === 'cac_increase')) {
      priorities.push('**Audit channel CAC** — pause underperforming campaigns, refresh creative.');
    }
    if (alerts.some((a) => a.id === 'cm_decrease')) {
      priorities.push('**Investigate CM decline** — review discount policies and product margins.');
    }
    if (alerts.some((a) => a.id === 'mer_deterioration')) {
      priorities.push('**Rebalance spend** — shift budget toward higher-MER channels.');
    }
    if (priorities.length === 0 || !alerts.some((a) => a.severity === 'critical')) {
      if (priorities.length === 0) priorities.push('Continue scaling best-performing campaigns.');
      priorities.push('Test new creative for prospecting.');
      priorities.push('Review post-purchase email flows for retention improvement.');
    }
    priorities.forEach((p, i) => { narrative += `${i + 1}. ${p}\n`; });

    return {
      weekLabel,
      narrative,
      summary: {
        revenue: curRevenue,
        revenueChange,
        orders: currentOrders.length,
        ordersChange,
        spend: curSpend,
        spendChange,
        cac: curCAC,
        mer: curMER,
        cmPct: curCMPct,
        newCustomers: curNewCust,
        ltvCacRatio: Math.round(ltvCacRatio * 10) / 10,
        paybackDays,
      },
      alerts,
      generatedAt: new Date().toISOString(),
    };
  });
}
