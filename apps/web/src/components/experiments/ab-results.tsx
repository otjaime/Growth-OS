'use client';

import { BarChart3 } from 'lucide-react';
import clsx from 'clsx';
import type { Experiment } from './types';

export function VerdictBadge({ verdict }: { verdict: string }): React.ReactElement {
  const styles: Record<string, string> = {
    WINNER: 'bg-[var(--tint-green)] text-apple-green',
    LOSER: 'bg-[var(--tint-red)] text-apple-red',
    INCONCLUSIVE: 'bg-[var(--tint-yellow)] text-apple-yellow',
  };
  const labels: Record<string, string> = {
    WINNER: 'Winner',
    LOSER: 'No Improvement',
    INCONCLUSIVE: 'Inconclusive',
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[verdict] ?? styles.INCONCLUSIVE}`}>
      {labels[verdict] ?? verdict}
    </span>
  );
}

export function ConversionBar({ controlRate, variantRate }: { controlRate: number; variantRate: number }): React.ReactElement {
  const maxRate = Math.max(controlRate, variantRate, 0.001);
  const controlWidth = (controlRate / maxRate) * 100;
  const variantWidth = (variantRate / maxRate) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--foreground-secondary)] w-14 shrink-0">Control</span>
        <div className="flex-1 bg-white/[0.04] rounded-full h-2">
          <div className="bg-[var(--foreground-secondary)] rounded-full h-2 transition-all ease-spring" style={{ width: `${controlWidth}%` }} />
        </div>
        <span className="text-[10px] text-[var(--foreground-secondary)] w-12 text-right">{(controlRate * 100).toFixed(2)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--foreground-secondary)] w-14 shrink-0">Variant</span>
        <div className="flex-1 bg-white/[0.04] rounded-full h-2">
          <div className={clsx(
            'rounded-full h-2 transition-all ease-spring',
            variantRate >= controlRate ? 'bg-apple-green' : 'bg-apple-red',
          )} style={{ width: `${variantWidth}%` }} />
        </div>
        <span className="text-[10px] text-[var(--foreground-secondary)] w-12 text-right">{(variantRate * 100).toFixed(2)}%</span>
      </div>
    </div>
  );
}

export function ABResultsCard({ exp }: { exp: Experiment }): React.ReactElement | null {
  if (!exp.verdict) return null;
  const ci = exp.confidenceInterval as { lower: number; upper: number } | null;
  return (
    <div className="p-4 bg-white/[0.04] rounded-lg border border-[var(--glass-border)] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" /> A/B Test Result
        </span>
        <VerdictBadge verdict={exp.verdict} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-[var(--foreground-secondary)]">{exp.controlName ?? 'Control'}</div>
          <div className="text-lg font-semibold text-[var(--foreground)]">{((exp.controlRate ?? 0) * 100).toFixed(2)}%</div>
          <div className="text-xs text-[var(--foreground-secondary)]">{exp.controlConversions?.toLocaleString()} / {exp.controlSampleSize?.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--foreground-secondary)]">{exp.variantName ?? 'Variant'}</div>
          <div className="text-lg font-semibold text-[var(--foreground)]">{((exp.variantRate ?? 0) * 100).toFixed(2)}%</div>
          <div className="text-xs text-[var(--foreground-secondary)]">{exp.variantConversions?.toLocaleString()} / {exp.variantSampleSize?.toLocaleString()}</div>
        </div>
      </div>

      {exp.controlRate != null && exp.variantRate != null && (
        <ConversionBar controlRate={exp.controlRate} variantRate={exp.variantRate} />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground-secondary)]">
        <span>Lift: <strong className="text-[var(--foreground)]">{(exp.relativeLift ?? 0) > 0 ? '+' : ''}{((exp.relativeLift ?? 0) * 100).toFixed(1)}%</strong></span>
        <span>p-value: <strong className="text-[var(--foreground)]">{(exp.pValue ?? 1).toFixed(4)}</strong></span>
        {ci && (
          <span>95% CI: <strong className="text-[var(--foreground)]">[{(ci.lower * 100).toFixed(2)}%, {(ci.upper * 100).toFixed(2)}%]</strong></span>
        )}
      </div>

      <div className={clsx('text-xs font-medium', exp.isSignificant ? 'text-apple-green' : 'text-apple-yellow')}>
        {exp.isSignificant ? 'Statistically significant (p < 0.05)' : 'Not statistically significant'}
      </div>
    </div>
  );
}
