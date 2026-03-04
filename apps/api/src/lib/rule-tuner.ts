// ──────────────────────────────────────────────────────────────
// Growth OS — Rule Tuner
// Analyzes diagnosis feedback patterns to generate rule health
// metrics and threshold adjustment suggestions.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';

export interface RuleHealthStats {
  ruleId: string;
  total: number;
  approved: number;
  dismissed: number;
  expired: number;
  autoExecuted: number;
  approvalRate: number;        // 0-1
  dismissalRate: number;       // 0-1
  effectivenessScore: number;  // 0-100
  suggestion: string | null;   // human-readable threshold suggestion
}

/**
 * Compute health metrics for each diagnosis rule based on historical feedback.
 * Looks at the last 30 days of feedback for the organization.
 */
export async function computeRuleHealth(organizationId: string): Promise<RuleHealthStats[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const feedback = await prisma.diagnosisFeedback.findMany({
    where: {
      organizationId,
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Group by ruleId
  const byRule = new Map<string, { total: number; approved: number; dismissed: number; expired: number; autoExecuted: number }>();
  for (const fb of feedback) {
    const stats = byRule.get(fb.ruleId) ?? { total: 0, approved: 0, dismissed: 0, expired: 0, autoExecuted: 0 };
    stats.total++;
    if (fb.action === 'APPROVED') stats.approved++;
    else if (fb.action === 'DISMISSED') stats.dismissed++;
    else if (fb.action === 'EXPIRED') stats.expired++;
    else if (fb.action === 'AUTO_EXECUTED') stats.autoExecuted++;
    byRule.set(fb.ruleId, stats);
  }

  const results: RuleHealthStats[] = [];
  for (const [ruleId, stats] of byRule) {
    const approvalRate = stats.total > 0 ? (stats.approved + stats.autoExecuted) / stats.total : 0;
    const dismissalRate = stats.total > 0 ? stats.dismissed / stats.total : 0;

    // Effectiveness: weighted score — approvals are good, dismissals are bad, expiries are neutral-bad
    // Score = 100 * (approved + autoExecuted) / total - 30 * (dismissed / total) - 10 * (expired / total)
    let effectivenessScore = Math.round(
      100 * approvalRate - 30 * dismissalRate - 10 * (stats.total > 0 ? stats.expired / stats.total : 0),
    );
    effectivenessScore = Math.max(0, Math.min(100, effectivenessScore));

    // Generate suggestion based on patterns
    let suggestion: string | null = null;
    if (stats.total >= 5) {
      if (dismissalRate > 0.6) {
        suggestion = `Rule "${ruleId}" is dismissed ${Math.round(dismissalRate * 100)}% of the time. Consider raising thresholds to reduce false positives.`;
      } else if (dismissalRate > 0.4) {
        suggestion = `Rule "${ruleId}" has a ${Math.round(dismissalRate * 100)}% dismissal rate. Review if thresholds are too aggressive.`;
      } else if (approvalRate > 0.8 && stats.total >= 10) {
        suggestion = `Rule "${ruleId}" is highly effective (${Math.round(approvalRate * 100)}% action rate). Consider enabling auto-execute for this rule.`;
      }
    }

    results.push({
      ruleId,
      total: stats.total,
      approved: stats.approved,
      dismissed: stats.dismissed,
      expired: stats.expired,
      autoExecuted: stats.autoExecuted,
      approvalRate: Math.round(approvalRate * 100) / 100,
      dismissalRate: Math.round(dismissalRate * 100) / 100,
      effectivenessScore,
      suggestion,
    });
  }

  // Sort by total (most active rules first)
  results.sort((a, b) => b.total - a.total);
  return results;
}

// ── Rule ID → Config Key Mapping ──────────────────────────────

/**
 * Maps diagnosis rule IDs to the DiagnosisRuleConfig keys they use.
 * When a rule has a high dismissal rate, we relax its threshold.
 * When a rule has a high approval rate, we tighten its threshold.
 */
const RULE_CONFIG_MAP: Record<string, {
  configKey: 'targetRoas' | 'topPerformerRoas' | 'maxFrequency' | 'minCtr';
  defaultValue: number;
  /** Direction to relax: 'raise' means increase the threshold to fire less often */
  relaxDirection: 'raise' | 'lower';
}> = {
  winner_not_scaled: { configKey: 'targetRoas', defaultValue: 3.0, relaxDirection: 'raise' },
  top_performer:     { configKey: 'topPerformerRoas', defaultValue: 2.0, relaxDirection: 'raise' },
  creative_fatigue:  { configKey: 'maxFrequency', defaultValue: 4.0, relaxDirection: 'raise' },
  low_ctr:           { configKey: 'minCtr', defaultValue: 0.008, relaxDirection: 'lower' },
};

export interface RuleOverrides {
  targetRoas?: number;
  topPerformerRoas?: number;
  maxFrequency?: number;
  minCtr?: number;
}

export interface AutoAdjustResult {
  overrides: RuleOverrides;
  adjustments: string[];
}

const RELAX_PCT = 0.15;           // Relax by 15% when dismissal rate is high
const TIGHTEN_PCT = 0.10;         // Tighten by 10% when approval rate is high
const MIN_SAMPLES_RELAX = 10;     // Need ≥10 feedback entries to relax
const MIN_SAMPLES_TIGHTEN = 20;   // Need ≥20 to tighten
const DISMISSAL_THRESHOLD = 0.50; // >50% dismissals → relax
const APPROVAL_THRESHOLD = 0.90;  // >90% approvals → tighten

/**
 * Analyze feedback patterns and auto-adjust rule thresholds.
 *
 * - If a rule has >50% dismissal rate (n≥10): relax its threshold by 15%
 * - If a rule has >90% approval rate (n≥20): tighten its threshold by 10%
 * - Persists adjustments in AutopilotConfig.ruleOverrides
 *
 * Returns the final merged overrides and a log of adjustments made.
 */
export async function autoAdjustThresholds(
  organizationId: string,
): Promise<AutoAdjustResult> {
  const health = await computeRuleHealth(organizationId);
  const adjustments: string[] = [];

  // Load existing overrides from DB
  const config = await prisma.autopilotConfig.findUnique({
    where: { organizationId },
    select: { ruleOverrides: true },
  });

  const existing: RuleOverrides = (config?.ruleOverrides as RuleOverrides | null) ?? {};
  const overrides: RuleOverrides = { ...existing };

  for (const rule of health) {
    const mapping = RULE_CONFIG_MAP[rule.ruleId];
    if (!mapping) continue;

    const currentValue = overrides[mapping.configKey] ?? mapping.defaultValue;

    if (rule.total >= MIN_SAMPLES_RELAX && rule.dismissalRate > DISMISSAL_THRESHOLD) {
      // Rule fires too aggressively — relax threshold
      let newValue: number;
      if (mapping.relaxDirection === 'raise') {
        newValue = currentValue * (1 + RELAX_PCT);
      } else {
        newValue = currentValue * (1 - RELAX_PCT);
      }
      newValue = Math.round(newValue * 10000) / 10000;
      overrides[mapping.configKey] = newValue;
      adjustments.push(
        `Relaxed ${mapping.configKey} from ${currentValue} → ${newValue} (${rule.ruleId} dismissed ${Math.round(rule.dismissalRate * 100)}%)`,
      );
    } else if (rule.total >= MIN_SAMPLES_TIGHTEN && rule.approvalRate > APPROVAL_THRESHOLD) {
      // Rule is highly accurate — tighten threshold
      let newValue: number;
      if (mapping.relaxDirection === 'raise') {
        newValue = currentValue * (1 - TIGHTEN_PCT);
      } else {
        newValue = currentValue * (1 + TIGHTEN_PCT);
      }
      newValue = Math.round(newValue * 10000) / 10000;
      overrides[mapping.configKey] = newValue;
      adjustments.push(
        `Tightened ${mapping.configKey} from ${currentValue} → ${newValue} (${rule.ruleId} approved ${Math.round(rule.approvalRate * 100)}%)`,
      );
    }
  }

  // Persist if any changes were made
  if (adjustments.length > 0) {
    await prisma.autopilotConfig.update({
      where: { organizationId },
      data: { ruleOverrides: overrides as unknown as Prisma.InputJsonValue },
    });
  }

  return { overrides, adjustments };
}
