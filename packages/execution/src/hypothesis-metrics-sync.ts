import { type prisma as PrismaInstance, decrypt, Prisma } from '@growth-os/database';
import type { CampaignMetrics } from './meta-writer.js';
import { MetaAdExecutor } from './meta-writer.js';
import pino from 'pino';

type DbClient = typeof PrismaInstance;

const logger = pino({ name: 'hypothesis-metrics-sync' });

export interface SyncResult {
  synced: number;
  errors: number;
}

export async function syncHypothesisMetrics(db: DbClient): Promise<SyncResult> {
  const hypotheses = await db.campaignHypothesis.findMany({
    where: {
      status: { in: ['LIVE', 'PAUSED_BY_SYSTEM', 'PAUSED_BY_USER'] },
      metaCampaignId: { not: null },
    },
    include: { client: true },
  });

  logger.info({ count: hypotheses.length }, 'Syncing metrics for live hypotheses');

  let synced = 0;
  let errors = 0;

  for (const hypothesis of hypotheses) {
    const { client } = hypothesis;

    if (!client.metaAccountId) {
      logger.warn({ hypothesisId: hypothesis.id }, 'Client has no metaAccountId — skipping');
      errors++;
      continue;
    }

    const credential = await db.connectorCredential.findFirst({
      where: {
        connectorType: 'meta',
        organizationId: client.organizationId,
      },
    });

    if (!credential) {
      logger.warn({ hypothesisId: hypothesis.id }, 'No Meta credentials found — skipping');
      errors++;
      continue;
    }

    let accessToken: string;
    try {
      const decrypted = decrypt(credential.encryptedData, credential.iv, credential.authTag);
      const parsed = JSON.parse(decrypted) as { accessToken?: string };
      accessToken = parsed.accessToken ?? '';
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ hypothesisId: hypothesis.id, error: errorMsg }, 'Failed to decrypt credentials');
      errors++;
      continue;
    }

    if (!accessToken) {
      logger.warn({ hypothesisId: hypothesis.id }, 'Empty access token — skipping');
      errors++;
      continue;
    }

    const executor = new MetaAdExecutor(accessToken, client.metaAccountId);

    try {
      const metrics: CampaignMetrics = await executor.getCampaignMetrics(hypothesis.metaCampaignId!);

      // Update hypothesis with latest metrics
      await db.campaignHypothesis.update({
        where: { id: hypothesis.id },
        data: {
          metricsSnapshot: metrics as unknown as Prisma.InputJsonValue,
          lastMetricsSyncAt: new Date(),
          actualROAS: metrics.roas,
          actualCTR: metrics.ctr,
          actualCVR: metrics.cvr,
          actualSpend: metrics.spend,
          actualRevenue: metrics.revenue,
        },
      });

      // Insert metric log for time-series charting
      await db.hypothesisMetricLog.create({
        data: {
          hypothesisId: hypothesis.id,
          spend: metrics.spend,
          revenue: metrics.revenue,
          roas: metrics.roas,
          ctr: metrics.ctr,
          cvr: metrics.cvr,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          conversions: metrics.conversions,
          daysRunning: metrics.daysRunning,
        },
      });

      synced++;
      logger.info({ hypothesisId: hypothesis.id, roas: metrics.roas, spend: metrics.spend }, 'Metrics synced');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ hypothesisId: hypothesis.id, error: errorMsg }, 'Failed to sync metrics');
      errors++;
    }
  }

  logger.info({ synced, errors }, 'Hypothesis metrics sync complete');
  return { synced, errors };
}
