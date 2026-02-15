// ──────────────────────────────────────────────────────────────
// Growth OS — Pipeline Health Routes
// ETL observability: run history, timing, data freshness, quality
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { validateData } from '@growth-os/etl';

export async function pipelineRoutes(app: FastifyInstance) {
  // ── Pipeline overview: runs, freshness, row counts ──────────
  app.get('/pipeline/overview', {
    schema: {
      tags: ['pipeline'],
      summary: 'Pipeline health overview',
      description: 'Returns recent pipeline runs, data freshness per connector, and row counts across all layers',
    },
  }, async (_req, reply) => {
    try {
    // Recent pipeline runs (last 20)
    const runs = await prisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        jobName: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        errorJson: true,
      },
    });

    // Data freshness per connector
    const connectors = await prisma.connectorCredential.findMany({
      select: {
        id: true,
        connectorType: true,
        lastSyncAt: true,
        lastSyncStatus: true,
      },
    });

    // Row counts across all layers (sequential to avoid OOM on small containers)
    const rawEvents = await prisma.rawEvent.count();
    const stgOrders = await prisma.stgOrder.count();
    const stgSpend = await prisma.stgSpend.count();
    const stgTraffic = await prisma.stgTraffic.count();
    const factOrders = await prisma.factOrder.count();
    const factSpend = await prisma.factSpend.count();
    const factTraffic = await prisma.factTraffic.count();
    const cohorts = await prisma.cohort.count();
    const dimCustomers = await prisma.dimCustomer.count();
    const dimCampaigns = await prisma.dimCampaign.count();

    // Compute avg duration of successful runs
    const successfulRuns = runs.filter((r) => r.status === 'SUCCESS' && r.durationMs);
    const avgDurationMs = successfulRuns.length > 0
      ? Math.round(successfulRuns.reduce((s, r) => s + (r.durationMs ?? 0), 0) / successfulRuns.length)
      : null;

    // Success rate from last 20 runs
    const completedRuns = runs.filter((r) => r.status !== 'RUNNING');
    const successRate = completedRuns.length > 0
      ? successfulRuns.length / completedRuns.length
      : null;

    return {
      runs,
      freshness: connectors.map((c) => ({
        id: c.id,
        source: c.connectorType,
        lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: c.lastSyncStatus,
      })),
      rowCounts: {
        raw: { events: rawEvents },
        staging: { orders: stgOrders, spend: stgSpend, traffic: stgTraffic },
        facts: { orders: factOrders, spend: factSpend, traffic: factTraffic },
        dimensions: { customers: dimCustomers, campaigns: dimCampaigns, cohorts },
      },
      stats: {
        avgDurationMs,
        successRate,
        totalRuns: runs.length,
      },
    };
    } catch (err) {
      reply.status(500);
      return { error: 'Pipeline overview query failed', message: String(err) };
    }
  });

  // ── Data quality checks ───────────────────────────────────
  app.get('/pipeline/quality', {
    schema: {
      tags: ['pipeline'],
      summary: 'Data quality checks',
      description: 'Runs 10 validation checks across all data layers: referential integrity, non-negative values, date continuity, uniqueness',
    },
  }, async () => {
    try {
      const results = await validateData();
      const passed = results.filter((r) => r.passed).length;
      return {
        checks: results,
        summary: { total: results.length, passed, failed: results.length - passed },
        score: results.length > 0 ? Math.round((passed / results.length) * 100) : 0,
      };
    } catch (err) {
      return {
        checks: [],
        summary: { total: 0, passed: 0, failed: 0 },
        score: 0,
        error: String(err),
      };
    }
  });
}
