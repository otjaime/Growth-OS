import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { subDays } from 'date-fns';
import { evaluateAlerts } from '@growth-os/etl';
import type { AlertInput } from '@growth-os/etl';
import * as kpiCalcs from '@growth-os/etl';

export async function alertsRoutes(app: FastifyInstance) {
  app.get('/alerts', async () => {
    const now = new Date('2026-02-09');
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

    // Get baseline retention (average of all cohorts)
    const cohorts = await prisma.cohort.findMany();
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
    };

    const alerts = evaluateAlerts(input);
    return { alerts, evaluatedAt: new Date().toISOString() };
  });
}
