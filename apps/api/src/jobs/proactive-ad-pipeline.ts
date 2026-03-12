// ──────────────────────────────────────────────────────────────
// Growth OS — Proactive Ad Pipeline
// Orchestrates the end-to-end flow: discover products → generate
// copy + image → create ads on Meta (PAUSED) → track lifecycle.
// ──────────────────────────────────────────────────────────────

import { prisma, decrypt } from '@growth-os/database';
import { evaluateProactiveRules } from '@growth-os/etl';
import type { ProactiveRulesInput } from '@growth-os/etl';
import { generateProductCopy } from '../lib/product-copy-generator.js';
import { prepareAdImage } from '../lib/ad-image-manager.js';
import { createAdFromVariant, createAdvantagePlusAd, createProactiveAdSet, fetchEligiblePageId, appendUtmParams } from '../lib/meta-executor.js';
import pino from 'pino';

const log = pino({ name: 'proactive-pipeline' });

export interface ProactivePipelineResult {
  jobsCreated: number;
  jobsGenerated: number;
  errors: string[];
}

interface SafetyCheckResult {
  safe: boolean;
  reason?: string;
}

async function validateProactiveSafety(organizationId: string): Promise<SafetyCheckResult> {
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
    select: {
      circuitBreakerTrippedAt: true,
      executionWindowStart: true,
      executionWindowEnd: true,
      executionTimezone: true,
      maxActionsPerDay: true,
      dailyBudgetCap: true,
    },
  });

  if (!config) return { safe: true }; // No config = no restrictions

  // Circuit breaker
  if (config.circuitBreakerTrippedAt) {
    return { safe: false, reason: 'Circuit breaker is active — proactive pipeline paused' };
  }

  // Execution window
  if (config.executionWindowStart != null && config.executionWindowEnd != null) {
    const now = new Date();
    const hour = now.getHours();
    if (hour < config.executionWindowStart || hour >= config.executionWindowEnd) {
      return { safe: false, reason: `Outside execution window (${config.executionWindowStart}:00–${config.executionWindowEnd}:00)` };
    }
  }

  // Daily action limit
  if (config.maxActionsPerDay) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await prisma.proactiveAdJob.count({
      where: { organizationId, createdAt: { gte: todayStart } },
    });
    if (todayCount >= config.maxActionsPerDay) {
      return { safe: false, reason: `Daily action limit reached (${todayCount}/${config.maxActionsPerDay})` };
    }
  }

  // Budget cap check
  if (config.dailyBudgetCap) {
    const activeJobs = await prisma.proactiveAdJob.findMany({
      where: {
        organizationId,
        status: { in: ['PUBLISHED', 'TESTING'] },
        dailyBudget: { not: null },
      },
      select: { dailyBudget: true },
    });
    const totalDailySpend = activeJobs.reduce((sum, j) => sum + Number(j.dailyBudget), 0);
    if (totalDailySpend >= Number(config.dailyBudgetCap)) {
      return { safe: false, reason: `Daily budget cap reached ($${totalDailySpend.toFixed(0)}/$${Number(config.dailyBudgetCap).toFixed(0)})` };
    }
  }

  return { safe: true };
}

/**
 * Discover top products and create ProactiveAdJob records.
 * In suggest/monitor mode: jobs stay PENDING until user approves.
 * In auto mode: jobs automatically advance to GENERATING.
 */
