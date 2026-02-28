'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import { SeverityDot } from './severity-badge';
import { SeverityGroupHeader } from './severity-group';
import { ExpiryCountdown } from './expiry-countdown';
import { AdThumbnail } from './ad-thumbnail';
import { AnimatedList } from '@/components/ui/animated-list';
import type { Diagnosis, DiagnosisSeverity } from './types';

interface DiagnosisListProps {
  diagnoses: Diagnosis[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function actionLabel(actionType: string): string {
  switch (actionType) {
    case 'GENERATE_COPY_VARIANTS': return 'Generate Copy';
    case 'PAUSE_AD': return 'Pause Ad';
    case 'REACTIVATE_AD': return 'Reactivate';
    case 'INCREASE_BUDGET': return 'Scale Budget';
    case 'DECREASE_BUDGET': return 'Reduce Budget';
    case 'REFRESH_CREATIVE': return 'Refresh Creative';
    default: return 'Monitor';
  }
}

function actionColor(actionType: string): string {
  switch (actionType) {
    case 'PAUSE_AD': return 'text-apple-red bg-[var(--tint-red)]';
    case 'REACTIVATE_AD': return 'text-apple-green bg-[var(--tint-green)]';
    case 'INCREASE_BUDGET': return 'text-apple-green bg-[var(--tint-green)]';
    case 'DECREASE_BUDGET': return 'text-apple-yellow bg-[var(--tint-yellow)]';
    case 'GENERATE_COPY_VARIANTS': return 'text-apple-purple bg-[var(--tint-purple)]';
    case 'REFRESH_CREATIVE': return 'text-apple-blue bg-[var(--tint-blue)]';
    default: return 'text-[var(--foreground-secondary)] bg-white/[0.06]';
  }
}

const severityOrder: DiagnosisSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];

export function DiagnosisList({ diagnoses, selectedId, onSelect }: DiagnosisListProps) {
  // Group diagnoses by severity
  const grouped = useMemo(() => {
    const map = new Map<DiagnosisSeverity, Diagnosis[]>();
    for (const s of severityOrder) map.set(s, []);
    for (const d of diagnoses) {
      const arr = map.get(d.severity);
      if (arr) arr.push(d);
    }
    return map;
  }, [diagnoses]);

  if (diagnoses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--tint-green)] flex items-center justify-center mb-3">
          <span className="text-apple-green text-xl">✓</span>
        </div>
        <p className="text-sm font-medium text-[var(--foreground)]">All Clear</p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1">No pending diagnoses</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {severityOrder.map((severity) => {
        const items = grouped.get(severity) ?? [];
        if (items.length === 0) return null;

        return (
          <div key={severity}>
            <SeverityGroupHeader severity={severity} count={items.length} />
            <AnimatedList className="space-y-1 mt-1">
              {items.map((diag) => {
                const isPauseAction = diag.actionType === 'PAUSE_AD';
                const spend = Number(diag.ad.spend7d);

                return (
                  <button
                    key={diag.id}
                    onClick={() => onSelect(diag.id)}
                    className={clsx(
                      'w-full text-left px-3 py-3 rounded-lg transition-all ease-spring',
                      selectedId === diag.id
                        ? 'bg-[var(--tint-blue)] border border-apple-blue/30'
                        : 'hover:bg-white/[0.06] border border-transparent',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <AdThumbnail
                        thumbnailUrl={diag.ad.thumbnailUrl}
                        imageUrl={diag.ad.imageUrl}
                        name={diag.ad.name}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <SeverityDot severity={diag.severity} />
                            <p className="text-sm font-medium text-[var(--foreground)] truncate">{diag.title}</p>
                          </div>
                          <ExpiryCountdown expiresAt={diag.expiresAt} />
                        </div>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 truncate">{diag.ad.name}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${actionColor(diag.actionType)}`}>
                            {actionLabel(diag.actionType)}
                          </span>
                          <span className="text-[10px] text-[var(--foreground-secondary)]/60">
                            ${spend.toFixed(0)} / 7d
                          </span>
                          {isPauseAction && spend > 0 && (
                            <span className="text-[10px] text-apple-red font-medium">
                              wasting ${spend.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </AnimatedList>
          </div>
        );
      })}
    </div>
  );
}
