// ──────────────────────────────────────────────────────────────
// Growth OS — Growth Model / Scenario Planning Routes
// Interactive scenario planning: input assumptions → projected outcomes
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { computeGrowthModel } from '@growth-os/etl';
import type { GrowthModelInput } from '@growth-os/etl';

export async function growthModelRoutes(app: FastifyInstance) {
  // ── LIST scenarios ─────────────────────────────────────────
  app.get('/growth-model/scenarios', {
    schema: {
      tags: ['growth-model'],
      summary: 'List saved scenarios',
      description: 'Returns all saved growth scenarios, newest first.',
    },
  }, async () => {
    const scenarios = await prisma.growthScenario.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return { scenarios };
  });

  // ── CREATE scenario ────────────────────────────────────────
  app.post('/growth-model/scenarios', {
    schema: {
      tags: ['growth-model'],
      summary: 'Create scenario',
      description: 'Create a new growth scenario — computes projected outputs from input assumptions and stores both.',
    },
  }, async (req, reply) => {
    const body = req.body as {
      name: string;
      description?: string;
      isBaseline?: boolean;
      monthlyBudget: number;
      targetCac: number;
      expectedCvr: number;
      avgOrderValue: number;
      cogsPercent: number;
      monthlyTraffic?: number;
      returnRate?: number;
      avgOrdersPerCustomer?: number;
      horizonMonths?: number;
    };

    if (!body.name || body.monthlyBudget == null || body.targetCac == null ||
        body.expectedCvr == null || body.avgOrderValue == null || body.cogsPercent == null) {
      reply.status(400);
      return { error: 'name, monthlyBudget, targetCac, expectedCvr, avgOrderValue, and cogsPercent are required' };
    }

    const input: GrowthModelInput = {
      monthlyBudget: body.monthlyBudget,
      targetCac: body.targetCac,
      expectedCvr: body.expectedCvr,
      avgOrderValue: body.avgOrderValue,
      cogsPercent: body.cogsPercent,
      monthlyTraffic: body.monthlyTraffic ?? null,
      returnRate: body.returnRate ?? 0,
      avgOrdersPerCustomer: body.avgOrdersPerCustomer ?? 1,
      horizonMonths: body.horizonMonths ?? 6,
    };

    const output = computeGrowthModel(input);

    const scenario = await prisma.growthScenario.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        isBaseline: body.isBaseline ?? false,
        ...input,
        projectedRevenue: output.projectedRevenue,
        projectedOrders: output.projectedOrders,
        projectedCustomers: output.projectedCustomers,
        projectedRoas: output.projectedRoas,
        projectedMer: output.projectedMer,
        projectedLtv: output.projectedLtv,
        projectedContributionMargin: output.projectedContributionMargin,
        breakEvenMonth: output.breakEvenMonth,
      },
    });

    reply.status(201);
    return scenario;
  });

  // ── GET single scenario ────────────────────────────────────
  app.get('/growth-model/scenarios/:id', {
    schema: {
      tags: ['growth-model'],
      summary: 'Get scenario by ID',
      description: 'Returns a single saved scenario with its inputs and outputs.',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const scenario = await prisma.growthScenario.findUnique({ where: { id } });

    if (!scenario) {
      reply.status(404);
      return { error: 'Scenario not found' };
    }

    // Recompute to include monthlyBreakdown (not stored in DB)
    const output = computeGrowthModel({
      monthlyBudget: scenario.monthlyBudget,
      targetCac: scenario.targetCac,
      expectedCvr: scenario.expectedCvr,
      avgOrderValue: scenario.avgOrderValue,
      cogsPercent: scenario.cogsPercent,
      monthlyTraffic: scenario.monthlyTraffic,
      returnRate: scenario.returnRate,
      avgOrdersPerCustomer: scenario.avgOrdersPerCustomer,
      horizonMonths: scenario.horizonMonths,
    });

    return { ...scenario, monthlyBreakdown: output.monthlyBreakdown };
  });

  // ── UPDATE scenario ────────────────────────────────────────
  app.put('/growth-model/scenarios/:id', {
    schema: {
      tags: ['growth-model'],
      summary: 'Update scenario',
      description: 'Update scenario inputs — recomputes all projected outputs.',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.growthScenario.findUnique({ where: { id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Scenario not found' };
    }

    const input: GrowthModelInput = {
      monthlyBudget: (body.monthlyBudget as number) ?? existing.monthlyBudget,
      targetCac: (body.targetCac as number) ?? existing.targetCac,
      expectedCvr: (body.expectedCvr as number) ?? existing.expectedCvr,
      avgOrderValue: (body.avgOrderValue as number) ?? existing.avgOrderValue,
      cogsPercent: (body.cogsPercent as number) ?? existing.cogsPercent,
      monthlyTraffic: (body.monthlyTraffic as number) ?? existing.monthlyTraffic,
      returnRate: (body.returnRate as number) ?? existing.returnRate,
      avgOrdersPerCustomer: (body.avgOrdersPerCustomer as number) ?? existing.avgOrdersPerCustomer,
      horizonMonths: (body.horizonMonths as number) ?? existing.horizonMonths,
    };

    const output = computeGrowthModel(input);

    const updated = await prisma.growthScenario.update({
      where: { id },
      data: {
        name: (body.name as string) ?? existing.name,
        description: (body.description as string) ?? existing.description,
        isBaseline: (body.isBaseline as boolean) ?? existing.isBaseline,
        ...input,
        projectedRevenue: output.projectedRevenue,
        projectedOrders: output.projectedOrders,
        projectedCustomers: output.projectedCustomers,
        projectedRoas: output.projectedRoas,
        projectedMer: output.projectedMer,
        projectedLtv: output.projectedLtv,
        projectedContributionMargin: output.projectedContributionMargin,
        breakEvenMonth: output.breakEvenMonth,
      },
    });

    return updated;
  });

  // ── DELETE scenario ────────────────────────────────────────
  app.delete('/growth-model/scenarios/:id', {
    schema: {
      tags: ['growth-model'],
      summary: 'Delete scenario',
      description: 'Delete a saved growth scenario.',
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const existing = await prisma.growthScenario.findUnique({ where: { id } });
    if (!existing) {
      reply.status(404);
      return { error: 'Scenario not found' };
    }

    await prisma.growthScenario.delete({ where: { id } });
    reply.status(204);
    return;
  });

  // ── COMPUTE (stateless) ────────────────────────────────────
  app.post('/growth-model/compute', {
    schema: {
      tags: ['growth-model'],
      summary: 'Compute projections (stateless)',
      description: 'Real-time computation for slider interaction. No database write — returns projected KPIs and monthly breakdown.',
    },
  }, async (req, reply) => {
    const body = req.body as {
      monthlyBudget: number;
      targetCac: number;
      expectedCvr: number;
      avgOrderValue: number;
      cogsPercent: number;
      monthlyTraffic?: number;
      returnRate?: number;
      avgOrdersPerCustomer?: number;
      horizonMonths?: number;
    };

    if (body.monthlyBudget == null || body.targetCac == null ||
        body.expectedCvr == null || body.avgOrderValue == null || body.cogsPercent == null) {
      reply.status(400);
      return { error: 'monthlyBudget, targetCac, expectedCvr, avgOrderValue, and cogsPercent are required' };
    }

    const input: GrowthModelInput = {
      monthlyBudget: body.monthlyBudget,
      targetCac: body.targetCac,
      expectedCvr: body.expectedCvr,
      avgOrderValue: body.avgOrderValue,
      cogsPercent: body.cogsPercent,
      monthlyTraffic: body.monthlyTraffic ?? null,
      returnRate: body.returnRate ?? 0,
      avgOrdersPerCustomer: body.avgOrdersPerCustomer ?? 1,
      horizonMonths: body.horizonMonths ?? 6,
    };

    const output = computeGrowthModel(input);
    return output;
  });

  // ── BASELINE from actual data ──────────────────────────────
  app.get('/growth-model/baseline', {
    schema: {
      tags: ['growth-model'],
      summary: 'Compute baseline from actual data',
      description: 'Derives input assumptions from the last 30 days of mart data (spend, orders, traffic, cohorts).',
    },
  }, async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Gather actual metrics from marts
    const [spendAgg, orderAgg, trafficAgg, latestCohort] = await Promise.all([
      // Last 90 days of spend for monthly average
      prisma.factSpend.aggregate({
        _sum: { spend: true },
        where: { date: { gte: ninetyDaysAgo } },
      }),
      // Last 30 days of orders
      prisma.factOrder.aggregate({
        _sum: { revenueNet: true, cogs: true },
        _count: { _all: true },
        where: { orderDate: { gte: thirtyDaysAgo } },
      }),
      // Last 30 days of traffic
      prisma.factTraffic.aggregate({
        _sum: { sessions: true, purchases: true },
        where: { date: { gte: thirtyDaysAgo } },
      }),
      // Latest cohort for retention
      prisma.cohort.findFirst({
        orderBy: { cohortMonth: 'desc' },
        where: { cohortSize: { gt: 0 } },
      }),
    ]);

    // New customers (last 30 days)
    const newCustomers = await prisma.dimCustomer.count({
      where: { firstOrderDate: { gte: thirtyDaysAgo } },
    });

    const totalSpend90 = Number(spendAgg._sum?.spend ?? 0);
    const monthlyBudget = Math.round(totalSpend90 / 3);
    const totalRevenueNet = Number(orderAgg._sum?.revenueNet ?? 0);
    const totalCogs = Number(orderAgg._sum?.cogs ?? 0);
    const orderCount = orderAgg._count._all;

    const targetCac = newCustomers > 0 ? Math.round((monthlyBudget / newCustomers) * 100) / 100 : 50;
    const avgOrderValue = orderCount > 0 ? Math.round((totalRevenueNet / orderCount) * 100) / 100 : 85;
    const cogsPercent = totalRevenueNet > 0 ? Math.round((totalCogs / totalRevenueNet) * 1000) / 1000 : 0.45;

    const sessions = Number(trafficAgg._sum?.sessions ?? 0);
    const purchases = Number(trafficAgg._sum?.purchases ?? 0);
    const expectedCvr = sessions > 0 ? Math.round((purchases / sessions) * 10000) / 10000 : 0.025;

    const returnRate = latestCohort ? Math.min(1, Number(latestCohort.d30Retention ?? 0)) : 0.20;

    const baseline: GrowthModelInput = {
      monthlyBudget: monthlyBudget > 0 ? monthlyBudget : 25000,
      targetCac: targetCac > 0 ? targetCac : 50,
      expectedCvr: expectedCvr > 0 ? expectedCvr : 0.025,
      avgOrderValue: avgOrderValue > 0 ? avgOrderValue : 85,
      cogsPercent: cogsPercent > 0 ? cogsPercent : 0.45,
      monthlyTraffic: sessions > 0 ? Math.round(sessions) : null,
      returnRate,
      avgOrdersPerCustomer: orderCount > 0 && newCustomers > 0
        ? Math.round((orderCount / newCustomers) * 10) / 10
        : 1.3,
      horizonMonths: 6,
    };

    const output = computeGrowthModel(baseline);

    return { baseline, ...output };
  });
}
