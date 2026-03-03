'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import { SeverityDot } from './severity-badge';
import { SeverityGroupHeader } from './severity-group';
import { ExpiryCountdown } from './expiry-countdown';
import { AdThumbnail } from './ad-thumbnail';
import { ConfidenceBadge } from './confidence-badge';
import { AnimatedList } from '@/components/ui/animated-list';
import type { Diagnosis, DiagnosisSeverity } from './types';

interface DiagnosisListProps {
  diagnoses: Diagnosis[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
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
    case 'PAUSE_AD':
    case 'DECREASE_BUDGET':
      return 'text-apple-red bg-[var(--tint-red)]';
    case 'REACTIVATE_AD':
    case 'INCREASE_BUDGET':
      return 'text-apple-green bg-[var(--tint-green)]';
    case 'GENERATE_COPY_VARIANTS':
    case 'REFRESH_CREATIVE':
      return 'text-apple-blue bg-[var(--tint-blue)]';
    default:
      return 'text-[var(--foreground-secondary)] bg-glass-hover';
  }
}

const severityOrder: DiagnosisSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];

export function DiagnosisList({ diagnoses, selectedId, onSelect, selectionMode, selectedIds, onToggleSelect, onSelectAll, onDeselectAll }: DiagnosisListProps) {
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
      {selectionMode && diagnoses.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--glass-border)]">
          <input
            type="checkbox"
            checked={selectedIds?.size === diagnoses.length && diagnoses.length > 0}
            onChange={() => {
              if (selectedIds?.size === diagnoses.length) {
                onDeselectAll?.();
              } else {
                onSelectAll?.();
              }
            }}
            className="h-3.5 w-3.5 rounded border-[var(--glass-border)] accent-apple-blue"
          />
          <span className="text-xs text-[var(--foreground-secondary)]">
            {selectedIds?.size === diagnoses.length ? 'Deselect all' : `Select all (${diagnoses.length})`}
          </span>
        </div>
      )}
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
                      'w-full text-left px-3 py-3 rounded-lg press-scale transition-all ease-spring',
                      selectedId === diag.id
                        ? 'bg-[var(--tint-blue)] border border-apple-blue/30'
                        : 'hover:bg-glass-hover border border-transparent',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {selectionMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds?.has(diag.id) ?? false}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleSelect?.(diag.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 rounded border-[var(--glass-border)] accent-apple-blue flex-shrink-0 mt-1"
                        />
                      )}
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
                          <span className={`text-label px-2 py-0.5 rounded font-medium ${actionColor(diag.actionType)}`}>
                            {actionLabel(diag.actionType)}
                          </span>
                          <span className="text-caption text-[var(--foreground-secondary)]/60">
                            ${spend.toFixed(0)} / 7d
                          </span>
                          {isPauseAction && spend > 0 && (
                            <span className="text-caption text-apple-red font-medium">
                              wasting ${spend.toLocaleString()}
                            </span>
                          )}
                          {diag.confidence !== null && <ConfidenceBadge confidence={diag.confidence} />}
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
