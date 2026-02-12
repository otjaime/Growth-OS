// ──────────────────────────────────────────────────────────────
// Growth OS — API Server (Fastify)
// ──────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from '@growth-os/database';
import { normalizeStaging, buildMarts } from '@growth-os/etl';
import { healthRoutes } from './routes/health.js';
import { jobsRoutes } from './routes/jobs.js';
import { metricsRoutes } from './routes/metrics.js';
import { connectionsRoutes } from './routes/connections.js';
import { alertsRoutes } from './routes/alerts.js';
import { wbrRoutes } from './routes/wbr.js';
import { settingsRoutes } from './routes/settings.js';
import { runFullSync } from './lib/run-connector-sync.js';

const PORT = parseInt(process.env.API_PORT ?? '4000', 10);
const HOST = process.env.API_HOST ?? '0.0.0.0';
// Auto-sync interval: default 1 hour, configurable via SYNC_INTERVAL_MS
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? String(60 * 60 * 1000), 10);

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: (() => {
        if (process.env.NODE_ENV === 'production') return undefined;
        try { require.resolve('pino-pretty'); return { target: 'pino-pretty', options: { colorize: true } }; } catch { return undefined; }
      })(),
    },
  });

  await app.register(cors, { origin: true });

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(jobsRoutes, { prefix: '/api' });
  await app.register(metricsRoutes, { prefix: '/api' });
  await app.register(connectionsRoutes, { prefix: '/api' });
  await app.register(alertsRoutes, { prefix: '/api' });
  await app.register(wbrRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });

  // Auto-sync: periodic full sync (replaces BullMQ scheduler, no Redis needed)
  let syncRunning = false;
  let syncTimer: ReturnType<typeof setInterval> | undefined;

  async function periodicSync() {
    if (syncRunning) {
      app.log.info('Skipping periodic sync — previous sync still running');
      return;
    }
    syncRunning = true;
    const startTime = Date.now();
    app.log.info('Starting periodic sync: runFullSync → normalizeStaging → buildMarts');

    let jobRun: { id: string } | undefined;
    try {
      jobRun = await prisma.jobRun.create({
        data: { jobName: 'scheduled_auto_sync', status: 'RUNNING' },
      });
    } catch {
      // jobRun table may not exist yet — proceed without tracking
    }

    try {
      const result = await runFullSync();
      const durationMs = Date.now() - startTime;
      app.log.info({ result, durationMs }, 'Periodic sync complete');
      if (jobRun) {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: { status: 'SUCCESS', finishedAt: new Date(), durationMs },
        }).catch(() => {});
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      app.log.error({ error: String(err), durationMs }, 'Periodic sync failed');
      if (jobRun) {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: { status: 'FAILED', finishedAt: new Date(), durationMs, errorJson: { message: String(err) } },
        }).catch(() => {});
      }
    } finally {
      syncRunning = false;
    }
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      if (syncTimer) clearInterval(syncTimer);
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Growth OS API running at http://${HOST}:${PORT}`);

    // Reset any stale 'syncing' statuses left from previous server shutdown
    const stale = await prisma.connectorCredential.updateMany({
      where: { lastSyncStatus: 'syncing' },
      data: { lastSyncStatus: 'error' },
    });
    if (stale.count > 0) {
      app.log.warn({ count: stale.count }, 'Reset stale syncing statuses from previous run');
    }

    // Rebuild marts on startup so every deploy picks up the latest pipeline code
    // Then run a full sync to fetch fresh data, and start the periodic timer
    app.log.info('Starting background rebuild: normalizeStaging → buildMarts');
    normalizeStaging()
      .then(() => buildMarts())
      .then((result) => {
        app.log.info({ result }, 'Startup rebuild complete');
        // Run an immediate full sync after rebuild
        app.log.info('Starting initial full sync after startup rebuild');
        return periodicSync();
      })
      .then(() => {
        // Start periodic sync timer
        const intervalMin = Math.round(SYNC_INTERVAL_MS / 60_000);
        app.log.info({ intervalMin }, `Auto-sync scheduled every ${intervalMin} minutes`);
        syncTimer = setInterval(() => { periodicSync(); }, SYNC_INTERVAL_MS);
      })
      .catch((err) => {
        app.log.error({ error: String(err) }, 'Startup rebuild/sync failed');
        // Still start the timer even if initial sync fails
        const intervalMin = Math.round(SYNC_INTERVAL_MS / 60_000);
        app.log.info({ intervalMin }, `Auto-sync scheduled every ${intervalMin} minutes (after startup failure)`);
        syncTimer = setInterval(() => { periodicSync(); }, SYNC_INTERVAL_MS);
      });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
