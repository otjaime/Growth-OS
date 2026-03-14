// ──────────────────────────────────────────────────────────────
// 0to1 — Client Management Routes
// CRUD for agency clients with AUM tracking
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma, Prisma } from '@growth-os/database';

export async function clientsRoutes(app: FastifyInstance): Promise<void> {
  // ── LIST clients ──────────────────────────────────────────
  app.get('/clients', {
    schema: {
      tags: ['clients'],
      summary: 'List all active clients with summary stats',
    },
  }, async () => {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { hypotheses: true },
        },
        hypotheses: {
          where: { status: { in: ['DRAFT', 'APPROVED', 'LIVE', 'PAUSED_BY_SYSTEM', 'PAUSED_BY_USER'] } },
          select: { status: true, actualROAS: true },
        },
        trackRecords: {
          where: { period: 'all-time' },
          take: 1,
          select: { winRate: true, totalHypotheses: true },
        },
      },
    });

    const formatted = clients.map((c) => {
      const liveCount = c.hypotheses.filter((h) => h.status === 'LIVE').length;
      const approvedCount = c.hypotheses.filter((h) => h.status === 'APPROVED').length;
      const draftCount = c.hypotheses.filter((h) => h.status === 'DRAFT').length;
      const trackRecord = c.trackRecords[0] ?? null;

      return {
        id: c.id,
        name: c.name,
        vertical: c.vertical,
        baselineROAS: c.baselineROAS,
        targetROAS: c.targetROAS,
        monthlyAdSpend: c.monthlyAdSpend,
        metaAccountId: c.metaAccountId,
        isActive: c.isActive,
        totalHypotheses: c._count.hypotheses,
        activeBreakdown: { live: liveCount, approved: approvedCount, draft: draftCount },
        winRate: trackRecord && trackRecord.totalHypotheses >= 5 ? trackRecord.winRate : null,
        createdAt: c.createdAt,
      };
    });

    const totalAUM = clients.reduce((sum, c) => sum + c.monthlyAdSpend, 0);

    return {
      clients: formatted,
      total: formatted.length,
      totalAUM,
    };
  });

  // ── CREATE client ─────────────────────────────────────────
  app.post('/clients', {
    schema: {
      tags: ['clients'],
      summary: 'Create a new client',
    },
  }, async (req, reply) => {
    const body = req.body as {
      name: string;
      vertical: string;
      baselineROAS: number;
      targetROAS: number;
      monthlyAdSpend: number;
      metaAccountId?: string;
      feeStructure: { baseRetainer: number; perfFeePercent: number; benchmarkROAS: number };
      organizationId?: string;
    };

    if (!body.name || !body.vertical) {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'name and vertical are required' } };
    }

    // Get org id from request context or body
    const organizationId = req.organizationId ?? body.organizationId;
    if (!organizationId) {
      // Fallback: use first org
      const org = await prisma.organization.findFirst();
      if (!org) {
        reply.status(400);
        return { error: { code: 'NO_ORG', message: 'No organization found' } };
      }
      body.organizationId = org.id;
    }

    const client = await prisma.client.create({
      data: {
        organizationId: organizationId ?? body.organizationId!,
        name: body.name,
        vertical: body.vertical as 'ECOMMERCE_DTC' | 'FOOD_BEVERAGE' | 'SAAS' | 'FITNESS' | 'BEAUTY' | 'HOME' | 'PETS' | 'OTHER',
        baselineROAS: body.baselineROAS ?? 2.5,
        targetROAS: body.targetROAS ?? 4.0,
        monthlyAdSpend: body.monthlyAdSpend ?? 10000,
        metaAccountId: body.metaAccountId,
        feeStructure: body.feeStructure ?? { baseRetainer: 3000, perfFeePercent: 15, benchmarkROAS: 2.5 },
      },
    });

    reply.status(201);
    return { client };
  });

  // ── GET client detail ─────────────────────────────────────
  app.get('/clients/:id', {
    schema: {
      tags: ['clients'],
      summary: 'Get client detail with hypothesis pipeline',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        hypotheses: {
          orderBy: { createdAt: 'desc' },
          include: {
            stopLossEvents: {
              orderBy: { executedAt: 'desc' },
              take: 5,
            },
          },
        },
        trackRecords: {
          where: { period: 'all-time' },
          take: 1,
        },
      },
    });

    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    return { client };
  });

  // ── UPDATE client ─────────────────────────────────────────
  app.put('/clients/:id', {
    schema: {
      tags: ['clients'],
      summary: 'Update client',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Partial<{
      name: string;
      vertical: string;
      baselineROAS: number;
      targetROAS: number;
      monthlyAdSpend: number;
      metaAccountId: string;
      feeStructure: Record<string, unknown>;
      isActive: boolean;
    }>;

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.vertical !== undefined && { vertical: body.vertical as 'ECOMMERCE_DTC' }),
        ...(body.baselineROAS !== undefined && { baselineROAS: body.baselineROAS }),
        ...(body.targetROAS !== undefined && { targetROAS: body.targetROAS }),
        ...(body.monthlyAdSpend !== undefined && { monthlyAdSpend: body.monthlyAdSpend }),
        ...(body.metaAccountId !== undefined && { metaAccountId: body.metaAccountId }),
        ...(body.feeStructure !== undefined && { feeStructure: body.feeStructure as unknown as Prisma.InputJsonValue }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return { client: updated };
  });

  // ── GET client AUM ────────────────────────────────────────
  app.get('/clients/:id/aum', {
    schema: {
      tags: ['clients'],
      summary: 'AUM snapshot for client',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: { hypotheses: { where: { status: 'LIVE' } } },
        },
      },
    });

    if (!client) {
      reply.status(404);
      return { error: { code: 'NOT_FOUND', message: 'Client not found' } };
    }

    return {
      aum: client.monthlyAdSpend,
      activeHypotheses: client._count.hypotheses,
      vertical: client.vertical,
    };
  });
}
