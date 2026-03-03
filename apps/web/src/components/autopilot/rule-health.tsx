'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface RuleHealth {
  ruleId: string;
  total: number;
  approved: number;
  dismissed: number;
  expired: number;
  autoExecuted: number;
  approvalRate: number;
  dismissalRate: number;
  effectivenessScore: number;
  suggestion: string | null;
}

function ruleDisplayName(ruleId: string): string {
  const names: Record<string, string> = {
    creative_fatigue: 'Creative Fatigue',
    negative_roas: 'Negative ROAS',
    winner_not_scaled: 'Winner Not Scaled',
    wasted_budget: 'Wasted Budget',
    low_ctr: 'Low CTR',
    click_no_buy: 'Click No Buy',
    learning_phase: 'Learning Phase',
    paused_positive: 'Paused Positive',
    top_performer: 'Top Performer',
    budget_pacing: 'Budget Pacing',
    audience_saturation: 'Audience Saturation',
    cost_spike: 'Cost Spike',
  };
  return names[ruleId] ?? ruleId;
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-apple-green'
      : score >= 40
        ? 'bg-apple-yellow'
        : 'bg-apple-red';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right text-[var(--foreground)]">{score}</span>
    </div>
  );
}

export function RuleHealth() {
  const [rules, setRules] = useState<RuleHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/autopilot/rule-health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { rules: RuleHealth[] } | null) => {
        if (data) setRules(data.rules);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--foreground-secondary)]" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-8 w-8 text-[var(--foreground-secondary)]/30 mx-auto mb-3" />
        <p className="text-sm text-[var(--foreground-secondary)]">No feedback data yet</p>
        <p className="text-xs text-[var(--foreground-secondary)]/60 mt-1">
          Approve or dismiss diagnoses to start building rule effectiveness data
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Rule Effectiveness (30 days)</h3>
        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
          Based on approve/dismiss/expire patterns for each diagnosis rule
        </p>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.ruleId}
            className="card border border-[var(--glass-border)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {ruleDisplayName(rule.ruleId)}
                </span>
                <span className="text-[10px] text-[var(--foreground-secondary)]/60 bg-[var(--glass-bg-thin)] px-1.5 py-0.5 rounded">
                  {rule.total} diagnoses
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-apple-green">
                  <Check className="h-3 w-3" />
                  {rule.approved + rule.autoExecuted}
                </span>
                <span className="flex items-center gap-1 text-apple-red">
                  <TrendingDown className="h-3 w-3" />
                  {rule.dismissed}
                </span>
                <span className="text-[var(--foreground-secondary)]/60">
                  {rule.expired} expired
                </span>
              </div>
            </div>

            <ScoreBar score={rule.effectivenessScore} />

            <div className="flex items-center gap-4 text-[10px] text-[var(--foreground-secondary)]">
              <span>Approval rate: <strong className="text-[var(--foreground)]">{Math.round(rule.approvalRate * 100)}%</strong></span>
              <span>Dismissal rate: <strong className="text-[var(--foreground)]">{Math.round(rule.dismissalRate * 100)}%</strong></span>
              {rule.autoExecuted > 0 && (
                <span>Auto-executed: <strong className="text-apple-blue">{rule.autoExecuted}</strong></span>
              )}
            </div>

            {rule.suggestion && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--tint-yellow)] text-xs text-apple-yellow">
                <TrendingUp className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{rule.suggestion}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
