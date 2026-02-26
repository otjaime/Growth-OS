// ──────────────────────────────────────────────────────────────
// Growth OS — Autopilot Routes
// Endpoints for Meta ad-level data, syncing, and campaign views
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma, DiagnosisStatus, decrypt, isDemoMode } from '@growth-os/database';
import { orgWhere, getOrgId } from '../lib/tenant.js';
import { syncMetaAds } from '../jobs/sync-meta-ads.js';
import { runDiagnosis } from '../jobs/run-diagnosis.js';
import { generateCopyVariants } from '../lib/copy-generator.js';
import { requirePlan, PlanError } from '../lib/plan-guard.js';
import { executeAction } from '../jobs/execute-action.js';
import { isAIConfigured } from '../lib/ai.js';

/**
 * Resolve the organizationId from the request, falling back to the first
 * available organization in demo mode (needed for Bearer auth / no-auth dev).
 */
async function resolveOrgId(request: { organizationId?: string }): Promise<string | null> {
  if (request.organizationId) return request.organizationId;

  // In demo mode, fall back to the first organization
  const demo = await isDemoMode();
  if (demo) {
    const org = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    return org?.id ?? null;
  }

  return null;
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

    const where: Record<string, unknown> = { ...orgWhere(request) };
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
      where: { id, ...orgWhere(request) },
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
      where: orgWhere(request),
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
    if (!organizationId) {
      reply.status(400);
      return { error: 'Organization context required. Ensure you are logged in or running in demo mode.' };
    }

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

      return { ...result, jobRunId: jobRun.id };
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
    const where = orgWhere(request);

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

    const where: Record<string, unknown> = { ...orgWhere(request) };
    if (status) where.status = status.toUpperCase();
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
    const where = { ...orgWhere(request), status: 'PENDING' as const };

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
      where: { id, ...orgWhere(request) },
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
      where: { id, ...orgWhere(request) },
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
    if (!organizationId) {
      reply.status(400);
      return { error: 'Organization context required. Ensure you are logged in or running in demo mode.' };
    }

    const result = await runDiagnosis(organizationId);
    return result;
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
    if (!organizationId) {
      reply.status(400);
      return { error: 'Organization context required. Ensure you are logged in or running in demo mode.' };
    }

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
    if (!organizationId) {
      reply.status(400);
      return { error: 'Organization context required. Ensure you are logged in or running in demo mode.' };
    }

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
      where: { id, ...orgWhere(request) },
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

    const where = {
      ...orgWhere(request),
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
}
