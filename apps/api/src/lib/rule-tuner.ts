// ──────────────────────────────────────────────────────────────
// Growth OS — Rule Tuner
// Analyzes diagnosis feedback patterns to generate rule health
// metrics and threshold adjustment suggestions.
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';

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
