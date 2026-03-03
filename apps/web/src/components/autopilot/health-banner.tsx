'use client';

import { useMemo } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import type { AutopilotStats, DiagnosisStats, Diagnosis } from './types';

interface HealthBannerProps {
  autopilotStats: AutopilotStats | null;
  diagnosisStats: DiagnosisStats | null;
  diagnoses: Diagnosis[];
}

function formatCompact(num: number): string {
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

type BannerLevel = 'green' | 'yellow' | 'red';

function bannerStyles(level: BannerLevel): string {
  switch (level) {
    case 'green':
      return 'border-l-4 border-apple-green bg-[var(--tint-green)]/30';
    case 'yellow':
      return 'border-l-4 border-apple-yellow bg-[var(--tint-yellow)]/30';
    case 'red':
      return 'border-l-4 border-apple-red bg-[var(--tint-red)]/30';
  }
}

function bannerIconColor(level: BannerLevel): string {
  switch (level) {
    case 'green': return 'text-apple-green';
    case 'yellow': return 'text-apple-yellow';
    case 'red': return 'text-apple-red';
  }
}

export function HealthBanner({ autopilotStats, diagnosisStats, diagnoses }: HealthBannerProps): JSX.Element | null {
  const atRiskSpend = useMemo(() => {
    const seen = new Set<string>();
    let total = 0;
    for (const d of diagnoses) {
      if ((d.severity === 'CRITICAL' || d.severity === 'WARNING') && !seen.has(d.ad.id)) {
        seen.add(d.ad.id);
        total += Number(d.ad.spend7d) || 0;
      }
    }
    return total;
  }, [diagnoses]);

  if (!autopilotStats) return null;

  const total = diagnosisStats?.total ?? 0;
  const critical = diagnosisStats?.critical ?? 0;
  const level: BannerLevel = critical > 0 ? 'red' : total > 0 ? 'yellow' : 'green';

  return (
    <div className={`card px-5 py-3.5 flex items-center gap-3 ${bannerStyles(level)}`}>
      {level === 'green' ? (
        <CheckCircle className={`h-5 w-5 shrink-0 ${bannerIconColor(level)}`} />
      ) : (
        <AlertTriangle className={`h-5 w-5 shrink-0 ${bannerIconColor(level)}`} />
      )}
      <div>
        {level === 'green' && (
          <p className="text-sm font-semibold text-[var(--foreground)]">
            All clear — your ads are performing well
          </p>
        )}
        {level === 'yellow' && (
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {total} issue{total !== 1 ? 's' : ''} found — review recommended
          </p>
        )}
        {level === 'red' && (
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {critical} critical issue{critical !== 1 ? 's' : ''} — {formatCompact(atRiskSpend)} at risk
          </p>
        )}
      </div>
    </div>
  );
}

export function HealthBannerSkeleton(): JSX.Element {
  return (
    <div className="card px-5 py-3.5 flex items-center gap-3">
      <div className="h-5 w-5 rounded-full skeleton-shimmer" />
      <div className="h-4 w-64 skeleton-shimmer" />
    </div>
  );
}
