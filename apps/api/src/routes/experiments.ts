// ──────────────────────────────────────────────────────────────
// Growth OS — Experiments CRUD Routes
// Manage growth experiments: hypothesis, ICE scoring, lifecycle
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { computeABTestResults, isValidABInput } from '../lib/ab-stats.js';

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
  IDEA: ['BACKLOG', 'ARCHIVED'],
  BACKLOG: ['RUNNING', 'IDEA', 'ARCHIVED'],
  RUNNING: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: ['IDEA'],
};

function computeIce(impact?: number | null, confidence?: number | null, ease?: number | null): number | null {
  if (impact == null || confidence == null || ease == null) return null;
  return Math.round((impact * confidence * ease / 10) * 100) / 100;
}

export async function experimentsRoutes(app: FastifyInstance) {
  // ── LIST experiments ──────────────────────────────────────
  app.get('/experiments', {
    schema: {
      tags: ['experiments'],
      summary: 'List experiments',
      description: 'Returns all experiments, optionally filtered by status and/or channel. Sorted by ICE score descending.',
    },
  }, async (req) => {
    const { status, channel } = req.query as { status?: string; channel?: string };

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (channel) where.channel = channel;

    const experiments = await prisma.experiment.findMany({
      where,
      orderBy: [{ iceScore: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { metrics: true } } },
    });

    return {
      experiments,
      total: experiments.length,
    };
  });

  // ── CREATE experiment ─────────────────────────────────────
  app.post('/experiments', {
    schema: {
      tags: ['experiments'],
      summary: 'Create experiment',
      description: 'Create a new growth experiment with optional ICE scoring',
    },
  }, async (req, reply) => {
    const body = req.body as {
      name: string;
      hypothesis: string;
      primaryMetric: string;
      channel?: string;
      targetLift?: number;
      impact?: number;
      confidence?: number;
      ease?: number;
      status?: string;
    };

    if (!body.name || !body.hypothesis || !body.primaryMetric) {
      reply.status(400);
      return { error: 'name, hypothesis, and primaryMetric are required' };
    }

    const iceScore = computeIce(body.impact, body.confidence, body.ease);

    const experiment = await prisma.experiment.create({
      data: {
        name: body.name,
        hypothesis: body.hypothesis,
        primaryMetric: body.primaryMetric,
        channel: body.channel ?? null,
        targetLift: body.targetLift ?? null,
        impact: body.impact ?? null,
        confidence: body.confidence ?? null,
        ease: body.ease ?? null,
        iceScore,
        status: (body.status as 'IDEA' | 'BACKLOG') ?? 'IDEA',
      },
    });

    reply.status(201);
    return experiment;
  });

  // ── GET single experiment ─────────────────────────────────
  app.get('/experiments/:id', {
    schema: {
      tags: ['experiments'],
      summary: 'Get experiment by ID',
      description: 'Returns a single experiment with its metric snapshots',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: { metrics: { orderBy: { date: 'desc' } } },
    });

    if (!experiment) {
      reply.status(404);
      return { error: 'Experiment not found' };
    }

    return experiment;
  });

  // ── UPDATE experiment ─────────────────────────────────────
  app.patch('/experiments/:id', {
    schema: {
      tags: ['experiments'],
      summary: 'Update experiment',
      description: 'Update experiment fields (name, hypothesis, ICE scores, results, learnings)',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.experiment.findUnique({ where: { id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Experiment not found' };
    }

    // Merge ICE scores to recompute
    const impact = (body.impact as number) ?? existing.impact;
    const confidence = (body.confidence as number) ?? existing.confidence;
    const ease = (body.ease as number) ?? existing.ease;
    const iceScore = computeIce(impact, confidence, ease);

    // Only allow safe fields to be updated
    const allowedFields = [
      'name', 'hypothesis', 'primaryMetric', 'channel', 'targetLift',
      'impact', 'confidence', 'ease',
      'startDate', 'endDate', 'result', 'learnings', 'nextSteps',
      'controlName', 'variantName',
      'controlSampleSize', 'variantSampleSize',
      'controlConversions', 'variantConversions',
    ];
    const data: Record<string, unknown> = { iceScore };
    for (const field of allowedFields) {
      if (field in body) data[field] = body[field];
    }

    // Auto-compute A/B test stats when all 4 numeric fields are available
    const cSample = (body.controlSampleSize as number) ?? existing.controlSampleSize;
    const vSample = (body.variantSampleSize as number) ?? existing.variantSampleSize;
    const cConv = (body.controlConversions as number) ?? existing.controlConversions;
    const vConv = (body.variantConversions as number) ?? existing.variantConversions;

    if (cSample != null && vSample != null && cConv != null && vConv != null) {
      const abInput = {
        controlSampleSize: cSample,
        variantSampleSize: vSample,
        controlConversions: cConv,
        variantConversions: vConv,
      };
      if (isValidABInput(abInput)) {
        const abResult = computeABTestResults(abInput);
        if (abResult) {
          data.controlRate = abResult.controlRate;
          data.variantRate = abResult.variantRate;
          data.absoluteLift = abResult.absoluteLift;
          data.relativeLift = abResult.relativeLift;
          data.pValue = abResult.pValue;
          data.confidenceLevel = abResult.confidenceLevel;
          data.isSignificant = abResult.isSignificant;
          data.confidenceInterval = abResult.confidenceInterval;
          data.verdict = abResult.verdict;
        }
      }
    }

    const updated = await prisma.experiment.update({
      where: { id },
      data,
    });

    return updated;
  });

  // ── DELETE experiment ──────────────────────────────────────
  app.delete('/experiments/:id', {
    schema: {
      tags: ['experiments'],
      summary: 'Delete experiment',
      description: 'Delete an experiment and its associated metrics',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await prisma.experiment.findUnique({ where: { id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Experiment not found' };
    }

    await prisma.experiment.delete({ where: { id } });
    reply.status(204);
    return;
  });

  // ── STATUS transition ─────────────────────────────────────
  app.patch('/experiments/:id/status', {
    schema: {
      tags: ['experiments'],
      summary: 'Transition experiment status',
      description: 'Move experiment through lifecycle: IDEA → BACKLOG → RUNNING → COMPLETED → ARCHIVED',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };

    if (!status) {
      reply.status(400);
      return { error: 'status is required' };
    }

    const existing = await prisma.experiment.findUnique({ where: { id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Experiment not found' };
    }

    const allowed = TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(status)) {
      reply.status(400);
      return {
        error: `Cannot transition from ${existing.status} to ${status}`,
        allowedTransitions: allowed,
      };
    }

    const data: Record<string, unknown> = { status };
    if (status === 'RUNNING' && !existing.startDate) {
      data.startDate = new Date();
    }
    if (status === 'COMPLETED' && !existing.endDate) {
      data.endDate = new Date();
    }

    const updated = await prisma.experiment.update({
      where: { id },
      data,
    });

    return updated;
  });
}
