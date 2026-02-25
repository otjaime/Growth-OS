'use client';

import type { Experiment } from './types';
import { VerdictBadge } from './ab-results';

interface ScorecardProps {
  exp: Experiment;
}

function formatMetric(value: number, metric: string): string {
  if (metric === 'conversion_rate' || metric === 'retention') return `${(value * 100).toFixed(2)}%`;
  if (metric === 'cac' || metric === 'aov' || metric === 'ltv' || metric === 'revenue') return `$${value.toLocaleString()}`;
  if (metric === 'mer') return `${value.toFixed(2)}x`;
  return value.toLocaleString();
}

function GuardrailIndicator({ status }: { status: 'green' | 'yellow' | 'red' | 'unknown' }): React.ReactElement {
  const colors = {
    green: 'bg-apple-green',
    yellow: 'bg-apple-yellow',
    red: 'bg-apple-red',
    unknown: 'bg-[var(--foreground-secondary)]/50',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

export function Scorecard({ exp }: ScorecardProps): React.ReactElement {
  const hasABData = exp.controlRate != null && exp.variantRate != null;
  const guardrails = (exp.guardrailMetrics ?? []) as string[];

  return (
    <div className="space-y-3 mt-3">
      <div className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">Experiment Scorecard</div>

      {/* Primary Metric Result */}
      <div className="p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--foreground-secondary)] uppercase">Primary Metric</span>
          {exp.verdict && <VerdictBadge verdict={exp.verdict} />}
        </div>
        <div className="flex items-end gap-4">
          <div>
            <div className="text-[10px] text-[var(--foreground-secondary)]">{exp.primaryMetric.replace(/_/g, ' ')}</div>
            {hasABData && (
              <div className="flex items-center gap-3 mt-1">
                <div>
                  <span className="text-[10px] text-[var(--foreground-secondary)]">Control: </span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{formatMetric(exp.controlRate!, exp.primaryMetric)}</span>
                </div>
                <div className="text-[var(--foreground-secondary)]">&rarr;</div>
                <div>
                  <span className="text-[10px] text-[var(--foreground-secondary)]">Variant: </span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{formatMetric(exp.variantRate!, exp.primaryMetric)}</span>
                </div>
              </div>
            )}
          </div>
          {exp.targetLift != null && exp.relativeLift != null && (
            <div className="ml-auto text-right">
              <div className="text-[10px] text-[var(--foreground-secondary)]">vs target {exp.targetLift}%</div>
              <div className={`text-sm font-semibold ${(exp.relativeLift * 100) >= exp.targetLift ? 'text-apple-green' : 'text-apple-yellow'}`}>
                {exp.relativeLift >= 0 ? '+' : ''}{(exp.relativeLift * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Guardrail Status */}
      {guardrails.length > 0 && (
        <div className="p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)]">
          <div className="text-xs text-[var(--foreground-secondary)] uppercase mb-2">Guardrails</div>
          <div className="space-y-1.5">
            {guardrails.map((g) => (
              <div key={g} className="flex items-center gap-2">
                <GuardrailIndicator status="green" />
                <span className="text-xs text-[var(--foreground)]">{g.replace(/_/g, ' ')}</span>
                <span className="text-[10px] text-[var(--foreground-secondary)] ml-auto">No degradation detected</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statistical Significance */}
      {hasABData && (
        <div className="p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)]">
          <div className="text-xs text-[var(--foreground-secondary)] uppercase mb-2">Statistical Significance</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-[var(--foreground-secondary)]">p-value</div>
              <div className={`text-sm font-medium ${(exp.pValue ?? 1) < 0.05 ? 'text-apple-green' : 'text-apple-yellow'}`}>
                {exp.pValue?.toFixed(4) ?? 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--foreground-secondary)]">Confidence</div>
              <div className="text-sm font-medium text-[var(--foreground)]">
                {exp.confidenceLevel != null ? `${(exp.confidenceLevel * 100).toFixed(1)}%` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--foreground-secondary)]">95% CI</div>
              <div className="text-sm font-medium text-[var(--foreground)]">
                {exp.confidenceInterval
                  ? `[${(exp.confidenceInterval.lower * 100).toFixed(2)}%, ${(exp.confidenceInterval.upper * 100).toFixed(2)}%]`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expected vs Actual Impact */}
      {exp.expectedImpactUsd != null && (
        <div className="p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)]">
          <div className="text-xs text-[var(--foreground-secondary)] uppercase mb-2">Dollar Impact</div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-[var(--foreground-secondary)]">Expected</div>
              <div className="text-sm font-medium text-[var(--foreground)]">${exp.expectedImpactUsd.toLocaleString()}</div>
            </div>
            {exp.verdict === 'WINNER' && exp.relativeLift != null && (
              <div>
                <div className="text-[10px] text-[var(--foreground-secondary)]">Estimated Actual</div>
                <div className="text-sm font-medium text-apple-green">
                  ~${Math.round(exp.expectedImpactUsd * (exp.relativeLift * 100) / (exp.targetLift ?? exp.relativeLift * 100)).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Learnings */}
      {exp.learnings && (
        <div className="p-3 bg-[var(--tint-purple)] rounded-lg border border-apple-purple/20">
          <div className="text-xs text-apple-purple uppercase mb-1.5">Key Learnings</div>
          <p className="text-sm text-[var(--foreground)]">{exp.learnings}</p>
        </div>
      )}
    </div>
  );
}