export async function runProactiveDiscovery(
  organizationId: string,
): Promise<ProactivePipelineResult> {
  const result: ProactivePipelineResult = { jobsCreated: 0, jobsGenerated: 0, errors: [] };

  // Check if proactive is enabled
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
    select: {
      proactiveEnabled: true,
      maxProactiveAdsPerMonth: true,
      minAdFitnessScore: true,
      mode: true,
    },
  });

  if (!config?.proactiveEnabled) {
    log.info({ organizationId }, 'Proactive pipeline skipped — not enabled');
    return result;
  }

  // Safety guardrails
  const safety = await validateProactiveSafety(organizationId);
  if (!safety.safe) {
    log.info({ organizationId, reason: safety.reason }, 'Proactive pipeline blocked by safety check');
    return result;
  }

  // Check monthly limit
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyCount = await prisma.proactiveAdJob.count({
    where: {
      organizationId,
      createdAt: { gte: startOfMonth },
    },
  });

  if (monthlyCount >= (config.maxProactiveAdsPerMonth ?? 5)) {
    log.info({ organizationId, monthlyCount }, 'Monthly proactive ad limit reached');
    return result;
  }

  // Check concurrent limit (max 3 active jobs)
  const activeCount = await prisma.proactiveAdJob.count({
    where: {
      organizationId,
      status: { in: ['PENDING', 'GENERATING', 'READY', 'APPROVED', 'PUBLISHED', 'TESTING'] },
    },
  });

  if (activeCount >= 3) {
    log.info({ organizationId, activeCount }, 'Max concurrent proactive jobs reached');
    return result;
  }

  // Get product performance data
  const products = await prisma.productPerformance.findMany({
    where: {
      organizationId,
      adFitnessScore: { gte: config.minAdFitnessScore ?? 60 },
    },
    select: {
      productTitle: true,
      productType: true,
      revenue30d: true,
      grossProfit30d: true,
      avgDailyUnits: true,
      repeatBuyerPct: true,
      estimatedMargin: true,
      avgPrice: true,
      adFitnessScore: true,
      imageUrl: true,
      description: true,
      productTier: true,
      revenueTrend: true,
      revenueShare: true,
    },
    orderBy: { adFitnessScore: 'desc' },
  });

  // Get existing advertised product titles (from MetaAd creative text)
  const existingAds = await prisma.metaAd.findMany({
    where: { organizationId, status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { name: true },
  });

  const existingProductAds = new Set(
    existingAds.map((a) => a.name.toLowerCase()),
  );

  // Get existing ProactiveAdJob product titles
  const existingJobs = await prisma.proactiveAdJob.findMany({
    where: {
      organizationId,
      status: { notIn: ['FAILED', 'PAUSED'] },
    },
    select: { productTitle: true },
  });
  for (const j of existingJobs) {
    existingProductAds.add(j.productTitle.toLowerCase());
  }

  // Evaluate proactive rules
  const input: ProactiveRulesInput = {
    products: products.map((p) => ({
      productTitle: p.productTitle,
      productType: p.productType,
      revenue30d: Number(p.revenue30d),
      grossProfit30d: Number(p.grossProfit30d),
      avgDailyUnits: Number(p.avgDailyUnits),
      estimatedMargin: Number(p.estimatedMargin),
      avgPrice: Number(p.avgPrice),
      repeatBuyerPct: Number(p.repeatBuyerPct),
      adFitnessScore: Number(p.adFitnessScore),
      imageUrl: p.imageUrl,
      productTier: p.productTier ?? null,
      revenueTrend: p.revenueTrend != null ? Number(p.revenueTrend) : null,
      revenueShare: p.revenueShare != null ? Number(p.revenueShare) : null,
    })),
    existingProductAds,
    maxRecommendations: 3 - activeCount,
  };

  const recommendations = evaluateProactiveRules(input);

  // Create ProactiveAdJob records
  const slotsAvailable = (config.maxProactiveAdsPerMonth ?? 5) - monthlyCount;
  const toCreate = recommendations.slice(0, slotsAvailable);

  for (const rec of toCreate) {
    const product = products.find(
      (p) => p.productTitle === rec.productTitle && p.productType === rec.productType,
    );

    try {
      await prisma.proactiveAdJob.create({
        data: {
          organizationId,
          productTitle: rec.productTitle,
          productType: rec.productType,
          productImageUrl: product?.imageUrl ?? null,
          adFitnessScore: rec.adFitnessScore,
          status: 'PENDING',
        },
      });
      result.jobsCreated++;
    } catch (err) {
      result.errors.push(`Failed to create job for ${rec.productTitle}: ${(err as Error).message}`);
    }
  }

  log.info({ organizationId, jobsCreated: result.jobsCreated }, 'Proactive discovery complete');
  return result;
}

