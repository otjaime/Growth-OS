// ──────────────────────────────────────────────────────────────
// 0to1 — Campaign Hypothesis Routes
// Full lifecycle: DRAFT → APPROVED → LIVE → WINNER/LOSER
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import type { HypothesisStatus, PsychTrigger, AwarenessLevel, FunnelStage } from '@growth-os/database';

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['LIVE'],
  LIVE: ['PAUSED_BY_SYSTEM', 'PAUSED_BY_USER', 'WINNER', 'LOSER', 'INCONCLUSIVE'],
  PAUSED_BY_SYSTEM: ['LIVE', 'WINNER', 'LOSER', 'INCONCLUSIVE'],
  PAUSED_BY_USER: ['LIVE', 'WINNER', 'LOSER', 'INCONCLUSIVE'],
};

export async function hypothesesRoutes(app: FastifyInstance): Promise<void> {
  // ── LIST hypotheses for a client ──────────────────────────
  app.get('/clients/:id/hypotheses', {
    schema: {
      tags: ['hypotheses'],
      summary: 'List hypotheses for a client',
    },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = req.query as { status?: string };

    const where: Record<string, unknown> = { clientId: id };
    if (status) where.status = status;

    const hypotheses = await prisma.campaignHypothesis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        stopLossEvents: {
          orderBy: { executedAt: 'desc' },
          take: 3,
        },
      },
    });

    return { hypotheses, total: hypotheses.length };
  });

  // ── CREATE hypothesis (DRAFT) ─────────────────────────────
  app.post('/clients/:id/hypotheses', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Create a new hypothesis in DRAFT status',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      title: string;
      trigger: PsychTrigger;
      triggerMechanism: string;
      awarenessLevel: AwarenessLevel;
      audience: string;
      funnelStage: FunnelStage;
      creativeAngle: string;
      copyHook: string;
      primaryEmotion: string;
      primaryObjection: string;
      conviction: number;
      budgetUSD: number;
      durationDays: number;
      falsificationCondition: string;
      expectedROAS: number;
      expectedCTR: number;
      expectedCVR: number;
    };

    // Validate client exists
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    if (!body.title) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'title is required' } };
    }

    const hypothesis = await prisma.campaignHypothesis.create({
      data: {
        clientId: id,
        title: body.title,
        trigger: body.trigger ?? 'LOSS_AVERSION',
        triggerMechanism: body.triggerMechanism ?? '',
        awarenessLevel: body.awarenessLevel ?? 'PAIN_AWARE',
        audience: body.audience ?? '',
        funnelStage: body.funnelStage ?? 'MOFU',
        creativeAngle: body.creativeAngle ?? '',
        copyHook: body.copyHook ?? '',
        primaryEmotion: body.primaryEmotion ?? '',
        primaryObjection: body.primaryObjection ?? '',
        conviction: body.conviction ?? 3,
        budgetUSD: body.budgetUSD ?? 1000,
        durationDays: body.durationDays ?? 7,
        falsificationCondition: body.falsificationCondition ?? '',
        expectedROAS: body.expectedROAS ?? 3.0,
        expectedCTR: body.expectedCTR ?? 2.0,
        expectedCVR: body.expectedCVR ?? 3.0,
        status: 'DRAFT',
      },
    });

    reply.status(201);
    return { hypothesis };
  });

  // ── GET hypothesis detail ─────────────────────────────────
  app.get('/clients/:id/hypotheses/:hId', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Get hypothesis detail',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({
      where: { id: hId },
      include: {
        client: true,
        stopLossEvents: {
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    return { hypothesis };
  });

  // ── UPDATE hypothesis (DRAFT only) ────────────────────────
  app.put('/clients/:id/hypotheses/:hId', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Update hypothesis (DRAFT status only)',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };
    const body = req.body as Record<string, unknown>;

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }
    if (hypothesis.status !== 'DRAFT') {
      reply.status(400);
      return { error: { code: 'INVALID_STATUS', message: 'Can only update DRAFT hypotheses' } };
    }

    // Allow updating any thesis field
    const allowedFields = [
      'title', 'trigger', 'triggerMechanism', 'awarenessLevel', 'audience',
      'funnelStage', 'creativeAngle', 'copyHook', 'primaryEmotion', 'primaryObjection',
      'conviction', 'budgetUSD', 'durationDays', 'falsificationCondition',
      'expectedROAS', 'expectedCTR', 'expectedCVR',
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const updated = await prisma.campaignHypothesis.update({
      where: { id: hId },
      data,
    });

    return { hypothesis: updated };
  });

  // ── APPROVE hypothesis (DRAFT → APPROVED) ─────────────────
  app.post('/clients/:id/hypotheses/:hId/approve', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Approve hypothesis — validates all required fields',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    if (hypothesis.status !== 'DRAFT') {
      reply.status(400);
      return { error: { code: 'INVALID_TRANSITION', message: `Cannot approve from ${hypothesis.status}` } };
    }

    // Validate all required fields
    const missing: string[] = [];
    if (!hypothesis.title) missing.push('title');
    if (!hypothesis.trigger) missing.push('trigger');
    if (!hypothesis.triggerMechanism) missing.push('triggerMechanism');
    if (!hypothesis.audience) missing.push('audience');
    if (!hypothesis.creativeAngle) missing.push('creativeAngle');
    if (!hypothesis.copyHook) missing.push('copyHook');
    if (!hypothesis.primaryEmotion) missing.push('primaryEmotion');
    if (!hypothesis.primaryObjection) missing.push('primaryObjection');
    if (!hypothesis.expectedROAS) missing.push('expectedROAS');
    if (!hypothesis.expectedCTR) missing.push('expectedCTR');
    if (!hypothesis.expectedCVR) missing.push('expectedCVR');
    if (!hypothesis.conviction) missing.push('conviction');
    if (!hypothesis.budgetUSD) missing.push('budgetUSD');
    if (!hypothesis.durationDays) missing.push('durationDays');

    if (!hypothesis.falsificationCondition || hypothesis.falsificationCondition.length < 30) {
      missing.push('falsificationCondition (min 30 characters)');
    }

    if (missing.length > 0) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: `Missing required fields: ${missing.join(', ')}` } };
    }

    const updated = await prisma.campaignHypothesis.update({
      where: { id: hId },
      data: { status: 'APPROVED' },
    });

    return { hypothesis: updated };
  });

  // ── LAUNCH hypothesis (APPROVED → LIVE) ───────────────────
  app.post('/clients/:id/hypotheses/:hId/launch', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Launch hypothesis — uses metaCampaignId or auto-creates via executeHypothesis',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };
    const body = req.body as { metaCampaignId?: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    if (hypothesis.status !== 'APPROVED') {
      reply.status(400);
      return { error: { code: 'INVALID_TRANSITION', message: `Cannot launch from ${hypothesis.status}` } };
    }

    // If metaCampaignId provided directly, use it (backward compatible)
    if (body.metaCampaignId) {
      const updated = await prisma.campaignHypothesis.update({
        where: { id: hId },
        data: {
          status: 'LIVE',
          metaCampaignId: body.metaCampaignId,
          launchedAt: new Date(),
        },
      });

      return { hypothesis: updated };
    }

    // If no metaCampaignId but hypothesis has a creative brief, auto-execute
    if (hypothesis.creativeBrief) {
      try {
        const { executeHypothesis } = await import('../lib/hypothesis-executor.js');
        const result = await executeHypothesis(hId, prisma);

        if (!result.success) {
          reply.status(400);
          return { error: { code: 'EXECUTION_FAILED', message: result.error } };
        }

        const updated = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
        return { hypothesis: updated, execution: result };
      } catch (err) {
        app.log.error(err, 'Failed to auto-execute hypothesis on launch');
        reply.status(500);
        return { error: { code: 'EXECUTION_ERROR', message: String(err) } };
      }
    }

    // Neither metaCampaignId nor creativeBrief
    reply.status(400);
    return { error: { code: 'VALIDATION_ERROR', message: 'Either metaCampaignId or a creative brief is required. Generate a brief first.' } };
  });

  // ── CLOSE hypothesis (LIVE → WINNER/LOSER/INCONCLUSIVE) ───
  app.post('/clients/:id/hypotheses/:hId/close', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Close hypothesis with verdict and lesson',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };
    const body = req.body as {
      verdict: 'WIN' | 'LOSS' | 'INCONCLUSIVE_VERDICT';
      lesson: string;
      actualROAS?: number;
      actualCTR?: number;
      actualCVR?: number;
      actualSpend?: number;
      actualRevenue?: number;
      triggerEffective?: boolean;
    };

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    const closableStatuses: HypothesisStatus[] = ['LIVE', 'PAUSED_BY_SYSTEM', 'PAUSED_BY_USER'];
    if (!closableStatuses.includes(hypothesis.status)) {
      reply.status(400);
      return { error: { code: 'INVALID_TRANSITION', message: `Cannot close from ${hypothesis.status}` } };
    }

    // Auto-populate actual metrics from synced data if available
    if (hypothesis.metricsSnapshot && typeof hypothesis.metricsSnapshot === 'object') {
      const snap = hypothesis.metricsSnapshot as Record<string, number>;
      if (body.actualROAS == null && snap.roas != null) body.actualROAS = snap.roas;
      if (body.actualCTR == null && snap.ctr != null) body.actualCTR = snap.ctr;
      if (body.actualCVR == null && snap.cvr != null) body.actualCVR = snap.cvr;
      if (body.actualSpend == null && snap.spend != null) body.actualSpend = snap.spend;
      if (body.actualRevenue == null && snap.revenue != null) body.actualRevenue = snap.revenue;
    }

    // Auto-pause Meta campaign if still live
    if (hypothesis.metaCampaignId && (hypothesis.status === 'LIVE')) {
      try {
        const { pauseMetaCampaign } = await import('../lib/meta-executor.js');
        const client = await prisma.client.findUnique({ where: { id: hypothesis.clientId } });
        if (client?.metaAccountId) {
          const cred = await prisma.connectorCredential.findFirst({
            where: { connectorType: 'meta', organizationId: client.organizationId },
          });
          if (cred) {
            const { decrypt: dec } = await import('@growth-os/database');
            const decrypted = dec(cred.encryptedData, cred.iv, cred.authTag);
            const parsed = JSON.parse(decrypted) as { accessToken?: string };
            if (parsed.accessToken) {
              const adSetIds = hypothesis.metaAdSetId ? [hypothesis.metaAdSetId] : [];
              await pauseMetaCampaign(parsed.accessToken, hypothesis.metaCampaignId, adSetIds);
            }
          }
        }
      } catch (err) {
        app.log.error(err, 'Failed to auto-pause Meta campaign on close');
      }
    }

    if (!body.verdict) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'verdict is required (WIN, LOSS, or INCONCLUSIVE_VERDICT)' } };
    }

    // Lesson required for all closures; min 50 chars for WIN/LOSS
    if (!body.lesson) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'lesson is required to close a hypothesis' } };
    }

    if ((body.verdict === 'WIN' || body.verdict === 'LOSS') && body.lesson.length < 50) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'lesson must be at least 50 characters for WIN/LOSS verdicts' } };
    }

    // Map verdict to status
    const statusMap: Record<string, HypothesisStatus> = {
      WIN: 'WINNER',
      LOSS: 'LOSER',
      INCONCLUSIVE_VERDICT: 'INCONCLUSIVE',
    };

    const newStatus = statusMap[body.verdict];
    if (!newStatus) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'Invalid verdict' } };
    }

    // WIN/LOSS require actual metrics + triggerEffective
    if (body.verdict === 'WIN' || body.verdict === 'LOSS') {
      if (body.actualROAS == null) {
        reply.status(400);
        return { error: { code: 'VALIDATION_ERROR', message: 'actualROAS is required for WIN/LOSS' } };
      }
      if (body.triggerEffective == null) {
        reply.status(400);
        return { error: { code: 'VALIDATION_ERROR', message: 'triggerEffective is required for WIN/LOSS' } };
      }
    }

    const delta = body.actualROAS != null ? body.actualROAS - hypothesis.expectedROAS : null;

    const updated = await prisma.campaignHypothesis.update({
      where: { id: hId },
      data: {
        status: newStatus,
        verdict: body.verdict,
        lesson: body.lesson,
        actualROAS: body.actualROAS,
        actualCTR: body.actualCTR,
        actualCVR: body.actualCVR,
        actualSpend: body.actualSpend,
        actualRevenue: body.actualRevenue,
        triggerEffective: body.triggerEffective,
        delta,
        closedAt: new Date(),
      },
    });

    // Update TriggerScore
    if (body.verdict === 'WIN' || body.verdict === 'LOSS') {
      try {
        const client = await prisma.client.findUnique({ where: { id: hypothesis.clientId } });
        if (client) {
          await prisma.triggerScore.upsert({
            where: {
              trigger_vertical_awarenessLevel: {
                trigger: hypothesis.trigger,
                vertical: client.vertical,
                awarenessLevel: hypothesis.awarenessLevel,
              },
            },
            create: {
              trigger: hypothesis.trigger,
              vertical: client.vertical,
              awarenessLevel: hypothesis.awarenessLevel,
              sampleSize: 1,
              wins: body.verdict === 'WIN' ? 1 : 0,
              losses: body.verdict === 'LOSS' ? 1 : 0,
              winRate: body.verdict === 'WIN' ? 1.0 : 0.0,
              avgROASDelta: delta ?? 0,
              confidenceLevel: 'LOW',
            },
            update: {
              sampleSize: { increment: 1 },
              wins: body.verdict === 'WIN' ? { increment: 1 } : undefined,
              losses: body.verdict === 'LOSS' ? { increment: 1 } : undefined,
            },
          });

          // Recalculate win rate
          const score = await prisma.triggerScore.findUnique({
            where: {
              trigger_vertical_awarenessLevel: {
                trigger: hypothesis.trigger,
                vertical: client.vertical,
                awarenessLevel: hypothesis.awarenessLevel,
              },
            },
          });

          if (score) {
            const denominator = score.wins + score.losses;
            const winRate = denominator > 0 ? score.wins / denominator : 0;
            const confidenceLevel = score.sampleSize >= 30 ? 'HIGH' : score.sampleSize >= 15 ? 'MEDIUM' : 'LOW';

            await prisma.triggerScore.update({
              where: { id: score.id },
              data: { winRate, confidenceLevel },
            });
          }
        }
      } catch (err) {
        app.log.error(err, 'Failed to update TriggerScore after closing hypothesis');
      }
    }

    return { hypothesis: updated };
  });

  // ── PAUSE hypothesis (LIVE → PAUSED_BY_USER) ─────────────
  app.post('/clients/:id/hypotheses/:hId/pause', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Pause hypothesis manually',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    if (hypothesis.status !== 'LIVE') {
      reply.status(400);
      return { error: { code: 'INVALID_TRANSITION', message: `Cannot pause from ${hypothesis.status}` } };
    }

    const updated = await prisma.campaignHypothesis.update({
      where: { id: hId },
      data: { status: 'PAUSED_BY_USER' },
    });

    return { hypothesis: updated };
  });

  // ── GENERATE creative brief ────────────────────────────────
  app.post('/clients/:id/hypotheses/:hId/generate-brief', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Generate AI creative brief for hypothesis',
    },
  }, async (req, reply) => {
    const { id, hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({
      where: { id: hId },
      include: { client: true },
    });

    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    if (hypothesis.clientId !== id) {
      reply.status(400);
      return { error: { code: 'INVALID_CLIENT', message: 'Hypothesis does not belong to this client' } };
    }

    if (hypothesis.status !== 'DRAFT' && hypothesis.status !== 'APPROVED') {
      reply.status(400);
      return { error: { code: 'INVALID_STATUS', message: `Cannot generate brief from status ${hypothesis.status}` } };
    }

    try {
      const { generateHypothesisBrief } = await import('../lib/hypothesis-brief-generator.js');
      const brief = await generateHypothesisBrief(hypothesis, hypothesis.client, prisma);

      const updated = await prisma.campaignHypothesis.update({
        where: { id: hId },
        data: {
          creativeBrief: JSON.parse(JSON.stringify(brief)),
          dailyBudget: brief.dailyBudget,
        },
      });

      return { hypothesis: updated, brief };
    } catch (err) {
      app.log.error(err, 'Failed to generate creative brief');
      reply.status(500);
      return { error: { code: 'BRIEF_GENERATION_FAILED', message: String(err) } };
    }
  });

  // ── EXECUTE hypothesis on Meta ─────────────────────────────
  app.post('/clients/:id/hypotheses/:hId/execute', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Create Meta campaign from hypothesis creative brief',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    if (hypothesis.status !== 'APPROVED') {
      reply.status(400);
      return { error: { code: 'INVALID_STATUS', message: `Cannot execute from status ${hypothesis.status}. Approve first.` } };
    }

    if (!hypothesis.creativeBrief) {
      reply.status(400);
      return { error: { code: 'NO_BRIEF', message: 'No creative brief found. Generate a brief first.' } };
    }

    try {
      const { executeHypothesis } = await import('../lib/hypothesis-executor.js');
      const result = await executeHypothesis(hId, prisma);

      if (!result.success) {
        reply.status(400);
        return { error: { code: 'EXECUTION_FAILED', message: result.error } };
      }

      // Refetch updated hypothesis
      const updated = await prisma.campaignHypothesis.findUnique({ where: { id: hId } });
      return { hypothesis: updated, execution: result };
    } catch (err) {
      app.log.error(err, 'Failed to execute hypothesis on Meta');
      reply.status(500);
      return { error: { code: 'EXECUTION_ERROR', message: String(err) } };
    }
  });

  // ── GET hypothesis metrics ─────────────────────────────────
  app.get('/clients/:id/hypotheses/:hId/metrics', {
    schema: {
      tags: ['hypotheses'],
      summary: 'Get live + historical metrics for a hypothesis',
    },
  }, async (req, reply) => {
    const { hId } = req.params as { id: string; hId: string };

    const hypothesis = await prisma.campaignHypothesis.findUnique({
      where: { id: hId },
      include: {
        metricLogs: {
          orderBy: { syncedAt: 'asc' },
        },
      },
    });

    if (!hypothesis) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } };
    }

    return {
      current: hypothesis.metricsSnapshot,
      history: hypothesis.metricLogs,
      lastSync: hypothesis.lastMetricsSyncAt,
      expected: {
        roas: hypothesis.expectedROAS,
        ctr: hypothesis.expectedCTR,
        cvr: hypothesis.expectedCVR,
      },
    };
  });
}
