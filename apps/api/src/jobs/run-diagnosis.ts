// ──────────────────────────────────────────────────────────────
// Growth OS — Diagnosis Runner Job
// Fetches active MetaAd records for an org, runs diagnosis rules,
// upserts Diagnosis records (dedup by [orgId, adId, ruleId]),
// and expires stale PENDING diagnoses older than 72h.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import {
  evaluateDiagnosisRules,
  detectAnomalies,
  analyzeCreativeDecay,
  optimizeBudgetAllocation,
  computeDynamicThresholds,
  scoreCampaignHealth,
} from '@growth-os/etl';
import type {
  DiagnosisRuleInput,
  DiagnosisRuleConfig,
  MetricSeries,
  DailySnapshot,
  AdSetMetrics,
  AdMetricsForThresholds,
  AnomalyResult,
  CreativeDecayAnalysis,
  BudgetAllocation,
  PortfolioOptimization,
  CampaignMetrics,
  CampaignHealthScore,
} from '@growth-os/etl';
import { autoExecutePending } from './auto-execute.js';
import type { AutoExecuteResult } from './auto-execute.js';
import { evaluateCircuitBreaker } from './circuit-breaker.js';
import {
  sendAutopilotPendingToSlack,
  sendAutopilotActionsToSlack,
} from '../lib/slack.js';
import { autoAdjustThresholds } from '../lib/rule-tuner.js';
import type { RuleOverrides } from '../lib/rule-tuner.js';
import { enrichDiagnosis } from './enrich-diagnosis.js';
import type { DiagnosisEnrichment } from './enrich-diagnosis.js';
import { computeForecastBudgetContext } from './forecast-aware-budget.js';
import type { ForecastBudgetContext } from './forecast-aware-budget.js';

export interface RunDiagnosisResult {
  adsEvaluated: number;
  diagnosesCreated: number;
  diagnosesUpdated: number;
  diagnosesExpired: number;
  durationMs: number;
  autoActions?: AutoExecuteResult;
}

export interface RunDiagnosisOptions {
  /** Skip cooldown check — recycle ALL executed/expired diagnoses immediately. */
  force?: boolean;
}

