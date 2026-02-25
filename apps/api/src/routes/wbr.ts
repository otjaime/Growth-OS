// ──────────────────────────────────────────────────────────────
// Growth OS — WBR (Weekly Business Review) Generation
// Auto-generates narrative summary of the week
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { format, subDays } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';
import { evaluateAlerts } from '@growth-os/etl';
import { isAIConfigured, generateWBRNarrative } from '../lib/ai.js';
import type { WbrAIContext } from '../lib/ai.js';
import { gatherWeekOverWeekData } from '../lib/gather-metrics.js';
import { isSlackConfigured, sendWBRToSlack } from '../lib/slack.js';
import { orgWhere, getOrgId } from '../lib/tenant.js';

export async function wbrRoutes(app: FastifyInstance) {
  app.get('/wbr', async (request) => {
    const m = await gatherWeekOverWeekData(7, getOrgId(request));
    const alerts = evaluateAlerts(m.alertInput);

    const now = new Date();
    const weekStart = subDays(now, 7);
    const weekLabel = `${format(weekStart, 'MMM d')} – ${format(now, 'MMM d, yyyy')}`;

    const revenueChange = kpiCalcs.kpis.percentChange(m.currentRevenue, m.previousRevenue);
    const ordersChange = kpiCalcs.kpis.percentChange(m.currentOrders, m.previousOrders);
    const spendChange = kpiCalcs.kpis.percentChange(m.currentSpend, m.previousSpend);
    const revDir = revenueChange >= 0 ? 'up' : 'down';
    const ordDir = ordersChange >= 0 ? 'up' : 'down';

    let narrative = `# Weekly Business Review — ${weekLabel}\n\n`;
    narrative += `## What Happened\n\n`;
    narrative += `Revenue was **$${(m.currentRevenue / 1000).toFixed(1)}K** this week, ${revDir} **${Math.abs(revenueChange * 100).toFixed(1)}%** WoW. `;
    narrative += `Orders were ${ordDir} ${Math.abs(ordersChange * 100).toFixed(1)}% at **${m.currentOrders}** total. `;
    narrative += `AOV was **$${m.currentAOV.toFixed(0)}**. `;
    narrative += `We acquired **${m.currentNewCustomers}** new customers at a blended CAC of **$${m.currentCAC.toFixed(0)}**.\n\n`;
    narrative += `Total ad spend was **$${(m.currentSpend / 1000).toFixed(1)}K** (${spendChange >= 0 ? '+' : ''}${(spendChange * 100).toFixed(1)}% WoW), `;
    narrative += `yielding a MER of **${m.currentMER.toFixed(2)}x**. `;
    narrative += `Contribution margin was **${(m.currentCMPct * 100).toFixed(1)}%** (${m.currentCMPct > m.previousCMPct ? '↑' : '↓'} ${Math.abs((m.currentCMPct - m.previousCMPct) * 100).toFixed(1)}pp).\n\n`;
    narrative += `Sessions: **${m.currentSessions.toLocaleString()}**\n\n`;

    // Drivers — Revenue Decomposition
    const prevAOV = m.previousOrders > 0 ? m.previousRevenue / m.previousOrders : 0;
    const curAOV = m.currentOrders > 0 ? m.currentRevenue / m.currentOrders : 0;
    const volumeEffect = (m.currentOrders - m.previousOrders) * prevAOV;
    const priceEffect = (curAOV - prevAOV) * m.currentOrders;
    const mixEffect = (m.currentRevenue - m.previousRevenue) - volumeEffect - priceEffect;

    narrative += `## Key Drivers\n\n`;
    narrative += `Revenue changed by **$${((m.currentRevenue - m.previousRevenue) / 1000).toFixed(1)}K** WoW, decomposed as:\n`;
    narrative += `- **Volume effect**: $${(volumeEffect / 1000).toFixed(1)}K (${m.currentOrders - m.previousOrders > 0 ? '+' : ''}${m.currentOrders - m.previousOrders} orders × $${prevAOV.toFixed(0)} prev AOV)\n`;
    narrative += `- **Price/AOV effect**: $${(priceEffect / 1000).toFixed(1)}K ($${(curAOV - prevAOV).toFixed(0)} AOV change × ${m.currentOrders} orders)\n`;
    if (Math.abs(mixEffect) > 10) {
      narrative += `- **Channel mix**: $${(mixEffect / 1000).toFixed(1)}K\n`;
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
    if (m.cohortSummary) {
      const ratioLabel = m.cohortSummary.ltvCacRatio >= 3 ? 'healthy' : m.cohortSummary.ltvCacRatio >= 2 ? 'monitor' : 'critical';
      narrative += `- LTV:CAC ratio: **${m.cohortSummary.ltvCacRatio.toFixed(1)}x** (${ratioLabel})\n`;
      narrative += `- Payback period: **${m.cohortSummary.paybackDays !== null ? `${m.cohortSummary.paybackDays} days` : 'N/A'}**\n`;
      narrative += `- LTV (90-day): **$${m.cohortSummary.ltv90.toFixed(0)}**\n`;
      narrative += `- D30 Retention: **${(m.cohortSummary.d30Retention * 100).toFixed(1)}%**\n`;
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

    // ── Active Experiments & AI Insights ──
    const runningExperiments = await prisma.experiment.findMany({
      where: { status: 'RUNNING', ...orgWhere(request) },
      select: { name: true, channel: true, primaryMetric: true, startDate: true },
      orderBy: { startDate: 'desc' },
      take: 5,
    });
    const completedThisWeek = await prisma.experiment.findMany({
      where: {
        status: 'COMPLETED',
        endDate: { gte: weekStart },
        ...orgWhere(request),
      },
      select: { name: true, result: true, learnings: true },
      take: 5,
    });
    const pendingOpportunities = await prisma.opportunity.count({
      where: { status: 'NEW', ...orgWhere(request) },
    });
    const pendingSuggestions = await prisma.suggestion.count({
      where: { status: 'PENDING', ...orgWhere(request) },
    });

    if (runningExperiments.length > 0 || completedThisWeek.length > 0) {
      narrative += `\n## Active Experiments\n\n`;
      for (const exp of runningExperiments) {
        const ch = exp.channel ? ` (${exp.channel.replace(/_/g, ' ')})` : '';
        narrative += `- **${exp.name}**${ch} — tracking ${exp.primaryMetric.replace(/_/g, ' ')}\n`;
      }
      for (const exp of completedThisWeek) {
        narrative += `- **${exp.name}** completed${exp.result ? `: ${exp.result}` : ''}\n`;
      }
    }

    if (pendingOpportunities > 0 || pendingSuggestions > 0) {
      narrative += `\n## AI Insights\n\n`;
      if (pendingOpportunities > 0) {
        narrative += `- **${pendingOpportunities}** new opportunit${pendingOpportunities === 1 ? 'y' : 'ies'} detected — review in AI Suggestions.\n`;
      }
      if (pendingSuggestions > 0) {
        narrative += `- **${pendingSuggestions}** pending suggestion${pendingSuggestions === 1 ? '' : 's'} awaiting review.\n`;
      }
    }

    // ── Decisions & Actions This Week ──
    const actionsThisWeek: string[] = [];
    if (alerts.some((a) => a.severity === 'critical')) {
      actionsThisWeek.push('Address critical alerts — immediate action required.');
    }
    if (pendingSuggestions > 0) {
      actionsThisWeek.push(`Review ${pendingSuggestions} pending AI suggestion${pendingSuggestions !== 1 ? 's' : ''}.`);
    }
    if (runningExperiments.length > 0) {
      actionsThisWeek.push(`Monitor ${runningExperiments.length} running experiment${runningExperiments.length !== 1 ? 's' : ''} for statistical significance.`);
    }
    if (completedThisWeek.length > 0) {
      actionsThisWeek.push(`Archive ${completedThisWeek.length} completed experiment${completedThisWeek.length !== 1 ? 's' : ''} — record learnings.`);
    }
    if (actionsThisWeek.length === 0) {
      actionsThisWeek.push('All systems running smoothly — focus on growth initiatives.');
    }

    narrative += `\n## Decisions & Actions This Week\n\n`;
    actionsThisWeek.forEach((a, i) => { narrative += `${i + 1}. ${a}\n`; });

    // ── Next Week Launch Plan ──
    const backlogExperiments = await prisma.experiment.findMany({
      where: { status: 'BACKLOG', ...orgWhere(request) },
      orderBy: { iceScore: 'desc' },
      select: { name: true, channel: true, hypothesis: true, iceScore: true },
      take: 2,
    });

    if (backlogExperiments.length > 0) {
      narrative += `\n## Next Week Launch Plan\n\n`;
      for (const exp of backlogExperiments) {
        const ch = exp.channel ? ` (${exp.channel.replace(/_/g, ' ')})` : '';
        narrative += `- **${exp.name}**${ch} — ICE score ${exp.iceScore?.toFixed(1) ?? 'N/A'}`;
        if (exp.hypothesis) narrative += `. _${exp.hypothesis.slice(0, 100)}${exp.hypothesis.length > 100 ? '...' : ''}_`;
        narrative += `\n`;
      }
    }

    // ── Revenue Driver data for frontend ──
    const drivers = {
      volumeEffect: Math.round(volumeEffect),
      priceEffect: Math.round(priceEffect),
      mixEffect: Math.round(mixEffect),
      totalChange: Math.round(m.currentRevenue - m.previousRevenue),
    };

    return {
      weekLabel,
      narrative,
      summary: {
        revenue: m.currentRevenue,
        revenueChange,
        orders: m.currentOrders,
        ordersChange,
        spend: m.currentSpend,
        spendChange,
        cac: m.currentCAC,
        mer: m.currentMER,
        cmPct: m.currentCMPct,
        newCustomers: m.currentNewCustomers,
        ltvCacRatio: m.cohortSummary?.ltvCacRatio ?? 0,
        paybackDays: m.cohortSummary?.paybackDays ?? null,
      },
      drivers,
      experiments: {
        running: runningExperiments,
        completedThisWeek,
      },
      insights: {
        pendingOpportunities,
        pendingSuggestions,
      },
      actions: actionsThisWeek,
      nextLaunches: backlogExperiments,
      alerts,
      aiEnabled: isAIConfigured(),
      slackEnabled: isSlackConfigured(),
      generatedAt: new Date().toISOString(),
    };
  });

  // ── Send WBR to Slack ──
  app.post('/wbr/send-slack', async (request, reply) => {
    if (!isSlackConfigured()) {
      return reply.status(400).send({ error: 'Slack webhook not configured' });
    }

    const m = await gatherWeekOverWeekData(7, getOrgId(request));
    const alerts = evaluateAlerts(m.alertInput);

    const now = new Date();
    const weekStart = subDays(now, 7);
    const weekLabel = `${format(weekStart, 'MMM d')} – ${format(now, 'MMM d, yyyy')}`;

    const revenueChange = kpiCalcs.kpis.percentChange(m.currentRevenue, m.previousRevenue);
    const ordersChange = kpiCalcs.kpis.percentChange(m.currentOrders, m.previousOrders);

    const pendingSuggestions = await prisma.suggestion.count({ where: { status: 'PENDING', ...orgWhere(request) } });
    const runningExperiments = await prisma.experiment.count({ where: { status: 'RUNNING', ...orgWhere(request) } });

    const success = await sendWBRToSlack({
      weekLabel,
      revenue: m.currentRevenue,
      revenueChange,
      orders: m.currentOrders,
      ordersChange,
      cac: m.currentCAC,
      mer: m.currentMER,
      cmPct: m.currentCMPct,
      alertCount: alerts.length,
      criticalAlerts: alerts.filter((a) => a.severity === 'critical').map((a) => a.title),
      pendingSuggestions,
      runningExperiments,
      dashboardUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    });

    if (!success) {
      return reply.status(500).send({ error: 'Failed to send to Slack' });
    }
    return { sent: true };
  });

  // ── AI-powered WBR (Server-Sent Events stream) ──
  app.get('/wbr/ai', async (request, reply) => {
    if (!isAIConfigured()) {
      return reply.status(400).send({ error: 'OPENAI_API_KEY not configured' });
    }

    const m = await gatherWeekOverWeekData(7, getOrgId(request));
    const alerts = evaluateAlerts(m.alertInput);

    const now = new Date();
    const weekStart = subDays(now, 7);
    const weekLabel = `${format(weekStart, 'MMM d')} – ${format(now, 'MMM d, yyyy')}`;

    const aiContext: WbrAIContext = {
      weekLabel,
      current: {
        revenue: m.currentRevenue,
        revenueNet: m.currentRevenueNet,
        orders: m.currentOrders,
        newCustomers: m.currentNewCustomers,
        spend: m.currentSpend,
        cac: m.currentCAC,
        mer: m.currentMER,
        cmPct: m.currentCMPct,
        aov: m.currentAOV,
        sessions: m.currentSessions,
      },
      previous: {
        revenue: m.previousRevenue,
        orders: m.previousOrders,
        newCustomers: m.previousNewCustomers,
        spend: m.previousSpend,
        cac: m.previousCAC,
        cmPct: m.previousCMPct,
      },
      channels: m.channels.map((ch) => ({
        name: ch.name,
        currentSpend: ch.currentSpend,
        currentRevenue: ch.currentRevenue,
        previousSpend: ch.previousSpend,
        previousRevenue: ch.previousRevenue,
        currentNewCustomers: ch.currentNewCustomers,
      })),
      alerts: alerts.map((a) => ({
        severity: a.severity,
        title: a.title,
        description: a.description,
        recommendation: a.recommendation,
      })),
      cohort: m.cohortSummary ? {
        ltvCacRatio: m.cohortSummary.ltvCacRatio,
        paybackDays: m.cohortSummary.paybackDays,
        ltv90: m.cohortSummary.ltv90,
        d30Retention: m.cohortSummary.d30Retention,
      } : null,
    };

    // Stream SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    });

    try {
      const stream = await generateWBRNarrative(aiContext);
      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ error: 'AI generation failed' })}\n\n`);
      app.log.error({ err }, 'AI WBR generation failed');
    }
    reply.raw.end();
  });
}
