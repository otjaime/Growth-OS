'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import type { TriggerPerformanceRecord, AwarenessLevel, FunnelStage } from './types';
import {
  AWARENESS_LABELS,
  AWARENESS_ORDER,
  TRIGGER_ORDER,
  TRIGGER_LABELS,
  CONFIDENCE_STYLES,
  FUNNEL_LABELS,
} from './psychology-labels';

interface TriggerPerformanceHeatmapProps {
  records: TriggerPerformanceRecord[];
  loading: boolean;
}

function winRateColor(rate: number): string {
  if (rate >= 0.5) return 'bg-apple-green/20 text-apple-green';
  if (rate >= 0.3) return 'bg-apple-yellow/20 text-apple-yellow';
  return 'bg-apple-red/20 text-apple-red';
}

export function TriggerPerformanceHeatmap({ records, loading }: TriggerPerformanceHeatmapProps): JSX.Element {
  const [verticalFilter, setVerticalFilter] = useState<string>('ALL');
  const [funnelFilter, setFunnelFilter] = useState<string>('ALL');
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  // Get unique verticals from data
  const verticals = useMemo(() => {
    const set = new Set(records.map((r) => r.vertical));
    return ['ALL', ...Array.from(set).sort()];
  }, [records]);

  // Client-side filter
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (verticalFilter !== 'ALL' && r.vertical !== verticalFilter) return false;
      if (funnelFilter !== 'ALL' && r.funnelStage !== funnelFilter) return false;
      return true;
    });
  }, [records, verticalFilter, funnelFilter]);

  // Build lookup: trigger+awareness → best record (highest sample)
  const cellMap = useMemo(() => {
    const map = new Map<string, TriggerPerformanceRecord>();
    for (const r of filtered) {
      const key = `${r.trigger}::${r.awarenessLevel}`;
      const existing = map.get(key);
      if (!existing || r.sampleSize > existing.sampleSize) {
        map.set(key, r);
      }
    }
    return map;
  }, [filtered]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-[var(--foreground-secondary)]" />
          <h3 className="text-sm font-semibold">Trigger Performance Library</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-glass-hover rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--foreground-secondary)]" />
          <h3 className="text-sm font-semibold">Trigger Performance Library</h3>
          <span className="text-caption text-[var(--foreground-secondary)]">
            {filtered.length} records
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            className="text-xs bg-glass-muted border border-white/10 rounded-lg px-2 py-1.5 text-[var(--foreground)]"
          >
            {verticals.map((v) => (
              <option key={v} value={v}>{v === 'ALL' ? 'All Verticals' : v}</option>
            ))}
          </select>
          <select
            value={funnelFilter}
            onChange={(e) => setFunnelFilter(e.target.value)}
            className="text-xs bg-glass-muted border border-white/10 rounded-lg px-2 py-1.5 text-[var(--foreground)]"
          >
            <option value="ALL">All Stages</option>
            {(Object.keys(FUNNEL_LABELS) as FunnelStage[]).map((fs) => (
              <option key={fs} value={fs}>{FUNNEL_LABELS[fs]}</option>
            ))}
          </select>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full bg-glass-hover flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="h-5 w-5 text-[var(--foreground-secondary)]" />
          </div>
          <p className="text-sm font-medium text-[var(--foreground)]">No performance data yet</p>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1">
            Close hypotheses with outcomes to build your trigger library
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          {/* Header row: awareness levels */}
          <div className="grid min-w-[640px]" style={{ gridTemplateColumns: '180px repeat(5, 1fr)' }}>
            <div className="px-2 py-2" />
            {AWARENESS_ORDER.map((al) => (
              <div key={al} className="px-2 py-2 text-center">
                <span className={`text-caption font-medium ${AWARENESS_LABELS[al].text}`}>
                  {AWARENESS_LABELS[al].short}
                </span>
              </div>
            ))}

            {/* Data rows: triggers */}
            {TRIGGER_ORDER.map((trigger) => {
              const hasAnyData = AWARENESS_ORDER.some(
                (al) => cellMap.has(`${trigger}::${al}`),
              );

              return [
                // Trigger label
                <div key={`${trigger}-label`} className="px-2 py-1.5 flex items-center">
                  <span className={`text-xs font-medium truncate ${hasAnyData ? 'text-[var(--foreground)]' : 'text-[var(--foreground-secondary)]'}`}>
                    {TRIGGER_LABELS[trigger].label}
                  </span>
                </div>,
                // Cells
                ...AWARENESS_ORDER.map((al) => {
                  const cellKey = `${trigger}::${al}`;
                  const record = cellMap.get(cellKey);
                  const isExpanded = expandedCell === cellKey;

                  if (!record) {
                    return (
                      <div key={cellKey} className="px-1 py-1">
                        <div className="h-10 rounded-lg bg-glass-hover/30 flex items-center justify-center">
                          <span className="text-caption text-[var(--foreground-secondary)]/40">—</span>
                        </div>
                      </div>
                    );
                  }

                  const confStyle = CONFIDENCE_STYLES[record.confidenceLevel];

                  return (
                    <div key={cellKey} className="px-1 py-1">
                      <button
                        onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                        className={`w-full rounded-lg p-1.5 transition-all ease-spring press-scale ${winRateColor(record.winRate)} ${isExpanded ? 'ring-1 ring-white/20' : ''}`}
                      >
                        <div className="text-xs font-semibold tabular-nums">
                          {(record.winRate * 100).toFixed(0)}%
                        </div>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <span className="text-caption opacity-70">n={record.sampleSize}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${confStyle.bg.replace('bg-', 'bg-')}`} />
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-1 p-2 rounded-lg bg-glass-elevated text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[var(--foreground-secondary)]">ROAS Δ</span>
                            <span className={record.avgRoasDelta >= 0 ? 'text-apple-green' : 'text-apple-red'}>
                              {record.avgRoasDelta >= 0 ? '+' : ''}{(record.avgRoasDelta * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--foreground-secondary)]">CTR Δ</span>
                            <span className={record.avgCtrDelta >= 0 ? 'text-apple-green' : 'text-apple-red'}>
                              {record.avgCtrDelta >= 0 ? '+' : ''}{(record.avgCtrDelta * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[var(--foreground-secondary)]">Confidence</span>
                            <span className={confStyle.text}>{confStyle.label}</span>
                          </div>
                          {record.bestImplementationPattern && (
                            <div className="pt-1 border-t border-white/5">
                              <span className="text-[var(--foreground-secondary)]">Best pattern: </span>
                              <span className="text-[var(--foreground)]">{record.bestImplementationPattern}</span>
                            </div>
                          )}
                          {record.commonFailurePattern && (
                            <div>
                              <span className="text-[var(--foreground-secondary)]">Common fail: </span>
                              <span className="text-[var(--foreground)]">{record.commonFailurePattern}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      )}
    </div>
  );
}
