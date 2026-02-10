// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function settingsRoutes(app: FastifyInstance) {
  // ── GET /settings/mode — current mode + data overview ──────
  app.get('/settings/mode', async () => {
    const demoMode = process.env.DEMO_MODE === 'true';

    const [demoEvents, realEvents, orders, spend, traffic] = await Promise.all([
      prisma.rawEvent.count({ where: { source: 'demo' } }),
      prisma.rawEvent.count({ where: { source: { not: 'demo' } } }),
      prisma.factOrder.count(),
      prisma.factSpend.count(),
      prisma.factTraffic.count(),
    ]);

    return {
      mode: demoMode ? 'demo' : 'live',
      data: {
        hasRealData: realEvents > 0,
        hasDemoData: demoEvents > 0,
        realEvents,
        demoEvents,
        marts: { orders, spend, traffic },
      },
    };
  });

  // ── POST /settings/mode — switch between demo / live ───────
  app.post<{ Body: { mode: string } }>('/settings/mode', async (req) => {
    const { mode } = req.body ?? {};

    if (mode === 'demo') {
      process.env.DEMO_MODE = 'true';
      return {
        success: true,
        mode: 'demo',
        message: 'Switched to demo mode. Dashboard shows sample data.',
      };
    }

    if (mode === 'live') {
      process.env.DEMO_MODE = 'false';
      const realCount = await prisma.rawEvent.count({
        where: { source: { not: 'demo' } },
      });
      return {
        success: true,
        mode: 'live',
        hasRealData: realCount > 0,
        message:
          realCount > 0
            ? `Switched to live mode. Showing ${realCount} real events.`
            : 'Switched to live mode. No real data yet — connect sources and sync.',
      };
    }

    return { success: false, message: 'Invalid mode. Use "demo" or "live".' };
  });

  // ── POST /settings/clear-demo — purge demo data ───────────
  app.post('/settings/clear-demo', async () => {
    const deleted = await prisma.rawEvent.deleteMany({
      where: { source: 'demo' },
    });
    return {
      success: true,
      deletedEvents: deleted.count,
      message: `Cleared ${deleted.count} demo events. Rebuild analytics to update marts.`,
    };
  });

  // ── POST /settings/rebuild-marts — re-run staging→marts ───
  app.post('/settings/rebuild-marts', async () => {
    try {
      // 1) Clear all marts
      await prisma.$transaction([
        prisma.factOrder.deleteMany(),
        prisma.factSpend.deleteMany(),
        prisma.factTraffic.deleteMany(),
        prisma.cohort.deleteMany(),
        prisma.dimCustomer.deleteMany(),
        prisma.dimCampaign.deleteMany(),
      ]);

      // 2) Re-run ETL pipeline on remaining raw events
      const { normalizeStaging, buildMarts } = await import('@growth-os/etl');
      await normalizeStaging();
      await buildMarts();

      const [orders, spend, traffic] = await Promise.all([
        prisma.factOrder.count(),
        prisma.factSpend.count(),
        prisma.factTraffic.count(),
      ]);

      return {
        success: true,
        message: 'Analytics rebuilt from raw events.',
        marts: { orders, spend, traffic },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  });
}
