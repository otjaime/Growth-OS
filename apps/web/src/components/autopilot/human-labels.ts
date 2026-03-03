// ──────────────────────────────────────────────────────────────
// Growth OS — Human-Readable Labels for Autopilot
// Central translation layer: technical terms → plain English
// ──────────────────────────────────────────────────────────────

import type { DiagnosisAction, DiagnosisSeverity, HumanAction, MetricKey, MetricExplanation } from './types';

// ── Action Type → Human Labels ───────────────────────────────

export const ACTION_LABELS: Record<DiagnosisAction, HumanAction> = {
  PAUSE_AD: {
    verb: 'Stop this ad',
    description: 'This ad is losing money. Pause it to save your budget.',
    buttonLabel: 'Stop this ad',
    activeLabel: 'Stopping...',
    icon: 'Pause',
  },
  REACTIVATE_AD: {
    verb: 'Restart this ad',
    description: 'This paused ad was making money before. Turn it back on.',
    buttonLabel: 'Restart this ad',
    activeLabel: 'Restarting...',
    icon: 'Play',
  },
  INCREASE_BUDGET: {
    verb: 'Spend more here',
    description: 'This ad is working well. Give it more budget to reach more people.',
    buttonLabel: 'Increase budget',
    activeLabel: 'Increasing...',
    icon: 'TrendingUp',
  },
  DECREASE_BUDGET: {
    verb: 'Spend less here',
    description: "This ad isn't performing well. Reduce the budget to limit waste.",
    buttonLabel: 'Reduce budget',
    activeLabel: 'Reducing...',
    icon: 'TrendingDown',
  },
  GENERATE_COPY_VARIANTS: {
    verb: 'Refresh ad text',
    description: 'People have seen this ad too many times. Create fresh text to re-engage them.',
    buttonLabel: 'Create new versions',
    activeLabel: 'Creating...',
    icon: 'Sparkles',
  },
  REFRESH_CREATIVE: {
    verb: 'Update visuals',
    description: "People click but don't buy. The image or video needs a refresh.",
    buttonLabel: 'Refresh creative',
    activeLabel: 'Refreshing...',
    icon: 'RefreshCw',
  },
  NONE: {
    verb: 'Keep watching',
    description: "No action needed right now. We'll keep monitoring.",
    buttonLabel: 'Got it',
    activeLabel: 'Noted',
    icon: 'Eye',
  },
};

// ── Severity → Human Labels ──────────────────────────────────

export const SEVERITY_LABELS: Record<DiagnosisSeverity, { label: string; description: string }> = {
  CRITICAL: { label: 'Needs attention now', description: 'This is urgently costing you money' },
  WARNING: { label: 'Worth reviewing', description: 'This could become a problem soon' },
  INFO: { label: 'Good to know', description: 'Informational — no action needed' },
};

// ── Mode → Human Labels ──────────────────────────────────────

export const MODE_LABELS: Record<string, { label: string; description: string }> = {
  monitor: {
    label: 'Watch Only',
    description: "We'll check your ads and flag issues, but won't make any changes.",
  },
  suggest: {
    label: 'Suggest Changes',
    description: "We'll recommend actions for you to review and approve one by one.",
  },
  auto: {
    label: 'Auto-Apply',
    description: "We'll automatically apply safe changes. You can undo any action.",
  },
};

// ── Rule ID → Human Explanation ──────────────────────────────