/**
 * Generate copy variants and prepare images for a ProactiveAdJob.
 * Transitions: PENDING → GENERATING → READY (or FAILED).
 */
export async function generateProactiveAssets(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const job = await prisma.proactiveAdJob.findUnique({
    where: { id: jobId },
    include: { organization: { select: { id: true } } },
  });

  if (!job) return { success: false, error: 'Job not found' };
  if (job.status !== 'PENDING' && job.status !== 'GENERATING') {
    return { success: false, error: `Job in invalid state: ${job.status}` };
  }

  // Mark as GENERATING
  await prisma.proactiveAdJob.update({
    where: { id: jobId },
    data: { status: 'GENERATING' },
  });

  try {
    // Get product data for copy generation
    const product = await prisma.productPerformance.findFirst({
      where: {
        organizationId: job.organizationId,
        productTitle: job.productTitle,
        productType: job.productType,
      },
    });

    // Generate copy variants
    const copyVariants = await generateProductCopy({
      productTitle: job.productTitle,
      productType: job.productType,
      productDescription: product?.description ?? null,
      avgPrice: Number(product?.avgPrice ?? 0),
      margin: Number(product?.estimatedMargin ?? 0),
      repeatBuyerPct: Number(product?.repeatBuyerPct ?? 0),
      adFitnessScore: Number(job.adFitnessScore),
    });

    // Get config for AI images setting
    const config = await prisma.autopilotConfig.findUnique({
      where: { organizationId: job.organizationId },
      select: { useAIImages: true },
    });

    // Get Meta credentials
    const cred = await prisma.connectorCredential.findFirst({
      where: { organizationId: job.organizationId, connectorType: 'meta' },
      select: { encryptedData: true, iv: true, authTag: true },
    });

    let accessToken: string | null = null;
    let adAccountId: string | null = null;
    if (cred) {
      const decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
      accessToken = decrypted.accessToken ?? null;
      adAccountId = decrypted.adAccountId ?? null;
    }

    // Prepare image
    const imageResult = await prepareAdImage(
      accessToken,
      adAccountId,
      job.productImageUrl,
      job.productTitle,
      job.productType,
      product?.description ?? null,
      config?.useAIImages ?? false,
    );

    // Update job with generated assets
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: {
        status: 'READY',
        copyVariants: JSON.parse(JSON.stringify(copyVariants)),
        imageHash: imageResult.imageHash ?? null,
        imageUrl: imageResult.imageUrl ?? job.productImageUrl,
        imageSource: imageResult.source,
      },
    });

    log.info({ jobId, variants: copyVariants.length }, 'Proactive assets generated');
    return { success: true };
  } catch (err) {
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
      },
    });
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Publish a READY/APPROVED ProactiveAdJob to Meta as PAUSED ads.
 * Creates one ad set + 3 ads (one per copy variant).
 */
