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
    const now = new Date('2026-02-09');
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

    // ── Get alerts ──
    const cohorts = await prisma.cohort.findMany();
    const baselineD30 = cohorts.length > 0
      ? cohorts.reduce((s, c) => s + Number(c.d30Retention), 0) / cohorts.length
      : 0.15;

    const alertInput: AlertInput = {
      currentRevenue: curRevenue, currentSpend: curSpend,
      currentNewCustomers: curNewCust, currentTotalOrders: currentOrders.length,
      currentContributionMargin: curCM,
      currentRevenueNet: curRevenueNet, currentD30Retention: baselineD30,
      previousRevenue: prevRevenue, previousSpend: prevSpend,
      previousNewCustomers: prevNewCust, previousTotalOrders: previousOrders.length,
      previousContributionMargin: prevCM,
      previousRevenueNet: prevRevenueNet, previousD30Retention: baselineD30,
      baselineD30Retention: baselineD30,
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

    // Priorities
    narrative += `## Next Week Priorities\n\n`;
    if (alerts.some((a) => a.id === 'cac_increase')) {
      narrative += `1. **Audit channel CAC** — pause underperforming campaigns, refresh creative.\n`;
    }
    if (alerts.some((a) => a.id === 'cm_decrease')) {
      narrative += `2. **Investigate CM decline** — review discount policies and product margins.\n`;
    }
    if (alerts.some((a) => a.id === 'mer_deterioration')) {
      narrative += `3. **Rebalance spend** — shift budget toward higher-MER channels.\n`;
    }
    if (alerts.length === 0 || !alerts.some((a) => a.severity === 'critical')) {
      narrative += `1. Continue scaling best-performing campaigns.\n`;
      narrative += `2. Test new creative for prospecting.\n`;
      narrative += `3. Review post-purchase email flows for retention improvement.\n`;
    }

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
      },
      alerts,
      generatedAt: new Date().toISOString(),
    };
  });
}
