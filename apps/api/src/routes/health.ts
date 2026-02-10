import type { FastifyInstance } from 'fastify';
import { prisma, isDemoMode } from '@growth-os/database';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch { /* db down */ }

    const demoMode = await isDemoMode();

    return {
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      db: dbOk ? 'connected' : 'disconnected',
      demoMode,
      version: '1.0.0',
    };
  });
}