export async function publishProactiveJob(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const job = await prisma.proactiveAdJob.findUnique({ where: { id: jobId } });

  if (!job) return { success: false, error: 'Job not found' };
  if (job.status !== 'READY' && job.status !== 'APPROVED') {
    return { success: false, error: `Job must be READY or APPROVED, got ${job.status}` };
  }

  const copyVariants = job.copyVariants as Array<{
    angle: string;
    headline: string;
    primaryText: string;
    description: string | null;
  }> | null;

  if (!copyVariants || copyVariants.length === 0) {
    return { success: false, error: 'No copy variants to publish' };
  }

  // Safety check
  const safety = await validateProactiveSafety(job.organizationId);
  if (!safety.safe) {
    return { success: false, error: `Safety check failed: ${safety.reason}` };
  }

  // Read budget from config
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId: job.organizationId },
    select: { proactiveDefaultBudget: true },
  });

  const budgetDollars = Number(config?.proactiveDefaultBudget ?? 0);
  if (budgetDollars <= 0 || !isFinite(budgetDollars)) {
    return { success: false, error: 'Proactive default budget not configured. Set it in Autopilot Settings.' };
  }
  const budgetCents = Math.round(budgetDollars * 100);
  if (!Number.isInteger(budgetCents) || budgetCents <= 0) {
    return { success: false, error: 'Invalid budget value after conversion' };
  }

  // Get Meta credentials
  const cred = await prisma.connectorCredential.findFirst({
    where: { organizationId: job.organizationId, connectorType: 'meta' },
    select: { encryptedData: true, iv: true, authTag: true },
  });

  if (!cred) {
    // Demo mode: simulate publication
    const demoAdIds = copyVariants.map((_, i) => `demo_ad_${job.id}_${i}`);
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: {
        status: 'PUBLISHED',
        metaAdSetId: `demo_adset_${job.id}`,
        metaAdIds: demoAdIds,
        dailyBudget: budgetDollars,
      },
    });
    return { success: true };
  }

  const decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
  const accessToken = decrypted.accessToken;
  const adAccountId = decrypted.adAccountId;

  if (!accessToken || !adAccountId) {
    return { success: false, error: 'Missing Meta access token or account ID' };
  }

  // Fetch an eligible Facebook Page for ad creatives
  const eligiblePage = await fetchEligiblePageId(accessToken, adAccountId);
  if (!eligiblePage) {
    return { success: false, error: 'No Facebook Page eligible for advertising found. Ensure a Facebook Page is connected to your Meta Business account.' };
  }
  const facebookPageId = eligiblePage.pageId;
  log.info({ pageId: facebookPageId, pageName: eligiblePage.pageName }, 'Using Facebook Page for proactive ads');

  // Find an active campaign
  const campaign = await prisma.metaCampaign.findFirst({
    where: { organizationId: job.organizationId, status: 'ACTIVE' },
    select: { id: true, campaignId: true },
  });

  if (!campaign) {
    return { success: false, error: 'No active Meta campaign found. Create one in Meta Ads Manager first.' };
  }

  // Find the MetaAdAccount internal ID for FK
  const adAccount = await prisma.metaAdAccount.findFirst({
    where: { organizationId: job.organizationId },
    select: { id: true },
  });

  // 4.1: Create a dedicated ad set with budget
  const adSetResult = await createProactiveAdSet(
    accessToken,
    adAccountId,
    campaign.campaignId,
    job.productTitle,
    budgetCents,
  );

  if (!adSetResult.success) {
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: `Ad set creation failed: ${adSetResult.error}` },
    });
    return { success: false, error: adSetResult.error };
  }

  const metaAdSetId = String((adSetResult.metaResponse as Record<string, unknown>)?.id ?? '');
  if (!metaAdSetId) {
    return { success: false, error: 'Ad set created but no ID returned' };
  }

  // Create MetaAdSet row for tracking
  let adSetDbId: string | undefined;
  try {
    const adSetRow = await prisma.metaAdSet.create({
      data: {
        adSetId: metaAdSetId,
        name: `GrowthOS Proactive — ${job.productTitle}`,
        status: 'PAUSED',
        dailyBudget: budgetCents,
        organizationId: job.organizationId,
        campaignId: campaign.id,
        accountId: adAccount?.id ?? '',
      },
    });
    adSetDbId = adSetRow.id;
  } catch {
    // Non-fatal: FK tracking is best-effort
  }

  // Get product URL for the link
  const product = await prisma.productPerformance.findFirst({
    where: { organizationId: job.organizationId, productTitle: job.productTitle },
    select: { productUrl: true, productHandle: true },
  });

  const productLinkUrl = product?.productUrl ?? undefined;
  if (!productLinkUrl) {
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'No product URL available. Ensure the product has a URL in Shopify.' },
    });
    return { success: false, error: 'No product URL available' };
  }

  if (!job.imageHash) {
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'No product image available. Upload images in Shopify.' },
    });
    return { success: false, error: 'No product image available' };
  }

  const utmCampaign = job.productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const linkWithUtm = appendUtmParams(productLinkUrl, {
    source: 'meta',
    medium: 'paid_social',
    campaign: utmCampaign,
  });

  const metaAdIds: string[] = [];

  // Try Advantage+ Creative first (1 ad with all copy variants)
  const advantageResult = await createAdvantagePlusAd(accessToken, adAccountId, metaAdSetId, {
    name: job.productTitle,
    headlines: copyVariants.map(v => v.headline),
    primaryTexts: copyVariants.map(v => v.primaryText),
    descriptions: copyVariants.map(v => v.description).filter((d): d is string => !!d),
    imageHashes: [job.imageHash],
    linkUrl: linkWithUtm,
    pageId: facebookPageId,
  });

  if (advantageResult.success) {
    const adId = (advantageResult.metaResponse as Record<string, unknown>)?.adId;
    if (typeof adId === 'string') {
      metaAdIds.push(adId);
      try {
        await prisma.metaAd.create({
          data: {
            adId,
            name: `${job.productTitle} — Advantage+ Creative`,
            status: 'PAUSED',
            organizationId: job.organizationId,
            adSetId: adSetDbId ?? '',
            campaignId: campaign.id,
            accountId: adAccount?.id ?? '',
          },
        });
      } catch {
        log.warn({ adId, jobId }, 'Failed to create MetaAd tracking row');
      }
    }
  } else {
    // Fallback: create individual ads per variant
    log.warn({ jobId, error: advantageResult.error }, 'Advantage+ failed, falling back to individual ads');

    for (const variant of copyVariants) {
      const variantLink = appendUtmParams(productLinkUrl, {
        source: 'meta',
        medium: 'paid_social',
        campaign: utmCampaign,
        content: variant.angle,
      });

      const result = await createAdFromVariant(accessToken, adAccountId, metaAdSetId, {
        name: `${job.productTitle} — ${variant.angle}`,
        headline: variant.headline,
        primaryText: variant.primaryText,
        description: variant.description ?? undefined,
        imageHash: job.imageHash,
        linkUrl: variantLink,
        pageId: facebookPageId,
      });

      if (result.success) {
        const adId = (result.metaResponse as Record<string, unknown>)?.adId;
        if (typeof adId === 'string') {
          metaAdIds.push(adId);
          try {
            await prisma.metaAd.create({
              data: {
                adId,
                name: `${job.productTitle} — ${variant.angle}`,
                status: 'PAUSED',
                organizationId: job.organizationId,
                adSetId: adSetDbId ?? '',
                campaignId: campaign.id,
                accountId: adAccount?.id ?? '',
              },
            });
          } catch {
            log.warn({ adId, jobId }, 'Failed to create MetaAd tracking row');
          }
        }
      }
    }
  }

  if (metaAdIds.length === 0) {
    await prisma.proactiveAdJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'All ad creations failed on Meta' },
    });
    return { success: false, error: 'All ad creations failed on Meta' };
  }

  await prisma.proactiveAdJob.update({
    where: { id: jobId },
    data: {
      status: 'PUBLISHED',
      metaAdSetId,
      metaAdIds,
      dailyBudget: budgetDollars,
    },
  });

  log.info({ jobId, adSetId: metaAdSetId, adCount: metaAdIds.length }, 'Proactive job published to Meta');
  return { success: true };
}

