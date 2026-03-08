// ──────────────────────────────────────────────────────────────
// Growth OS — Autopilot Routes
// Endpoints for Meta ad-level data, syncing, and campaign views
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma, DiagnosisStatus, decrypt, Prisma } from '@growth-os/database';
import { getOrgId } from '../lib/tenant.js';
import { syncMetaAds } from '../jobs/sync-meta-ads.js';
import { runDiagnosis } from '../jobs/run-diagnosis.js';
import { generateCopyVariants } from '../lib/copy-generator.js';
// Plan guard removed — autopilot actions available on all plans
import { executeAction } from '../jobs/execute-action.js';
import { rollbackAction } from '../jobs/rollback-action.js';
import { generateDiagnosisInsight, generateRuleBasedInsight } from '../lib/autopilot-analyzer.js';
import type { DiagnosisAnalyzerInput } from '../lib/autopilot-analyzer.js';
import { isAIConfigured } from '../lib/ai.js';
import {
  optimizeBudgetAllocation,
  scoreCampaignHealth,
  detectAnomalies,
  analyzeCreativeDecay,
} from '@growth-os/etl';
import type {
  AdSetMetrics,
  CampaignMetrics,
  AdSetHealth,
  MetricSeries,
  DailySnapshot,
} from '@growth-os/etl';
import { computeRuleHealth } from '../lib/rule-tuner.js';
import { enrichDiagnosis } from '../jobs/enrich-diagnosis.js';

/**
 * Ensure at least one Organization exists. When using Bearer-token auth
 * (no Clerk) in live mode, there's no automatic org creation — so we
 * create a default one on-the-fly so autopilot records have a valid FK.
 *
 * Also claims any orphaned ConnectorCredentials (organizationId = null)
 * and links them to this org so that syncMetaAds can find them.
 */
async function ensureOrganization(): Promise<string> {
  const existing = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (existing) {
    // Claim any orphaned credentials that were saved before an org existed
    await prisma.connectorCredential.updateMany({
      where: { organizationId: null },
      data: { organizationId: existing.id },
    });
    return existing.id;
  }

  const created = await prisma.organization.create({
    data: { name: 'My Organization' },
    select: { id: true },
  });

  // Claim orphaned credentials
  await prisma.connectorCredential.updateMany({
    where: { organizationId: null },
    data: { organizationId: created.id },
  });

  return created.id;
}

/**
 * Resolve the organizationId from the request, falling back to the first
 * available organization (or auto-creating one if none exists).
 */
async function resolveOrgId(request: { organizationId?: string }): Promise<string> {
  if (request.organizationId) return request.organizationId;
  return ensureOrganization();
}

/**
 * Returns a Prisma `where` fragment scoped to the organization.
 * Always resolves to a concrete org (auto-creates if needed) so
 * GET endpoints return data scoped to the correct tenant.
 */
async function resolveOrgWhere(request: FastifyRequest): Promise<{ organizationId: string }> {
  const orgId = await resolveOrgId(request);
  return { organizationId: orgId };
}

