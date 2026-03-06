// ──────────────────────────────────────────────────────────────
// Growth OS — Weekly Marketing Analysis
// Generates a comprehensive weekly marketing performance report.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';

const log = createLogger('weekly-analysis');

// ── Interfaces ──────────────────────────────────────────────

export interface WeeklyAnalysisResult {
  readonly period: string;
  readonly topPerformers: readonly TopPerformer[];
  readonly underperformers: readonly Underperformer[];
  readonly campaignSummary: readonly CampaignTypeSummary[];
  readonly budgetEfficiency: BudgetEfficiency;
  readonly recommendations: readonly string[];
}

interface TopPerformer {
  readonly productTitle: string;
  readonly revenue30d: number;
  readonly revenueTrend: number | null;
  readonly adFitnessScore: number;
  readonly tier: string | null;
}

interface Underperformer {
  readonly productTitle: string;
  readonly revenue30d: number;
  readonly revenueTrend: number | null;
  readonly reason: string;
}

interface CampaignTypeSummary {
  readonly type: string;
  readonly count: number;
  readonly totalSpend: number;
  readonly totalRevenue: number;
  readonly avgRoas: number;
}

interface BudgetEfficiency {
  readonly totalSpend: number;
  readonly totalRevenue: number;
  readonly overallRoas: number;
  readonly bestType: string | null;
  readonly worstType: string | null;
}

// ── Helper to convert Decimal to number ─────────────────────

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === 'number' ? val : Number(val);
}

// ── Main function ───────────────────────────────────────────

export async function runWeeklyMarketingAnalysis(
  organizationId: string,
): Promise<WeeklyAnalysisResult> {
  log.info({ organizationId }, 'Running weekly marketing analysis');

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period = `${weekAgo.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`;

  // ── Top performers ────────────────────────────────────────
  const topProducts = await prisma.productPerformance.findMany({
    where: {
      organizationId,
      OR: [
        { revenueTrend: { gte: 0 } },
        { revenueTrend: null },
      ],
    },
    orderBy: { revenue30d: 'desc' },
    take: 5,
    select: {
      productTitle: true,
      revenue30d: true,
      revenueTrend: true,
      adFitnessScore: true,
      productTier: true,
    },
  });

  const topPerformers: readonly TopPerformer[] = topProducts.map((p) => ({
    productTitle: p.productTitle,
    revenue30d: toNum(p.revenue30d),
    revenueTrend: p.revenueTrend != null ? toNum(p.revenueTrend) : null,
    adFitnessScore: toNum(p.adFitnessScore),
    tier: p.productTier,
  }));

  // ── Underperformers ───────────────────────────────────────
  const underProducts = await prisma.productPerformance.findMany({
    where: {
      organizationId,
      revenueTrend: { lt: new Prisma.Decimal(-0.10) },
    },
    orderBy: { revenueTrend: 'asc' },
    take: 5,
    select: {
      productTitle: true,
      revenue30d: true,
      revenueTrend: true,
    },
  });

  const underperformers: readonly Underperformer[] = underProducts.map((p) => {
    const trend = toNum(p.revenueTrend);
    const pctDrop = Math.abs(trend * 100).toFixed(1);
    return {
      productTitle: p.productTitle,
      revenue30d: toNum(p.revenue30d),
      revenueTrend: trend,
      reason: `Revenue declined ${pctDrop}%`,
    };
  });

  // ── Campaign summary by type ──────────────────────────────
  const campaigns = await prisma.campaignStrategy.findMany({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'COMPLETED', 'PAUSED'] },
    },
    select: {
      type: true,
      status: true,
      actualSpend: true,
      actualRevenue: true,
    },
  });

  const byType = new Map<string, { count: number; totalSpend: number; totalRevenue: number }>();
  for (const c of campaigns) {
    const entry = byType.get(c.type) ?? { count: 0, totalSpend: 0, totalRevenue: 0 };
    entry.count += 1;
    entry.totalSpend += toNum(c.actualSpend);
    entry.totalRevenue += toNum(c.actualRevenue);
    byType.set(c.type, entry);
  }

  const campaignSummary: readonly CampaignTypeSummary[] = Array.from(byType.entries()).map(
    ([type, data]) => ({
      type,
      count: data.count,
      totalSpend: data.totalSpend,
      totalRevenue: data.totalRevenue,
      avgRoas: data.totalSpend > 0 ? data.totalRevenue / data.totalSpend : 0,
    }),
  );

  // ── Budget efficiency ─────────────────────────────────────
  const totalSpend = campaignSummary.reduce((sum, c) => sum + c.totalSpend, 0);
  const totalRevenue = campaignSummary.reduce((sum, c) => sum + c.totalRevenue, 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  let bestType: string | null = null;
  let worstType: string | null = null;
  let bestRoas = -Infinity;
  let worstRoas = Infinity;

  for (const c of campaignSummary) {
    if (c.totalSpend > 0) {
      if (c.avgRoas > bestRoas) {
        bestRoas = c.avgRoas;
        bestType = c.type;
      }
      if (c.avgRoas < worstRoas) {
        worstRoas = c.avgRoas;
        worstType = c.type;
      }
    }
  }

  const budgetEfficiency: BudgetEfficiency = {
    totalSpend,
    totalRevenue,
    overallRoas,
    bestType,
    worstType,
  };

  // ── Recommendations ───────────────────────────────────────
  const recommendations: string[] = [];

  // Scale top performer
  const topProduct = topPerformers[0];
  if (topProduct) {
    const trendLabel = topProduct.revenueTrend != null && topProduct.revenueTrend > 0
      ? ` with +${(topProduct.revenueTrend * 100).toFixed(0)}% trend`
      : '';
    recommendations.push(
      `Scale "${topProduct.productTitle}" — strong performer${trendLabel} with $${topProduct.revenue30d.toFixed(0)} revenue`,
    );
  }

  // Pause underperformer
  const worstProduct = underperformers[0];
  if (worstProduct) {
    const dropPct = Math.abs(toNum(worstProduct.revenueTrend) * 100).toFixed(0);
    recommendations.push(
      `Pause ads for "${worstProduct.productTitle}" — revenue declined ${dropPct}%`,
    );
  }

  // Best campaign type
  if (bestType && bestRoas > 0) {
    recommendations.push(
      `Increase budget for ${bestType} campaigns — ${bestRoas.toFixed(1)}x ROAS`,
    );
  }

  // Worst campaign type
  if (worstType && worstType !== bestType && worstRoas < Infinity) {
    recommendations.push(
      `Review ${worstType} campaigns — only ${worstRoas.toFixed(1)}x ROAS`,
    );
  }

  // No active campaigns fallback
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  if (activeCampaigns.length === 0) {
    recommendations.push('Generate campaign suggestions to start advertising');
  }

  log.info(
    {
      organizationId,
      topPerformers: topPerformers.length,
      underperformers: underperformers.length,
      campaignTypes: campaignSummary.length,
      recommendations: recommendations.length,
    },
    'Weekly marketing analysis complete',
  );

  return {
    period,
    topPerformers,
    underperformers,
    campaignSummary,
    budgetEfficiency,
    recommendations,
  };
}
