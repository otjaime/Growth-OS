'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen, X } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { formatMultiplier } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton, TableSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge, getStatusVariant } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { GlassSurface } from '@/components/ui/glass-surface';

interface TradeEntry {
  id: string;
  title: string;
  trigger: string;
  awarenessLevel: number;
  expectedROAS: number;
  actualROAS: number | null;
  delta: number | null;
  verdict: string;
  lesson: string | null;
  closedAt: string | null;
}

interface TrackRecord {
  winRate: number;
  expectedValue: number;
  sharpeEquivalent: number;
  alpha: number;
}

export default function TradebookPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [trackRecord, setTrackRecord] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [triggerFilter, setTriggerFilter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');

  // Lesson modal
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiFetch(`/api/clients/${clientId}/tradebook`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/clients/${clientId}/track-record`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([tradeData, recordData]) => {
        if (tradeData) setTrades(tradeData.trades ?? tradeData);
        if (recordData) setTrackRecord(recordData);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [clientId]);

  const uniqueTriggers = useMemo(() => {
    const set = new Set(trades.map((t) => t.trigger));
    return Array.from(set).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    let list = trades;
    if (triggerFilter) list = list.filter((t) => t.trigger === triggerFilter);
    if (verdictFilter) list = list.filter((t) => t.verdict === verdictFilter);
    return list;
  }, [trades, triggerFilter, verdictFilter]);

  const filteredWinRate = useMemo(() => {
    const wins = filteredTrades.filter((t) => t.verdict === 'WIN' || t.verdict === 'WINNER').length;
    return filteredTrades.length > 0 ? wins / filteredTrades.length : null;
  }, [filteredTrades]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trade Book" breadcrumb={{ label: 'Back to Client', href: `/clients/${clientId}` }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton />
        </div>
        <TableSkeleton rows={6} cols={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trade Book" breadcrumb={{ label: 'Back to Client', href: `/clients/${clientId}` }} />
        <ErrorState message="Failed to load trade book." onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Trade Book" breadcrumb={{ label: 'Back to Client', href: `/clients/${clientId}` }} />

      {/* Stats Row */}
      {trackRecord && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Win Rate" value={trackRecord.winRate} format="percent" />
          <KpiCard title="Expected Value" value={trackRecord.expectedValue} format="multiplier" />
          <KpiCard title="Sharpe Equiv." value={trackRecord.sharpeEquivalent} format="multiplier" />
          <KpiCard title="Alpha" value={trackRecord.alpha} format="multiplier" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          placeholder="All Triggers"
          options={uniqueTriggers.map((t) => ({ value: t, label: t }))}
        />
        <Select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          placeholder="All Verdicts"
          options={[
            { value: 'WIN', label: 'Win' },
            { value: 'LOSS', label: 'Loss' },
            { value: 'INCONCLUSIVE', label: 'Inconclusive' },
          ]}
        />
      </div>

      {/* Table */}
      {filteredTrades.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No closed hypotheses yet."
          description="The track record builds as campaigns close."
        />
      ) : (
        <GlassSurface className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Trigger</th>
                  <th className="px-5 py-3 font-medium text-center">Awareness</th>
                  <th className="px-5 py-3 font-medium text-right">Exp ROAS</th>
                  <th className="px-5 py-3 font-medium text-right">Act ROAS</th>
                  <th className="px-5 py-3 font-medium text-right">Delta</th>
                  <th className="px-5 py-3 font-medium text-center">Verdict</th>
                  <th className="px-5 py-3 font-medium">Lesson</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-sm text-[var(--foreground)]">{t.title}</td>
                    <td className="px-5 py-3">
                      <Badge variant="slate">{t.trigger}</Badge>
                    </td>
                    <td className="px-5 py-3 text-center font-mono text-xs text-[var(--foreground)]">{t.awarenessLevel}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">{formatMultiplier(t.expectedROAS)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                      {t.actualROAS != null ? formatMultiplier(t.actualROAS) : '--'}
                    </td>
                    <td className={clsx(
                      'px-5 py-3 text-right font-mono text-xs',
                      t.delta != null && t.delta > 0 ? 'text-green-400' : t.delta != null && t.delta < 0 ? 'text-red-400' : 'text-[var(--foreground-secondary)]',
                    )}>
                      {t.delta != null ? `${t.delta > 0 ? '+' : ''}${t.delta.toFixed(2)}x` : '--'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={getStatusVariant(t.verdict)}>{t.verdict}</Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--foreground-secondary)] max-w-[200px]">
                      {t.lesson ? (
                        <button
                          onClick={() => setExpandedLesson(t.lesson)}
                          className="text-left hover:text-[var(--foreground)] transition-colors truncate block w-full"
                          title={t.lesson}
                        >
                          {t.lesson.length > 60 ? `${t.lesson.slice(0, 60)}...` : t.lesson}
                        </button>
                      ) : (
                        <span className="text-[var(--foreground-secondary)]/30">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[var(--glass-border)] flex items-center justify-between">
            <span className="text-xs text-[var(--foreground-secondary)]">
              {filteredTrades.length} trade{filteredTrades.length !== 1 ? 's' : ''} shown
            </span>
            {filteredWinRate != null && (
              <span className="text-xs font-mono text-[var(--foreground)]">
                Filter Win Rate: {(filteredWinRate * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </GlassSurface>
      )}

      {/* Lesson Modal */}
      {expandedLesson && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setExpandedLesson(null)}>
          <div className="card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Lesson Learned</h3>
              <button onClick={() => setExpandedLesson(null)} className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">{expandedLesson}</p>
          </div>
        </div>
      )}
    </div>
  );
}