export async function autopilotRoutes(app: FastifyInstance) {
  // ── GET /autopilot/ads — list ads with metrics + trends ─────
  app.get('/autopilot/ads', {
    schema: {
      tags: ['autopilot'],
      summary: 'List Meta ads',
      description: 'Returns all Meta ads with creative fields, 7d/14d metrics, and trend data.',
    },
  }, async (request) => {
    const { status, campaignId, sortBy, limit } = request.query as {
      status?: string;
      campaignId?: string;
      sortBy?: string;
      limit?: string;
    };

    const orgFilter = await resolveOrgWhere(request);
    const where: Record<string, unknown> = { ...orgFilter };
    if (status) where.status = status.toUpperCase();
    if (campaignId) where.campaignId = campaignId;

    // Default sort: spend descending (highest spend first)
    const orderBy = sortBy === 'roas' ? { roas7d: 'desc' as const }
      : sortBy === 'ctr' ? { ctr7d: 'desc' as const }
      : sortBy === 'conversions' ? { conversions7d: 'desc' as const }
      : { spend7d: 'desc' as const };

    const take = limit ? parseInt(limit, 10) : 100;

    const ads = await prisma.metaAd.findMany({
      where,
      orderBy,
      take,
      include: {
        campaign: { select: { id: true, name: true, campaignId: true, status: true, objective: true } },
        adSet: { select: { id: true, name: true, adSetId: true, status: true, dailyBudget: true } },
      },
    });

    // Compute trends (7d vs 14d)
    const adsWithTrends = ads.map((ad) => {
      const spend7 = Number(ad.spend7d);
      const spend14 = Number(ad.spend14d);
      const roas7 = ad.roas7d ? Number(ad.roas7d) : null;
      const roas14 = ad.roas14d ? Number(ad.roas14d) : null;
      const ctr7 = ad.ctr7d ? Number(ad.ctr7d) : null;
      const ctr14 = ad.ctr14d ? Number(ad.ctr14d) : null;
      const freq7 = ad.frequency7d ? Number(ad.frequency7d) : null;
      const freq14 = ad.frequency14d ? Number(ad.frequency14d) : null;

      return {
        ...ad,
        trends: {
          spendChange: spend14 > 0 ? (spend7 - spend14) / spend14 : null,
          roasChange: roas14 && roas7 ? (roas7 - roas14) / roas14 : null,
          ctrChange: ctr14 && ctr7 ? (ctr7 - ctr14) / ctr14 : null,
          frequencyChange: freq14 && freq7 ? (freq7 - freq14) / freq14 : null,
        },
      };
    });

    return { ads: adsWithTrends, total: adsWithTrends.length };
  });

  // ── GET /autopilot/ads/:id — single ad detail ──────────────
  app.get('/autopilot/ads/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get Meta ad detail',
      description: 'Returns a single Meta ad with full creative, metrics, and campaign context.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const ad = await prisma.metaAd.findFirst({
      where: { id, ...(await resolveOrgWhere(request)) },
      include: {
        campaign: true,
        adSet: true,
        account: { select: { id: true, adAccountId: true, name: true, currency: true } },
      },
    });

    if (!ad) {
      reply.status(404);
      return { error: 'Ad not found' };
    }

    return ad;
  });

  // ── GET /autopilot/campaigns — campaign tree view ──────────
  app.get('/autopilot/campaigns', {
    schema: {
      tags: ['autopilot'],
      summary: 'List Meta campaigns',
      description: 'Returns campaigns with ad sets and aggregated metrics.',
    },
  }, async (request) => {
    const campaigns = await prisma.metaCampaign.findMany({
      where: await resolveOrgWhere(request),
      orderBy: { name: 'asc' },
      include: {
        adSets: {
          orderBy: { name: 'asc' },
          include: {
            ads: {
              orderBy: { spend7d: 'desc' },
              select: {
                id: true, adId: true, name: true, status: true, creativeType: true,
                spend7d: true, impressions7d: true, clicks7d: true, conversions7d: true,
                revenue7d: true, roas7d: true, ctr7d: true, frequency7d: true,
              },
            },
          },
        },
      },
    });

    // Aggregate metrics per campaign
    const result = campaigns.map((camp) => {
      let totalSpend = 0;
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalConversions = 0;
      let totalRevenue = 0;
      let adCount = 0;

      for (const adSet of camp.adSets) {
        for (const ad of adSet.ads) {
          totalSpend += Number(ad.spend7d);
          totalImpressions += ad.impressions7d;
          totalClicks += ad.clicks7d;
          totalConversions += ad.conversions7d;
          totalRevenue += Number(ad.revenue7d);
          adCount++;
        }
      }

      return {
        ...camp,
        metrics7d: {
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalImpressions,
          totalClicks,
          totalConversions,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null,
          ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 10000 : null,
          adCount,
        },
      };
    });

    return { campaigns: result, total: result.length };
  });

  // ── POST /autopilot/sync — trigger manual ad sync ──────────
  app.post('/autopilot/sync', {
    schema: {
      tags: ['autopilot'],
      summary: 'Trigger Meta ad sync',
      description: 'Manually triggers a sync of Meta ad-level data for the current organization. Pass ?force=true to recycle previously-executed diagnoses immediately.',
      querystring: {
        type: 'object',
        properties: {
          force: { type: 'string', enum: ['true', 'false'], description: 'Skip cooldown and recycle all executed/expired diagnoses' },
        },
      },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const query = request.query as { force?: string };
    const forceRecycle = query.force === 'true';

    // Create a job run for tracking
    const jobRun = await prisma.jobRun.create({
      data: {
        jobName: 'meta_ads_sync',
        status: 'RUNNING',
        organizationId,
      },
    });

    try {
      const result = await syncMetaAds(organizationId);

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          rowsLoaded: result.adsUpserted,
          durationMs: result.durationMs,
          metadata: result as never,
        },
      });

      // Re-run diagnosis rules against fresh metrics — this updates stale
      // PENDING diagnoses (messages, severity) and expires diagnoses whose
      // rules no longer fire (e.g., ROAS improved above threshold).
      const diagResult = await runDiagnosis(organizationId, { force: forceRecycle });
      app.log.info(
        { orgId: organizationId, ...diagResult },
        'Post-sync diagnosis run complete',
      );

      return { ...result, diagnosis: diagResult, jobRunId: jobRun.id };
    } catch (err) {
      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Date.now() - jobRun.startedAt.getTime(),
          errorJson: { message: String(err) },
        },
      });

      reply.status(500);
      return { error: 'Meta ad sync failed', detail: String(err) };
    }
  });

  // ── GET /autopilot/stats — summary stats ───────────────────
  app.get('/autopilot/stats', {
    schema: {
      tags: ['autopilot'],
      summary: 'Autopilot summary stats',
      description: 'Returns high-level statistics about Meta ad accounts, campaigns, and ads.',
    },
  }, async (request) => {
    const where = await resolveOrgWhere(request);

    const [accountCount, campaignCount, adSetCount, adCount, activeAdCount, firstAccount] = await Promise.all([
      prisma.metaAdAccount.count({ where }),
      prisma.metaCampaign.count({ where }),
      prisma.metaAdSet.count({ where }),
      prisma.metaAd.count({ where }),
      prisma.metaAd.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.metaAdAccount.findFirst({ where, select: { currency: true } }),
    ]);

    // Top-level 7d aggregates
    const ads = await prisma.metaAd.findMany({
      where: { ...where, status: 'ACTIVE' },
      select: { spend7d: true, revenue7d: true, conversions7d: true, impressions7d: true, clicks7d: true },
    });

    let totalSpend = 0;
    let totalRevenue = 0;
    let totalConversions = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    for (const ad of ads) {
      totalSpend += Number(ad.spend7d);
      totalRevenue += Number(ad.revenue7d);
      totalConversions += ad.conversions7d;
      totalImpressions += ad.impressions7d;
      totalClicks += ad.clicks7d;
    }

    // Last sync time
    const lastSynced = await prisma.metaAd.findFirst({
      where,
      orderBy: { lastSyncAt: 'desc' },
      select: { lastSyncAt: true },
    });

    // Detect currency: Meta ad account currency → fallback to StgOrder → USD
    let currency = firstAccount?.currency ?? 'USD';
    if (currency === 'USD') {
      const orgId = (where as { organizationId?: string }).organizationId;
      if (orgId) {
        const orderCurrency = await prisma.stgOrder.findFirst({
          where: { organizationId: orgId },
          select: { currency: true },
          orderBy: { orderDate: 'desc' },
        });
        if (orderCurrency?.currency) currency = orderCurrency.currency;
      }
    }

    return {
      accounts: accountCount,
      campaigns: campaignCount,
      adSets: adSetCount,
      totalAds: adCount,
      activeAds: activeAdCount,
      currency,
      metrics7d: {
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalConversions,
        blendedRoas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null,
        blendedCtr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 10000 : null,
      },
      lastSyncAt: lastSynced?.lastSyncAt ?? null,
    };
  });

  // ── GET /autopilot/diagnoses — list diagnoses ──────────────
  app.get('/autopilot/diagnoses', {
    schema: {
      tags: ['autopilot'],
      summary: 'List ad diagnoses',
      description: 'Returns diagnoses filtered by status and severity, sorted by severity (critical first).',
    },
  }, async (request) => {
    const { status, severity, adId, limit } = request.query as {
      status?: string;
      severity?: string;
      adId?: string;
      limit?: string;
    };

    const orgFilter = await resolveOrgWhere(request);
    const where: Record<string, unknown> = { ...orgFilter };
    if (status) {
      where.status = status.toUpperCase();
    } else {
      // By default, exclude EXPIRED diagnoses — they're stale and no longer actionable.
      // Users can explicitly pass status=EXPIRED to see them (e.g., in History tab).
      where.status = { not: 'EXPIRED' };
    }
    if (severity) where.severity = severity.toUpperCase();
    if (adId) where.adId = adId;

    const take = limit ? parseInt(limit, 10) : 100;

    const diagnoses = await prisma.diagnosis.findMany({
      where,
      orderBy: [
        { severity: 'asc' }, // CRITICAL < INFO < WARNING alphabetically — use custom sort below
        { createdAt: 'desc' },
      ],
      take,
      include: {
        ad: {
          select: {
            id: true, adId: true, name: true, status: true, creativeType: true,
            spend7d: true, roas7d: true, ctr7d: true, frequency7d: true,
            imageUrl: true, thumbnailUrl: true,
            campaign: { select: { id: true, name: true } },
            adSet: { select: { id: true, name: true, dailyBudget: true } },
          },
        },
      },
    });

    // Sort: CRITICAL > WARNING > INFO
    const severityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    const sorted = diagnoses.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 3;
      const sb = severityOrder[b.severity] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return { diagnoses: sorted, total: sorted.length };
  });

  // ── GET /autopilot/diagnoses/stats — counts by severity ────
  app.get('/autopilot/diagnoses/stats', {
    schema: {
      tags: ['autopilot'],
      summary: 'Diagnosis statistics',
      description: 'Returns counts of pending diagnoses grouped by severity.',
    },
  }, async (request) => {
    const orgFilter = await resolveOrgWhere(request);
    const where = { ...orgFilter, status: 'PENDING' as const };

    const [critical, warning, info, total] = await Promise.all([
      prisma.diagnosis.count({ where: { ...where, severity: 'CRITICAL' } }),
      prisma.diagnosis.count({ where: { ...where, severity: 'WARNING' } }),
      prisma.diagnosis.count({ where: { ...where, severity: 'INFO' } }),
      prisma.diagnosis.count({ where }),
    ]);

    return { total, critical, warning, info };
  });

  // ── GET /autopilot/diagnoses/:id — diagnosis detail ────────
  app.get('/autopilot/diagnoses/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get diagnosis detail',
      description: 'Returns a single diagnosis with full ad context.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, ...(await resolveOrgWhere(request)) },
      include: {
        ad: {
          include: {
            campaign: true,
            adSet: true,
            account: { select: { id: true, adAccountId: true, name: true, currency: true } },
          },
        },
      },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    return diagnosis;
  });

  // ── POST /autopilot/diagnoses/:id/dismiss — dismiss diagnosis
  app.post('/autopilot/diagnoses/:id/dismiss', {
    schema: {
      tags: ['autopilot'],
      summary: 'Dismiss a diagnosis',
      description: 'Sets the diagnosis status to DISMISSED.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, ...(await resolveOrgWhere(request)) },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    if (diagnosis.status !== 'PENDING') {
      reply.status(400);
      return { error: `Cannot dismiss diagnosis with status ${diagnosis.status}` };
    }

    const updated = await prisma.diagnosis.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });

    // Record feedback for rule tuning
    await prisma.diagnosisFeedback.create({
      data: {
        organizationId: diagnosis.organizationId,
        ruleId: diagnosis.ruleId,
        action: 'DISMISSED',
        diagnosisId: id,
        confidence: diagnosis.confidence,
      },
    });

    return updated;
  });

  // ── POST /autopilot/run-diagnosis — trigger diagnosis run ──
  app.post('/autopilot/run-diagnosis', {
    schema: {
      tags: ['autopilot'],
      summary: 'Run diagnosis engine',
      description: 'Evaluates all diagnosis rules against current ad data for the organization. Pass ?force=true to recycle previously-executed diagnoses immediately (skip 6h cooldown).',
      querystring: {
        type: 'object',
        properties: {
          force: { type: 'string', enum: ['true', 'false'], description: 'Skip cooldown and recycle all executed/expired diagnoses' },
        },
      },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const query = request.query as { force?: string };
    const force = query.force === 'true';

    const result = await runDiagnosis(organizationId, { force });
    return result;
  });

  // ── POST /autopilot/diagnoses/:id/analyze — AI analysis ──────
  app.post('/autopilot/diagnoses/:id/analyze', {
    schema: {
      tags: ['autopilot'],
      summary: 'Analyze diagnosis with AI',
      description: 'Returns multi-level (ad, ad-set, campaign) AI-powered analysis and recommendations for a diagnosis. Caches results for 6 hours.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, organizationId },
      include: {
        ad: {
          include: {
            campaign: { select: { id: true, name: true, campaignId: true, status: true, objective: true } },
            adSet: { select: { id: true, name: true, adSetId: true, status: true, dailyBudget: true } },
          },
        },
      },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    // Return cached insight if fresh (< 6 hours old)
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    if (
      diagnosis.aiInsight &&
      diagnosis.aiInsightAt &&
      Date.now() - new Date(diagnosis.aiInsightAt).getTime() < SIX_HOURS_MS
    ) {
      return { insight: diagnosis.aiInsight, cached: true };
    }

    // Fetch sibling ads in the same ad set (for context)
    const siblingAds = await prisma.metaAd.findMany({
      where: {
        adSetId: diagnosis.ad.adSetId,
        id: { not: diagnosis.adId },
      },
      select: {
        name: true,
        status: true,
        spend7d: true,
        roas7d: true,
        ctr7d: true,
      },
    });

    const ad = diagnosis.ad;
    const analyzerInput: DiagnosisAnalyzerInput = {
      ruleId: diagnosis.ruleId,
      severity: diagnosis.severity,
      title: diagnosis.title,
      message: diagnosis.message,
      actionType: diagnosis.actionType,
      suggestedValue: diagnosis.suggestedValue as Record<string, unknown> | null,
      adName: ad.name,
      adStatus: ad.status,
      creativeType: ad.creativeType,
      headline: ad.headline,
      primaryText: ad.primaryText,
      callToAction: ad.callToAction,
      spend7d: Number(ad.spend7d),
      impressions7d: ad.impressions7d,
      clicks7d: ad.clicks7d,
      conversions7d: ad.conversions7d,
      revenue7d: Number(ad.revenue7d),
      roas7d: ad.roas7d ? Number(ad.roas7d) : null,
      ctr7d: ad.ctr7d ? Number(ad.ctr7d) : null,
      cpc7d: ad.cpc7d ? Number(ad.cpc7d) : null,
      frequency7d: ad.frequency7d ? Number(ad.frequency7d) : null,
      spend14d: Number(ad.spend14d),
      roas14d: ad.roas14d ? Number(ad.roas14d) : null,
      ctr14d: ad.ctr14d ? Number(ad.ctr14d) : null,
      frequency14d: ad.frequency14d ? Number(ad.frequency14d) : null,
      campaignName: ad.campaign.name,
      campaignObjective: ad.campaign.objective,
      adSetName: ad.adSet.name,
      adSetDailyBudget: ad.adSet.dailyBudget ? Number(ad.adSet.dailyBudget) : null,
      siblingAds: siblingAds.map((s) => ({
        name: s.name,
        status: s.status,
        spend7d: Number(s.spend7d),
        roas7d: s.roas7d ? Number(s.roas7d) : null,
        ctr7d: s.ctr7d ? Number(s.ctr7d) : null,
      })),
    };

    // Phase 4.1: Enrich AI prompts with business context
    try {
      const enrichment = await enrichDiagnosis(organizationId);

      const kpiParts: string[] = [];
      if (enrichment.unitEconomicsContext) {
        const ue = enrichment.unitEconomicsContext;
        kpiParts.push(`AOV: $${ue.currentAOV.toFixed(0)}, CM%: ${(ue.currentCMPct * 100).toFixed(1)}%, Max affordable CAC: $${ue.maxAffordableCac.toFixed(0)}`);
        if (ue.currentMetaCac !== null) kpiParts.push(`Current Meta CAC: $${ue.currentMetaCac.toFixed(0)}`);
      }

      const funnelParts: string[] = [];
      if (enrichment.funnelContext) {
        const f = enrichment.funnelContext;
        funnelParts.push(`Funnel: Session→PDP ${(f.sessionToPdp * 100).toFixed(1)}%, PDP→ATC ${(f.pdpToAtc * 100).toFixed(1)}%, ATC→Checkout ${(f.atcToCheckout * 100).toFixed(1)}%, Checkout→Purchase ${(f.checkoutToPurchase * 100).toFixed(1)}%`);
        if (f.bottleneck) funnelParts.push(`Bottleneck: ${f.bottleneck}`);
      }

      const cohortParts: string[] = [];
      if (enrichment.cohortContext) {
        const c = enrichment.cohortContext;
        cohortParts.push(`LTV90: $${c.latestLtv90.toFixed(0)}, D30 Retention: ${(c.latestD30Retention * 100).toFixed(1)}%, LTV:CAC ratio: ${c.ltvCacRatio.toFixed(1)}x`);
        if (c.paybackDays !== null) cohortParts.push(`Payback: ${c.paybackDays} days`);
      }

      const segmentParts: string[] = [];
      if (enrichment.segmentContext) {
        const s = enrichment.segmentContext;
        segmentParts.push(`Segments: Champions ${s.champions}, Loyal ${s.loyal}, Potential ${s.potential}, At Risk ${s.atRisk}, Dormant ${s.dormant}, Lost ${s.lost} (Total: ${s.total})`);
      }

      if (kpiParts.length > 0 || funnelParts.length > 0 || cohortParts.length > 0 || segmentParts.length > 0) {
        analyzerInput.businessContext = {
          kpiSummary: kpiParts.join('. ') || 'N/A',
          funnelSummary: funnelParts.join('. ') || 'N/A',
          cohortSummary: cohortParts.join('. ') || 'N/A',
          segmentSummary: segmentParts.join('. ') || 'N/A',
        };
      }
    } catch {
      // Business context enrichment failure is non-fatal
    }

    let insight;
    try {
      insight = isAIConfigured()
        ? await generateDiagnosisInsight(analyzerInput)
        : generateRuleBasedInsight(analyzerInput);
    } catch (err) {
      // Fallback to rule-based if AI fails
      request.log.warn({ err }, 'AI insight generation failed, falling back to rule-based');
      insight = generateRuleBasedInsight(analyzerInput);
    }

    // Cache the insight in the diagnosis row
    await prisma.diagnosis.update({
      where: { id: diagnosis.id },
      data: {
        aiInsight: insight as unknown as Prisma.InputJsonValue,
        aiInsightAt: new Date(),
      },
    });

    return { insight, cached: false };
  });

  // ── POST /autopilot/diagnoses/:id/generate-copy — AI variants ─
  app.post('/autopilot/diagnoses/:id/generate-copy', {
    schema: {
      tags: ['autopilot'],
      summary: 'Generate copy variants',
      description: 'Uses AI to generate 3 copy variants (benefit, pain_point, urgency) for a diagnosis. ',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, organizationId },
      include: {
        ad: {
          select: {
            id: true, headline: true, primaryText: true, description: true,
            spend7d: true, roas7d: true, ctr7d: true, frequency7d: true, conversions7d: true,
          },
        },
      },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    if (diagnosis.actionType !== 'GENERATE_COPY_VARIANTS') {
      reply.status(400);
      return { error: `Diagnosis action type is ${diagnosis.actionType}, not GENERATE_COPY_VARIANTS` };
    }

    // Phase 4.2: Query previously approved/published variants for learning
    const previousVariants = await prisma.adVariant.findMany({
      where: {
        adId: diagnosis.adId,
        status: { in: ['APPROVED', 'PUBLISHED'] },
      },
      select: {
        angle: true,
        headline: true,
        spend: true,
        conversions: true,
        revenue: true,
        clicks: true,
        impressions: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10, // Limit to most recent 10 variants
    });

    const previousVariantPerf = previousVariants.map((v) => {
      const spend = v.spend ? Number(v.spend) : 0;
      const revenue = v.revenue ? Number(v.revenue) : 0;
      const clicks = v.clicks ?? 0;
      const impressions = v.impressions ?? 0;
      return {
        angle: v.angle,
        headline: v.headline,
        roas: spend > 0 ? revenue / spend : null,
        ctr: impressions > 0 ? clicks / impressions : null,
        conversions: v.conversions ?? 0,
        status: v.status,
      };
    });

    const copies = await generateCopyVariants({
      originalHeadline: diagnosis.ad.headline,
      originalPrimaryText: diagnosis.ad.primaryText,
      originalDescription: diagnosis.ad.description,
      diagnosisRule: diagnosis.ruleId,
      diagnosisMessage: diagnosis.message,
      adMetrics: {
        spend7d: Number(diagnosis.ad.spend7d),
        roas7d: diagnosis.ad.roas7d ? Number(diagnosis.ad.roas7d) : null,
        ctr7d: diagnosis.ad.ctr7d ? Number(diagnosis.ad.ctr7d) : null,
        frequency7d: diagnosis.ad.frequency7d ? Number(diagnosis.ad.frequency7d) : null,
        conversions7d: diagnosis.ad.conversions7d,
      },
      previousVariants: previousVariantPerf.length > 0 ? previousVariantPerf : undefined,
    });

    // Create AdVariant records
    const variants = [];
    for (const copy of copies) {
      const variant = await prisma.adVariant.create({
        data: {
          diagnosisId: diagnosis.id,
          adId: diagnosis.adId,
          angle: copy.angle,
          headline: copy.headline,
          primaryText: copy.primaryText,
          description: copy.description,
        },
      });
      variants.push(variant);
    }

    return { variants };
  });

  // ── GET /autopilot/variants/:id — variant detail ─────────────
  app.get('/autopilot/variants/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get variant detail',
      description: 'Returns a single ad copy variant.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const variant = await prisma.adVariant.findFirst({
      where: { id },
      include: {
        diagnosis: { select: { id: true, ruleId: true, title: true, severity: true, organizationId: true } },
        ad: { select: { id: true, adId: true, name: true, headline: true, primaryText: true, description: true } },
      },
    });

    if (!variant) {
      reply.status(404);
      return { error: 'Variant not found' };
    }

    // Verify org ownership via diagnosis
    const orgId = getOrgId(request);
    if (orgId && variant.diagnosis.organizationId !== orgId) {
      reply.status(404);
      return { error: 'Variant not found' };
    }

    return variant;
  });

  // ── PATCH /autopilot/variants/:id — approve/reject ───────────
  app.patch('/autopilot/variants/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Update variant status',
      description: 'Approve or reject an ad copy variant.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status?: string };

    if (!status || !['APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      reply.status(400);
      return { error: 'Status must be APPROVED or REJECTED' };
    }

    const variant = await prisma.adVariant.findFirst({
      where: { id },
      include: {
        diagnosis: { select: { organizationId: true } },
      },
    });

    if (!variant) {
      reply.status(404);
      return { error: 'Variant not found' };
    }

    const orgId = getOrgId(request);
    if (orgId && variant.diagnosis.organizationId !== orgId) {
      reply.status(404);
      return { error: 'Variant not found' };
    }

    if (variant.status !== 'DRAFT') {
      reply.status(400);
      return { error: `Cannot update variant with status ${variant.status}` };
    }

    const updated = await prisma.adVariant.update({
      where: { id },
      data: { status: status.toUpperCase() as 'APPROVED' | 'REJECTED' },
    });

    return updated;
  });

  // ── POST /autopilot/variants/:id/activate — Publish approved variant to Meta ─
  app.post('/autopilot/variants/:id/activate', {
    schema: {
      tags: ['autopilot'],
      summary: 'Activate an approved variant',
      description: 'Publishes an APPROVED ad variant to Meta Ads and marks it PUBLISHED.',
      params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    // 1. Fetch variant with diagnosis + ad context
    const variant = await prisma.adVariant.findFirst({
      where: { id },
      include: {
        diagnosis: {
          select: {
            organizationId: true,
            ad: {
              select: {
                adId: true,
                adSet: { select: { adSetId: true } },
              },
            },
          },
        },
      },
    });

    if (!variant || variant.diagnosis.organizationId !== organizationId) {
      return reply.status(404).send({ error: 'Variant not found' });
    }

    if (variant.status !== 'APPROVED') {
      return reply.status(400).send({ error: `Cannot activate variant with status ${variant.status}. Must be APPROVED first.` });
    }

    // 2. Get Meta credentials
    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads', organizationId },
    });

    if (!credential) {
      return reply.status(400).send({ error: 'No Meta Ads credentials found' });
    }

    let decrypted: Record<string, string>;
    try {
      decrypted = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch {
      return reply.status(500).send({ error: 'Failed to decrypt credentials' });
    }

    const accessToken = decrypted.accessToken ?? '';
    const meta = (credential.metadata ?? {}) as Record<string, string>;
    const adAccountId = ((meta.adAccountId as string) ?? '').trim();

    if (!accessToken || !adAccountId) {
      return reply.status(400).send({ error: 'Meta Ads credentials incomplete' });
    }

    // 3. Create ad in Meta
    const { createAdFromVariant } = await import('../lib/meta-executor.js');
    const result = await createAdFromVariant(accessToken, adAccountId, variant.diagnosis.ad.adSet.adSetId, {
      name: variant.headline,
      headline: variant.headline,
      primaryText: variant.primaryText,
      description: variant.description ?? undefined,
    });

    if (!result.success) {
      return reply.status(500).send({ error: result.error ?? 'Failed to create ad in Meta' });
    }

    // 4. Update variant to PUBLISHED with Meta ad ID
    const metaResp = result.metaResponse as { adId?: string } | undefined;
    const newMetaAdId = metaResp?.adId ?? null;

    const updated = await prisma.adVariant.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        metaAdId: newMetaAdId,
      },
    });

    return { variant: updated, metaAdId: newMetaAdId };
  });

  // ── GET /autopilot/variants — List variants with performance data ─
  app.get('/autopilot/variants', {
    schema: {
      tags: ['autopilot'],
      summary: 'List ad variants',
      description: 'List all ad variants with optional filtering by diagnosisId.',
      querystring: {
        type: 'object',
        properties: {
          diagnosisId: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { diagnosisId } = request.query as { diagnosisId?: string };
    const organizationId = await resolveOrgId(request);

    const where: Record<string, unknown> = {
      diagnosis: { organizationId },
    };
    if (diagnosisId) {
      where.diagnosisId = diagnosisId;
    }

    const variants = await prisma.adVariant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        ad: {
          select: {
            adId: true,
            name: true,
            spend7d: true,
            roas7d: true,
            ctr7d: true,
            conversions7d: true,
          },
        },
      },
    });

    return { variants };
  });

  // ── POST /autopilot/diagnoses/:id/approve — approve + execute ─
  app.post('/autopilot/diagnoses/:id/approve', {
    schema: {
      tags: ['autopilot'],
      summary: 'Approve and execute diagnosis',
      description: 'Validates PENDING status, checks plan, marks APPROVED, then queues execution via Meta API. ',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, organizationId },
      include: {
        ad: {
          select: { adId: true },
        },
      },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    if (diagnosis.status !== 'PENDING') {
      reply.status(400);
      return { error: `Cannot approve diagnosis with status ${diagnosis.status}` };
    }

    // For GENERATE_COPY_VARIANTS, verify there's an approved variant
    if (diagnosis.actionType === 'GENERATE_COPY_VARIANTS') {
      const approvedVariant = await prisma.adVariant.findFirst({
        where: { diagnosisId: id, status: 'APPROVED' },
      });
      if (!approvedVariant) {
        reply.status(400);
        return { error: 'No approved variant found. Generate and approve a copy variant first.' };
      }
    }

    // Verify Meta credentials exist
    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads', organizationId },
    });
    if (!credential) {
      reply.status(400);
      return { error: 'No Meta Ads connection found. Connect Meta Ads in Settings first.' };
    }

    // Check token exists
    try {
      const creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
      if (!creds.accessToken) {
        reply.status(400);
        return { error: 'Meta Ads access token is missing. Reconnect Meta Ads.' };
      }
    } catch {
      reply.status(400);
      return { error: 'Failed to read Meta Ads credentials. Reconnect Meta Ads.' };
    }

    // Mark as APPROVED
    await prisma.diagnosis.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    // Record feedback for rule tuning
    await prisma.diagnosisFeedback.create({
      data: {
        organizationId,
        ruleId: diagnosis.ruleId,
        action: 'APPROVED',
        diagnosisId: id,
        confidence: diagnosis.confidence,
      },
    });

    // Execute in background
    const jobRun = await prisma.jobRun.create({
      data: {
        jobName: `execute_${diagnosis.actionType.toLowerCase()}`,
        status: 'RUNNING',
        organizationId,
        metadata: { diagnosisId: id, adId: diagnosis.ad.adId } as never,
      },
    });

    executeAction(id)
      .then(async (result) => {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: result.success ? 'SUCCESS' : 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - jobRun.startedAt.getTime(),
            metadata: result as never,
          },
        });
      })
      .catch(async (err) => {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - jobRun.startedAt.getTime(),
            errorJson: { message: String(err) },
          },
        }).catch(() => {});
        app.log.error({ diagnosisId: id, error: String(err) }, 'Diagnosis execution failed');
      });

    return {
      success: true,
      diagnosisId: id,
      status: 'APPROVED',
      actionType: diagnosis.actionType,
      jobRunId: jobRun.id,
      message: `Diagnosis approved. Executing ${diagnosis.actionType} via Meta API...`,
    };
  });

  // ── GET /autopilot/diagnoses/:id/status — JSON execution status ─
  app.get('/autopilot/diagnoses/:id/status', {
    schema: {
      tags: ['autopilot'],
      summary: 'Diagnosis execution status (JSON)',
      description: 'Returns current execution status as JSON. Frontend polls this endpoint.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, ...(await resolveOrgWhere(request)) },
      select: { id: true, status: true, actionType: true, executedAt: true, executionResult: true },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    // Check if execution failed (status stays APPROVED but executionResult has error)
    const execResult = diagnosis.executionResult as Record<string, unknown> | null;
    if (diagnosis.status === 'APPROVED' && execResult?.error) {
      return {
        status: diagnosis.status,
        error: execResult.error as string,
        executionResult: diagnosis.executionResult,
      };
    }

    return {
      status: diagnosis.status,
      executedAt: diagnosis.executedAt,
      executionResult: diagnosis.executionResult,
    };
  });

  // ── POST /autopilot/diagnoses/:id/retry — retry failed execution ─
  app.post('/autopilot/diagnoses/:id/retry', {
    schema: {
      tags: ['autopilot'],
      summary: 'Retry failed diagnosis execution',
      description: 'Re-runs executeAction for APPROVED diagnoses that failed.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    const diagnosis = await prisma.diagnosis.findFirst({
      where: { id, organizationId },
    });

    if (!diagnosis) {
      reply.status(404);
      return { error: 'Diagnosis not found' };
    }

    if (diagnosis.status !== 'APPROVED') {
      reply.status(400);
      return { error: `Cannot retry diagnosis with status ${diagnosis.status}` };
    }

    const execResult = diagnosis.executionResult as Record<string, unknown> | null;
    if (!execResult?.error) {
      reply.status(400);
      return { error: 'Diagnosis has no execution error — it may still be processing' };
    }

    // Clear the old execution error before retrying
    await prisma.diagnosis.update({
      where: { id },
      data: { executionResult: Prisma.DbNull },
    });

    // Re-execute in background
    const jobRun = await prisma.jobRun.create({
      data: {
        jobName: `retry_${diagnosis.actionType.toLowerCase()}`,
        status: 'RUNNING',
        organizationId,
        metadata: { diagnosisId: id, retry: true } as never,
      },
    });

    executeAction(id)
      .then(async (result) => {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: result.success ? 'SUCCESS' : 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - jobRun.startedAt.getTime(),
            metadata: result as never,
          },
        });
      })
      .catch(async (err) => {
        await prisma.jobRun.update({
          where: { id: jobRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            durationMs: Date.now() - jobRun.startedAt.getTime(),
            errorJson: { message: String(err) },
          },
        }).catch(() => {});
        app.log.error({ diagnosisId: id, error: String(err) }, 'Diagnosis retry execution failed');
      });

    return {
      success: true,
      diagnosisId: id,
      status: 'APPROVED',
      actionType: diagnosis.actionType,
      jobRunId: jobRun.id,
      message: `Retrying ${diagnosis.actionType} via Meta API...`,
    };
  });

  // ── POST /autopilot/debug-meta-write — test a Meta write call ───
  app.post('/autopilot/debug-meta-write', {
    schema: {
      tags: ['autopilot'],
      summary: 'Debug Meta API write',
      description: 'Tests a write call to Meta API and returns full error response.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);
    const { campaignId: extCampaignId } = request.body as { campaignId?: string };

    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads', organizationId },
    });
    if (!credential) return { error: 'No Meta Ads connector found' };

    let creds: Record<string, string>;
    try {
      creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch {
      return { error: 'Failed to decrypt credentials' };
    }

    const accessToken = creds.accessToken ?? '';
    if (!accessToken) return { error: 'No access token' };

    // Use provided campaignId or get first active campaign
    let targetId = extCampaignId;
    if (!targetId) {
      const camp = await prisma.metaCampaign.findFirst({
        where: { organizationId, status: 'ACTIVE' },
        select: { campaignId: true, name: true, dailyBudget: true },
      });
      if (!camp) return { error: 'No active campaigns' };
      targetId = camp.campaignId;
    }

    // Step 1: Read campaign from Meta to verify access
    const readResp = await fetch(
      `https://graph.facebook.com/v21.0/${targetId}?fields=id,name,daily_budget,status,budget_remaining&access_token=${accessToken}`,
    );
    const readBody = await readResp.json();

    // Step 2: Try a write using form-urlencoded (Meta's official format)
    // Update to SAME daily_budget so no actual change is made
    const currentBudget = (readBody as Record<string, unknown>).daily_budget;
    let writeResult: unknown = null;
    if (currentBudget) {
      const formData = new URLSearchParams();
      formData.append('access_token', accessToken);
      formData.append('daily_budget', String(currentBudget));

      const writeResp = await fetch(`https://graph.facebook.com/v21.0/${targetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      writeResult = await writeResp.json();
    }

    // Step 3: Debug token info (app, scopes, validity)
    const debugResp = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
    );
    const debugBody = await debugResp.json();

    return {
      campaignId: targetId,
      readResponse: readBody,
      writeResponse: writeResult,
      currentBudget,
      tokenDebug: debugBody,
    };
  });

  // ── GET /autopilot/check-permissions — verify Meta token scopes ──
  app.get('/autopilot/check-permissions', {
    schema: {
      tags: ['autopilot'],
      summary: 'Check Meta token permissions',
      description: 'Verifies the Meta access token has ads_management scope for write operations.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads', organizationId },
    });

    if (!credential) {
      return { ok: false, error: 'No Meta Ads connector found' };
    }

    let creds: Record<string, string>;
    try {
      creds = JSON.parse(decrypt(credential.encryptedData, credential.iv, credential.authTag)) as Record<string, string>;
    } catch {
      return { ok: false, error: 'Failed to decrypt credentials' };
    }

    const accessToken = creds.accessToken ?? '';
    if (!accessToken) {
      return { ok: false, error: 'No access token in credentials' };
    }

    // Call Meta debug_token or /me/permissions to check scopes
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v21.0/me/permissions?access_token=${accessToken}`,
      );
      const body = await resp.json() as { data?: Array<{ permission: string; status: string }> };
      const permissions = (body.data ?? []).map((p) => ({
        permission: p.permission,
        status: p.status,
      }));

      const hasAdsManagement = permissions.some(
        (p) => p.permission === 'ads_management' && p.status === 'granted',
      );
      const hasAdsRead = permissions.some(
        (p) => p.permission === 'ads_read' && p.status === 'granted',
      );

      return {
        ok: hasAdsManagement,
        hasAdsManagement,
        hasAdsRead,
        permissions,
        message: hasAdsManagement
          ? 'Token has ads_management — write operations are allowed'
          : 'Token is MISSING ads_management scope — cannot make changes via API. Re-generate the token with ads_management permission.',
      };
    } catch (err) {
      return { ok: false, error: `Failed to check permissions: ${(err as Error).message}` };
    }
  });

  // ── GET /autopilot/history — action history ──────────────────
  app.get('/autopilot/history', {
    schema: {
      tags: ['autopilot'],
      summary: 'Diagnosis action history',
      description: 'Returns diagnoses that have been actioned (executed, dismissed, expired).',
    },
  }, async (request) => {
    const { limit, offset } = request.query as { limit?: string; offset?: string };
    const take = limit ? parseInt(limit, 10) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;

    const orgFilter = await resolveOrgWhere(request);
    const where = {
      ...orgFilter,
      status: { in: [DiagnosisStatus.EXECUTED, DiagnosisStatus.DISMISSED, DiagnosisStatus.EXPIRED, DiagnosisStatus.APPROVED] },
    };

    const [items, total] = await Promise.all([
      prisma.diagnosis.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        include: {
          ad: {
            select: {
              id: true, adId: true, name: true, status: true,
              spend7d: true, roas7d: true, ctr7d: true,
              campaign: { select: { id: true, name: true } },
            },
          },
          variants: {
            select: { id: true, angle: true, headline: true, status: true },
          },
        },
      }),
      prisma.diagnosis.count({ where }),
    ]);

    return { items, total };
  });

  // ── GET /autopilot/config — current org config ──────────────
  app.get('/autopilot/config', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get autopilot configuration',
      description: 'Returns the current autopilot configuration for the organization. Creates defaults if none exists.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    let config = await prisma.autopilotConfig.findUnique({
      where: { organizationId },
    });

    if (!config) {
      config = await prisma.autopilotConfig.create({
        data: { organizationId },
      });
    }

    return {
      mode: config.mode,
      targetRoas: config.targetRoas?.toNumber() ?? null,
      maxCpa: config.maxCpa?.toNumber() ?? null,
      dailyBudgetCap: config.dailyBudgetCap?.toNumber() ?? null,
      maxBudgetIncreasePct: config.maxBudgetIncreasePct,
      maxActionsPerDay: config.maxActionsPerDay,
      minSpendBeforeAction: config.minSpendBeforeAction.toNumber(),
      minConfidence: config.minConfidence,
      // Mask webhook URL — only show whether it's set (never expose full URL)
      slackWebhookUrl: config.slackWebhookUrl ? '••••••' + config.slackWebhookUrl.slice(-8) : null,
      hasSlackWebhook: !!config.slackWebhookUrl,
      notifyOnCritical: config.notifyOnCritical,
      notifyOnAutoAction: config.notifyOnAutoAction,
    };
  });

  // ── PATCH /autopilot/config — update org config ─────────────
  app.patch('/autopilot/config', {
    schema: {
      tags: ['autopilot'],
      summary: 'Update autopilot configuration',
      description: 'Updates autopilot configuration fields. Only provided fields are changed.',
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const body = request.body as Record<string, unknown>;

    // Ensure config exists
    const existing = await prisma.autopilotConfig.findUnique({ where: { organizationId } });
    if (!existing) {
      await prisma.autopilotConfig.create({ data: { organizationId } });
    }

    // Helper: parse numeric field with NaN guard
    const safeNumber = (val: unknown): number | null => {
      if (val === null || val === undefined) return null;
      const n = Number(val);
      return isNaN(n) || !isFinite(n) ? null : n;
    };

    const data: Record<string, unknown> = {};
    if (body.mode !== undefined) {
      const mode = String(body.mode);
      if (!['monitor', 'suggest', 'auto'].includes(mode)) {
        return reply.status(400).send({ error: 'Invalid mode. Must be: monitor, suggest, or auto' });
      }
      data.mode = mode;
    }
    if (body.targetRoas !== undefined) {
      const v = safeNumber(body.targetRoas);
      data.targetRoas = v !== null && v >= 0 ? v : null;
    }
    if (body.maxCpa !== undefined) {
      const v = safeNumber(body.maxCpa);
      data.maxCpa = v !== null && v >= 0 ? v : null;
    }
    if (body.dailyBudgetCap !== undefined) {
      const v = safeNumber(body.dailyBudgetCap);
      data.dailyBudgetCap = v !== null && v >= 0 ? v : null;
    }
    if (body.maxBudgetIncreasePct !== undefined) {
      const v = safeNumber(body.maxBudgetIncreasePct);
      data.maxBudgetIncreasePct = v !== null ? Math.max(10, Math.min(200, v)) : 50;
    }
    if (body.maxActionsPerDay !== undefined) {
      const v = safeNumber(body.maxActionsPerDay);
      data.maxActionsPerDay = v !== null ? Math.max(1, Math.min(100, Math.round(v))) : 10;
    }
    if (body.minSpendBeforeAction !== undefined) {
      const v = safeNumber(body.minSpendBeforeAction);
      data.minSpendBeforeAction = v !== null ? Math.max(0, v) : 0;
    }
    if (body.minConfidence !== undefined) {
      const v = safeNumber(body.minConfidence);
      data.minConfidence = v !== null ? Math.max(0, Math.min(100, Math.round(v))) : 70;
    }
    if (body.slackWebhookUrl !== undefined) {
      // Accept null to clear, or a non-empty string to set
      data.slackWebhookUrl = body.slackWebhookUrl === null || body.slackWebhookUrl === '' ? null : String(body.slackWebhookUrl);
    }
    if (body.notifyOnCritical !== undefined) data.notifyOnCritical = Boolean(body.notifyOnCritical);
    if (body.notifyOnAutoAction !== undefined) data.notifyOnAutoAction = Boolean(body.notifyOnAutoAction);

    const updated = await prisma.autopilotConfig.update({
      where: { organizationId },
      data,
    });

    return {
      mode: updated.mode,
      targetRoas: updated.targetRoas?.toNumber() ?? null,
      maxCpa: updated.maxCpa?.toNumber() ?? null,
      dailyBudgetCap: updated.dailyBudgetCap?.toNumber() ?? null,
      maxBudgetIncreasePct: updated.maxBudgetIncreasePct,
      maxActionsPerDay: updated.maxActionsPerDay,
      minSpendBeforeAction: updated.minSpendBeforeAction.toNumber(),
      minConfidence: updated.minConfidence,
      slackWebhookUrl: updated.slackWebhookUrl ? '••••••' + updated.slackWebhookUrl.slice(-8) : null,
      hasSlackWebhook: !!updated.slackWebhookUrl,
      notifyOnCritical: updated.notifyOnCritical,
      notifyOnAutoAction: updated.notifyOnAutoAction,
    };
  });

  // ── GET /autopilot/budget-optimization — portfolio optimizer ──
  app.get('/autopilot/budget-optimization', {
    schema: {
      tags: ['autopilot'],
      summary: 'Budget optimization suggestions',
      description: 'Returns portfolio-level budget reallocation suggestions based on ROAS performance across ad sets.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    // Load config for optimization parameters
    const config = await prisma.autopilotConfig.findUnique({
      where: { organizationId },
    });

    // Fetch ad sets with aggregated ad metrics
    const adSets = await prisma.metaAdSet.findMany({
      where: { organizationId },
      include: {
        ads: {
          where: { status: 'ACTIVE' },
          select: {
            spend7d: true, revenue7d: true, impressions7d: true,
            clicks7d: true, conversions7d: true, roas7d: true, frequency7d: true,
          },
        },
      },
    });

    // Aggregate ad-level metrics per ad set
    const adSetMetrics: AdSetMetrics[] = adSets.map((as) => {
      let spend = 0, revenue = 0, impressions = 0, clicks = 0, conversions = 0;
      let totalFreq = 0, freqCount = 0;
      for (const ad of as.ads) {
        spend += Number(ad.spend7d);
        revenue += Number(ad.revenue7d);
        impressions += ad.impressions7d;
        clicks += ad.clicks7d;
        conversions += ad.conversions7d;
        if (ad.frequency7d !== null) {
          totalFreq += Number(ad.frequency7d);
          freqCount++;
        }
      }
      return {
        adSetId: as.adSetId,
        adSetName: as.name,
        currentDailyBudget: as.dailyBudget ? Number(as.dailyBudget) : Math.round(spend / 7),
        spend7d: spend,
        revenue7d: revenue,
        roas7d: spend > 0 ? revenue / spend : null,
        impressions7d: impressions,
        clicks7d: clicks,
        conversions7d: conversions,
        frequency7d: freqCount > 0 ? totalFreq / freqCount : null,
      };
    }).filter((m) => m.spend7d > 0); // Only include ad sets with spend

    const optimization = optimizeBudgetAllocation(adSetMetrics, {
      totalBudgetCap: config?.dailyBudgetCap?.toNumber() ?? undefined,
      targetRoas: config?.targetRoas?.toNumber() ?? 2.0,
      maxChangePct: config?.maxBudgetIncreasePct ?? 50,
      minDailyBudget: 10,
    });

    return optimization;
  });

  // ── GET /autopilot/campaigns/health — campaign health scores ──
  app.get('/autopilot/campaigns/health', {
    schema: {
      tags: ['autopilot'],
      summary: 'Campaign health scores',
      description: 'Returns 0-100 health scores for all campaigns with component breakdown.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    const config = await prisma.autopilotConfig.findUnique({
      where: { organizationId },
    });

    // Fetch campaigns with ad sets and their ads
    const campaigns = await prisma.metaCampaign.findMany({
      where: { organizationId },
      include: {
        adSets: {
          include: {
            ads: {
              where: { status: 'ACTIVE' },
              select: {
                id: true, spend7d: true, revenue7d: true,
                roas7d: true, ctr7d: true, frequency7d: true,
                roas14d: true, ctr14d: true,
              },
            },
          },
        },
      },
    });

    // For each campaign, also fetch snapshot-based ROAS values for stability scoring
    const scores = await Promise.all(campaigns.map(async (camp) => {
      const adSetHealths: AdSetHealth[] = [];

      for (const adSet of camp.adSets) {
        let spend = 0, revenue = 0;
        let totalRoas = 0, roasCount = 0;
        let totalCtr = 0, ctrCount = 0;
        let totalFreq = 0, freqCount = 0;
        let totalRoas14 = 0, roas14Count = 0;
        let totalCtr14 = 0, ctr14Count = 0;

        // Collect ad IDs for snapshot queries
        const adIds: string[] = [];
        for (const ad of adSet.ads) {
          adIds.push(ad.id);
          spend += Number(ad.spend7d);
          revenue += Number(ad.revenue7d);
          if (ad.roas7d !== null) { totalRoas += Number(ad.roas7d); roasCount++; }
          if (ad.ctr7d !== null) { totalCtr += Number(ad.ctr7d); ctrCount++; }
          if (ad.frequency7d !== null) { totalFreq += Number(ad.frequency7d); freqCount++; }
          if (ad.roas14d !== null) { totalRoas14 += Number(ad.roas14d); roas14Count++; }
          if (ad.ctr14d !== null) { totalCtr14 += Number(ad.ctr14d); ctr14Count++; }
        }

        // Get snapshot ROAS values for variance calculation (last 21 days)
        let roasValues: number[] | undefined;
        if (adIds.length > 0) {
          const since = new Date();
          since.setDate(since.getDate() - 21);
          const snapshots = await prisma.metaAdSnapshot.findMany({
            where: { adId: { in: adIds }, date: { gte: since } },
            select: { roas: true },
          });
          const validRoas = snapshots
            .map((s) => s.roas?.toNumber())
            .filter((v): v is number => v !== null && v !== undefined);
          if (validRoas.length >= 5) roasValues = validRoas;
        }

        adSetHealths.push({
          adSetId: adSet.adSetId,
          spend7d: spend,
          revenue7d: revenue,
          roas7d: roasCount > 0 ? totalRoas / roasCount : null,
          ctr7d: ctrCount > 0 ? totalCtr / ctrCount : null,
          frequency7d: freqCount > 0 ? totalFreq / freqCount : null,
          roas14d: roas14Count > 0 ? totalRoas14 / roas14Count : null,
          ctr14d: ctr14Count > 0 ? totalCtr14 / ctr14Count : null,
          roasValues,
        });
      }

      const campaignMetrics: CampaignMetrics = {
        campaignId: camp.campaignId,
        campaignName: camp.name,
        adSets: adSetHealths,
      };

      return scoreCampaignHealth(campaignMetrics, {
        targetRoas: config?.targetRoas?.toNumber() ?? 2.0,
      });
    }));

    // Sort by score descending
    scores.sort((a, b) => b.overallScore - a.overallScore);
    return { campaigns: scores, total: scores.length };
  });

  // ── GET /autopilot/ads/:id/anomalies — anomaly detection ──
  app.get('/autopilot/ads/:id/anomalies', {
    schema: {
      tags: ['autopilot'],
      summary: 'Detect anomalies for an ad',
      description: 'Uses z-score based anomaly detection on snapshot history for a specific ad.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgFilter = await resolveOrgWhere(request);

    const ad = await prisma.metaAd.findFirst({
      where: { id, ...orgFilter },
      select: {
        id: true, name: true,
        roas7d: true, ctr7d: true, cpc7d: true, frequency7d: true, spend7d: true,
      },
    });
    if (!ad) return reply.status(404).send({ error: 'Ad not found' });

    // Get last 30 days of snapshots
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const snapshots = await prisma.metaAdSnapshot.findMany({
      where: { adId: id, organizationId: orgFilter.organizationId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { roas: true, ctr: true, cpc: true, frequency: true, spend: true },
    });

    // Preserve array length (use NaN for nulls) so excludeRecentDays stays time-aligned
    const series: MetricSeries[] = [];
    const addSeries = (metric: string, getter: (s: typeof snapshots[0]) => number | null) => {
      const values = snapshots.map((s) => getter(s) ?? NaN);
      const validCount = values.filter((v) => !isNaN(v)).length;
      if (validCount > 0) series.push({ values, metric });
    };

    addSeries('roas', (s) => s.roas?.toNumber() ?? null);
    addSeries('ctr', (s) => s.ctr?.toNumber() ?? null);
    addSeries('cpc', (s) => s.cpc?.toNumber() ?? null);
    addSeries('frequency', (s) => s.frequency?.toNumber() ?? null);
    addSeries('spend', (s) => s.spend?.toNumber() ?? null);

    const currentValues: Record<string, number> = {};
    if (ad.roas7d !== null) currentValues.roas = Number(ad.roas7d);
    if (ad.ctr7d !== null) currentValues.ctr = Number(ad.ctr7d);
    if (ad.cpc7d !== null) currentValues.cpc = Number(ad.cpc7d);
    if (ad.frequency7d !== null) currentValues.frequency = Number(ad.frequency7d);
    if (ad.spend7d !== null) currentValues.spend = Number(ad.spend7d);

    const anomalies = detectAnomalies(series, currentValues);
    return { adId: ad.id, adName: ad.name, anomalies, snapshotCount: snapshots.length };
  });

  // ── GET /autopilot/ads/:id/decay — creative decay analysis ──
  app.get('/autopilot/ads/:id/decay', {
    schema: {
      tags: ['autopilot'],
      summary: 'Creative decay analysis',
      description: 'Analyzes the creative performance decay curve for a specific ad using snapshot history.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgFilter = await resolveOrgWhere(request);

    const ad = await prisma.metaAd.findFirst({
      where: { id, ...orgFilter },
      select: { id: true, name: true, roas7d: true },
    });
    if (!ad) return reply.status(404).send({ error: 'Ad not found' });

    const snapshots = await prisma.metaAdSnapshot.findMany({
      where: { adId: id },
      orderBy: { date: 'asc' },
      select: {
        date: true, spend: true, revenue: true,
        roas: true, ctr: true, impressions: true, frequency: true,
      },
    });

    const dailySnapshots: DailySnapshot[] = snapshots.map((s) => ({
      date: s.date.toISOString().split('T')[0]!,
      spend: s.spend.toNumber(),
      revenue: s.revenue.toNumber(),
      roas: s.roas?.toNumber() ?? null,
      ctr: s.ctr?.toNumber() ?? null,
      impressions: s.impressions,
      frequency: s.frequency?.toNumber() ?? null,
    }));

    const analysis = analyzeCreativeDecay(
      ad.id,
      ad.name,
      dailySnapshots,
      ad.roas7d ? Number(ad.roas7d) : null,
    );

    return analysis;
  });

  // ── GET /autopilot/action-log — audit trail ──────────────────
  app.get('/autopilot/action-log', {
    schema: {
      tags: ['autopilot'],
      summary: 'Action audit log',
      description: 'Returns the audit trail of all autopilot actions (manual + auto).',
    },
  }, async (request) => {
    const { limit, offset, triggeredBy } = request.query as {
      limit?: string; offset?: string; triggeredBy?: string;
    };
    const take = limit ? Math.min(parseInt(limit, 10), 200) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;

    const orgFilter = await resolveOrgWhere(request);
    const where: Record<string, unknown> = { ...orgFilter };
    if (triggeredBy) where.triggeredBy = triggeredBy;

    const [items, total] = await Promise.all([
      prisma.autopilotActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.autopilotActionLog.count({ where }),
    ]);

    return { items, total };
  });

  // ── GET /autopilot/ads/:id/timeseries — snapshot time-series ─
  app.get('/autopilot/ads/:id/timeseries', {
    schema: {
      tags: ['autopilot'],
      summary: 'Ad snapshot timeseries',
      description: 'Returns daily snapshot data for a specific ad over a given period.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { days = '30' } = request.query as { days?: string };
    const daysNum = Math.min(90, Math.max(7, parseInt(days, 10) || 30));
    const orgFilter = await resolveOrgWhere(request);

    const since = new Date();
    since.setDate(since.getDate() - daysNum);
    since.setHours(0, 0, 0, 0);

    const ad = await prisma.metaAd.findFirst({
      where: { id, ...orgFilter },
      select: { id: true, name: true, adId: true },
    });

    if (!ad) {
      return reply.status(404).send({ error: 'Ad not found' });
    }

    const snapshots = await prisma.metaAdSnapshot.findMany({
      where: { adId: id, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        revenue: true,
        roas: true,
        ctr: true,
        cpc: true,
        frequency: true,
      },
    });

    return {
      adId: ad.id,
      adName: ad.name,
      metaAdId: ad.adId,
      days: daysNum,
      series: snapshots.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        spend: s.spend.toNumber(),
        impressions: s.impressions,
        clicks: s.clicks,
        conversions: s.conversions,
        revenue: s.revenue.toNumber(),
        roas: s.roas?.toNumber() ?? null,
        ctr: s.ctr?.toNumber() ?? null,
        cpc: s.cpc?.toNumber() ?? null,
        frequency: s.frequency?.toNumber() ?? null,
      })),
    };
  });

  // ── POST /autopilot/actions/:id/rollback — undo an action ───
  app.post('/autopilot/actions/:id/rollback', {
    schema: {
      tags: ['autopilot'],
      summary: 'Rollback an executed action',
      description: 'Performs the inverse of a previously executed action via the Meta API. Only successful, non-rollback actions less than 7 days old can be rolled back.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    // Verify the action log belongs to this org
    const actionLog = await prisma.autopilotActionLog.findFirst({
      where: { id, organizationId },
    });

    if (!actionLog) {
      reply.status(404);
      return { error: 'Action log not found' };
    }

    const result = await rollbackAction(id);
    if (!result.success) {
      reply.status(400);
    }
    return result;
  });

  // ── POST /autopilot/bulk-approve — bulk approve diagnoses ────
  app.post('/autopilot/bulk-approve', {
    schema: {
      tags: ['autopilot'],
      summary: 'Bulk approve diagnoses',
      description: 'Approves multiple diagnoses and queues them for execution. ',
    },
  }, async (request, reply) => {
    const { ids } = request.body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      reply.status(400);
      return { error: 'ids must be a non-empty array of diagnosis IDs' };
    }

    if (ids.length > 50) {
      reply.status(400);
      return { error: 'Maximum 50 diagnoses per bulk operation' };
    }

    const organizationId = await resolveOrgId(request);

    // Verify Meta credentials exist
    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorType: 'meta_ads', organizationId },
    });
    if (!credential) {
      reply.status(400);
      return { error: 'No Meta Ads connection found. Connect Meta Ads in Settings first.' };
    }

    // Fetch all diagnoses and validate
    const diagnoses = await prisma.diagnosis.findMany({
      where: { id: { in: ids }, organizationId, status: 'PENDING' },
      select: { id: true, actionType: true, adId: true, ruleId: true, confidence: true },
    });

    const foundIds = new Set(diagnoses.map((d) => d.id));
    const skipped = ids.filter((id) => !foundIds.has(id));

    // Approve all valid diagnoses
    if (diagnoses.length > 0) {
      await prisma.diagnosis.updateMany({
        where: { id: { in: diagnoses.map((d) => d.id) } },
        data: { status: 'APPROVED' },
      });

      // Record feedback
      for (const diag of diagnoses) {
        await prisma.diagnosisFeedback.create({
          data: {
            organizationId,
            ruleId: diag.ruleId,
            action: 'APPROVED',
            diagnosisId: diag.id,
            confidence: diag.confidence,
          },
        });
      }
    }

    // Queue executions (non-blocking, with 2s delay between each)
    const results: Array<{ id: string; status: string }> = [];
    for (const diag of diagnoses) {
      results.push({ id: diag.id, status: 'queued' });
    }

    // Execute sequentially in background with delay
    (async () => {
      for (let i = 0; i < diagnoses.length; i++) {
        const diag = diagnoses[i];
        if (!diag) continue;
        if (i > 0) await new Promise((r) => setTimeout(r, 2000));
        try {
          await executeAction(diag.id);
        } catch (err) {
          app.log.error({ diagnosisId: diag.id, error: String(err) }, 'Bulk execution failed');
        }
      }
    })().catch(() => {});

    return {
      approved: diagnoses.length,
      skipped: skipped.length,
      skippedIds: skipped,
      results,
    };
  });

  // ── POST /autopilot/bulk-dismiss — bulk dismiss diagnoses ────
  app.post('/autopilot/bulk-dismiss', {
    schema: {
      tags: ['autopilot'],
      summary: 'Bulk dismiss diagnoses',
      description: 'Dismisses multiple diagnoses at once.',
    },
  }, async (request, reply) => {
    const { ids } = request.body as { ids?: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      reply.status(400);
      return { error: 'ids must be a non-empty array of diagnosis IDs' };
    }

    if (ids.length > 50) {
      reply.status(400);
      return { error: 'Maximum 50 diagnoses per bulk operation' };
    }

    const organizationId = await resolveOrgId(request);

    // Fetch diagnoses for feedback recording
    const diagnosesToDismiss = await prisma.diagnosis.findMany({
      where: { id: { in: ids }, organizationId, status: 'PENDING' },
      select: { id: true, ruleId: true, confidence: true },
    });

    const result = await prisma.diagnosis.updateMany({
      where: { id: { in: ids }, organizationId, status: 'PENDING' },
      data: { status: 'DISMISSED' },
    });

    // Record feedback
    for (const diag of diagnosesToDismiss) {
      await prisma.diagnosisFeedback.create({
        data: {
          organizationId,
          ruleId: diag.ruleId,
          action: 'DISMISSED',
          diagnosisId: diag.id,
          confidence: diag.confidence,
        },
      });
    }

    return {
      dismissed: result.count,
      total: ids.length,
    };
  });

  // ── GET /autopilot/rule-health — rule effectiveness stats ────
  app.get('/autopilot/rule-health', {
    schema: {
      tags: ['autopilot'],
      summary: 'Rule health statistics',
      description: 'Returns effectiveness metrics for each diagnosis rule based on 30-day feedback history.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);
    const stats = await computeRuleHealth(organizationId);
    return { rules: stats };
  });

  // ── POST /autopilot/emergency-stop — halt all automation ────
  app.post('/autopilot/emergency-stop', {
    schema: {
      tags: ['autopilot'],
      summary: 'Emergency stop',
      description: 'Switches autopilot to monitor mode and cancels all pending/approved diagnoses.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    // Set config.mode = 'monitor'
    await prisma.autopilotConfig.upsert({
      where: { organizationId },
      update: { mode: 'monitor' },
      create: { organizationId, mode: 'monitor' },
    });

    // Cancel all PENDING and APPROVED diagnoses
    const expireResult = await prisma.diagnosis.updateMany({
      where: {
        organizationId,
        status: { in: [DiagnosisStatus.PENDING, DiagnosisStatus.APPROVED] },
      },
      data: { status: 'EXPIRED' },
    });

    return {
      success: true,
      mode: 'monitor',
      diagnosesExpired: expireResult.count,
    };
  });

  // ── POST /autopilot/diagnoses/approve-by-severity — shortcut ──
  app.post('/autopilot/diagnoses/approve-by-severity', {
    schema: {
      tags: ['autopilot'],
      summary: 'Approve all diagnoses by severity',
      description: 'Approves and executes all PENDING diagnoses with the given severity level.',
    },
  }, async (request, reply) => {
    const { severity } = request.body as { severity?: string };

    if (!severity || !['CRITICAL', 'WARNING', 'INFO'].includes(severity.toUpperCase())) {
      return reply.status(400).send({ error: 'severity must be CRITICAL, WARNING, or INFO' });
    }

    const organizationId = await resolveOrgId(request);

    const pending = await prisma.diagnosis.findMany({
      where: { organizationId, status: 'PENDING', severity: severity.toUpperCase() as 'CRITICAL' | 'WARNING' | 'INFO' },
      select: { id: true, actionType: true },
    });

    if (pending.length === 0) {
      return { action: 'approve', severity: severity.toUpperCase(), total: 0, succeeded: 0, failed: 0, failures: [] };
    }

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const diag of pending) {
      try {
        await prisma.diagnosis.update({ where: { id: diag.id }, data: { status: 'APPROVED' } });
        const result = await executeAction(diag.id, 'user');
        if (result.success) {
          succeeded.push(diag.id);
        } else {
          failed.push({ id: diag.id, error: result.error ?? 'Execution failed' });
        }
      } catch (err) {
        failed.push({ id: diag.id, error: (err as Error).message });
      }
    }

    return {
      action: 'approve',
      severity: severity.toUpperCase(),
      total: pending.length,
      succeeded: succeeded.length,
      failed: failed.length,
      failures: failed,
    };
  });

  // ── GET /autopilot/performance — performance report ──────────
  app.get('/autopilot/performance', {
    schema: {
      tags: ['autopilot'],
      summary: 'Autopilot performance report',
      description: 'Returns summary of autopilot actions, budget changes, and estimated impact over a period.',
    },
  }, async (request) => {
    const { days = '30' } = request.query as { days?: string };
    const daysNum = Math.min(90, Math.max(7, parseInt(days, 10) || 30));
    const since = new Date();
    since.setDate(since.getDate() - daysNum);

    const orgFilter = await resolveOrgWhere(request);

    const actions = await prisma.autopilotActionLog.findMany({
      where: { ...orgFilter, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    const byType: Record<string, number> = {};
    let totalSuccessful = 0;
    let totalFailed = 0;
    let budgetIncreasesTotal = 0;
    let budgetDecreasesTotal = 0;
    let adsPaused = 0;
    let adsReactivated = 0;
    let undoCount = 0;
    const byTrigger: Record<string, number> = { user: 0, auto: 0, schedule: 0 };

    for (const action of actions) {
      byType[action.actionType] = (byType[action.actionType] ?? 0) + 1;
      if (action.triggeredBy in byTrigger) byTrigger[action.triggeredBy]!++;

      if (action.success) {
        totalSuccessful++;
        if (action.actionType === 'PAUSE_AD') adsPaused++;
        if (action.actionType === 'REACTIVATE_AD') adsReactivated++;
        if (action.actionType === 'INCREASE_BUDGET') {
          const before = (action.beforeValue as Record<string, number> | null)?.dailyBudget ?? 0;
          const after = (action.afterValue as Record<string, number> | null)?.dailyBudget ?? 0;
          budgetIncreasesTotal += (after - before);
        }
        if (action.actionType === 'DECREASE_BUDGET') {
          const before = (action.beforeValue as Record<string, number> | null)?.dailyBudget ?? 0;
          const after = (action.afterValue as Record<string, number> | null)?.dailyBudget ?? 0;
          budgetDecreasesTotal += (before - after);
        }
        if (action.actionType.startsWith('UNDO_')) undoCount++;
      } else {
        totalFailed++;
      }
    }

    const adActionCounts = new Map<string, { name: string; count: number }>();
    for (const action of actions) {
      if (!action.success) continue;
      const existing = adActionCounts.get(action.targetId);
      if (existing) existing.count++;
      else adActionCounts.set(action.targetId, { name: action.targetName, count: 1 });
    }
    const topAds = Array.from(adActionCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5);

    const config = await prisma.autopilotConfig.findUnique({
      where: { organizationId: orgFilter.organizationId },
    });

    return {
      period: { days: daysNum, since: since.toISOString() },
      totalActions: actions.length,
      totalSuccessful,
      totalFailed,
      undoCount,
      byType,
      byTrigger,
      budget: {
        totalIncreases: Math.round(budgetIncreasesTotal * 100) / 100,
        totalDecreases: Math.round(budgetDecreasesTotal * 100) / 100,
        netChange: Math.round((budgetIncreasesTotal - budgetDecreasesTotal) * 100) / 100,
      },
      adsPaused,
      adsReactivated,
      topActionedAds: topAds,
      circuitBreaker: {
        enabled: config?.circuitBreakerEnabled ?? true,
        trippedAt: config?.circuitBreakerTrippedAt ?? null,
        isTripped: !!config?.circuitBreakerTrippedAt,
      },
      mode: config?.mode ?? 'suggest',
    };
  });

  // ── POST /autopilot/circuit-breaker/reset ─────────────────────
  app.post('/autopilot/circuit-breaker/reset', {
    schema: {
      tags: ['autopilot'],
      summary: 'Reset circuit breaker',
      description: 'Resets the circuit breaker, re-enabling auto mode execution.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    await prisma.autopilotConfig.update({
      where: { organizationId },
      data: { circuitBreakerTrippedAt: null },
    });

    return { success: true, message: 'Circuit breaker reset. Auto mode re-enabled.' };
  });

  // ── GET /autopilot/product-opportunities ───────────────────
  app.get('/autopilot/product-opportunities', {
    schema: {
      tags: ['autopilot'],
      summary: 'Proactive product ad recommendations',
      description: 'Returns products with high ad fitness scores not yet being advertised.',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    // Get top products by fitness score — try org-scoped first, then claim orphans
    let products = await prisma.productPerformance.findMany({
      where: { organizationId },
      orderBy: { adFitnessScore: 'desc' },
      take: 20,
    });

    // If no products found with org scope, claim orphaned products (org = null)
    if (products.length === 0) {
      const orphanCount = await prisma.productPerformance.updateMany({
        where: { organizationId: null },
        data: { organizationId },
      });
      if (orphanCount.count > 0) {
        products = await prisma.productPerformance.findMany({
          where: { organizationId },
          orderBy: { adFitnessScore: 'desc' },
          take: 20,
        });
      }
    }

    // Get existing ad headlines to match against product titles
    const existingAds = await prisma.metaAd.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { headline: true, primaryText: true },
    });
    const adTexts = new Set(
      existingAds
        .flatMap((a) => [a.headline, a.primaryText])
        .filter((t): t is string => !!t)
        .map((t) => t.toLowerCase()),
    );

    // Determine which products are already being advertised
    const existingProductAds = new Set<string>();
    for (const p of products) {
      const titleLower = p.productTitle.toLowerCase();
      for (const text of adTexts) {
        if (text.includes(titleLower) || titleLower.includes(text)) {
          existingProductAds.add(p.productTitle);
          break;
        }
      }
    }

    const { evaluateProactiveRules } = await import('@growth-os/etl');

    // Build a lookup map so we can enrich recommendations with per-product metrics
    const productLookup = new Map(
      products.map((p) => [
        p.productTitle,
        {
          revenue30d: Number(p.revenue30d),
          grossProfit30d: Number(p.grossProfit30d),
          avgDailyUnits: Number(p.avgDailyUnits),
          repeatBuyerPct: Number(p.repeatBuyerPct),
          estimatedMargin: Number(p.estimatedMargin),
          avgPrice: Number(p.avgPrice),
          hasImage: !!p.imageUrl,
          hasDescription: !!p.description,
        },
      ]),
    );

    const rawRecommendations = evaluateProactiveRules({
      products: products.map((p) => ({
        productTitle: p.productTitle,
        productType: p.productType,
        adFitnessScore: Number(p.adFitnessScore ?? 0),
        revenue30d: Number(p.revenue30d),
        grossProfit30d: Number(p.grossProfit30d),
        estimatedMargin: Number(p.estimatedMargin),
        avgPrice: Number(p.avgPrice),
        avgDailyUnits: Number(p.avgDailyUnits),
        repeatBuyerPct: Number(p.repeatBuyerPct),
        imageUrl: p.imageUrl,
        productTier: p.productTier ?? null,
        revenueTrend: p.revenueTrend != null ? Number(p.revenueTrend) : null,
        revenueShare: p.revenueShare != null ? Number(p.revenueShare) : null,
      })),
      existingProductAds,
    });

    // Enrich with metrics object and normalize casing for frontend
    const recommendations = rawRecommendations.map((rec) => ({
      productTitle: rec.productTitle,
      productType: rec.productType,
      adFitnessScore: rec.adFitnessScore,
      reason: rec.reason,
      estimatedRoas: rec.estimatedROAS,  // normalize casing for frontend
      metrics: productLookup.get(rec.productTitle) ?? {
        revenue30d: 0,
        grossProfit30d: 0,
        avgDailyUnits: 0,
        repeatBuyerPct: 0,
        estimatedMargin: 0,
        avgPrice: 0,
        hasImage: false,
        hasDescription: false,
      },
    }));

    return {
      recommendations,
      totalProducts: products.length,
      eligibleCount: products.filter((p) => Number(p.adFitnessScore ?? 0) >= 55).length,
      alreadyAdvertised: existingProductAds.size,
    };
  });

  // ── GET /autopilot/proactive/jobs ──────────────────────────
  app.get('/autopilot/proactive/jobs', {
    schema: {
      tags: ['autopilot'],
      summary: 'List proactive ad jobs',
    },
  }, async (request) => {
    const organizationId = await resolveOrgId(request);

    const jobs = await prisma.proactiveAdJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      jobs: jobs.map((j) => ({
        id: j.id,
        productTitle: j.productTitle,
        productType: j.productType,
        productImageUrl: j.productImageUrl,
        adFitnessScore: Number(j.adFitnessScore),
        status: j.status,
        copyVariants: j.copyVariants,
        imageUrl: j.imageUrl,
        imageSource: j.imageSource,
        testRoundNumber: j.testRoundNumber,
        testStartedAt: j.testStartedAt,
        winnerId: j.winnerId,
        dailyBudget: j.dailyBudget ? Number(j.dailyBudget) : null,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
    };
  });

  // ── POST /autopilot/proactive/generate ───────────────────
  app.post('/autopilot/proactive/generate', {
    schema: {
      tags: ['autopilot'],
      summary: 'Trigger proactive ad pipeline for top products',
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);

    // Rate limit: reject if a proactive job was created < 1 hour ago for this org
    const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000);
    const recentJob = await prisma.proactiveAdJob.findFirst({
      where: { organizationId, createdAt: { gte: ONE_HOUR_AGO } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (recentJob) {
      reply.status(429);
      return { error: 'Rate limited — proactive discovery can only run once per hour per organization' };
    }

    const { runProactiveDiscovery } = await import('../jobs/proactive-ad-pipeline.js');
    const result = await runProactiveDiscovery(organizationId);
    return result;
  });

  // ── GET /autopilot/proactive/jobs/:id ─────────────────────
  app.get<{ Params: { id: string } }>('/autopilot/proactive/jobs/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get single proactive ad job detail',
      params: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const job = await prisma.proactiveAdJob.findFirst({
      where: { id: request.params.id, organizationId },
    });

    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    return {
      id: job.id,
      productTitle: job.productTitle,
      productType: job.productType,
      productImageUrl: job.productImageUrl,
      adFitnessScore: Number(job.adFitnessScore),
      status: job.status,
      copyVariants: job.copyVariants,
      imageHash: job.imageHash,
      imageUrl: job.imageUrl,
      imageSource: job.imageSource,
      metaAdSetId: job.metaAdSetId,
      metaAdIds: job.metaAdIds,
      testRoundNumber: job.testRoundNumber,
      testStartedAt: job.testStartedAt,
      winnerId: job.winnerId,
      dailyBudget: job.dailyBudget ? Number(job.dailyBudget) : null,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  });

  // ── POST /autopilot/proactive/jobs/:id/approve ────────────
  app.post<{ Params: { id: string } }>('/autopilot/proactive/jobs/:id/approve', {
    schema: {
      tags: ['autopilot'],
      summary: 'Approve a proactive job → generate assets + publish to Meta',
      params: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const job = await prisma.proactiveAdJob.findFirst({
      where: { id: request.params.id, organizationId },
    });

    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    // Only PENDING or READY jobs can be approved
    if (!['PENDING', 'READY'].includes(job.status)) {
      reply.status(400);
      return { error: `Cannot approve job with status ${job.status}` };
    }

    try {
      // If PENDING, generate assets first
      if (job.status === 'PENDING') {
        const { generateProactiveAssets } = await import('../jobs/proactive-ad-pipeline.js');
        const genResult = await generateProactiveAssets(job.id);
        if (!genResult.success) {
          // Revert to PENDING so user can retry
          await prisma.proactiveAdJob.update({
            where: { id: job.id },
            data: { status: 'PENDING', errorMessage: genResult.error ?? 'Generation failed' },
          });
          return { success: false, error: `Generation failed: ${genResult.error}` };
        }
      }

      // Mark approved
      await prisma.proactiveAdJob.update({
        where: { id: request.params.id },
        data: { status: 'APPROVED' },
      });

      // Publish to Meta
      const { publishProactiveJob } = await import('../jobs/proactive-ad-pipeline.js');
      const pubResult = await publishProactiveJob(request.params.id);

      if (!pubResult.success) {
        // publishProactiveJob already sets FAILED status with errorMessage
        return { success: false, error: pubResult.error };
      }

      return { success: true };
    } catch (err) {
      // Unexpected error — mark FAILED
      await prisma.proactiveAdJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: (err as Error).message },
      });
      return { success: false, error: (err as Error).message };
    }
  });

  // ── POST /autopilot/proactive/jobs/:id/reject ─────────────
  app.post<{ Params: { id: string } }>('/autopilot/proactive/jobs/:id/reject', {
    schema: {
      tags: ['autopilot'],
      summary: 'Reject a proactive job',
      params: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const job = await prisma.proactiveAdJob.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }

    await prisma.proactiveAdJob.update({
      where: { id: request.params.id },
      data: { status: 'PAUSED' },
    });

    return { success: true };
  });

  // ── POST /autopilot/proactive/jobs/:id/activate ───────────
  app.post<{ Params: { id: string } }>('/autopilot/proactive/jobs/:id/activate', {
    schema: {
      tags: ['autopilot'],
      summary: 'Activate a PUBLISHED job for A/B testing',
      params: { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'] },
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);
    const job = await prisma.proactiveAdJob.findFirst({
      where: { id: request.params.id, organizationId },
    });

    if (!job) {
      reply.status(404);
      return { error: 'Job not found' };
    }
    if (job.status !== 'PUBLISHED') {
      reply.status(400);
      return { error: `Job must be PUBLISHED, got ${job.status}` };
    }

    const metaAdIds = (job.metaAdIds as string[] | null) ?? [];

    // Try to activate ads on Meta
    const cred = await prisma.connectorCredential.findFirst({
      where: { organizationId, connectorType: 'meta' },
      select: { encryptedData: true, iv: true, authTag: true },
    });

    const activatedIds: string[] = [];
    const failedIds: string[] = [];

    if (cred && metaAdIds.length > 0) {
      const { reactivateAd } = await import('../lib/meta-executor.js');
      const decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
      const accessToken = decrypted.accessToken;

      if (accessToken) {
        for (const adId of metaAdIds) {
          const result = await reactivateAd(accessToken, adId);
          if (result.success) {
            activatedIds.push(adId);
          } else {
            failedIds.push(adId);
          }
        }

        // Also activate the ad set
        if (job.metaAdSetId) {
          const { reactivateAd: activateAdSet } = await import('../lib/meta-executor.js');
          await activateAdSet(accessToken, job.metaAdSetId);
        }
      }
    } else {
      // Demo mode — all ads "activated"
      activatedIds.push(...metaAdIds);
    }

    // Set to TESTING
    await prisma.proactiveAdJob.update({
      where: { id: request.params.id },
      data: {
        status: 'TESTING',
        testStartedAt: new Date(),
      },
    });

    return {
      success: true,
      activated: activatedIds.length,
      failed: failedIds.length,
      failedIds: failedIds.length > 0 ? failedIds : undefined,
    };
  });

  // ── Campaign Strategy endpoints ─────────────────────────────

  // GET /autopilot/strategies — List campaign strategies
  app.get('/autopilot/strategies', {
    schema: {
      tags: ['autopilot'],
      summary: 'List campaign strategies',
      description: 'Returns all campaign strategies (AI-suggested multi-product campaigns).',
    },
  }, async (request) => {
    const orgId = await resolveOrgId(request);
    const campaigns = await prisma.campaignStrategy.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    // Convert Prisma Decimal fields to plain numbers for JSON serialization
    const strategies = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      productTitles: c.productTitles as string[],
      productCount: c.productCount,
      dailyBudget: c.dailyBudget != null ? Number(c.dailyBudget) : null,
      totalBudget: c.totalBudget != null ? Number(c.totalBudget) : null,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      targetAudience: c.targetAudience,
      creativeDirection: c.creativeDirection,
      estimatedRoas: c.estimatedRoas != null ? Number(c.estimatedRoas) : null,
      rationale: c.rationale,
      actualSpend: c.actualSpend != null ? Number(c.actualSpend) : null,
      actualRevenue: c.actualRevenue != null ? Number(c.actualRevenue) : null,
      actualRoas: c.actualRoas != null ? Number(c.actualRoas) : null,
      metaCampaignId: c.metaCampaignId ?? null,
      metaAdSetIds: (c.metaAdSetIds as string[] | null) ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { strategies };
  });

  // GET /autopilot/strategies/calendar — Upcoming seasonal events
  app.get('/autopilot/strategies/calendar', {
    schema: {
      tags: ['autopilot'],
      summary: 'Seasonal marketing calendar',
      description: 'Returns upcoming seasonal events within the next 60 days.',
    },
  }, async () => {
    const { getUpcomingEvents } = await import('@growth-os/etl');
    const events = getUpcomingEvents(60);
    return { events };
  });

  // ── Campaign Intelligence Loop (Phase 4) ──────────────────

  // GET /autopilot/strategies/report/:period — Campaign performance report
  app.get('/autopilot/strategies/report/:period', {
    schema: {
      tags: ['autopilot'],
      summary: 'Campaign performance report',
      description: 'Returns a structured performance report for the given period (daily, weekly, monthly).',
    },
  }, async (request, reply) => {
    const orgId = await resolveOrgId(request);
    const { period } = request.params as { period: string };
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      reply.status(400);
      return { error: 'Invalid period. Use daily, weekly, or monthly.' };
    }
    const { generateCampaignReport } = await import('../lib/campaign-reporter.js');
    const report = await generateCampaignReport(orgId, period as 'daily' | 'weekly' | 'monthly');
    return { report };
  });

  // GET /autopilot/strategies/analysis — Weekly marketing analysis
  app.get('/autopilot/strategies/analysis', {
    schema: {
      tags: ['autopilot'],
      summary: 'Weekly marketing analysis',
      description: 'Generates a comprehensive weekly marketing performance analysis with recommendations.',
    },
  }, async (request) => {
    const orgId = await resolveOrgId(request);
    const { runWeeklyMarketingAnalysis } = await import('../jobs/weekly-marketing-analysis.js');
    const analysis = await runWeeklyMarketingAnalysis(orgId);
    return { analysis };
  });

  // GET /autopilot/strategies/:id — Campaign strategy detail
  app.get('/autopilot/strategies/:id', {
    schema: {
      tags: ['autopilot'],
      summary: 'Get campaign strategy detail',
      description: 'Returns a single campaign strategy by ID.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await ensureOrganization();
    const campaign = await prisma.campaignStrategy.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!campaign) {
      reply.status(404);
      return { error: 'Campaign strategy not found' };
    }
    return { campaign };
  });

  // POST /autopilot/strategies/generate — Generate campaign suggestions
  app.post('/autopilot/strategies/generate', {
    schema: {
      tags: ['autopilot'],
      summary: 'Generate campaign suggestions',
      description: 'Analyzes product performance data and generates multi-product campaign suggestions.',
    },
  }, async (request) => {
    const orgId = await resolveOrgId(request);

    // Load product performance data — try org-scoped first, then claim orphans
    let products = await prisma.productPerformance.findMany({
      where: { organizationId: orgId },
      select: {
        productTitle: true, productType: true, adFitnessScore: true,
        revenue30d: true, grossProfit30d: true, estimatedMargin: true,
        avgPrice: true, avgDailyUnits: true, repeatBuyerPct: true,
        imageUrl: true, description: true, productTier: true, revenueTrend: true,
        revenueShare: true, daysSinceFirstSale: true,
        collections: true, tags: true, topCrossSellProducts: true,
      },
    });

    // If no products found with org scope, claim orphaned products (org = null)
    if (products.length === 0) {
      const orphanCount = await prisma.productPerformance.updateMany({
        where: { organizationId: null },
        data: { organizationId: orgId },
      });
      if (orphanCount.count > 0) {
        products = await prisma.productPerformance.findMany({
          where: { organizationId: orgId },
          select: {
            productTitle: true, productType: true, adFitnessScore: true,
            revenue30d: true, grossProfit30d: true, estimatedMargin: true,
            avgPrice: true, avgDailyUnits: true, repeatBuyerPct: true,
            imageUrl: true, description: true, productTier: true, revenueTrend: true,
            revenueShare: true, daysSinceFirstSale: true,
            collections: true, tags: true, topCrossSellProducts: true,
          },
        });
      }
    }

    // If STILL no products, rebuild product performance from stg_orders
    if (products.length === 0) {
      const { buildProductPerformance } = await import('@growth-os/etl');
      await buildProductPerformance(orgId);

      products = await prisma.productPerformance.findMany({
        where: { organizationId: orgId },
        select: {
          productTitle: true, productType: true, adFitnessScore: true,
          revenue30d: true, grossProfit30d: true, estimatedMargin: true,
          avgPrice: true, avgDailyUnits: true, repeatBuyerPct: true,
          imageUrl: true, description: true, productTier: true, revenueTrend: true,
          revenueShare: true, daysSinceFirstSale: true,
          collections: true, tags: true, topCrossSellProducts: true,
        },
      });
    }

    // Get existing active campaign products
    const activeCampaigns = await prisma.campaignStrategy.findMany({
      where: { organizationId: orgId, status: { in: ['ACTIVE', 'APPROVED', 'SUGGESTED'] } },
      select: { productTitles: true },
    });
    const existingProductTitles = new Set<string>();
    for (const c of activeCampaigns) {
      const titles = c.productTitles as string[];
      for (const t of titles) existingProductTitles.add(t);
    }

    // Get budget from autopilot config
    const config = await prisma.autopilotConfig.findUnique({
      where: { organizationId: orgId },
      select: { dailyBudgetCap: true },
    });
    const totalDailyBudget = Number(config?.dailyBudgetCap ?? 100);

    const { generateCampaignSuggestions } = await import('@growth-os/etl');

    // Map products to the input format
    const productsForEngine = products.map((p) => ({
      productTitle: p.productTitle,
      productType: p.productType,
      adFitnessScore: Number(p.adFitnessScore ?? 0),
      revenue30d: Number(p.revenue30d),
      grossProfit30d: Number(p.grossProfit30d),
      estimatedMargin: Number(p.estimatedMargin),
      avgPrice: Number(p.avgPrice),
      avgDailyUnits: Number(p.avgDailyUnits),
      repeatBuyerPct: Number(p.repeatBuyerPct),
      imageUrl: p.imageUrl,
      productTier: p.productTier,
      revenueTrend: p.revenueTrend != null ? Number(p.revenueTrend) : null,
      revenueShare: p.revenueShare != null ? Number(p.revenueShare) : null,
      daysSinceFirstSale: p.daysSinceFirstSale,
      collections: p.collections as string[] | null,
      tags: p.tags as string[] | null,
      topCrossSellProducts: p.topCrossSellProducts as { title: string; coOccurrence: number }[] | null,
    }));

    const suggestions = generateCampaignSuggestions({
      products: productsForEngine,
      totalDailyBudget,
      existingCampaignProductTitles: existingProductTitles,
    });

    // Upsert suggestions into campaign_strategies
    const created: unknown[] = [];
    for (const s of suggestions) {
      const existing = await prisma.campaignStrategy.findFirst({
        where: { organizationId: orgId, name: s.name, status: 'SUGGESTED' },
      });
      if (existing) continue; // Don't duplicate

      const campaign = await prisma.campaignStrategy.create({
        data: {
          organizationId: orgId,
          name: s.name,
          type: s.type,
          status: 'SUGGESTED',
          productTitles: s.productTitles as unknown as Prisma.InputJsonValue,
          productCount: s.productTitles.length,
          dailyBudget: s.dailyBudget,
          estimatedRoas: s.estimatedRoas,
          rationale: s.rationale,
          targetAudience: s.targetAudience,
          creativeDirection: s.creativeDirection,
        },
      });
      created.push(campaign);
    }

    return {
      generated: created.length,
      campaigns: created,
      debug: {
        organizationId: orgId,
        productsFound: products.length,
        suggestionsGenerated: suggestions.length,
        existingCampaignProducts: existingProductTitles.size,
        dailyBudget: totalDailyBudget,
        productScores: productsForEngine.slice(0, 5).map((p) => ({
          title: p.productTitle,
          score: p.adFitnessScore,
          tier: p.productTier,
          hasImage: !!p.imageUrl,
        })),
      },
    };
  });

  // POST /autopilot/strategies/:id/approve — Approve a suggestion
  app.post('/autopilot/strategies/:id/approve', {
    schema: {
      tags: ['autopilot'],
      summary: 'Approve a campaign strategy',
      description: 'Marks a suggested campaign strategy as approved.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await ensureOrganization();
    const existing = await prisma.campaignStrategy.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      reply.status(404);
      return { error: 'Campaign strategy not found' };
    }
    if (existing.status !== 'SUGGESTED') {
      reply.status(400);
      return { error: `Cannot approve strategy with status ${existing.status}, must be SUGGESTED` };
    }
    const campaign = await prisma.campaignStrategy.update({
      where: { id },
      data: { status: 'APPROVED' },
    });
    return { campaign };
  });

  // POST /autopilot/strategies/:id/activate — Create real Meta campaign from approved strategy
  app.post('/autopilot/strategies/:id/activate', {
    schema: {
      tags: ['autopilot'],
      summary: 'Activate a campaign strategy on Meta',
      description: 'Creates a real Meta campaign with ad sets and ads for each product in the strategy.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await ensureOrganization();

    // 1. Validate strategy
    const strategy = await prisma.campaignStrategy.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!strategy) {
      reply.status(404);
      return { error: 'Campaign strategy not found' };
    }
    if (strategy.status !== 'APPROVED') {
      reply.status(400);
      return { error: `Cannot activate strategy with status ${strategy.status}, must be APPROVED` };
    }

    const productTitles = (strategy.productTitles ?? []) as string[];
    if (productTitles.length === 0) {
      reply.status(400);
      return { error: 'Strategy has no products to advertise' };
    }

    const dailyBudget = Number(strategy.dailyBudget ?? 0);
    if (dailyBudget <= 0 || !isFinite(dailyBudget)) {
      reply.status(400);
      return { error: 'Strategy must have a positive daily budget' };
    }

    // 2. Get Meta credentials
    const cred = await prisma.connectorCredential.findFirst({
      where: { organizationId: orgId, connectorType: 'meta_ads' },
      select: { encryptedData: true, iv: true, authTag: true, metadata: true },
    });

    // Also try 'meta' connector type as fallback
    const credFallback = cred ?? await prisma.connectorCredential.findFirst({
      where: { organizationId: orgId, connectorType: 'meta' },
      select: { encryptedData: true, iv: true, authTag: true, metadata: true },
    });

    // 3. Demo mode — no credentials
    if (!credFallback) {
      const demoAdSetIds = productTitles.map((_, i) => `demo_adset_${strategy.id}_${i}`);
      await prisma.campaignStrategy.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          metaCampaignId: `demo_campaign_${strategy.id}`,
          metaAdSetIds: demoAdSetIds,
        },
      });
      return {
        success: true,
        demo: true,
        metaCampaignId: `demo_campaign_${strategy.id}`,
        adSetsCreated: productTitles.length,
        adsCreated: productTitles.length * 3,
      };
    }

    // 4. Decrypt credentials — accessToken is encrypted, adAccountId is in metadata
    let accessToken: string;
    let adAccountId: string;
    let pixelId: string | undefined;
    try {
      const decrypted = JSON.parse(
        decrypt(credFallback.encryptedData, credFallback.iv, credFallback.authTag),
      ) as Record<string, string>;
      accessToken = decrypted.accessToken ?? '';
      const meta = (credFallback.metadata ?? {}) as Record<string, string>;
      adAccountId = (meta.adAccountId ?? '').trim();
      pixelId = (meta.pixelId ?? '').trim() || undefined;
    } catch {
      reply.status(500);
      return { error: 'Failed to decrypt Meta credentials' };
    }

    if (!accessToken || !adAccountId) {
      reply.status(400);
      return { error: 'Meta credentials missing accessToken or adAccountId' };
    }

    // 5. Detect targeting from MetaAdAccount currency + fetch Facebook Page ID
    const { createMetaCampaign, createProactiveAdSet, createAdFromVariant, CURRENCY_COUNTRY_MAP, toSmallestUnit, fetchFacebookPageId } =
      await import('../lib/meta-executor.js');

    const adAccount = await prisma.metaAdAccount.findFirst({
      where: { organizationId: orgId },
      select: { id: true, currency: true },
    });

    const currency = adAccount?.currency ?? 'USD';
    const countryCode = CURRENCY_COUNTRY_MAP[currency] ?? 'US';
    const targeting = { countries: [countryCode], ageMin: 18, ageMax: 65 };

    // Fetch the Facebook Page ID — required for ad creative creation.
    // The page must be connected to the Business Manager / ad account.
    const facebookPageId = await fetchFacebookPageId(accessToken);
    if (!facebookPageId) {
      reply.status(400);
      return { error: 'No Facebook Page found for this access token. Ensure a Facebook Page is connected to your Meta Business account.' };
    }

    // 6. Create Meta Campaign (budget set per ad set, not at campaign level)
    const totalBudgetUnits = toSmallestUnit(dailyBudget, currency);
    const campaignResult = await createMetaCampaign(
      accessToken,
      adAccountId,
      strategy.name,
    );

    if (!campaignResult.success) {
      reply.status(502);
      return { error: `Failed to create Meta campaign: ${campaignResult.error}` };
    }

    const metaCampaignId = String(
      (campaignResult.metaResponse as Record<string, unknown>)?.id ?? '',
    );
    if (!metaCampaignId) {
      reply.status(502);
      return { error: 'Meta campaign created but no ID returned' };
    }

    // 7. Create tracking row for the campaign
    let campaignDbId: string | undefined;
    try {
      const row = await prisma.metaCampaign.create({
        data: {
          campaignId: metaCampaignId,
          name: strategy.name,
          status: 'PAUSED',
          objective: 'OUTCOME_TRAFFIC',
          dailyBudget,
          organizationId: orgId,
          accountId: adAccount?.id ?? '',
        },
      });
      campaignDbId = row.id;
    } catch {
      // Non-fatal: campaign was created on Meta, tracking is best-effort
    }

    // 8. Generate copy + create ad sets + ads for each product
    const { generateProductCopy } = await import('../lib/product-copy-generator.js');

    const perProductBudget = Math.max(
      1, // minimum 1 unit per ad set
      Math.round(totalBudgetUnits / productTitles.length),
    );

    const createdAdSetIds: string[] = [];
    const createdAdIds: string[] = [];
    const errors: string[] = [];

    for (const productTitle of productTitles) {
      // Look up product data for copy generation
      const product = await prisma.productPerformance.findFirst({
        where: { organizationId: orgId, productTitle },
        select: {
          productTitle: true,
          productType: true,
          description: true,
          avgPrice: true,
          estimatedMargin: true,
          repeatBuyerPct: true,
          adFitnessScore: true,
          productUrl: true,
          imageUrl: true,
        },
      });

      // Generate copy variants (3 per product: benefit, pain_point, urgency)
      const copyVariants = await generateProductCopy({
        productTitle,
        productType: product?.productType ?? 'product',
        productDescription: product?.description ?? null,
        avgPrice: Number(product?.avgPrice ?? 0),
        margin: Number(product?.estimatedMargin ?? 0),
        repeatBuyerPct: Number(product?.repeatBuyerPct ?? 0),
        adFitnessScore: Number(product?.adFitnessScore ?? 50),
      });

      // Create ad set for this product
      const adSetResult = await createProactiveAdSet(
        accessToken,
        adAccountId,
        metaCampaignId,
        productTitle,
        perProductBudget,
        targeting,
        pixelId,
      );

      if (!adSetResult.success) {
        errors.push(`Ad set for "${productTitle}": ${adSetResult.error}`);
        continue;
      }

      const metaAdSetId = String(
        (adSetResult.metaResponse as Record<string, unknown>)?.id ?? '',
      );
      if (!metaAdSetId) {
        errors.push(`Ad set for "${productTitle}": no ID returned`);
        continue;
      }

      createdAdSetIds.push(metaAdSetId);

      // Create tracking row for ad set
      let adSetDbId: string | undefined;
      try {
        const row = await prisma.metaAdSet.create({
          data: {
            adSetId: metaAdSetId,
            name: `GrowthOS — ${productTitle}`,
            status: 'PAUSED',
            dailyBudget: perProductBudget,
            organizationId: orgId,
            campaignId: campaignDbId ?? '',
            accountId: adAccount?.id ?? '',
          },
        });
        adSetDbId = row.id;
      } catch {
        // Non-fatal
      }

      // Create ads from copy variants
      for (const variant of copyVariants) {
        const adResult = await createAdFromVariant(accessToken, adAccountId, metaAdSetId, {
          name: `${productTitle} — ${variant.angle}`,
          headline: variant.headline,
          primaryText: variant.primaryText,
          description: variant.description ?? undefined,
          linkUrl: product?.productUrl ?? undefined,
          pageId: facebookPageId,
        });

        if (adResult.success) {
          const adId = String(
            (adResult.metaResponse as Record<string, unknown>)?.adId ?? '',
          );
          if (adId) {
            createdAdIds.push(adId);

            // Create tracking row for ad
            try {
              await prisma.metaAd.create({
                data: {
                  adId,
                  name: `${productTitle} — ${variant.angle}`,
                  status: 'PAUSED',
                  organizationId: orgId,
                  adSetId: adSetDbId ?? '',
                  campaignId: campaignDbId ?? '',
                  accountId: adAccount?.id ?? '',
                },
              });
            } catch {
              // Non-fatal
            }
          }
        } else {
          errors.push(`Ad "${productTitle}/${variant.angle}": ${adResult.error}`);
        }
      }
    }

    // 9. Check results
    if (createdAdSetIds.length === 0) {
      // Total failure — revert status
      reply.status(502);
      return {
        error: errors.length > 0
          ? `Failed to create ad sets: ${errors[0]}`
          : 'Failed to create any ad sets on Meta',
        details: errors,
        metaCampaignId,
      };
    }

    // 10. Update strategy with Meta IDs and set ACTIVE
    await prisma.campaignStrategy.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        metaCampaignId,
        metaAdSetIds: createdAdSetIds,
      },
    });

    return {
      success: true,
      metaCampaignId,
      adSetsCreated: createdAdSetIds.length,
      adsCreated: createdAdIds.length,
      productsTotal: productTitles.length,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    };
  });

  // POST /autopilot/strategies/:id/reject — Reject a suggestion
  app.post('/autopilot/strategies/:id/reject', {
    schema: {
      tags: ['autopilot'],
      summary: 'Reject a campaign strategy',
      description: 'Marks a suggested campaign strategy as rejected.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await ensureOrganization();
    const existing = await prisma.campaignStrategy.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      reply.status(404);
      return { error: 'Campaign strategy not found' };
    }
    if (existing.status !== 'SUGGESTED') {
      reply.status(400);
      return { error: `Cannot reject strategy with status ${existing.status}, must be SUGGESTED` };
    }
    const campaign = await prisma.campaignStrategy.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    return { campaign };
  });

  // POST /autopilot/strategies/:id/pause — Pause an active campaign
  app.post('/autopilot/strategies/:id/pause', {
    schema: {
      tags: ['autopilot'],
      summary: 'Pause a campaign strategy',
      description: 'Pauses an active campaign strategy.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = await ensureOrganization();
    const existing = await prisma.campaignStrategy.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!existing) {
      reply.status(404);
      return { error: 'Campaign strategy not found' };
    }
    if (existing.status !== 'ACTIVE') {
      reply.status(400);
      return { error: `Cannot pause strategy with status ${existing.status}, must be ACTIVE` };
    }
    const campaign = await prisma.campaignStrategy.update({
      where: { id },
      data: { status: 'PAUSED' },
    });
    return { campaign };
  });
}
