// ──────────────────────────────────────────────────────────────
// Growth OS — Alert Engine
// Rule-based alerts for growth metrics
// ──────────────────────────────────────────────────────────────

import * as kpis from './kpis.js';

export interface AlertInput {
  // Current period
  currentRevenue: number;
  currentSpend: number;
  currentNewCustomers: number;
  currentTotalOrders: number;
  currentContributionMargin: number;
  currentRevenueNet: number;
  currentD30Retention: number;

  // Previous period
  previousRevenue: number;
  previousSpend: number;
  previousNewCustomers: number;
  previousTotalOrders: number;
  previousContributionMargin: number;
  previousRevenueNet: number;
  previousD30Retention: number;
  baselineD30Retention: number;

  // Per-channel breakdowns (optional)
  channels?: Array<{
    name: string;
    currentSpend: number;
    currentRevenue: number;
    previousSpend: number;
    previousRevenue: number;
    currentNewCustomers: number;
    previousNewCustomers: number;
  }>;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  impactedSegment: string;
  recommendation: string;
  metricValue: number;
  threshold: number;
  context: Record<string, number | string>;
}

export function evaluateAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = [];

  // ── 1. CAC up > 15% WoW ──
  const currentCac = kpis.blendedCac(input.currentSpend, input.currentNewCustomers);
  const previousCac = kpis.blendedCac(input.previousSpend, input.previousNewCustomers);
  const cacChange = kpis.percentChange(currentCac, previousCac);

  if (cacChange > 0.15) {
    alerts.push({
      id: 'cac_increase',
      severity: cacChange > 0.30 ? 'critical' : 'warning',
      title: 'CAC Increased Significantly',
      description: `Blended CAC increased ${(cacChange * 100).toFixed(1)}% WoW ($${previousCac.toFixed(0)} → $${currentCac.toFixed(0)})`,
      impactedSegment: 'All Paid Channels',
      recommendation:
        `Review channel-level CAC (currently $${currentCac.toFixed(0)}, up from $${previousCac.toFixed(0)}). Pause underperforming campaigns. Check for audience fatigue on Meta prospecting. Consider reallocating budget to higher-efficiency channels.`,
      metricValue: cacChange,
      threshold: 0.15,
      context: { currentCac, previousCac, cacChangePercent: cacChange * 100, totalSpend: input.currentSpend, newCustomers: input.currentNewCustomers },
    });
  }

  // ── 2. Contribution Margin % down > 3pp WoW ──
  const currentCmPct = kpis.contributionMarginPct(
    input.currentContributionMargin,
    input.currentRevenueNet,
  );
  const previousCmPct = kpis.contributionMarginPct(
    input.previousContributionMargin,
    input.previousRevenueNet,
  );
  const cmPpChange = kpis.percentagePointChange(currentCmPct, previousCmPct);

  if (cmPpChange < -0.03) {
    alerts.push({
      id: 'cm_decrease',
      severity: cmPpChange < -0.06 ? 'critical' : 'warning',
      title: 'Contribution Margin Declining',
      description: `CM% dropped ${(cmPpChange * 100).toFixed(1)}pp WoW (${(previousCmPct * 100).toFixed(1)}% → ${(currentCmPct * 100).toFixed(1)}%)`,
      impactedSegment: 'Unit Economics',
      recommendation:
        `Investigate discount rate increases, product mix shifts, and shipping cost changes. CM dropped from ${(previousCmPct * 100).toFixed(1)}% to ${(currentCmPct * 100).toFixed(1)}%. Check if high-margin categories are underperforming.`,
      metricValue: cmPpChange,
      threshold: -0.03,
      context: { currentCmPct, previousCmPct, cmDropPp: cmPpChange * 100, currentCM: input.currentContributionMargin, currentRevenueNet: input.currentRevenueNet },
    });
  }

  // ── 3. D30 Retention down > 5pp vs baseline ──
  const retentionDrop = kpis.percentagePointChange(
    input.currentD30Retention,
    input.baselineD30Retention,
  );

  if (retentionDrop < -0.05) {
    alerts.push({
      id: 'retention_drop',
      severity: retentionDrop < -0.10 ? 'critical' : 'warning',
      title: 'D30 Retention Below Baseline',
      description: `D30 retention dropped ${(retentionDrop * 100).toFixed(1)}pp vs baseline (${(input.baselineD30Retention * 100).toFixed(1)}% → ${(input.currentD30Retention * 100).toFixed(1)}%)`,
      impactedSegment: 'Customer Retention',
      recommendation:
        `Review post-purchase flows, email engagement rates, and product quality feedback. Current D30 retention is ${(input.currentD30Retention * 100).toFixed(1)}% vs ${(input.baselineD30Retention * 100).toFixed(1)}% baseline. Consider launching a win-back campaign for recent cohorts.`,
      metricValue: retentionDrop,
      threshold: -0.05,
      context: { currentD30: input.currentD30Retention, baselineD30: input.baselineD30Retention, dropPp: retentionDrop * 100 },
    });
  }

  // ── 4. MER deterioration (spend up, revenue flat) ──
  const currentMer = kpis.mer(input.currentRevenue, input.currentSpend);
  const previousMer = kpis.mer(input.previousRevenue, input.previousSpend);
  const merChange = kpis.percentChange(currentMer, previousMer);
  const spendChange = kpis.percentChange(input.currentSpend, input.previousSpend);
  const revenueChange = kpis.percentChange(input.currentRevenue, input.previousRevenue);

  if (spendChange > 0.10 && revenueChange < 0.05 && merChange < -0.10) {
    alerts.push({
      id: 'mer_deterioration',
      severity: 'warning',
      title: 'Marketing Efficiency Deteriorating',
      description: `Spend up ${(spendChange * 100).toFixed(1)}% but revenue only ${revenueChange >= 0 ? '+' : ''}${(revenueChange * 100).toFixed(1)}%. MER dropped from ${previousMer.toFixed(2)}x to ${currentMer.toFixed(2)}x`,
      impactedSegment: 'Marketing Efficiency',
      recommendation:
        `Audit spend allocation ($${input.currentSpend.toFixed(0)} this week, up from $${input.previousSpend.toFixed(0)}). MER fell to ${currentMer.toFixed(2)}x. Check for diminishing returns on scaled campaigns. Consider shifting budget from prospecting to retargeting.`,
      metricValue: merChange,
      threshold: -0.10,
      context: { currentMer, previousMer, currentSpend: input.currentSpend, previousSpend: input.previousSpend, currentRevenue: input.currentRevenue, previousRevenue: input.previousRevenue },
    });
  }

  // ── 5. Per-channel CAC alerts ──
  if (input.channels) {
    for (const ch of input.channels) {
      const chCurrentCac = kpis.channelCac(ch.currentSpend, ch.currentNewCustomers);
      const chPreviousCac = kpis.channelCac(ch.previousSpend, ch.previousNewCustomers);
      const chCacChange = kpis.percentChange(chCurrentCac, chPreviousCac);

      if (chCacChange > 0.25 && ch.currentSpend > 500) {
        alerts.push({
          id: `channel_cac_${ch.name.toLowerCase()}`,
          severity: 'warning',
          title: `${ch.name} CAC Spike`,
          description: `${ch.name} CAC up ${(chCacChange * 100).toFixed(1)}% WoW ($${chPreviousCac.toFixed(0)} → $${chCurrentCac.toFixed(0)})`,
          impactedSegment: ch.name,
          recommendation: `Review ${ch.name} campaign performance (spend: $${ch.currentSpend.toFixed(0)}, ${ch.currentNewCustomers} new customers). Check audience overlap, creative fatigue, and bid strategy. Consider creative refresh.`,
          metricValue: chCacChange,
          threshold: 0.25,
          context: { channel: ch.name, currentCac: chCurrentCac, previousCac: chPreviousCac, channelSpend: ch.currentSpend, channelNewCustomers: ch.currentNewCustomers },
        });
      }
    }
  }

  // ── 6. Revenue declining ──
  if (revenueChange < -0.10) {
    alerts.push({
      id: 'revenue_decline',
      severity: revenueChange < -0.20 ? 'critical' : 'warning',
      title: 'Revenue Declining',
      description: `Revenue dropped ${(revenueChange * 100).toFixed(1)}% WoW ($${input.previousRevenue.toFixed(0)} → $${input.currentRevenue.toFixed(0)})`,
      impactedSegment: 'Overall Revenue',
      recommendation:
        `Investigate traffic volumes, conversion rates, and AOV. Revenue fell from $${input.previousRevenue.toFixed(0)} to $${input.currentRevenue.toFixed(0)}. Check for site issues, inventory problems, or external factors.`,
      metricValue: revenueChange,
      threshold: -0.10,
      context: { currentRevenue: input.currentRevenue, previousRevenue: input.previousRevenue, revenueDropPercent: revenueChange * 100 },
    });
  }

  // ── 7. New customer share declining ──
  const currentNewShare = kpis.newCustomerShare(input.currentNewCustomers, input.currentTotalOrders);
  const previousNewShare = kpis.newCustomerShare(input.previousNewCustomers, input.previousTotalOrders);
  const newShareChange = kpis.percentagePointChange(currentNewShare, previousNewShare);

  if (newShareChange < -0.08) {
    alerts.push({
      id: 'new_customer_decline',
      severity: 'info',
      title: 'New Customer Acquisition Slowing',
      description: `New customer share dropped ${(newShareChange * 100).toFixed(1)}pp (${(previousNewShare * 100).toFixed(1)}% → ${(currentNewShare * 100).toFixed(1)}%)`,
      impactedSegment: 'Acquisition',
      recommendation:
        `Review prospecting campaigns. New customer share fell from ${(previousNewShare * 100).toFixed(1)}% to ${(currentNewShare * 100).toFixed(1)}% (${input.currentNewCustomers} vs ${input.previousNewCustomers} new customers). Consider expanding audiences, testing new channels, or refreshing creative.`,
      metricValue: newShareChange,
      threshold: -0.08,
      context: { currentNewShare, previousNewShare, currentNewCustomers: input.currentNewCustomers, previousNewCustomers: input.previousNewCustomers },
    });
  }

  return alerts;
}