// ── A/B Loop ──────────────────────────────────────────────────

export interface ABLoopResult {
  jobsEvaluated: number;
  winnersFound: number;
  jobsPaused: number;
  errors: string[];
}

/**
 * Run the A/B evaluation loop for all TESTING ProactiveAdJobs.
 * Called periodically from the scheduler.
 */
export async function runProactiveABLoop(
  organizationId: string,
): Promise<ABLoopResult> {
  const { evaluateProductABTest } = await import('../lib/proactive-ab-engine.js');
  const { pauseAd } = await import('../lib/meta-executor.js');
  const result: ABLoopResult = { jobsEvaluated: 0, winnersFound: 0, jobsPaused: 0, errors: [] };

  const testingJobs = await prisma.proactiveAdJob.findMany({
    where: { organizationId, status: 'TESTING' },
  });

  if (testingJobs.length === 0) return result;

  // Get Meta credentials once
  const cred = await prisma.connectorCredential.findFirst({
    where: { organizationId, connectorType: 'meta' },
    select: { encryptedData: true, iv: true, authTag: true },
  });

  let accessToken: string | null = null;
  if (cred) {
    const decrypted = JSON.parse(decrypt(cred.encryptedData, cred.iv, cred.authTag)) as Record<string, string>;
    accessToken = decrypted.accessToken ?? null;
  }

  // Get config for test round limits
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
    select: { maxTestRounds: true },
  });
  const maxTestRounds = config?.maxTestRounds ?? 3;

  for (const job of testingJobs) {
    result.jobsEvaluated++;
    const metaAdIds = (job.metaAdIds as string[] | null) ?? [];
    const copyVariants = (job.copyVariants as Array<{ angle: string }> | null) ?? [];

    if (metaAdIds.length === 0) continue;

    // Get performance for each ad from MetaAd table
    const adPerformances = await prisma.metaAd.findMany({
      where: { adId: { in: metaAdIds } },
      select: {
        adId: true,
        spend7d: true,
        impressions7d: true,
        clicks7d: true,
        conversions7d: true,
        revenue7d: true,
      },
    });

    const daysActive = job.testStartedAt
      ? Math.floor((Date.now() - new Date(job.testStartedAt).getTime()) / 86_400_000)
      : 0;

    const variants = metaAdIds.map((adId, i) => {
      const perf = adPerformances.find((a) => a.adId === adId);
      return {
        variantIndex: i,
        angle: copyVariants[i]?.angle ?? `variant_${i}`,
        spend: Number(perf?.spend7d ?? 0),
        impressions: perf?.impressions7d ?? 0,
        clicks: perf?.clicks7d ?? 0,
        conversions: perf?.conversions7d ?? 0,
        revenue: Number(perf?.revenue7d ?? 0),
        daysActive,
      };
    });

    const decision = evaluateProductABTest(variants);

    switch (decision.type) {
      case 'insufficient_data':
      case 'no_winner_yet':
        // Continue testing
        break;

      case 'winner_found':
      case 'forced_winner': {
        result.winnersFound++;
        const winnerAdId = metaAdIds[decision.winnerIndex];

        // Pause losing variants
        for (const loserIdx of decision.loserIndices) {
          const loserId = metaAdIds[loserIdx];
          if (loserId && accessToken) {
            await pauseAd(accessToken, loserId);
          }
        }

        await prisma.proactiveAdJob.update({
          where: { id: job.id },
          data: {
            status: 'WINNER',
            winnerId: winnerAdId,
          },
        });

        log.info({ jobId: job.id, winnerAdId, reason: decision.reason }, 'Proactive A/B winner found');

        // Check if we should iterate (more test rounds)
        if (job.testRoundNumber < maxTestRounds) {
          log.info({ jobId: job.id, round: job.testRoundNumber + 1 }, 'Scheduling next test round');
          // Create a new job for the next round
          await prisma.proactiveAdJob.create({
            data: {
              organizationId: job.organizationId,
              productTitle: job.productTitle,
              productType: job.productType,
              productImageUrl: job.productImageUrl,
              adFitnessScore: job.adFitnessScore,
              status: 'PENDING',
              testRoundNumber: job.testRoundNumber + 1,
            },
          });
        }
        break;
      }

      case 'all_poor': {
        result.jobsPaused++;

        // Pause all variants
        for (const adId of metaAdIds) {
          if (accessToken) {
            await pauseAd(accessToken, adId);
          }
        }

        await prisma.proactiveAdJob.update({
          where: { id: job.id },
          data: { status: 'PAUSED' },
        });

        // Lower product's fitness score by 20 (penalty for poor ad performance)
        await prisma.productPerformance.updateMany({
          where: {
            organizationId: job.organizationId,
            productTitle: job.productTitle,
          },
          data: {
            adFitnessScore: { decrement: 20 },
          },
        });

        log.info({ jobId: job.id, reason: decision.reason }, 'Proactive A/B — all variants poor, pausing');
        break;
      }
    }
  }

  return result;
}
