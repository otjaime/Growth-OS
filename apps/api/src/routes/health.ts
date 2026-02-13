import type { FastifyInstance } from 'fastify';
import { prisma, isDemoMode } from '@growth-os/database';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Health check',
      description: 'Returns API health status, database connectivity, and sync freshness',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded'] },
            timestamp: { type: 'string', format: 'date-time' },
            db: { type: 'string', enum: ['connected', 'disconnected'] },
            demoMode: { type: 'boolean' },
            lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch { /* db down */ }

    const demoMode = await isDemoMode();

    // Get latest sync timestamp from any connector
    let lastSyncAt: string | null = null;
    try {
      const latestSync = await prisma.connectorCredential.findFirst({
        where: { lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      });
      lastSyncAt = latestSync?.lastSyncAt?.toISOString() ?? null;
    } catch { /* table may not exist */ }

    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
      demoMode,
      lastSyncAt,
      version: '1.0.0',
    };
  });
}