export const RULE_LABELS: Record<string, { label: string; explanation: string }> = {
  learning_phase: {
    label: 'New ad — still learning',
    explanation: 'This ad is too new to evaluate. Give it a few more days to gather data.',
  },
  creative_fatigue: {
    label: 'People have seen this ad too many times',
    explanation: "Your audience is getting tired of seeing the same creative. Click rates drop when ads get repetitive.",
  },
  negative_roas: {
    label: 'This ad is losing money',
    explanation: "You're spending more on this ad than it's bringing in. Every dollar spent is a loss.",
  },
  winner_not_scaled: {
    label: 'This winning ad could grow more',
    explanation: 'This ad is performing great but has room to reach more people with a bigger budget.',
  },
  wasted_budget: {
    label: 'Money spent with no sales',
    explanation: "This ad is getting views but nobody is buying. The budget would be better spent elsewhere.",
  },
  low_ctr: {
    label: 'Few people are clicking this ad',
    explanation: 'The ad creative or message isn\'t catching attention. Fresh copy or visuals could help.',
  },
  click_no_buy: {
    label: 'People click but don\'t buy',
    explanation: 'The ad gets attention, but something on your landing page is losing the sale.',
  },
  paused_positive: {
    label: 'A paused ad that was making money',
    explanation: 'This ad was turned off but had good results. It might be worth restarting.',
  },
  top_performer: {
    label: 'Your best-performing ad',
    explanation: 'This ad is consistently delivering great results. Consider giving it more budget.',
  },
  budget_pacing: {
    label: 'Under-spending its budget',
    explanation: 'This ad set isn\'t using all its daily budget. The audience or bid might need adjusting.',
  },
  audience_saturation: {
    label: 'Audience is getting saturated',
    explanation: 'People in this audience have seen your ads many times. Consider expanding the audience.',
  },
  cost_spike: {
    label: 'Costs are rising fast',
    explanation: 'The cost per click jumped significantly. This usually means increased competition or audience fatigue.',
  },
};

// ── Metric → Human Labels ────────────────────────────────────

export const METRIC_LABELS: Record<MetricKey, MetricExplanation> = {
  roas: {
    label: 'Return',
    tooltip: 'For every $1 you spend on this ad, you get this much back in sales. Above 2x is good.',
    format: (v: number) => `${v.toFixed(2)}x`,
  },
  ctr: {
    label: 'Click rate',
    tooltip: 'What percentage of people who see this ad actually click on it. Above 1% is typical.',
    format: (v: number) => `${v.toFixed(2)}%`,
  },
  cpc: {
    label: 'Cost per click',
    tooltip: 'How much you pay each time someone clicks your ad.',
    format: (v: number) => `$${v.toFixed(2)}`,
  },
  frequency: {
    label: 'Views per person',
    tooltip: 'How many times each person has seen this ad on average. Above 3x means people are seeing it too often.',
    format: (v: number) => `${v.toFixed(1)}x`,
  },
  spend: {
    label: 'Money spent',
    tooltip: 'Total amount spent on this ad in the last 7 days.',
    format: (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
  },
  conversions: {
    label: 'Sales',
    tooltip: 'Number of purchases attributed to this ad.',
    format: (v: number) => String(Math.round(v)),
  },
  revenue: {
    label: 'Revenue',
    tooltip: 'Total sales revenue generated by this ad.',
    format: (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
  },
};

// ── Copy Variant Angles → Human Labels ───────────────────────

export const ANGLE_LABELS: Record<string, { label: string; description: string }> = {
  benefit: {
    label: 'Highlights value',
    description: 'Focuses on what the product does for the customer',
  },
  pain_point: {
    label: 'Addresses a problem',
    description: 'Speaks to an issue the customer faces',
  },
  urgency: {
    label: 'Creates urgency',
    description: 'Motivates the customer to act now',
  },
};

// ── Helpers ──────────────────────────────────────────────────

export function getActionLabel(action: DiagnosisAction): HumanAction {
  return ACTION_LABELS[action] ?? ACTION_LABELS.NONE;
}

export function getSeverityLabel(severity: DiagnosisSeverity): string {
  return SEVERITY_LABELS[severity]?.label ?? severity;
}

export function getRuleLabel(ruleId: string): string {
  return RULE_LABELS[ruleId]?.label ?? ruleId.replace(/_/g, ' ');
}

export function getRuleExplanation(ruleId: string): string {
  return RULE_LABELS[ruleId]?.explanation ?? '';
}
