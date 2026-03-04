// ──────────────────────────────────────────────────────────────
// Growth OS — Diagnosis Enrichment Module
// Queries funnel, cohort, unit economics, cross-channel, and
// RFM segment data to provide cross-data context for diagnoses.
// Called once per diagnosis run — NOT per ad.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { kpis } from '@growth-os/etl';
import { gatherWeekOverWeekData } from '../lib/gather-metrics.js';

// ── Interfaces ────────────────────────────────────────────────

export interface FunnelContext {
  sessionToPdp: number;
  pdpToAtc: number;
  atcToCheckout: number;
  checkoutToPurchase: number;
  overall: number;
  previousFunnel: {
    sessionToPdp: number;
    pdpToAtc: number;
    atcToCheckout: number;
    checkoutToPurchase: number;
    overall: number;
  } | null;
  /** Lowest-converting funnel step (null if all steps are ≥30%) */
  bottleneck: string | null;
}

export interface CohortContext {
  latestLtv90: number;
  latestD30Retention: number;
  ltvCacRatio: number;
  paybackDays: number | null;
}

export interface UnitEconomicsContext {
  /** Contribution margin percentage (0-1 scale, e.g. 0.35 = 35%) */
  currentCMPct: number;
  currentAOV: number;
  /** Maximum CAC the business can afford = AOV × CM% */
  maxAffordableCac: number;
  /** Meta-specific CAC if available */
  currentMetaCac: number | null;
}

export interface ChannelPerformance {
  name: string;
  spend: number;
  revenue: number;
  cac: number | null;
  roas: number | null;
  /** Share of total spend (0-1) */
  spendShare: number;
}

export interface CrossChannelContext {
  channels: readonly ChannelPerformance[];
  bestChannel: string | null;
  worstChannel: string | null;
  /** Meta's share of total ad spend (0-1) */
  metaSpendShare: number;
  totalSpend: number;
}

export interface SegmentContext {
  champions: number;
  loyal: number;
  potential: number;
  atRisk: number;
  dormant: number;
  lost: number;
  total: number;
}

export interface DiagnosisEnrichment {
  funnelContext: FunnelContext | null;
  cohortContext: CohortContext | null;
  unitEconomicsContext: UnitEconomicsContext | null;
  crossChannelContext: CrossChannelContext | null;
  segmentContext: SegmentContext | null;
}

// ── Constants ─────────────────────────────────────────────────

const FUNNEL_BOTTLENECK_THRESHOLD = 0.30;
const MIN_CHANNEL_SPEND_FOR_RANKING = 100;

// ── Main Export ───────────────────────────────────────────────

/**
 * Gather cross-data enrichment context for the diagnosis pipeline.
 *
 * Calls `gatherWeekOverWeekData()` once (already handles demo mode),
 * then extracts funnel, cohort, unit economics, cross-channel, and
 * RFM segment context.
 *
 * Failures are non-fatal — returns partial enrichment on error.
 */
