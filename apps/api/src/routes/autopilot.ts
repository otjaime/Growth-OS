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
import { requirePlan, PlanError } from '../lib/plan-guard.js';
import { executeAction } from '../jobs/execute-action.js';
import { generateDiagnosisInsight, generateRuleBasedInsight } from '../lib/autopilot-analyzer.js';
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
      description: 'Manually triggers a sync of Meta ad-level data for the current organization.',
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);

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
      const diagResult = await runDiagnosis(organizationId);
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

    const [accountCount, campaignCount, adSetCount, adCount, activeAdCount] = await Promise.all([
      prisma.metaAdAccount.count({ where }),
      prisma.metaCampaign.count({ where }),
      prisma.metaAdSet.count({ where }),
      prisma.metaAd.count({ where }),
      prisma.metaAd.count({ where: { ...where, status: 'ACTIVE' } }),
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

    return {
      accounts: accountCount,
      campaigns: campaignCount,
      adSets: adSetCount,
      totalAds: adCount,
      activeAds: activeAdCount,
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

    return updated;
  });

  // ── POST /autopilot/run-diagnosis — trigger diagnosis run ──
  app.post('/autopilot/run-diagnosis', {
    schema: {
      tags: ['autopilot'],
      summary: 'Run diagnosis engine',
      description: 'Evaluates all diagnosis rules against current ad data for the organization.',
    },
  }, async (request, reply) => {
    const organizationId = await resolveOrgId(request);

    const result = await runDiagnosis(organizationId);
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
    const analyzerInput = {
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
      description: 'Uses AI to generate 3 copy variants (benefit, pain_point, urgency) for a diagnosis. Requires STARTER plan or higher.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    // Plan gate: STARTER+
    try {
      await requirePlan(organizationId, 'STARTER');
    } catch (err) {
      if (err instanceof PlanError) {
        reply.status(403);
        return { error: err.message };
      }
      throw err;
    }

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

  // ── POST /autopilot/diagnoses/:id/approve — approve + execute ─
  app.post('/autopilot/diagnoses/:id/approve', {
    schema: {
      tags: ['autopilot'],
      summary: 'Approve and execute diagnosis',
      description: 'Validates PENDING status, checks plan, marks APPROVED, then queues execution via Meta API. Requires STARTER plan or higher.',
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const organizationId = await resolveOrgId(request);

    // Plan gate: STARTER+
    try {
      await requirePlan(organizationId, 'STARTER');
    } catch (err) {
      if (err instanceof PlanError) {
        reply.status(403);
        return { error: err.message };
      }
      throw err;
    }

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

  // ── GET /autopilot/diagnoses/:id/status — SSE execution stream ─
  app.get('/autopilot/diagnoses/:id/status', {
    schema: {
      tags: ['autopilot'],
      summary: 'Diagnosis execution status (SSE)',
      description: 'Server-Sent Events stream for real-time execution status updates.',
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

    // If already in a terminal state, return immediately (no SSE needed)
    if (['EXECUTED', 'DISMISSED', 'EXPIRED'].includes(diagnosis.status)) {
      return {
        status: diagnosis.status,
        executedAt: diagnosis.executedAt,
        executionResult: diagnosis.executionResult,
      };
    }

    // SSE stream for PENDING/APPROVED states
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:3000',
    });

    // Send initial status
    reply.raw.write(`data: ${JSON.stringify({ status: diagnosis.status, actionType: diagnosis.actionType })}\n\n`);

    // Poll for status changes (check every 2 seconds, up to 60s)
    let lastStatus = diagnosis.status;
    const maxPolls = 30;
    let polls = 0;

    const pollInterval = setInterval(async () => {
      polls++;
      try {
        const current = await prisma.diagnosis.findUnique({
          where: { id },
          select: { status: true, executedAt: true, executionResult: true },
        });

        if (!current) {
          reply.raw.write(`data: ${JSON.stringify({ error: 'Diagnosis not found' })}\n\n`);
          clearInterval(pollInterval);
          reply.raw.end();
          return;
        }

        if (current.status !== lastStatus) {
          lastStatus = current.status;
          reply.raw.write(`data: ${JSON.stringify({
            status: current.status,
            executedAt: current.executedAt,
            executionResult: current.executionResult,
          })}\n\n`);
        }

        // Terminal state or timeout
        if (['EXECUTED', 'DISMISSED', 'EXPIRED'].includes(current.status) || polls >= maxPolls) {
          reply.raw.write(`data: ${JSON.stringify({ done: true, status: current.status })}\n\n`);
          clearInterval(pollInterval);
          reply.raw.end();
        }
      } catch (err) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'Status check failed' })}\n\n`);
        clearInterval(pollInterval);
        reply.raw.end();
      }
    }, 2000);

    // Clean up on client disconnect
    request.raw.on('close', () => {
      clearInterval(pollInterval);
    });
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
      minSpendBeforeAction: config.minSpendBeforeAction.toNumber(),
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
    if (body.minSpendBeforeAction !== undefined) {
      const v = safeNumber(body.minSpendBeforeAction);
      data.minSpendBeforeAction = v !== null ? Math.max(0, v) : 0;
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
      minSpendBeforeAction: updated.minSpendBeforeAction.toNumber(),
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
}
