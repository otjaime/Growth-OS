// ──────────────────────────────────────────────────────────────
// 0to1 — Portfolio Routes
// Global AUM, track record, trigger scores, tradebook
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function portfolioRoutes(app: FastifyInstance): Promise<void> {
  // ── Global AUM ────────────────────────────────────────────
  app.get('/portfolio/aum', {
    schema: {
      tags: ['portfolio'],
      summary: 'Global AUM snapshot across all clients',
    },
  }, async () => {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      select: { monthlyAdSpend: true, vertical: true },
    });

    const liveCount = await prisma.campaignHypothesis.count({
      where: { status: 'LIVE' },
    });

    const totalAUM = clients.reduce((sum, c) => sum + c.monthlyAdSpend, 0);
    const verticalBreakdown: Record<string, number> = {};
    for (const c of clients) {
      verticalBreakdown[c.vertical] = (verticalBreakdown[c.vertical] ?? 0) + c.monthlyAdSpend;
    }

    return {
      totalAUM,
      activeAccounts: clients.length,
      activeHypotheses: liveCount,
      verticalBreakdown,
    };
  });

  // ── Global Track Record ───────────────────────────────────
  app.get('/portfolio/track-record', {
    schema: {
      tags: ['portfolio'],
      summary: 'Global track record across all clients',
    },
  }, async () => {
    const closed = await prisma.campaignHypothesis.findMany({
      where: { status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] } },
      select: {
        status: true,
        actualROAS: true,
        expectedROAS: true,
        actualSpend: true,
        actualRevenue: true,
        delta: true,
      },
    });

    const wins = closed.filter((h) => h.status === 'WINNER');
    const losses = closed.filter((h) => h.status === 'LOSER');
    const inconclusive = closed.filter((h) => h.status === 'INCONCLUSIVE');
    const decided = [...wins, ...losses]; // exclude inconclusive from win rate

    const winRate = decided.length > 0 ? wins.length / decided.length : 0;
    const avgWinROAS = wins.length > 0
      ? wins.reduce((s, h) => s + (h.actualROAS ?? 0), 0) / wins.length
      : 0;
    const avgLossROAS = losses.length > 0
      ? losses.reduce((s, h) => s + (h.actualROAS ?? 0), 0) / losses.length
      : 0;
    const avgExpectedROAS = closed.length > 0
      ? closed.reduce((s, h) => s + h.expectedROAS, 0) / closed.length
      : 0;

    // Expected value: winRate * avgUpside - lossRate * avgDownside
    const avgUpside = wins.length > 0
      ? wins.reduce((s, h) => s + (h.delta ?? 0), 0) / wins.length
      : 0;
    const avgDownside = losses.length > 0
      ? Math.abs(losses.reduce((s, h) => s + (h.delta ?? 0), 0) / losses.length)
      : 0;
    const lossRate = decided.length > 0 ? losses.length / decided.length : 0;
    const expectedValue = winRate * avgUpside - lossRate * avgDownside;

    // Sharpe equivalent: EV / stdDev(deltas)
    const deltas = decided.map((h) => h.delta ?? 0);
    const mean = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
    const variance = deltas.length > 1
      ? deltas.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / (deltas.length - 1)
      : 0;
    const sd = Math.sqrt(variance);
    const sharpeEquivalent = sd > 0 ? expectedValue / sd : 0;

    // Alpha vs benchmark (2.0 global default)
    const avgActualROAS = decided.length > 0
      ? decided.reduce((s, h) => s + (h.actualROAS ?? 0), 0) / decided.length
      : 0;
    const alpha = avgActualROAS - 2.0;

    const totalSpend = closed.reduce((s, h) => s + (h.actualSpend ?? 0), 0);
    const totalRevenue = closed.reduce((s, h) => s + (h.actualRevenue ?? 0), 0);

    return {
      totalHypotheses: closed.length,
      wins: wins.length,
      losses: losses.length,
      inconclusive: inconclusive.length,
      winRate: Math.round(winRate * 1000) / 1000,
      avgWinROAS: Math.round(avgWinROAS * 100) / 100,
      avgLossROAS: Math.round(avgLossROAS * 100) / 100,
      avgExpectedROAS: Math.round(avgExpectedROAS * 100) / 100,
      expectedValue: Math.round(expectedValue * 1000) / 1000,
      sharpeEquivalent: Math.round(sharpeEquivalent * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };
  });

  // ── Trigger Score Matrix ──────────────────────────────────
  app.get('/portfolio/trigger-scores', {
    schema: {
      tags: ['portfolio'],
      summary: 'TriggerScore matrix — all trigger × vertical × awareness combinations',
    },
  }, async () => {
    const scores = await prisma.triggerScore.findMany({
      orderBy: [{ trigger: 'asc' }, { vertical: 'asc' }, { awarenessLevel: 'asc' }],
    });

    return { scores, total: scores.length };
  });

  // ── Global Tradebook ──────────────────────────────────────
  app.get('/portfolio/tradebook', {
    schema: {
      tags: ['portfolio'],
      summary: 'All closed hypotheses across all clients',
    },
  }, async (req) => {
    const { trigger, verdict, awarenessLevel, fromDate, toDate } = req.query as {
      trigger?: string;
      verdict?: string;
      awarenessLevel?: string;
      fromDate?: string;
      toDate?: string;
    };

    const where: Record<string, unknown> = {
      status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] },
    };
    if (trigger) where.trigger = trigger;
    if (verdict) where.verdict = verdict;
    if (awarenessLevel) where.awarenessLevel = awarenessLevel;
    if (fromDate || toDate) {
      where.closedAt = {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate && { lte: new Date(toDate) }),
      };
    }

    const entries = await prisma.campaignHypothesis.findMany({
      where,
      orderBy: { closedAt: 'desc' },
      include: { client: { select: { name: true, vertical: true } } },
    });

    const tradebook = entries.map((h) => ({
      hypothesisId: h.id,
      clientId: h.clientId,
      clientName: h.client.name,
      vertical: h.client.vertical,
      title: h.title,
      trigger: h.trigger,
      awarenessLevel: h.awarenessLevel,
      budgetUSD: h.budgetUSD,
      expectedROAS: h.expectedROAS,
      actualROAS: h.actualROAS,
      delta: h.delta,
      relativeReturn: h.delta != null && h.expectedROAS > 0 ? h.delta / h.expectedROAS : null,
      verdict: h.verdict,
      lesson: h.lesson,
      triggerEffective: h.triggerEffective,
      durationDays: h.durationDays,
      openedAt: h.createdAt,
      closedAt: h.closedAt,
    }));

    return { tradebook, total: tradebook.length };
  });

  // ── Trigger Recommendation ────────────────────────────────
  app.get('/portfolio/trigger-recommend', {
    schema: {
      tags: ['portfolio'],
      summary: 'Ranked trigger recommendations based on empirical data',
    },
  }, async (req) => {
    const { vertical, awarenessLevel, funnelStage } = req.query as {
      vertical?: string;
      awarenessLevel?: string;
      funnelStage?: string;
    };

    const where: Record<string, unknown> = {};
    if (vertical) where.vertical = vertical;
    if (awarenessLevel) where.awarenessLevel = awarenessLevel;

    const scores = await prisma.triggerScore.findMany({
      where,
      orderBy: { winRate: 'desc' },
    });

    const recommendations = scores.map((s) => ({
      trigger: s.trigger,
      winRate: s.winRate,
      confidence: s.confidenceLevel,
      sampleSize: s.sampleSize,
      avgROASDelta: s.avgROASDelta,
      vertical: s.vertical,
      awarenessLevel: s.awarenessLevel,
    }));

    return { recommendations, total: recommendations.length };
  });
}
