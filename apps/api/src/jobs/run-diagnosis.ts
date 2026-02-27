// ──────────────────────────────────────────────────────────────
// Growth OS — Diagnosis Runner Job
// Fetches active MetaAd records for an org, runs diagnosis rules,
// upserts Diagnosis records (dedup by [orgId, adId, ruleId]),
// and expires stale PENDING diagnoses older than 72h.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { evaluateDiagnosisRules } from '@growth-os/etl';
import type { DiagnosisRuleInput } from '@growth-os/etl';

export interface RunDiagnosisResult {
  adsEvaluated: number;
  diagnosesCreated: number;
  diagnosesUpdated: number;
  diagnosesExpired: number;
  durationMs: number;
}

export async function runDiagnosis(organizationId: string): Promise<RunDiagnosisResult> {
  const start = Date.now();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h from now

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

    const results = evaluateDiagnosisRules(input, now);

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
        // Only update if the existing diagnosis is still PENDING
        if (existing.status === 'PENDING') {
          await prisma.diagnosis.update({
            where: { id: existing.id },
            data: {
              severity: diag.severity,
              title: diag.title,
              message: diag.message,
              actionType: diag.actionType,
              suggestedValue: diag.suggestedValue as never,
              expiresAt,
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

  return {
    adsEvaluated: ads.length,
    diagnosesCreated,
    diagnosesUpdated,
    diagnosesExpired: expiredCount,
    durationMs: Date.now() - start,
  };
}
