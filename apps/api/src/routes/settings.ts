// ──────────────────────────────────────────────────────────────
// Growth OS — Settings Routes (Demo / Live mode management)
// ──────────────────────────────────────────────────────────────

import { FastifyInstance } from 'fastify';
import { prisma, isDemoMode, setMode } from '@growth-os/database';

async function clearAllData() {
  return prisma.$transaction([
    prisma.rawEvent.deleteMany(),
    prisma.factOrder.deleteMany(),
    prisma.factSpend.deleteMany(),
    prisma.factTraffic.deleteMany(),
    prisma.cohort.deleteMany(),
    prisma.dimCustomer.deleteMany(),
    prisma.dimCampaign.deleteMany(),
    prisma.stgOrder.deleteMany(),
    prisma.stgSpend.deleteMany(),
    prisma.stgTraffic.deleteMany(),
    prisma.jobRun.deleteMany(),
  ]);
}

export async function settingsRoutes(app: FastifyInstance) {
  // ── GET /settings/mode — current mode + data overview ──────
  app.get('/settings/mode', async () => {
    const demoMode = await isDemoMode();

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
      await setMode('demo');
      return {
        success: true,
        mode: 'demo',
        message: 'Switched to demo mode. Dashboard shows sample data.',
      };
    }

    if (mode === 'live') {
      const wasDemoMode = await isDemoMode();
      await setMode('live');

      if (wasDemoMode) {
        // Clear demo data to prevent mixing with real data
        const [rawDeleted] = await clearAllData();
        return {
          success: true,
          mode: 'live',
          message: `Switched to live mode. Cleared ${rawDeleted.count} demo records. Click Sync on your connections to fetch real data.`,
          dataCleared: true,
        };
      }

      return {
        success: true,
        mode: 'live',
        message: 'Switched to live mode.',
        dataCleared: false,
      };
    }

    return { success: false, message: 'Invalid mode. Use "demo" or "live".' };
  });

  // ── POST /settings/clear-data — purge ALL data (demo + real) ──
  app.post('/settings/clear-data', async () => {
    const [rawDeleted] = await clearAllData();
    return {
      success: true,
      message: `Cleared all data (${rawDeleted.count} raw events + all marts). Ready for fresh sync.`,
      deletedEvents: rawDeleted.count,
    };
  });

  // ── POST /settings/seed-demo — run demo pipeline ──────────
  app.post('/settings/seed-demo', async () => {
    try {
      await setMode('demo');
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
