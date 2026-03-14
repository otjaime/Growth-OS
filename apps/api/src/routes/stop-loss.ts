// ──────────────────────────────────────────────────────────────
// 0to1 — Stop-Loss Routes
// View stop-loss event history + manual trigger
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function stopLossRoutes(app: FastifyInstance): Promise<void> {
  // ── Stop-loss event history (global) ──────────────────────
  app.get('/stop-loss/history', {
    schema: {
      tags: ['stop-loss'],
      summary: 'All stop-loss events, sorted by executedAt desc',
    },
  }, async (req) => {
    const { limit } = req.query as { limit?: string };
    const take = Math.min(Number(limit) || 50, 200);

    const events = await prisma.stopLossEvent.findMany({
      orderBy: { executedAt: 'desc' },
      take,
      include: {
        hypothesis: {
          select: {
            title: true,
            trigger: true,
            expectedROAS: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    return { events, total: events.length };
  });

  // ── Stop-loss history by client ───────────────────────────
  app.get('/stop-loss/history/:clientId', {
    schema: {
      tags: ['stop-loss'],
      summary: 'Stop-loss events for a specific client',
    },
  }, async (req) => {
    const { clientId } = req.params as { clientId: string };

    const events = await prisma.stopLossEvent.findMany({
      where: {
        hypothesis: { clientId },
      },
      orderBy: { executedAt: 'desc' },
      take: 50,
      include: {
        hypothesis: {
          select: {
            title: true,
            trigger: true,
            expectedROAS: true,
          },
        },
      },
    });

    return { events, total: events.length };
  });

  // ── Manual stop-loss evaluation ───────────────────────────
  app.post('/stop-loss/evaluate', {
    schema: {
      tags: ['stop-loss'],
      summary: 'Manually trigger stop-loss evaluation on all LIVE hypotheses',
    },
  }, async (_req, reply) => {
    // Get all LIVE hypotheses with Meta campaign IDs
    const liveHypotheses = await prisma.campaignHypothesis.findMany({
      where: {
        status: 'LIVE',
        metaCampaignId: { not: null },
      },
      include: {
        client: true,
      },
    });

    if (liveHypotheses.length === 0) {
      return { message: 'No LIVE hypotheses with Meta campaign IDs', evaluated: 0, actions: [] };
    }

    // For now, return the list of hypotheses that would be evaluated
    // Actual execution requires MetaAdExecutor with real credentials
    const evaluatable = liveHypotheses.map((h) => ({
      hypothesisId: h.id,
      title: h.title,
      clientName: h.client.name,
      metaCampaignId: h.metaCampaignId,
      expectedROAS: h.expectedROAS,
      expectedCTR: h.expectedCTR,
      budgetUSD: h.budgetUSD,
      launchedAt: h.launchedAt,
      daysRunning: h.launchedAt
        ? Math.floor((Date.now() - h.launchedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    }));

    return {
      message: `${evaluatable.length} LIVE hypotheses ready for evaluation`,
      evaluated: evaluatable.length,
      hypotheses: evaluatable,
    };
  });
}
