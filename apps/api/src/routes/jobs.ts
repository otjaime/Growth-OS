import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';

export async function jobsRoutes(app: FastifyInstance) {
  // List recent job runs
  app.get('/jobs', {
    schema: {
      tags: ['jobs'],
      summary: 'List pipeline job runs',
      description: 'Returns recent ETL pipeline job runs with status and duration',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Max results (default 20)' },
          status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'RUNNING'] },
        },
      },
    },
  }, async (request) => {
    const query = request.query as { limit?: string; status?: string };
    const limit = parseInt(query.limit ?? '20', 10);

    const where = query.status ? { status: query.status as 'SUCCESS' | 'FAILED' | 'RUNNING' } : {};

    const jobs = await prisma.jobRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return { jobs, total: jobs.length };
  });

  // Get single job run
  app.get('/jobs/:id', {
    schema: {
      tags: ['jobs'],
      summary: 'Get job run by ID',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const job = await prisma.jobRun.findUnique({ where: { id } });
    if (!job) {
      return { error: 'Job not found' };
    }
    return job;
  });
}
