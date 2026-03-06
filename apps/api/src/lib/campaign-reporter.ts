// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Performance Reporter
// Generates structured performance reports for campaigns.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';

// ── Interfaces ──────────────────────────────────────────────

export interface CampaignReport {
  readonly period: 'daily' | 'weekly' | 'monthly';
  readonly generatedAt: string;
  readonly summary: ReportSummary;
  readonly byType: readonly CampaignTypeReport[];
  readonly topCampaigns: readonly CampaignPerformanceEntry[];
  readonly recommendations: readonly string[];
}

interface ReportSummary {
  readonly activeCampaigns: number;
  readonly totalSpend: number;
  readonly totalRevenue: number;
  readonly overallRoas: number;
  readonly budgetUtilization: number; // actual spend / allocated budget
}

interface CampaignTypeReport {
  readonly type: string;
  readonly activeCampaigns: number;
  readonly totalSpend: number;
  readonly totalRevenue: number;
  readonly avgRoas: number;
}

interface CampaignPerformanceEntry {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly spend: number;
  readonly revenue: number;
  readonly roas: number;
  readonly productCount: number;
}

// ── Helpers ─────────────────────────────────────────────────

function toNum(val: Prisma.Decimal | number | null | undefined): number {
  if (val == null) return 0;
  return typeof val === 'number' ? val : Number(val);
}

// ── Main function ───────────────────────────────────────────

export async function generateCampaignReport(
  organizationId: string,
  period: 'daily' | 'weekly' | 'monthly',
): Promise<CampaignReport> {
  // Query campaigns for the org, filtered by relevant statuses
  const campaigns = await prisma.campaignStrategy.findMany({
    where: {
      organizationId,
      status: { in: ['ACTIVE', 'COMPLETED', 'PAUSED'] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      dailyBudget: true,
      totalBudget: true,
      actualSpend: true,
      actualRevenue: true,
      actualRoas: true,
      productCount: true,
    },
  });

  // ── Summary ─────────────────────────────────────────────
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
  const totalSpend = campaigns.reduce((sum, c) => sum + toNum(c.actualSpend), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + toNum(c.actualRevenue), 0);
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Budget utilization: actual spend / sum of total budgets (or daily * 30 if no total)
  const totalAllocated = campaigns.reduce((sum, c) => {
    const allocated = toNum(c.totalBudget) || toNum(c.dailyBudget) * 30;
    return sum + allocated;
  }, 0);
  const budgetUtilization = totalAllocated > 0 ? totalSpend / totalAllocated : 0;

  const summary: ReportSummary = {
    activeCampaigns,
    totalSpend,
    totalRevenue,
    overallRoas,
    budgetUtilization,
  };

  // ── By type ─────────────────────────────────────────────
  const typeMap = new Map<string, { active: number; spend: number; revenue: number }>();
  for (const c of campaigns) {
    const entry = typeMap.get(c.type) ?? { active: 0, spend: 0, revenue: 0 };
    if (c.status === 'ACTIVE') entry.active += 1;
    entry.spend += toNum(c.actualSpend);
    entry.revenue += toNum(c.actualRevenue);
    typeMap.set(c.type, entry);
  }

  const byType: readonly CampaignTypeReport[] = Array.from(typeMap.entries()).map(
    ([type, data]) => ({
      type,
      activeCampaigns: data.active,
      totalSpend: data.spend,
      totalRevenue: data.revenue,
      avgRoas: data.spend > 0 ? data.revenue / data.spend : 0,
    }),
  );

  // ── Top campaigns by ROAS ─────────────────────────────
  const campaignsWithSpend = campaigns.filter((c) => toNum(c.actualSpend) > 0);
  const sorted = [...campaignsWithSpend].sort((a, b) => {
    const roasA = toNum(a.actualSpend) > 0 ? toNum(a.actualRevenue) / toNum(a.actualSpend) : 0;
    const roasB = toNum(b.actualSpend) > 0 ? toNum(b.actualRevenue) / toNum(b.actualSpend) : 0;
    return roasB - roasA;
  });

  const topCampaigns: readonly CampaignPerformanceEntry[] = sorted.slice(0, 3).map((c) => {
    const spend = toNum(c.actualSpend);
    const revenue = toNum(c.actualRevenue);
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      spend,
      revenue,
      roas: spend > 0 ? revenue / spend : 0,
      productCount: c.productCount,
    };
  });

  // ── Recommendations ───────────────────────────────────
  const recommendations: string[] = [];

  if (overallRoas > 0 && overallRoas < 1) {
    recommendations.push(
      `Overall ROAS is ${overallRoas.toFixed(1)}x — review underperforming campaigns to reduce waste`,
    );
  } else if (overallRoas >= 3) {
    recommendations.push(
      `Strong overall ROAS of ${overallRoas.toFixed(1)}x — consider increasing total budget allocation`,
    );
  }

  if (budgetUtilization < 0.5 && totalAllocated > 0) {
    recommendations.push(
      `Budget utilization is only ${(budgetUtilization * 100).toFixed(0)}% — reallocate unused budget to top performers`,
    );
  }

  if (activeCampaigns === 0 && campaigns.length > 0) {
    recommendations.push('No active campaigns — reactivate paused campaigns or generate new suggestions');
  }

  if (campaigns.length === 0) {
    recommendations.push('No campaigns found — generate campaign suggestions to start advertising');
  }

  // Best performing type recommendation
  const bestType = byType.reduce<CampaignTypeReport | null>(
    (best, t) => (t.totalSpend > 0 && (best === null || t.avgRoas > best.avgRoas) ? t : best),
    null,
  );
  if (bestType && bestType.avgRoas > 1) {
    recommendations.push(
      `${bestType.type} campaigns show best ROAS (${bestType.avgRoas.toFixed(1)}x) — prioritize this campaign type`,
    );
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    summary,
    byType,
    topCampaigns,
    recommendations,
  };
}
