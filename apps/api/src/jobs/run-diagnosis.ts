// ──────────────────────────────────────────────────────────────
// Growth OS — Diagnosis Runner Job
// Fetches active MetaAd records for an org, runs diagnosis rules,
// upserts Diagnosis records (dedup by [orgId, adId, ruleId]),
// and expires stale PENDING diagnoses older than 72h.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { evaluateDiagnosisRules } from '@growth-os/etl';
import type { DiagnosisRuleInput, DiagnosisRuleConfig } from '@growth-os/etl';
import { autoExecutePending } from './auto-execute.js';
import type { AutoExecuteResult } from './auto-execute.js';
import { evaluateCircuitBreaker } from './circuit-breaker.js';
import {
  sendAutopilotPendingToSlack,
  sendAutopilotActionsToSlack,
} from '../lib/slack.js';

export interface RunDiagnosisResult {
  adsEvaluated: number;
  diagnosesCreated: number;
  diagnosesUpdated: number;
  diagnosesExpired: number;
  durationMs: number;
  autoActions?: AutoExecuteResult;
}

export async function runDiagnosis(organizationId: string): Promise<RunDiagnosisResult> {
  const start = Date.now();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h from now

  // Load autopilot config for dynamic thresholds
  const autopilotConfig = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
  });

  const ruleConfig: DiagnosisRuleConfig | undefined = autopilotConfig ? {
    targetRoas: autopilotConfig.targetRoas?.toNumber(),
    topPerformerRoas: undefined, // Use defaults for now
    maxFrequency: undefined,
    minCtr: undefined,
  } : undefined;

  // 1. Fetch all MetaAd records for this org (active + paused for rule 8)
  const ads = await prisma.metaAd.findMany({
    where: { organizationId },
    include: {
      adSet: { select: { dailyBudget: true } },
    },
  });

  let diagnosesCreated = 0;
  let diagnosesUpdated = 0;

  // Track which [adId, ruleId] pairs fired in this run
  const firedPairs = new Set<string>();

  // 2. Evaluate rules per ad
  for (const ad of ads) {
    const input: DiagnosisRuleInput = {
      adId: ad.id,
      adName: ad.name,
      status: ad.status,
      createdAt: ad.createdAt,
      spend7d: ad.spend7d?.toNumber() ?? 0,
      impressions7d: ad.impressions7d ?? 0,
      clicks7d: ad.clicks7d ?? 0,
      conversions7d: ad.conversions7d ?? 0,
      revenue7d: ad.revenue7d?.toNumber() ?? 0,
      roas7d: ad.roas7d?.toNumber() ?? null,
      ctr7d: ad.ctr7d?.toNumber() ?? null,
      cpc7d: ad.cpc7d?.toNumber() ?? null,
      frequency7d: ad.frequency7d?.toNumber() ?? null,
      spend14d: ad.spend14d?.toNumber() ?? 0,
      impressions14d: ad.impressions14d ?? 0,
      clicks14d: ad.clicks14d ?? 0,
      conversions14d: ad.conversions14d ?? 0,
      revenue14d: ad.revenue14d?.toNumber() ?? 0,
      roas14d: ad.roas14d?.toNumber() ?? null,
      ctr14d: ad.ctr14d?.toNumber() ?? null,
      cpc14d: ad.cpc14d?.toNumber() ?? null,
      frequency14d: ad.frequency14d?.toNumber() ?? null,
      adSetDailyBudget: ad.adSet?.dailyBudget?.toNumber() ?? null,
    };

    const results = evaluateDiagnosisRules(input, now, ruleConfig);

    for (const diag of results) {
      firedPairs.add(`${ad.id}::${diag.ruleId}`);
      // Upsert by [organizationId, adId, ruleId] — update if already exists
      const existing = await prisma.diagnosis.findUnique({
        where: {
          organizationId_adId_ruleId: {
            organizationId,
            adId: ad.id,
            ruleId: diag.ruleId,
          },
        },
      });

      if (existing) {
        // Determine if this is a stuck APPROVED diagnosis whose execution failed.
        // These should be reset to PENDING so the user can re-approve with
        // fresh suggestedValue (which may now include budget fields that were
        // missing in a previous code version).
        const execResult = existing.executionResult as Record<string, unknown> | null;
        const isApprovedWithError =
          existing.status === 'APPROVED' && execResult?.error;

        // If the diagnosis was already EXECUTED or DISMISSED but the rule still fires,
        // recycle it back to PENDING so the user can review fresh metrics and re-approve.
        // Cooldown: wait at least 6h after execution to avoid rapid re-diagnosis.
        const RECYCLE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
        const isRecyclable =
          (existing.status === 'EXECUTED' || existing.status === 'EXPIRED') &&
          (!existing.executedAt ||
            now.getTime() - new Date(existing.executedAt).getTime() > RECYCLE_COOLDOWN_MS);

        if (existing.status === 'PENDING' || isApprovedWithError || isRecyclable) {
          // Clear cached AI insight if the message changed (metrics shifted)
          const insightChanged = existing.message !== diag.message;
          await prisma.diagnosis.update({
            where: { id: existing.id },
            data: {
              // Reset to PENDING so user can re-approve
              status: 'PENDING',
              severity: diag.severity,
              title: diag.title,
              message: diag.message,
              actionType: diag.actionType,
              suggestedValue: diag.suggestedValue as never,
              confidence: diag.confidence,
              expiresAt,
              // Clear stale execution data
              executionResult: Prisma.DbNull,
              executedAt: null,
              ...(insightChanged || isApprovedWithError || isRecyclable
                ? { aiInsight: Prisma.DbNull, aiInsightAt: null }
                : {}),
            },
          });
          diagnosesUpdated++;
        }
      } else {
        await prisma.diagnosis.create({
          data: {
            organizationId,
            adId: ad.id,
            ruleId: diag.ruleId,
            severity: diag.severity,
            title: diag.title,
            message: diag.message,
            actionType: diag.actionType,
            suggestedValue: diag.suggestedValue as never,
            confidence: diag.confidence,
            expiresAt,
          },
        });
        diagnosesCreated++;
      }
    }
  }

  // 3. Expire PENDING diagnoses whose rules no longer fire
  //    Fetch all PENDING diagnoses for this org, expire any not in firedPairs
  const pendingDiagnoses = await prisma.diagnosis.findMany({
    where: { organizationId, status: 'PENDING' },
    select: { id: true, adId: true, ruleId: true },
  });

  const toExpireIds: string[] = [];
  for (const d of pendingDiagnoses) {
    if (!firedPairs.has(`${d.adId}::${d.ruleId}`)) {
      toExpireIds.push(d.id);
    }
  }

  let expiredCount = 0;
  if (toExpireIds.length > 0) {
    const result = await prisma.diagnosis.updateMany({
      where: { id: { in: toExpireIds } },
      data: { status: 'EXPIRED' },
    });
    expiredCount = result.count;

    // Record feedback for expired diagnoses
    const expiredDiags = await prisma.diagnosis.findMany({
      where: { id: { in: toExpireIds } },
      select: { ruleId: true, confidence: true },
    });
    for (const d of expiredDiags) {
      await prisma.diagnosisFeedback.create({
        data: {
          organizationId,
          ruleId: d.ruleId,
          action: 'EXPIRED',
          confidence: d.confidence,
        },
      });
    }
  }

  // Also expire any remaining stale PENDING diagnoses older than 72h
  const expiredStale = await prisma.diagnosis.updateMany({
    where: {
      organizationId,
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });
  expiredCount += expiredStale.count;

  // 4. Detect and resolve conflicting diagnoses on the same ad
  const pendingByAd = new Map<string, Array<{ id: string; actionType: string; severity: string; ruleId: string }>>();
  const allPending = await prisma.diagnosis.findMany({
    where: { organizationId, status: 'PENDING' },
    select: { id: true, adId: true, actionType: true, severity: true, ruleId: true },
  });

  for (const d of allPending) {
    const existing = pendingByAd.get(d.adId) ?? [];
    existing.push(d);
    pendingByAd.set(d.adId, existing);
  }

  const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 3, WARNING: 2, INFO: 1 };
  const conflictExpireIds: string[] = [];

  for (const [, diags] of pendingByAd) {
    if (diags.length <= 1) continue;

    const hasPause = diags.some((d) => d.actionType === 'PAUSE_AD');
    const hasIncrease = diags.some((d) => d.actionType === 'INCREASE_BUDGET');
    const hasReactivate = diags.some((d) => d.actionType === 'REACTIVATE_AD');

    if (hasPause && hasIncrease) {
      const pauseDiag = diags.find((d) => d.actionType === 'PAUSE_AD')!;
      const increaseDiag = diags.find((d) => d.actionType === 'INCREASE_BUDGET')!;
      const pauseSev = SEVERITY_ORDER[pauseDiag.severity] ?? 0;
      const incSev = SEVERITY_ORDER[increaseDiag.severity] ?? 0;
      conflictExpireIds.push(pauseSev >= incSev ? increaseDiag.id : pauseDiag.id);
    }

    if (hasReactivate && hasPause) {
      const reactDiag = diags.find((d) => d.actionType === 'REACTIVATE_AD')!;
      const pauseDiag = diags.find((d) => d.actionType === 'PAUSE_AD')!;
      const reactSev = SEVERITY_ORDER[reactDiag.severity] ?? 0;
      const pauseSev = SEVERITY_ORDER[pauseDiag.severity] ?? 0;
      conflictExpireIds.push(reactSev >= pauseSev ? pauseDiag.id : reactDiag.id);
    }
  }

  if (conflictExpireIds.length > 0) {
    const conflictResult = await prisma.diagnosis.updateMany({
      where: { id: { in: conflictExpireIds } },
      data: { status: 'EXPIRED' },
    });
    expiredCount += conflictResult.count;
  }

  // 5. Auto-execute eligible diagnoses when autopilot mode is 'auto'
  let autoActions: AutoExecuteResult | undefined;
  if (autopilotConfig && autopilotConfig.mode === 'auto') {
    try {
      autoActions = await autoExecutePending(organizationId, {
        mode: autopilotConfig.mode,
        maxBudgetIncreasePct: autopilotConfig.maxBudgetIncreasePct,
        minSpendBeforeAction: autopilotConfig.minSpendBeforeAction.toNumber(),
        maxActionsPerDay: autopilotConfig.maxActionsPerDay,
        dailyBudgetCap: autopilotConfig.dailyBudgetCap?.toNumber() ?? null,
        minConfidence: autopilotConfig.minConfidence,
        executionWindowStart: autopilotConfig.executionWindowStart,
        executionWindowEnd: autopilotConfig.executionWindowEnd,
        executionTimezone: autopilotConfig.executionTimezone,
        circuitBreakerTrippedAt: autopilotConfig.circuitBreakerTrippedAt,
      });

      // Post-execution: evaluate circuit breaker if any actions were taken
      if (autoActions.actionsQueued > 0) {
        try {
          const cbResult = await evaluateCircuitBreaker(organizationId);
          if (cbResult.tripped) {
            console.warn(
              `[runDiagnosis] Circuit breaker tripped for org ${organizationId}: ${cbResult.degraded}/${cbResult.checked} actions degraded performance`,
            );
          }
        } catch (cbErr) {
          console.error('[runDiagnosis] Circuit breaker evaluation failed:', cbErr);
        }

        // Notify Slack about auto-executed actions
        try {
          const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000';
          const recentActions = await prisma.autopilotActionLog.findMany({
            where: {
              organizationId,
              triggeredBy: 'auto',
              createdAt: { gte: new Date(Date.now() - 60 * 1000) },
            },
            select: { actionType: true, targetName: true, beforeValue: true, afterValue: true },
          });

          if (recentActions.length > 0) {
            await sendAutopilotActionsToSlack({
              total: recentActions.length,
              actions: recentActions.map((a) => ({
                actionType: a.actionType,
                adName: a.targetName,
                before: JSON.stringify(a.beforeValue ?? {}),
                after: JSON.stringify(a.afterValue ?? {}),
              })),
              dashboardUrl,
            });
          }
        } catch {
          // Slack notification failure must not crash the run
        }
      }
    } catch (err) {
      // Auto-execute failures must not crash the diagnosis run
      console.error('[runDiagnosis] Auto-execute failed:', err);
      autoActions = {
        actionsQueued: 0,
        actionsSkipped: 0,
        actionsRemaining: 0,
        reasons: [`Auto-execute error: ${(err as Error).message}`],
      };
    }
  }

  // Notify Slack about pending approvals
  if (
    autopilotConfig &&
    autopilotConfig.notifyOnPendingApproval &&
    diagnosesCreated > 0 &&
    (autopilotConfig.mode === 'suggest' || autopilotConfig.mode === 'auto')
  ) {
    try {
      const pendingCounts = await prisma.diagnosis.groupBy({
        by: ['severity'],
        where: { organizationId, status: 'PENDING' },
        _count: true,
      });

      const total = pendingCounts.reduce((sum, g) => sum + g._count, 0);
      const critical = pendingCounts.find((g) => g.severity === 'CRITICAL')?._count ?? 0;
      const warning = pendingCounts.find((g) => g.severity === 'WARNING')?._count ?? 0;
      const info = pendingCounts.find((g) => g.severity === 'INFO')?._count ?? 0;
      const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000';

      if (total > 0) {
        await sendAutopilotPendingToSlack({ total, critical, warning, info, dashboardUrl });
      }
    } catch {
      // Slack notification failure must not crash the run
    }
  }

  return {
    adsEvaluated: ads.length,
    diagnosesCreated,
    diagnosesUpdated,
    diagnosesExpired: expiredCount,
    durationMs: Date.now() - start,
    autoActions,
  };
}