export async function runDiagnosis(
  organizationId: string,
  options?: RunDiagnosisOptions,
): Promise<RunDiagnosisResult> {
  const start = Date.now();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h from now

  // Load autopilot config for dynamic thresholds
  const autopilotConfig = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
  });

  // Phase 1.4: Auto-adjust thresholds from feedback patterns before evaluating rules
  let ruleOverrides: RuleOverrides = {};
  if (autopilotConfig) {
    try {
      const adjustResult = await autoAdjustThresholds(organizationId);
      ruleOverrides = adjustResult.overrides;
      if (adjustResult.adjustments.length > 0) {
        console.info(
          `[runDiagnosis] Rule tuner adjustments: ${adjustResult.adjustments.join('; ')}`,
        );
      }
    } catch (err) {
      // Rule tuner failure must not crash the diagnosis run
      console.error('[runDiagnosis] Rule tuner failed:', err);
      ruleOverrides = (autopilotConfig.ruleOverrides as RuleOverrides | null) ?? {};
    }
  }

  const ruleConfig: DiagnosisRuleConfig | undefined = autopilotConfig ? {
    targetRoas: ruleOverrides.targetRoas ?? autopilotConfig.targetRoas?.toNumber(),
    topPerformerRoas: ruleOverrides.topPerformerRoas,
    maxFrequency: ruleOverrides.maxFrequency,
    minCtr: ruleOverrides.minCtr,
  } : undefined;

  // 1. Fetch all MetaAd records for this org (active + paused for rule 8)
  const ads = await prisma.metaAd.findMany({
    where: { organizationId },
    include: {
      adSet: { select: { id: true, name: true, dailyBudget: true } },
      campaign: { select: { name: true } },
    },
  });

  // ── Intelligence Layer: batch-load snapshots & pre-compute signals ──

  // Phase 1.1 & 1.3: Load last 30 days of MetaAdSnapshot for anomaly + decay analysis
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const adIds = ads.map((a) => a.id);
  const snapshots = adIds.length > 0
    ? await prisma.metaAdSnapshot.findMany({
        where: {
          organizationId,
          adId: { in: adIds },
          date: { gte: thirtyDaysAgo },
        },
        select: {
          adId: true,
          date: true,
          spend: true,
          revenue: true,
          roas: true,
          ctr: true,
          cpc: true,
          impressions: true,
          frequency: true,
        },
        orderBy: { date: 'asc' },
      })
    : [];

  // Group snapshots by adId
  const snapshotsByAd = new Map<string, typeof snapshots>();
  for (const snap of snapshots) {
    const group = snapshotsByAd.get(snap.adId) ?? [];
    group.push(snap);
    snapshotsByAd.set(snap.adId, group);
  }

  // Phase 1.1: Pre-compute anomaly scores per ad (requires ≥14 snapshots)
  const anomalyByAd = new Map<string, AnomalyResult[]>();
  for (const ad of ads) {
    const adSnaps = snapshotsByAd.get(ad.id);
    if (!adSnaps || adSnaps.length < 14) continue;

    const roasSeries: MetricSeries = {
      metric: 'roas',
      values: adSnaps.map((s) => s.roas?.toNumber() ?? NaN),
    };
    const ctrSeries: MetricSeries = {
      metric: 'ctr',
      values: adSnaps.map((s) => s.ctr?.toNumber() ?? NaN),
    };
    const cpcSeries: MetricSeries = {
      metric: 'cpc',
      values: adSnaps.map((s) => s.cpc?.toNumber() ?? NaN),
    };

    const currentValues: Record<string, number> = {};
    if (ad.roas7d !== null) currentValues['roas'] = ad.roas7d.toNumber();
    if (ad.ctr7d !== null) currentValues['ctr'] = ad.ctr7d.toNumber();
    if (ad.cpc7d !== null) currentValues['cpc'] = ad.cpc7d.toNumber();

    if (Object.keys(currentValues).length > 0) {
      const anomalies = detectAnomalies(
        [roasSeries, ctrSeries, cpcSeries],
        currentValues,
      );
      if (anomalies.length > 0) {
        anomalyByAd.set(ad.id, anomalies);
      }
    }
  }

  // Phase 1.3: Pre-compute creative decay per ad (requires ≥7 snapshots)
  const decayByAd = new Map<string, CreativeDecayAnalysis>();
  for (const ad of ads) {
    const adSnaps = snapshotsByAd.get(ad.id);
    if (!adSnaps || adSnaps.length < 7) continue;

    const dailySnapshots: DailySnapshot[] = adSnaps.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      spend: s.spend.toNumber(),
      revenue: s.revenue.toNumber(),
      roas: s.roas?.toNumber() ?? null,
      ctr: s.ctr?.toNumber() ?? null,
      impressions: s.impressions,
      frequency: s.frequency?.toNumber() ?? null,
    }));

    const decay = analyzeCreativeDecay(
      ad.id,
      ad.name,
      dailySnapshots,
      ad.roas7d?.toNumber() ?? null,
    );
    decayByAd.set(ad.id, decay);
  }

  // Phase 1.2: Pre-compute portfolio optimization by aggregating ads → ad sets
  const adSetAggregates = new Map<string, {
    adSetId: string;
    adSetName: string;
    currentDailyBudget: number;
    spend7d: number;
    revenue7d: number;
    impressions7d: number;
    clicks7d: number;
    conversions7d: number;
    frequency7dSum: number;
    frequency7dCount: number;
  }>();

  for (const ad of ads) {
    if (!ad.adSet) continue;
    const setId = ad.adSet.id;
    const agg = adSetAggregates.get(setId) ?? {
      adSetId: setId,
      adSetName: ad.adSet.name ?? setId,
      currentDailyBudget: ad.adSet.dailyBudget?.toNumber() ?? 0,
      spend7d: 0,
      revenue7d: 0,
      impressions7d: 0,
      clicks7d: 0,
      conversions7d: 0,
      frequency7dSum: 0,
      frequency7dCount: 0,
    };
    agg.spend7d += ad.spend7d?.toNumber() ?? 0;
    agg.revenue7d += ad.revenue7d?.toNumber() ?? 0;
    agg.impressions7d += ad.impressions7d ?? 0;
    agg.clicks7d += ad.clicks7d ?? 0;
    agg.conversions7d += ad.conversions7d ?? 0;
    if (ad.frequency7d !== null) {
      agg.frequency7dSum += ad.frequency7d.toNumber();
      agg.frequency7dCount++;
    }
    adSetAggregates.set(setId, agg);
  }

  const adSetMetricsList: AdSetMetrics[] = Array.from(adSetAggregates.values()).map((agg) => ({
    adSetId: agg.adSetId,
    adSetName: agg.adSetName,
    currentDailyBudget: agg.currentDailyBudget,
    spend7d: agg.spend7d,
    revenue7d: agg.revenue7d,
    roas7d: agg.spend7d > 0 ? agg.revenue7d / agg.spend7d : null,
    impressions7d: agg.impressions7d,
    clicks7d: agg.clicks7d,
    conversions7d: agg.conversions7d,
    frequency7d: agg.frequency7dCount > 0 ? agg.frequency7dSum / agg.frequency7dCount : null,
  }));

  let portfolioResult: PortfolioOptimization | undefined;
  if (adSetMetricsList.length > 0) {
    portfolioResult = optimizeBudgetAllocation(adSetMetricsList, {
      targetRoas: autopilotConfig?.targetRoas?.toNumber() ?? 2.0,
      maxChangePct: autopilotConfig?.maxBudgetIncreasePct ?? 20,
      minDailyBudget: 5,
      totalBudgetCap: autopilotConfig?.dailyBudgetCap?.toNumber() ?? undefined,
    });
  }

  // Build lookup: adSetId → portfolio allocation suggestion
  const portfolioByAdSet = new Map<string, BudgetAllocation>();
  if (portfolioResult) {
    for (const alloc of portfolioResult.allocations) {
      portfolioByAdSet.set(alloc.adSetId, alloc);
    }
  }

  // Phase 3.1: Compute dynamic thresholds from actual ad data
  const adMetricsForThresholds: AdMetricsForThresholds[] = ads.map((a) => ({
    ctr7d: a.ctr7d?.toNumber() ?? null,
    cpc7d: a.cpc7d?.toNumber() ?? null,
    adSetDailyBudget: a.adSet?.dailyBudget?.toNumber() ?? null,
  }));

  const dynamicThresholds = computeDynamicThresholds(adMetricsForThresholds);

  // Merge dynamic thresholds into ruleConfig (dynamic < rule tuner overrides < explicit config)
  if (ruleConfig) {
    ruleConfig.minCtr = ruleConfig.minCtr ?? dynamicThresholds.minCtr;
    ruleConfig.wastedSpendThreshold = ruleConfig.wastedSpendThreshold ?? dynamicThresholds.wastedSpendThreshold;
    ruleConfig.cpcSpikeThreshold = ruleConfig.cpcSpikeThreshold ?? dynamicThresholds.cpcSpikeThreshold;
  }

  // Phase 3.4: Pre-compute campaign health scores
  // Group ads by campaign, then build AdSetHealth[] for each campaign
  const campaignAdSetIds = new Map<string, Set<string>>();
  const campaignNames = new Map<string, string>();
  for (const ad of ads) {
    if (!ad.campaignId || !ad.adSet) continue;
    const sets = campaignAdSetIds.get(ad.campaignId) ?? new Set<string>();
    sets.add(ad.adSet.id);
    campaignAdSetIds.set(ad.campaignId, sets);
    if (!campaignNames.has(ad.campaignId)) {
      campaignNames.set(ad.campaignId, ad.campaign?.name ?? ad.campaignId);
    }
  }

  const campaignHealthByAd = new Map<string, CampaignHealthScore>();
  for (const [campaignId, adSetIdSet] of campaignAdSetIds) {
    const campaignMetrics: CampaignMetrics = {
      campaignId,
      campaignName: campaignNames.get(campaignId) ?? campaignId,
      adSets: Array.from(adSetIdSet).map((setId) => {
        const setAgg = adSetAggregates.get(setId);
        return {
          adSetId: setId,
          spend7d: setAgg?.spend7d ?? 0,
          revenue7d: setAgg?.revenue7d ?? 0,
          roas7d: setAgg && setAgg.spend7d > 0 ? setAgg.revenue7d / setAgg.spend7d : null,
          ctr7d: null,  // Not tracked at ad set aggregate level
          frequency7d: setAgg && setAgg.frequency7dCount > 0
            ? setAgg.frequency7dSum / setAgg.frequency7dCount
            : null,
          roas14d: null, // Not tracked at ad set aggregate level
          ctr14d: null,
        };
      }),
    };

    const healthScore = scoreCampaignHealth(campaignMetrics);

    // Map health score to all ads in this campaign
    for (const ad of ads) {
      if (ad.campaignId === campaignId) {
        campaignHealthByAd.set(ad.id, healthScore);
      }
    }
  }

  // ── Phase 2: Cross-data enrichment (funnel, LTV, margins, channels) ──
  let enrichment: DiagnosisEnrichment | null = null;
  try {
    enrichment = await enrichDiagnosis(organizationId);
  } catch (err) {
    // Enrichment failure must not crash the diagnosis run
    console.error('[runDiagnosis] Enrichment failed:', err);
  }

  // Phase 5: Forecast-aware budget context (demand trends + seasonal factors)
  let forecastContext: ForecastBudgetContext | null = null;
  try {
    forecastContext = await computeForecastBudgetContext(organizationId);
    if (forecastContext) {
      console.info(
        `[runDiagnosis] Forecast context: trend=${forecastContext.trend}, multiplier=${forecastContext.budgetMultiplier}, seasonal=${forecastContext.todaySeasonalFactor ?? 'N/A'}`,
      );
    }
  } catch (err) {
    // Forecast failure must not crash the diagnosis run
    console.error('[runDiagnosis] Forecast context failed:', err);
  }

  // Phase 4.3: Query suggestion feedback patterns to build confidence modifiers
  // Maps OpportunityType → approval ratio (0-1). If efficiency suggestions are
  // frequently approved, boost confidence for efficiency-related diagnoses.
  const suggestionConfidenceMap = new Map<string, number>();
  try {
    const thirtyDaysAgoFeedback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const feedbackWithType = await prisma.suggestionFeedback.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgoFeedback },
        suggestion: {
          opportunity: {
            organizationId,
          },
        },
      },
      select: {
        action: true,
        suggestion: {
          select: {
            opportunity: {
              select: { type: true },
            },
          },
        },
      },
    });

    // Group by opportunity type
    const byType = new Map<string, { approved: number; total: number }>();
    for (const fb of feedbackWithType) {
      const type = fb.suggestion.opportunity.type;
      const stats = byType.get(type) ?? { approved: 0, total: 0 };
      stats.total++;
      if (fb.action === 'APPROVE' || fb.action === 'PROMOTE') stats.approved++;
      byType.set(type, stats);
    }

    for (const [type, stats] of byType) {
      if (stats.total >= 5) {
        suggestionConfidenceMap.set(type, stats.approved / stats.total);
      }
    }
  } catch {
    // Suggestion feedback query failure is non-fatal
  }

  // ── End Intelligence Layer ────────────────────────────────────

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

    // Phase 3.2: Compute weekly ROAS averages for trend acceleration rule
    const adSnaps = snapshotsByAd.get(ad.id);
    if (adSnaps && adSnaps.length >= 21) {
      // Group snapshots into weekly buckets (oldest first)
      const weeklyBuckets: number[][] = [];
      let currentBucket: number[] = [];
      for (const snap of adSnaps) {
        const roasVal = snap.roas?.toNumber();
        if (roasVal !== null && roasVal !== undefined && !isNaN(roasVal)) {
          currentBucket.push(roasVal);
        }
        if (currentBucket.length >= 7) {
          weeklyBuckets.push(currentBucket);
          currentBucket = [];
        }
      }
      if (weeklyBuckets.length >= 3) {
        // Take last 3-4 weeks
        const recentWeeks = weeklyBuckets.slice(-4);
        input.weeklyRoasAvgs = recentWeeks.map(
          (bucket) => bucket.reduce((s, v) => s + v, 0) / bucket.length,
        );
      }
    }

    // Phase 3.3: Attach creative decay projections for predictive ROAS alert
    const decay = decayByAd.get(ad.id);
    if (decay) {
      input.decayRecommendation = decay.recommendation;
      input.decayEstimatedDaysToBreakeven = decay.estimatedDaysToBreakeven;
    }

    const results = evaluateDiagnosisRules(input, now, ruleConfig);

    for (const diag of results) {
      firedPairs.add(`${ad.id}::${diag.ruleId}`);

      // ── Intelligence: adjust confidence based on anomaly/decay/portfolio ──
      let confidenceAdj = 0;
      const enrichments: Record<string, unknown> = {};

      // Phase 1.1: Anomaly detection — boost if statistically unusual, reduce if normal
      const anomalies = anomalyByAd.get(ad.id);
      if (anomalies && anomalies.length > 0) {
        const fired = anomalies.filter((a) => a.isAnomaly);
        if (fired.length > 0) {
          confidenceAdj += 10;
          enrichments.anomalyDetected = true;
          enrichments.anomalies = fired.map((a) => ({
            metric: a.metric,
            zScore: a.zScore,
            direction: a.direction,
            pctChange: a.percentChange,
          }));
        } else {
          confidenceAdj -= 5;
          enrichments.anomalyDetected = false;
        }
      }

      // Phase 1.3: Creative decay — boost/reduce for fatigue-related rules
      if (diag.ruleId === 'creative_fatigue' || diag.ruleId === 'audience_saturation') {
        const decay = decayByAd.get(ad.id);
        if (decay) {
          if (decay.recommendation === 'replace_now') {
            confidenceAdj += 15;
          } else if (decay.recommendation === 'accelerating_decay') {
            confidenceAdj += 10;
          } else if (decay.recommendation === 'healthy') {
            confidenceAdj -= 15;
          }
          enrichments.decayAnalysis = {
            decayRate: decay.decayRate,
            estimatedDaysToBreakeven: decay.estimatedDaysToBreakeven,
            peakRoas: decay.peakRoas,
            recommendation: decay.recommendation,
          };
        }
      }

      // Phase 1.2: Portfolio validation — penalize budget changes that conflict with optimizer
      if (
        (diag.actionType === 'INCREASE_BUDGET' || diag.actionType === 'DECREASE_BUDGET') &&
        ad.adSet
      ) {
        const portfolioAlloc = portfolioByAdSet.get(ad.adSet.id);
        if (portfolioAlloc) {
          const diagDir = diag.actionType === 'INCREASE_BUDGET' ? 1 : -1;
          const portDir = portfolioAlloc.changePct > 0 ? 1 : portfolioAlloc.changePct < 0 ? -1 : 0;

          if (portDir !== 0 && diagDir !== portDir) {
            confidenceAdj -= 20;
            enrichments.portfolioDisagreement = true;
          }
          enrichments.portfolioSuggestion = {
            suggestedBudget: portfolioAlloc.suggestedDailyBudget,
            changePct: portfolioAlloc.changePct,
            reason: portfolioAlloc.reason,
          };
        }
      }

      // Phase 2.2: Funnel validation for click_no_buy
      if (diag.ruleId === 'click_no_buy' && enrichment?.funnelContext) {
        const funnel = enrichment.funnelContext;
        if (funnel.atcToCheckout < 0.5) {
          // Post-click funnel drop confirms the diagnosis (problem is beyond the ad)
          confidenceAdj += 10;
          enrichments.funnelConfirmed = true;
          enrichments.funnelBottleneck = funnel.bottleneck;
          enrichments.atcToCheckout = Math.round(funnel.atcToCheckout * 1000) / 10;
        }
      }

      // Phase 2.3: Unit economics guard for budget increases
      if (diag.actionType === 'INCREASE_BUDGET' && enrichment?.unitEconomicsContext) {
        const ue = enrichment.unitEconomicsContext;
        if (ue.currentMetaCac !== null && ue.currentMetaCac > ue.maxAffordableCac * 0.9) {
          // Meta CAC is approaching the maximum affordable CAC — risky to scale
          confidenceAdj -= 20;
          enrichments.unitEconWarning = true;
          enrichments.unitEconContext = {
            metaCac: Math.round(ue.currentMetaCac * 100) / 100,
            maxAffordableCac: Math.round(ue.maxAffordableCac * 100) / 100,
            cmPct: Math.round(ue.currentCMPct * 1000) / 10,
            aov: Math.round(ue.currentAOV * 100) / 100,
          };
        }
      }

      // Phase 2.4: Cohort LTV context for pause decisions
      if (diag.ruleId === 'negative_roas' && diag.actionType === 'PAUSE_AD' && enrichment?.cohortContext) {
        const cohort = enrichment.cohortContext;
        if (cohort.ltvCacRatio > 3) {
          // High LTV:CAC ratio — customers are valuable long-term, pausing may be premature
          confidenceAdj -= 15;
          enrichments.ltvOverride = true;
          enrichments.ltvContext = {
            ltvCacRatio: Math.round(cohort.ltvCacRatio * 10) / 10,
            ltv90: Math.round(cohort.latestLtv90 * 100) / 100,
            d30Retention: Math.round(cohort.latestD30Retention * 1000) / 10,
          };
        }
      }

      // Phase 2.5: Cross-channel context for budget decisions
      if (diag.actionType === 'INCREASE_BUDGET' && enrichment?.crossChannelContext) {
        const xch = enrichment.crossChannelContext;
        if (xch.metaSpendShare > 0.7 && xch.bestChannel !== null) {
          const isBest = xch.bestChannel.toLowerCase() === 'meta' || xch.bestChannel.toLowerCase() === 'meta ads';
          if (!isBest) {
            // Meta consumes >70% of spend but isn't the best-performing channel
            confidenceAdj -= 10;
            enrichments.crossChannelWarning = true;
            enrichments.crossChannelNote = {
              metaSpendShare: Math.round(xch.metaSpendShare * 1000) / 10,
              bestChannel: xch.bestChannel,
            };
          }
        }
      }

      // Phase 3.4: Campaign health — penalize budget increases for ads in unhealthy campaigns
      const campaignHealth = campaignHealthByAd.get(ad.id);
      if (campaignHealth) {
        if (campaignHealth.grade === 'F' && diag.actionType === 'INCREASE_BUDGET') {
          confidenceAdj -= 25;
          enrichments.campaignHealthWarning = true;
          enrichments.campaignHealth = {
            grade: campaignHealth.grade,
            score: campaignHealth.overallScore,
            campaignName: campaignHealth.campaignName,
          };
        } else if (campaignHealth.grade === 'A' && diag.ruleId === 'top_performer') {
          confidenceAdj += 5;
          enrichments.campaignHealth = {
            grade: campaignHealth.grade,
            score: campaignHealth.overallScore,
            campaignName: campaignHealth.campaignName,
          };
        }
      }

      // Phase 4.3: Suggestion feedback → confidence modifier
      // Map diagnosis rules to relevant opportunity types
      const RULE_TO_OPPORTUNITY: Record<string, string> = {
        negative_roas: 'EFFICIENCY_DROP',
        wasted_budget: 'EFFICIENCY_DROP',
        cost_spike: 'CAC_SPIKE',
        low_ctr: 'QUICK_WIN',
        creative_fatigue: 'QUICK_WIN',
        click_no_buy: 'FUNNEL_LEAK',
        winner_not_scaled: 'GROWTH_PLATEAU',
        top_performer: 'GROWTH_PLATEAU',
      };
      const relatedOppType = RULE_TO_OPPORTUNITY[diag.ruleId];
      if (relatedOppType) {
        const approvalRate = suggestionConfidenceMap.get(relatedOppType);
        if (approvalRate !== undefined) {
          // High approval rate → user trusts these suggestions → boost confidence
          if (approvalRate > 0.7) {
            confidenceAdj += 5;
            enrichments.suggestionFeedbackBoost = true;
          }
          // Low approval rate → user frequently rejects → reduce confidence
          if (approvalRate < 0.3) {
            confidenceAdj -= 10;
            enrichments.suggestionFeedbackPenalty = true;
          }
        }
      }

      // Extract base suggested value for forecast budget adjustments
      const baseSuggested = (typeof diag.suggestedValue === 'object' && diag.suggestedValue !== null)
        ? (diag.suggestedValue as Record<string, unknown>)
        : {};

      // Phase 5: Forecast-aware budget adjustments
      // Penalize INCREASE_BUDGET when demand is declining, boost when growing
      if (forecastContext && diag.actionType === 'INCREASE_BUDGET') {
        if (forecastContext.trend === 'declining') {
          confidenceAdj -= 15;
          enrichments.forecastWarning = true;
          enrichments.forecastContext = {
            trend: forecastContext.trend,
            budgetMultiplier: forecastContext.budgetMultiplier,
            forecastedRevenue7d: forecastContext.forecastedRevenue7d,
            forecastVsActualPct: forecastContext.forecastVsActualPct,
          };
        } else if (forecastContext.trend === 'growing') {
          confidenceAdj += 5;
          enrichments.forecastBoost = true;
          enrichments.forecastContext = {
            trend: forecastContext.trend,
            budgetMultiplier: forecastContext.budgetMultiplier,
            forecastedRevenue7d: forecastContext.forecastedRevenue7d,
            forecastVsActualPct: forecastContext.forecastVsActualPct,
          };

          // Multiply suggested budget by forecast multiplier
          if (
            typeof baseSuggested['suggestedDailyBudget'] === 'number' &&
            forecastContext.budgetMultiplier > 1.0
          ) {
            baseSuggested['forecastAdjustedBudget'] =
              Math.round(
                (baseSuggested['suggestedDailyBudget'] as number) * forecastContext.budgetMultiplier * 100,
              ) / 100;
          }
        }

        // Attach seasonal context if available
        if (forecastContext.hasSeasonal && forecastContext.todaySeasonalFactor !== null) {
          enrichments.seasonalContext = {
            todayFactor: forecastContext.todaySeasonalFactor,
            isHighDemandDay: forecastContext.todaySeasonalFactor > 1.1,
          };
        }
      }

      const adjustedConfidence = Math.max(0, Math.min(100, diag.confidence + confidenceAdj));

      // Merge enrichments into suggestedValue for downstream consumption
      const enrichedSuggestedValue = Object.keys(enrichments).length > 0
        ? { ...baseSuggested, ...enrichments }
        : diag.suggestedValue;

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

        // If the diagnosis was already EXECUTED or EXPIRED but the rule still fires,
        // recycle it back to PENDING so the user can review fresh metrics and re-approve.
        // Cooldown: wait at least 6h after execution to avoid rapid re-diagnosis
        // (skipped when options.force is true).
        const RECYCLE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
        const cooldownPassed =
          !existing.executedAt ||
          now.getTime() - new Date(existing.executedAt).getTime() > RECYCLE_COOLDOWN_MS;
        const isRecyclable =
          (existing.status === 'EXECUTED' || existing.status === 'EXPIRED') &&
          (options?.force || cooldownPassed);

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
              suggestedValue: enrichedSuggestedValue as never,
              confidence: adjustedConfidence,
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
            suggestedValue: enrichedSuggestedValue as never,
            confidence: adjustedConfidence,
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
