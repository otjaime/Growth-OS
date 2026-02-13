// ──────────────────────────────────────────────────────────────
// Growth OS — Ask Your Data API Route
// Natural language Q&A powered by LLM over business metrics
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { subDays, format } from 'date-fns';
import * as kpiCalcs from '@growth-os/etl';
import { isAIConfigured, answerDataQuestion } from '../lib/ai.js';

async function buildDataContext(): Promise<string> {
  const now = new Date();
  const start7 = subDays(now, 7);
  const start30 = subDays(now, 30);
  const prev7Start = subDays(start7, 7);

  // Last 7 days orders
  const cur7Orders = await prisma.factOrder.findMany({
    where: { orderDate: { gte: start7, lte: now } },
  });
  const prev7Orders = await prisma.factOrder.findMany({
    where: { orderDate: { gte: prev7Start, lt: start7 } },
  });

  // Last 30 days orders
  const cur30Orders = await prisma.factOrder.findMany({
    where: { orderDate: { gte: start30, lte: now } },
  });

  // Spend
  const spend7 = await prisma.factSpend.aggregate({
    _sum: { spend: true },
    where: { date: { gte: start7, lte: now } },
  });
  const prevSpend7 = await prisma.factSpend.aggregate({
    _sum: { spend: true },
    where: { date: { gte: prev7Start, lt: start7 } },
  });
  const spend30 = await prisma.factSpend.aggregate({
    _sum: { spend: true },
    where: { date: { gte: start30, lte: now } },
  });

  // Traffic
  const traffic7 = await prisma.factTraffic.aggregate({
    _sum: { sessions: true, purchases: true, addToCart: true, checkouts: true, pdpViews: true },
    where: { date: { gte: start7, lte: now } },
  });
  const traffic30 = await prisma.factTraffic.aggregate({
    _sum: { sessions: true, purchases: true },
    where: { date: { gte: start30, lte: now } },
  });

  // Channels (last 7 days)
  const channels = await prisma.dimChannel.findMany();
  const channelLines: string[] = [];
  for (const ch of channels) {
    const chOrders = cur7Orders.filter((o) => o.channelId === ch.id);
    const chSpend = await prisma.factSpend.aggregate({
      _sum: { spend: true },
      where: { channelId: ch.id, date: { gte: start7, lte: now } },
    });
    const chRev = chOrders.reduce((s, o) => s + Number(o.revenueNet), 0);
    const chNewCust = chOrders.filter((o) => o.isNewCustomer).length;
    const chSpendVal = Number(chSpend._sum.spend ?? 0);
    channelLines.push(`  ${ch.name}: Revenue $${chRev.toFixed(0)}, Spend $${chSpendVal.toFixed(0)}, Orders ${chOrders.length}, New Customers ${chNewCust}, ROAS ${chSpendVal > 0 ? (chRev / chSpendVal).toFixed(2) : 'N/A'}x`);
  }

  // Cohorts
  const latestCohort = await prisma.cohort.findFirst({ orderBy: { cohortMonth: 'desc' } });

  // Compute KPIs
  const curRev7 = cur7Orders.reduce((s, o) => s + Number(o.revenueGross), 0);
  const prevRev7 = prev7Orders.reduce((s, o) => s + Number(o.revenueGross), 0);
  const curRevNet7 = cur7Orders.reduce((s, o) => s + Number(o.revenueNet), 0);
  const curCM7 = cur7Orders.reduce((s, o) => s + Number(o.contributionMargin), 0);
  const curSpend7 = Number(spend7._sum.spend ?? 0);
  const prevSpend7val = Number(prevSpend7._sum.spend ?? 0);
  const curNewCust7 = cur7Orders.filter((o) => o.isNewCustomer).length;
  const prevNewCust7 = prev7Orders.filter((o) => o.isNewCustomer).length;
  const curSessions7 = traffic7._sum.sessions ?? 0;

  const curRev30 = cur30Orders.reduce((s, o) => s + Number(o.revenueGross), 0);
  const curRevNet30 = cur30Orders.reduce((s, o) => s + Number(o.revenueNet), 0);
  const curCM30 = cur30Orders.reduce((s, o) => s + Number(o.contributionMargin), 0);
  const curSpend30 = Number(spend30._sum.spend ?? 0);
  const curNewCust30 = cur30Orders.filter((o) => o.isNewCustomer).length;
  const curSessions30 = traffic30._sum.sessions ?? 0;

  return `Business Data as of ${format(now, 'MMM d, yyyy')}:

LAST 7 DAYS:
- Revenue (Gross): $${curRev7.toFixed(0)} (prev week: $${prevRev7.toFixed(0)}, change: ${kpiCalcs.kpis.percentChange(curRev7, prevRev7) > 0 ? '+' : ''}${(kpiCalcs.kpis.percentChange(curRev7, prevRev7) * 100).toFixed(1)}%)
- Revenue (Net): $${curRevNet7.toFixed(0)}
- Orders: ${cur7Orders.length} (prev week: ${prev7Orders.length})
- New Customers: ${curNewCust7} (prev week: ${prevNewCust7})
- Ad Spend: $${curSpend7.toFixed(0)} (prev week: $${prevSpend7val.toFixed(0)})
- Blended CAC: $${kpiCalcs.kpis.blendedCac(curSpend7, curNewCust7).toFixed(0)}
- MER: ${kpiCalcs.kpis.mer(curRev7, curSpend7).toFixed(2)}x
- CM%: ${(kpiCalcs.kpis.contributionMarginPct(curCM7, curRevNet7) * 100).toFixed(1)}%
- AOV: $${kpiCalcs.kpis.aov(curRevNet7, cur7Orders.length).toFixed(0)}
- Sessions: ${curSessions7.toLocaleString()}
- Funnel: ${curSessions7} sessions → ${traffic7._sum.pdpViews ?? 0} PDP views → ${traffic7._sum.addToCart ?? 0} ATC → ${traffic7._sum.checkouts ?? 0} checkouts → ${traffic7._sum.purchases ?? 0} purchases

LAST 30 DAYS:
- Revenue (Gross): $${curRev30.toFixed(0)}
- Revenue (Net): $${curRevNet30.toFixed(0)}
- Orders: ${cur30Orders.length}
- New Customers: ${curNewCust30}
- Ad Spend: $${curSpend30.toFixed(0)}
- Blended CAC: $${kpiCalcs.kpis.blendedCac(curSpend30, curNewCust30).toFixed(0)}
- MER: ${kpiCalcs.kpis.mer(curRev30, curSpend30).toFixed(2)}x
- CM%: ${(kpiCalcs.kpis.contributionMarginPct(curCM30, curRevNet30) * 100).toFixed(1)}%
- Sessions: ${curSessions30.toLocaleString()}

CHANNEL BREAKDOWN (Last 7 days):
${channelLines.join('\n')}

COHORT DATA:
${latestCohort ? `- Latest Cohort: ${latestCohort.cohortMonth}
- Cohort Size: ${latestCohort.cohortSize}
- D30 Retention: ${(Number(latestCohort.d30Retention) * 100).toFixed(1)}%
- D90 Retention: ${(Number(latestCohort.d90Retention) * 100).toFixed(1)}%
- LTV (90-day): $${Number(latestCohort.ltv90).toFixed(0)}
- LTV (180-day): $${Number(latestCohort.ltv180).toFixed(0)}
- Avg CAC: $${Number(latestCohort.avgCac).toFixed(0)}
- LTV:CAC Ratio: ${Number(latestCohort.avgCac) > 0 ? (Number(latestCohort.ltv180) / Number(latestCohort.avgCac)).toFixed(1) : 'N/A'}x
- Payback Period: ${latestCohort.paybackDays ?? 'N/A'} days` : 'No cohort data available.'}`;
}

export async function askRoutes(app: FastifyInstance) {
  // Check if AI is available
  app.get('/ask/status', async () => {
    return { enabled: isAIConfigured() };
  });

  // Stream answer via SSE
  app.post('/ask', async (request, reply) => {
    if (!isAIConfigured()) {
      return reply.status(400).send({ error: 'OPENAI_API_KEY not configured' });
    }

    const body = request.body as { question?: string };
    const question = body.question?.trim();
    if (!question) {
      return reply.status(400).send({ error: 'Question is required' });
    }

    // Build data context from the database
    const dataContext = await buildDataContext();

    // Stream SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? '*',
    });

    try {
      const stream = await answerDataQuestion(question, dataContext);
      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (err) {
      reply.raw.write(`data: ${JSON.stringify({ error: 'AI generation failed' })}\n\n`);
      app.log.error({ err }, 'Ask Your Data AI generation failed');
    }
    reply.raw.end();
  });
}
