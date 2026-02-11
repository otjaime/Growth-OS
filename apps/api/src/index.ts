// ──────────────────────────────────────────────────────────────
// Growth OS — API Server (Fastify)
// ──────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from '@growth-os/database';
import { healthRoutes } from './routes/health.js';
import { jobsRoutes } from './routes/jobs.js';
import { metricsRoutes } from './routes/metrics.js';
import { connectionsRoutes } from './routes/connections.js';
import { alertsRoutes } from './routes/alerts.js';
import { wbrRoutes } from './routes/wbr.js';
import { settingsRoutes } from './routes/settings.js';

const PORT = parseInt(process.env.API_PORT ?? '4000', 10);
const HOST = process.env.API_HOST ?? '0.0.0.0';

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

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
