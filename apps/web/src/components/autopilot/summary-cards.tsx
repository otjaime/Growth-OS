'use client';

import { useMemo } from 'react';
import { BarChart3, Activity, Target, DollarSign } from 'lucide-react';
import { CounterTicker } from '@/components/ui/counter-ticker';
import { ReflectiveCard } from '@/components/ui/reflective-card';
import type { AutopilotStats, DiagnosisStats, Diagnosis } from './types';

interface AutopilotSummaryCardsProps {
  stats: AutopilotStats | null;
  diagnosisStats: DiagnosisStats | null;
  diagnoses: Diagnosis[];
}

export function AutopilotSummaryCards({ stats, diagnosisStats, diagnoses }: AutopilotSummaryCardsProps) {
  // Dollar impact: sum of spend7d for CRITICAL + WARNING diagnosed ads
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

  if (!stats) return null;

  const roas = stats.metrics7d.blendedRoas;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active Ads */}
      <ReflectiveCard className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-4 w-4 text-apple-blue" />
          <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Active Ads</p>
        </div>
        <CounterTicker value={stats.activeAds} className="text-2xl font-bold text-[var(--foreground)]" />
        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{stats.totalAds} total</p>
      </ReflectiveCard>

      {/* Spend (7d) + ROAS */}
      <ReflectiveCard className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-apple-green" />
          <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Spend (7d)</p>
        </div>
        <p className="text-2xl font-bold text-[var(--foreground)]">
          ${stats.metrics7d.totalSpend.toLocaleString()}
        </p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
          {roas ? `${roas.toFixed(2)}x ROAS` : 'No ROAS data'}
        </p>
      </ReflectiveCard>

      {/* Diagnoses with dollar impact */}
      <ReflectiveCard className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-apple-purple" />
          <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Diagnoses</p>
        </div>
        <CounterTicker value={diagnosisStats?.total ?? 0} className="text-2xl font-bold text-[var(--foreground)]" />
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {(diagnosisStats?.critical ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tint-red)] text-apple-red font-medium">
              {diagnosisStats!.critical} critical
            </span>
          )}
          {(diagnosisStats?.warning ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tint-yellow)] text-apple-yellow font-medium">
              {diagnosisStats!.warning} warning
            </span>
          )}
        </div>
      </ReflectiveCard>

      {/* At Risk / Revenue */}
      <ReflectiveCard className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-apple-yellow" />
          <p className="text-[10px] uppercase text-[var(--foreground-secondary)]/60 font-medium">Revenue (7d)</p>
        </div>
        <p className="text-2xl font-bold text-[var(--foreground)]">
          ${stats.metrics7d.totalRevenue.toLocaleString()}
        </p>
        {atRiskSpend > 0 ? (
          <p className="text-xs text-apple-red mt-0.5 font-medium">
            ${atRiskSpend.toLocaleString()} at risk
          </p>
        ) : (
          <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
            {stats.metrics7d.totalConversions} conversions
          </p>
        )}
      </ReflectiveCard>
    </div>
  );
}
