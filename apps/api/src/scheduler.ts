// ──────────────────────────────────────────────────────────────
// Growth OS — BullMQ Scheduler
// Manages cron-based sync jobs with retries
// ──────────────────────────────────────────────────────────────

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma, isDemoMode } from '@growth-os/database';
import { createLogger } from './logger.js';

const log = createLogger('scheduler');

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const syncQueue = new Queue('growth-os-sync', { connection });

async function startScheduler() {
  log.info('Starting Growth OS scheduler');

  // Add repeatable jobs
  await syncQueue.add(
    'hourly-sync',
    { type: 'incremental' },
    {
      repeat: { pattern: process.env.SYNC_CRON_HOURLY ?? '0 * * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );

  await syncQueue.add(
    'daily-marts',
    { type: 'build-marts' },
    {
      repeat: { pattern: process.env.SYNC_CRON_DAILY ?? '0 6 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    },
  );

  // Worker
  const worker = new Worker(
    'growth-os-sync',
    async (job) => {
      log.info({ jobId: job.id, type: job.data.type }, 'Processing sync job');

      const jobRun = await prisma.jobRun.create({
        data: { jobName: `scheduled_${job.data.type}`, status: 'RUNNING' },
      });

      const startTime = Date.now();

      try {
        const { normalizeStaging, buildMarts } = await import('@growth-os/etl');

        if (job.data.type === 'incremental' || job.data.type === 'full') {
          const demoMode = await isDemoMode();

          if (demoMode) {
            const { ingestRaw, generateAllDemoData } = await import('@growth-os/etl');
            const data = generateAllDemoData();
            const all = [
              ...data.orders,
              ...data.customers,
              ...data.metaInsights,
              ...data.googleAdsInsights,
              ...data.ga4Traffic,
            ];
            await ingestRaw(all);
            await normalizeStaging();
            await buildMarts();
          } else {
            // Live mode: fetch real data from all configured connectors
            const { runFullSync } = await import('./lib/run-connector-sync.js');
            await runFullSync();
          }
        } else if (job.data.type === 'build-marts') {
          await buildMarts();
        }

        const durationMs = Date.now() - startTime;
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: { status: 'SUCCESS', finishedAt: new Date(), durationMs },
        });

        log.info({ jobId: job.id, durationMs }, 'Sync job completed');
      } catch (error) {
        const durationMs = Date.now() - startTime;
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            durationMs,
            errorJson: { message: String(error) },
          },
        });
        throw error;
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, error: err.message }, 'Sync job failed');
  });

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Sync job completed');
  });

  log.info('Scheduler started — waiting for jobs');
}

startScheduler().catch((err) => {
  log.error({ err }, 'Failed to start scheduler');
  process.exit(1);
});
