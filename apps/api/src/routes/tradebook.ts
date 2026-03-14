// ──────────────────────────────────────────────────────────────
// 0to1 — Client Tradebook & Track Record Routes
// Per-client closed hypotheses + performance fees
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function tradebookRoutes(app: FastifyInstance): Promise<void> {
  // ── Client Tradebook ──────────────────────────────────────
  app.get('/clients/:id/tradebook', {
    schema: {
      tags: ['tradebook'],
      summary: 'Closed hypotheses for a specific client',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    const entries = await prisma.campaignHypothesis.findMany({
      where: {
        clientId: id,
        status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] },
      },
      orderBy: { closedAt: 'desc' },
    });

    const tradebook = entries.map((h) => ({
      hypothesisId: h.id,
      clientId: h.clientId,
      clientName: client.name,
      vertical: client.vertical,
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

  // ── Client Track Record ───────────────────────────────────
  app.get('/clients/:id/track-record', {
    schema: {
      tags: ['tradebook'],
      summary: 'Track record stats for a specific client',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    // Calculate from actual hypothesis data
    const closed = await prisma.campaignHypothesis.findMany({
      where: {
        clientId: id,
        status: { in: ['WINNER', 'LOSER', 'INCONCLUSIVE'] },
      },
    });

    const wins = closed.filter((h) => h.status === 'WINNER');
    const losses = closed.filter((h) => h.status === 'LOSER');
    const inconclusiveArr = closed.filter((h) => h.status === 'INCONCLUSIVE');
    const decided = [...wins, ...losses];

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

    const avgUpside = wins.length > 0
      ? wins.reduce((s, h) => s + (h.delta ?? 0), 0) / wins.length
      : 0;
    const avgDownside = losses.length > 0
      ? Math.abs(losses.reduce((s, h) => s + (h.delta ?? 0), 0) / losses.length)
      : 0;
    const lossRate = decided.length > 0 ? losses.length / decided.length : 0;
    const expectedValue = winRate * avgUpside - lossRate * avgDownside;

    const deltas = decided.map((h) => h.delta ?? 0);
    const mean = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : 0;
    const variance = deltas.length > 1
      ? deltas.reduce((s, d) => s + Math.pow(d - mean, 2), 0) / (deltas.length - 1)
      : 0;
    const sd = Math.sqrt(variance);
    const sharpeEquivalent = sd > 0 ? expectedValue / sd : 0;

    const BENCHMARKS: Record<string, number> = {
      ECOMMERCE_DTC: 2.5, FOOD_BEVERAGE: 2.0, SAAS: 1.8,
      FITNESS: 2.2, BEAUTY: 2.8, HOME: 2.3, PETS: 2.4, OTHER: 2.0,
    };
    const benchmark = BENCHMARKS[client.vertical] ?? 2.0;
    const avgActualROAS = decided.length > 0
      ? decided.reduce((s, h) => s + (h.actualROAS ?? 0), 0) / decided.length
      : 0;
    const alpha = avgActualROAS - benchmark;

    const totalSpend = closed.reduce((s, h) => s + (h.actualSpend ?? 0), 0);
    const totalRevenue = closed.reduce((s, h) => s + (h.actualRevenue ?? 0), 0);

    return {
      clientId: id,
      clientName: client.name,
      vertical: client.vertical,
      totalHypotheses: closed.length,
      wins: wins.length,
      losses: losses.length,
      inconclusive: inconclusiveArr.length,
      winRate: Math.round(winRate * 1000) / 1000,
      avgWinROAS: Math.round(avgWinROAS * 100) / 100,
      avgLossROAS: Math.round(avgLossROAS * 100) / 100,
      avgExpectedROAS: Math.round(avgExpectedROAS * 100) / 100,
      expectedValue: Math.round(expectedValue * 1000) / 1000,
      sharpeEquivalent: Math.round(sharpeEquivalent * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      benchmark,
      sampleDisclaimer: closed.length < 15
        ? `Win rate is meaningful above 15 closed hypotheses. Current sample: ${closed.length}.`
        : null,
    };
  });

  // ── Client Performance Fee ────────────────────────────────
  app.get('/clients/:id/performance-fee', {
    schema: {
      tags: ['tradebook'],
      summary: 'Calculate performance fee for a period',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { period } = req.query as { period?: string };

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    const feeStructure = client.feeStructure as {
      baseRetainer: number;
      perfFeePercent: number;
      benchmarkROAS: number;
    };

    // Check for existing fee record
    const currentPeriod = period ?? new Date().toISOString().slice(0, 7);
    const existingFee = await prisma.performanceFee.findFirst({
      where: { clientId: id, period: currentPeriod },
    });

    if (existingFee) {
      return { fee: existingFee };
    }

    // Calculate from hypothesis data for the period
    const periodStart = new Date(`${currentPeriod}-01`);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const periodHypotheses = await prisma.campaignHypothesis.findMany({
      where: {
        clientId: id,
        status: { in: ['WINNER', 'LOSER'] },
        closedAt: { gte: periodStart, lt: periodEnd },
      },
    });

    const totalRevenue = periodHypotheses.reduce((s, h) => s + (h.actualRevenue ?? 0), 0);
    const totalSpend = periodHypotheses.reduce((s, h) => s + (h.actualSpend ?? 0), 0);
    const actualROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const incrementalROAS = Math.max(0, actualROAS - feeStructure.benchmarkROAS);
    const incrementalRevenue = incrementalROAS > 0 && totalSpend > 0
      ? incrementalROAS * totalSpend
      : 0;
    const perfFeeAmount = incrementalRevenue * feeStructure.perfFeePercent / 100;
    const totalFee = feeStructure.baseRetainer + perfFeeAmount;

    return {
      fee: {
        clientId: id,
        period: currentPeriod,
        baseRetainer: feeStructure.baseRetainer,
        benchmarkROAS: feeStructure.benchmarkROAS,
        actualROAS: Math.round(actualROAS * 100) / 100,
        incrementalROAS: Math.round(incrementalROAS * 100) / 100,
        revenueBase: Math.round(totalRevenue * 100) / 100,
        incrementalRevenue: Math.round(incrementalRevenue * 100) / 100,
        perfFeePercent: feeStructure.perfFeePercent,
        perfFeeAmount: Math.round(perfFeeAmount * 100) / 100,
        totalFee: Math.round(totalFee * 100) / 100,
        status: 'PENDING',
      },
    };
  });
}
