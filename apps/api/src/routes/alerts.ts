import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { subDays } from 'date-fns';
import { evaluateAlerts } from '@growth-os/etl';
import type { AlertInput } from '@growth-os/etl';
import * as kpiCalcs from '@growth-os/etl';
import { sendAlertToSlack, isSlackConfigured } from '../lib/slack.js';
import { isAIConfigured, generateAlertExplanation } from '../lib/ai.js';

export async function alertsRoutes(app: FastifyInstance) {
  app.get('/alerts', {
    schema: {
      tags: ['alerts'],
      summary: 'Evaluate alerts',
      description: 'Compares current week vs previous week KPIs and returns triggered alerts. Sends Slack notification for critical/warning alerts if configured.',
      response: {
        200: {
          type: 'object',
          properties: {
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  recommendation: { type: 'string' },
                },
              },
            },
            evaluatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async () => {
    const now = new Date();
    const currentStart = subDays(now, 7);
    const previousStart = subDays(currentStart, 7);

    // Current period
    const currentOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: currentStart, lte: now } },
    });
    const previousOrders = await prisma.factOrder.findMany({
      where: { orderDate: { gte: previousStart, lt: currentStart } },
    });

    const curSpend = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: currentStart, lte: now } },
    });
    const prevSpend = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { date: { gte: previousStart, lt: currentStart } },
    });

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

    // Get baseline retention (average of all cohorts)
    const cohorts = await prisma.cohort.findMany({ orderBy: { cohortMonth: 'desc' } });
    const baselineD30 = cohorts.length > 0
      ? cohorts.reduce((s, c) => s + Number(c.d30Retention), 0) / cohorts.length
      : 0.15;

    // Latest cohort retention
    const latestCohort = cohorts[0];
    const currentD30 = latestCohort ? Number(latestCohort.d30Retention) : baselineD30;

    const input: AlertInput = {
      currentRevenue: currentOrders.reduce((s, o) => s + Number(o.revenueGross), 0),
      currentSpend: Number(curSpend._sum.spend ?? 0),
      currentNewCustomers: currentOrders.filter((o) => o.isNewCustomer).length,
      currentTotalOrders: currentOrders.length,
      currentContributionMargin: currentOrders.reduce((s, o) => s + Number(o.contributionMargin), 0),
      currentRevenueNet: currentOrders.reduce((s, o) => s + Number(o.revenueNet), 0),
      currentD30Retention: currentD30,
      previousRevenue: previousOrders.reduce((s, o) => s + Number(o.revenueGross), 0),
      previousSpend: Number(prevSpend._sum.spend ?? 0),
      previousNewCustomers: previousOrders.filter((o) => o.isNewCustomer).length,
      previousTotalOrders: previousOrders.length,
      previousContributionMargin: previousOrders.reduce((s, o) => s + Number(o.contributionMargin), 0),
      previousRevenueNet: previousOrders.reduce((s, o) => s + Number(o.revenueNet), 0),
      previousD30Retention: baselineD30,
      baselineD30Retention: baselineD30,
      channels: channelBreakdowns,
    };

    const alerts = evaluateAlerts(input);

    // Fire-and-forget Slack notification for critical/warning alerts
    if (isSlackConfigured()) {
      const notifiable = alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning');
      if (notifiable.length > 0) {
        const dashboardUrl = process.env.FRONTEND_URL ?? '';
        sendAlertToSlack(notifiable, dashboardUrl).catch(() => {});
      }
    }

    return { alerts, evaluatedAt: new Date().toISOString() };
  });

  // ── AI Alert Explanation ──────────────────────────────────
  app.post('/alerts/explain', {
    schema: {
      tags: ['alerts'],
      summary: 'AI-powered alert explanation',
      description: 'Uses LLM to generate root cause analysis and recommendations for an alert',
    },
  }, async (request) => {
    if (!isAIConfigured()) {
      return { enabled: false, explanation: null, message: 'AI not configured. Set OPENAI_API_KEY.' };
    }

    const body = request.body as {
      alert: { title: string; description: string; severity: string; recommendation: string };
    };

    if (!body?.alert?.title) {
      return { enabled: true, explanation: null, message: 'Missing alert data.' };
    }

    // Build a brief metrics context for the LLM
    const now = new Date();
    const start = subDays(now, 7);

    const [orderCount, spendAgg] = await Promise.all([
      prisma.factOrder.count({ where: { orderDate: { gte: start, lte: now } } }),
      prisma.factSpend.aggregate({ _sum: { spend: true }, where: { date: { gte: start, lte: now } } }),
    ]);

    const metricsContext = `7-day snapshot: ${orderCount} orders, $${Number(spendAgg._sum.spend ?? 0).toFixed(0)} ad spend. The alert rule-based recommendation was: "${body.alert.recommendation}"`;

    try {
      const explanation = await generateAlertExplanation(body.alert, metricsContext);
      return { enabled: true, explanation };
    } catch {
      return { enabled: true, explanation: null, message: 'AI generation failed.' };
    }
  });
}
