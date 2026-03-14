import type { CampaignHypothesis } from '@growth-os/database';
import { type prisma as PrismaInstance, decrypt } from '@growth-os/database';
import type { CampaignMetrics } from './meta-writer.js';
import { MetaAdExecutor } from './meta-writer.js';
import { calculateScaleTarget } from './position-sizer.js';
import pino from 'pino';

type DbClient = typeof PrismaInstance;

const logger = pino({ name: 'stop-loss' });

// ── Stop-Loss Rule Definition ───────────────────────────────

export interface StopLossRule {
  id: string;
  description: string;
  condition: (metrics: CampaignMetrics, hypothesis: CampaignHypothesis) => boolean;
  action: 'PAUSE' | 'SCALE' | 'ALERT_ONLY';
  minDaysRunning: number;
}

export const STOP_LOSS_RULES: readonly StopLossRule[] = [
  {
    id: 'roas-floor',
    description: 'ROAS below 50% of target after 3 days',
    condition: (m, h) => m.roas < h.expectedROAS * 0.5 && m.daysRunning >= 3,
    action: 'PAUSE',
    minDaysRunning: 3,
  },
  {
    id: 'ctr-floor',
    description: 'CTR below 40% of expected after 2 days -- trigger not landing',
    condition: (m, h) => m.ctr < h.expectedCTR * 0.4 && m.daysRunning >= 2,
    action: 'PAUSE',
    minDaysRunning: 2,
  },
  {
    id: 'zero-conversions',
    description: '30% of budget spent with zero conversions',
    condition: (m, h) => m.spend > h.budgetUSD * 0.3 && m.conversions === 0,
    action: 'PAUSE',
    minDaysRunning: 2,
  },
  {
    id: 'winner-scale',
    description: 'ROAS 50% above target with statistical significance -- scale',
    condition: (m, h) => m.roas > h.expectedROAS * 1.5 && m.daysRunning >= 5 && m.spend > 200,
    action: 'SCALE',
    minDaysRunning: 5,
  },
];

// ── Evaluation Result ───────────────────────────────────────

export interface EvaluationResult {
  action: string;
  rule?: StopLossRule;
  executed: boolean;
}

// ── Evaluate a Single Hypothesis ────────────────────────────

export async function evaluateHypothesis(
  hypothesis: CampaignHypothesis,
  executor: MetaAdExecutor,
  db: DbClient,
): Promise<EvaluationResult> {
  if (!hypothesis.metaCampaignId) {
    logger.warn({ hypothesisId: hypothesis.id }, 'No metaCampaignId — skipping');
    return { action: 'SKIP', executed: false };
  }

  let metrics: CampaignMetrics;
  try {
    metrics = await executor.getCampaignMetrics(hypothesis.metaCampaignId);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ hypothesisId: hypothesis.id, error: errorMsg }, 'Failed to get metrics');
    return { action: 'ERROR', executed: false };
  }

  for (const rule of STOP_LOSS_RULES) {
    if (metrics.daysRunning < rule.minDaysRunning) continue;

    if (!rule.condition(metrics, hypothesis)) continue;

    logger.info(
      { hypothesisId: hypothesis.id, ruleId: rule.id, action: rule.action, metrics },
      'Stop-loss rule triggered',
    );

    let executed = false;

    if (rule.action === 'PAUSE') {
      const result = await executor.pauseCampaign(hypothesis.metaCampaignId);
      executed = result.success;

      if (executed) {
        await db.campaignHypothesis.update({
          where: { id: hypothesis.id },
          data: { status: 'PAUSED_BY_SYSTEM' },
        });
      }
    } else if (rule.action === 'SCALE') {
      const currentDailyBudget = hypothesis.budgetUSD / Math.max(hypothesis.durationDays, 1);
      const newBudget = calculateScaleTarget({
        currentDailyBudget,
        currentROAS: metrics.roas,
        expectedROAS: hypothesis.expectedROAS,
      });

      const result = await executor.scaleBudget(hypothesis.metaCampaignId, newBudget);
      executed = result.success;
    }

    // Record the stop-loss event
    await db.stopLossEvent.create({
      data: {
        hypothesisId: hypothesis.id,
        rule: rule.id,
        metricAtTrigger: {
          roas: metrics.roas,
          ctr: metrics.ctr,
          spend: metrics.spend,
          daysRunning: metrics.daysRunning,
          conversions: metrics.conversions,
        },
        actionTaken: rule.action,
      },
    });

    return { action: rule.action, rule, executed };
  }

  logger.debug({ hypothesisId: hypothesis.id }, 'No stop-loss rules triggered');
  return { action: 'HOLD', executed: false };
}

// ── Evaluate All Live Hypotheses ────────────────────────────

export async function evaluateAllLive(db: DbClient): Promise<void> {
  const liveHypotheses = await db.campaignHypothesis.findMany({
    where: {
      status: 'LIVE',
      metaCampaignId: { not: null },
    },
    include: {
      client: true,
    },
  });

  logger.info({ count: liveHypotheses.length }, 'Evaluating live hypotheses');

  for (const hypothesis of liveHypotheses) {
    const { client } = hypothesis;

    if (!client.metaAccountId) {
      logger.warn(
        { hypothesisId: hypothesis.id, clientId: client.id },
        'Client has no metaAccountId — skipping',
      );
      continue;
    }

    // Get the Meta credentials for this client's organization
    const credential = await db.connectorCredential.findFirst({
      where: {
        connectorType: 'meta',
        organizationId: client.organizationId,
      },
    });

    if (!credential) {
      logger.warn(
        { hypothesisId: hypothesis.id, organizationId: client.organizationId },
        'No Meta credentials found — skipping',
      );
      continue;
    }

    // Decrypt the access token
    let accessToken: string;
    try {
      const decrypted = decrypt(credential.encryptedData, credential.iv, credential.authTag);
      const parsed = JSON.parse(decrypted) as { accessToken?: string };
      accessToken = parsed.accessToken ?? '';
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(
        { hypothesisId: hypothesis.id, error: errorMsg },
        'Failed to decrypt credentials',
      );
      continue;
    }

    if (!accessToken) {
      logger.warn({ hypothesisId: hypothesis.id }, 'Empty access token — skipping');
      continue;
    }

    const executor = new MetaAdExecutor(accessToken, client.metaAccountId);

    try {
      const result = await evaluateHypothesis(hypothesis, executor, db);
      logger.info(
        { hypothesisId: hypothesis.id, result: result.action, executed: result.executed },
        'Hypothesis evaluation complete',
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error(
        { hypothesisId: hypothesis.id, error: errorMsg },
        'Unhandled error evaluating hypothesis',
      );
    }
  }
}
