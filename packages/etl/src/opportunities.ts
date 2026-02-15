// ──────────────────────────────────────────────────────────────
// Growth OS — Opportunity Classification
// Rule-based mapping from signals to opportunity types
// ──────────────────────────────────────────────────────────────

import type { Signal } from './signals.js';

export type OpportunityType =
  | 'EFFICIENCY_DROP'
  | 'CAC_SPIKE'
  | 'RETENTION_DECLINE'
  | 'FUNNEL_LEAK'
  | 'GROWTH_PLATEAU'
  | 'CHANNEL_IMBALANCE'
  | 'QUICK_WIN';

export interface OpportunityCandidate {
  type: OpportunityType;
  title: string;
  description: string;
  priority: number;
  signals: Signal[];
}

const OPPORTUNITY_META: Record<OpportunityType, { title: string; description: string; priority: number }> = {
  EFFICIENCY_DROP: {
    title: 'Marketing Efficiency Deteriorating',
    description: 'Spend is increasing but returns are diminishing. MER or ROAS declining while ad budgets grow.',
    priority: 85,
  },
  CAC_SPIKE: {
    title: 'Customer Acquisition Cost Spiking',
    description: 'Blended or channel-level CAC has increased significantly, eroding unit economics.',
    priority: 80,
  },
  RETENTION_DECLINE: {
    title: 'Customer Retention Declining',
    description: 'Repeat purchase rates are falling below historical baselines, threatening LTV.',
    priority: 75,
  },
  FUNNEL_LEAK: {
    title: 'Conversion Funnel Leaking',
    description: 'One or more stages of the purchase funnel show abnormal drop-off rates.',
    priority: 70,
  },
  GROWTH_PLATEAU: {
    title: 'Revenue Growth Stalling',
    description: 'Revenue is declining or flat without corresponding efficiency issues, suggesting demand-side weakness.',
    priority: 65,
  },
  CHANNEL_IMBALANCE: {
    title: 'Channel Mix Imbalanced',
    description: 'Performance varies significantly across channels, indicating reallocation opportunities.',
    priority: 60,
  },
  QUICK_WIN: {
    title: 'Quick Win Opportunities Detected',
    description: 'Minor metric shifts suggest low-effort experiments that could yield measurable gains.',
    priority: 40,
  },
};

export function classifyOpportunities(signals: Signal[]): OpportunityCandidate[] {
  const opportunities: OpportunityCandidate[] = [];
  const used = new Set<string>();

  function add(type: OpportunityType, matched: Signal[]) {
    if (matched.length === 0) return;
    const meta = OPPORTUNITY_META[type];
    // Boost priority based on severity
    const hasCritical = matched.some((s) => s.severity === 'critical');
    const hasWarning = matched.some((s) => s.severity === 'warning');
    const boost = hasCritical ? 10 : hasWarning ? 5 : 0;
    opportunities.push({
      type,
      title: meta.title,
      description: meta.description,
      priority: Math.min(100, meta.priority + boost),
      signals: matched,
    });
    for (const s of matched) used.add(s.id);
  }

  // 1. EFFICIENCY_DROP: MER deterioration signal
  const merSignals = signals.filter((s) => s.id === 'alert_mer_deterioration');
  add('EFFICIENCY_DROP', merSignals);

  // 2. CAC_SPIKE: blended or channel CAC alerts
  const cacSignals = signals.filter(
    (s) => s.id === 'alert_cac_increase' || s.id.startsWith('alert_channel_cac_'),
  );

  // If multiple channel CAC signals (>1) → also qualifies as CHANNEL_IMBALANCE
  const channelCacSignals = cacSignals.filter((s) => s.id.startsWith('alert_channel_cac_'));
  if (channelCacSignals.length > 1) {
    add('CHANNEL_IMBALANCE', channelCacSignals);
  }
  add('CAC_SPIKE', cacSignals);

  // 3. RETENTION_DECLINE
  const retentionSignals = signals.filter((s) => s.id === 'alert_retention_drop');
  add('RETENTION_DECLINE', retentionSignals);

  // 4. FUNNEL_LEAK
  const funnelSignals = signals.filter((s) => s.type === 'funnel_drop');
  add('FUNNEL_LEAK', funnelSignals);

  // 5. GROWTH_PLATEAU: revenue decline without CAC issue
  const revenueSignals = signals.filter((s) => s.id === 'alert_revenue_decline');
  const hasCacIssue = cacSignals.length > 0;
  if (!hasCacIssue && revenueSignals.length > 0) {
    const sessionsSignals = signals.filter((s) => s.id === 'metric_delta_sessions');
    add('GROWTH_PLATEAU', [...revenueSignals, ...sessionsSignals]);
  }

  // 6. QUICK_WIN: remaining unused info-level signals
  const unusedInfoSignals = signals.filter(
    (s) => !used.has(s.id) && s.severity === 'info',
  );
  if (unusedInfoSignals.length > 0) {
    add('QUICK_WIN', unusedInfoSignals);
  }

  // Sort by priority descending
  opportunities.sort((a, b) => b.priority - a.priority);

  return opportunities;
}