export async function enrichDiagnosis(
  organizationId: string,
): Promise<DiagnosisEnrichment> {
  const result: DiagnosisEnrichment = {
    funnelContext: null,
    cohortContext: null,
    unitEconomicsContext: null,
    crossChannelContext: null,
    segmentContext: null,
  };

  // Gather all WoW metrics in one call (reuses existing function)
  let wow: Awaited<ReturnType<typeof gatherWeekOverWeekData>>;
  try {
    wow = await gatherWeekOverWeekData(7, organizationId);
  } catch (err) {
    console.error('[enrichDiagnosis] Failed to gather WoW metrics:', err);
    return result;
  }

  // ── Funnel Context ──────────────────────────────────────────
  if (wow.funnelCurrent) {
    try {
      const cvr = kpis.funnelCvr(wow.funnelCurrent);
      const previousCvr = wow.funnelPrevious ? kpis.funnelCvr(wow.funnelPrevious) : null;

      // Identify funnel bottleneck (lowest-converting step below threshold)
      const steps = [
        { name: 'Session → PDP', rate: cvr.sessionToPdp },
        { name: 'PDP → ATC', rate: cvr.pdpToAtc },
        { name: 'ATC → Checkout', rate: cvr.atcToCheckout },
        { name: 'Checkout → Purchase', rate: cvr.checkoutToPurchase },
      ];
      const worstStep = steps.reduce((min, s) => s.rate < min.rate ? s : min, steps[0]!);
      const bottleneck = worstStep.rate < FUNNEL_BOTTLENECK_THRESHOLD ? worstStep.name : null;

      result.funnelContext = {
        ...cvr,
        previousFunnel: previousCvr,
        bottleneck,
      };
    } catch {
      // Funnel computation failure is non-fatal
    }
  }

  // ── Cohort Context ──────────────────────────────────────────
  if (wow.cohortSummary) {
    result.cohortContext = {
      latestLtv90: wow.cohortSummary.ltv90,
      latestD30Retention: wow.cohortSummary.d30Retention,
      ltvCacRatio: wow.cohortSummary.ltvCacRatio,
      paybackDays: wow.cohortSummary.paybackDays,
    };
  }

  // ── Unit Economics Context ──────────────────────────────────
  if (wow.currentAOV > 0 && wow.currentCMPct > 0) {
    // maxAffordableCac = AOV × CM% (CM% is already 0-1 scale from kpis.ts)
    const maxAffordableCac = wow.currentAOV * wow.currentCMPct;

    // Find Meta-specific CAC from channels
    const metaChannel = wow.channels.find(
      (c) => c.name.toLowerCase() === 'meta' || c.name.toLowerCase() === 'meta ads',
    );
    const metaCac =
      metaChannel && metaChannel.currentNewCustomers > 0
        ? metaChannel.currentSpend / metaChannel.currentNewCustomers
        : null;

    result.unitEconomicsContext = {
      currentCMPct: wow.currentCMPct,
      currentAOV: wow.currentAOV,
      maxAffordableCac,
      currentMetaCac: metaCac,
    };
  }

  // ── Cross-Channel Context ──────────────────────────────────
  if (wow.channels.length > 0 && wow.currentSpend > 0) {
    const channelPerf: ChannelPerformance[] = wow.channels.map((ch) => ({
      name: ch.name,
      spend: ch.currentSpend,
      revenue: ch.currentRevenue,
      cac:
        ch.currentNewCustomers > 0
          ? ch.currentSpend / ch.currentNewCustomers
          : null,
      roas: ch.currentSpend > 0 ? ch.currentRevenue / ch.currentSpend : null,
      spendShare: ch.currentSpend / wow.currentSpend,
    }));

    // Rank by ROAS among channels with meaningful spend
    const meaningful = channelPerf.filter(
      (c) => c.spend >= MIN_CHANNEL_SPEND_FOR_RANKING && c.roas !== null,
    );
    const best =
      meaningful.length > 0
        ? meaningful.reduce((a, b) => ((a.roas ?? 0) > (b.roas ?? 0) ? a : b))
        : null;
    const worst =
      meaningful.length > 0
        ? meaningful.reduce((a, b) =>
            (a.roas ?? Infinity) < (b.roas ?? Infinity) ? a : b,
          )
        : null;

    const metaEntry = channelPerf.find(
      (c) => c.name.toLowerCase() === 'meta' || c.name.toLowerCase() === 'meta ads',
    );

    result.crossChannelContext = {
      channels: channelPerf,
      bestChannel: best?.name ?? null,
      worstChannel: worst?.name ?? null,
      metaSpendShare: metaEntry?.spendShare ?? 0,
      totalSpend: wow.currentSpend,
    };
  }

  // ── Segment Context (RFM distribution) ─────────────────────
  try {
    const segmentCounts = await prisma.dimCustomer.groupBy({
      by: ['segment'],
      where: {
        ...(organizationId ? { organizationId } : {}),
        segment: { not: null },
      },
      _count: true,
    });

    if (segmentCounts.length > 0) {
      const getCount = (seg: string): number =>
        segmentCounts.find((s) => s.segment === seg)?._count ?? 0;
      result.segmentContext = {
        champions: getCount('Champions'),
        loyal: getCount('Loyal'),
        potential: getCount('Potential'),
        atRisk: getCount('At Risk'),
        dormant: getCount('Dormant'),
        lost: getCount('Lost'),
        total: segmentCounts.reduce((sum, s) => sum + s._count, 0),
      };
    }
  } catch {
    // Segment query failure is non-fatal
  }

  return result;
}
