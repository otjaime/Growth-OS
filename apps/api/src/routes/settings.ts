// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function settingsRoutes(app: FastifyInstance) {
  // ── GET /settings/mode — current mode + data overview ──────
  app.get('/settings/mode', async () => {
    const demoMode = process.env.DEMO_MODE === 'true';

    // Demo data comes from job_name='demo_ingest' job runs
    const demoJob = await prisma.jobRun.findFirst({
      where: { jobName: 'demo_ingest' },
      orderBy: { startedAt: 'desc' },
    });

    const [totalEvents, orders, spend, traffic] = await Promise.all([
      prisma.rawEvent.count(),
      prisma.factOrder.count(),
      prisma.factSpend.count(),
      prisma.factTraffic.count(),
    ]);

    return {
      mode: demoMode ? 'demo' : 'live',
      data: {
        hasDemoData: !!demoJob,
        totalEvents,
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
      return {
        success: true,
        mode: 'live',
        message: 'Switched to live mode.',
      };
    }

    return { success: false, message: 'Invalid mode. Use "demo" or "live".' };
  });

  // ── POST /settings/clear-data — purge ALL data (demo + real) ──
  app.post('/settings/clear-data', async () => {
    // Clear everything: marts, staging, raw events, job runs
    const [rawDeleted] = await prisma.$transaction([
      prisma.rawEvent.deleteMany(),
      prisma.factOrder.deleteMany(),
      prisma.factSpend.deleteMany(),
      prisma.factTraffic.deleteMany(),
      prisma.cohort.deleteMany(),
      prisma.dimCustomer.deleteMany(),
      prisma.dimCampaign.deleteMany(),
      prisma.stagingOrder.deleteMany(),
      prisma.stagingSpend.deleteMany(),
      prisma.stagingTraffic.deleteMany(),
      prisma.jobRun.deleteMany(),
    ]);
    return {
      success: true,
      message: `Cleared all data (${rawDeleted.count} raw events + all marts). Ready for fresh sync.`,
      deletedEvents: rawDeleted.count,
    };
  });

  // ── POST /settings/seed-demo — run demo pipeline ──────────
  app.post('/settings/seed-demo', async () => {
    try {
      process.env.DEMO_MODE = 'true';
      // Import and run the demo pipeline dynamically
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('pnpm --filter @growth-os/etl demo', {
        cwd: '/app',
        env: { ...process.env, DEMO_MODE: 'true' },
        timeout: 300_000, // 5 min max
      });
      return {
        success: true,
        message: 'Demo data seeded successfully.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message: `Demo seed failed: ${message}` };
    }
  });
}
