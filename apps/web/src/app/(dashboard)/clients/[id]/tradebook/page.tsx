'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
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

const VERDICT_STYLES: Record<string, string> = {
  WIN: 'bg-green-500/20 text-green-400',
  LOSS: 'bg-red-500/20 text-red-400',
  INCONCLUSIVE: 'bg-gray-500/20 text-gray-400',
};

export default function TradebookPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [trackRecord, setTrackRecord] = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [triggerFilter, setTriggerFilter] = useState('ALL');
  const [verdictFilter, setVerdictFilter] = useState('ALL');

  // Lesson modal
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);

  useEffect(() => {
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
  }, [clientId]);

  const uniqueTriggers = useMemo(() => {
    const set = new Set(trades.map((t) => t.trigger));
    return Array.from(set).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    let list = trades;
    if (triggerFilter !== 'ALL') list = list.filter((t) => t.trigger === triggerFilter);
    if (verdictFilter !== 'ALL') list = list.filter((t) => t.verdict === verdictFilter);
    return list;
  }, [trades, triggerFilter, verdictFilter]);

  const filteredWinRate = useMemo(() => {
    const wins = filteredTrades.filter((t) => t.verdict === 'WIN').length;
    return filteredTrades.length > 0 ? wins / filteredTrades.length : null;
  }, [filteredTrades]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-apple-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Trade Book</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load trade book.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href={`/clients/${clientId}`} className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
          &larr; Back to Client
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Trade Book</h1>
      </div>

      {/* Stats Row */}
      {trackRecord && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassSurface className="card p-5">
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Win Rate</p>
            <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
              {(trackRecord.winRate * 100).toFixed(0)}%
            </p>
          </GlassSurface>
          <GlassSurface className="card p-5">
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Expected Value</p>
            <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
              {trackRecord.expectedValue >= 0 ? '+' : ''}{trackRecord.expectedValue.toFixed(2)}x
            </p>
          </GlassSurface>
          <GlassSurface className="card p-5">
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Sharpe Equiv.</p>
            <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
              {trackRecord.sharpeEquivalent.toFixed(2)}
            </p>
          </GlassSurface>
          <GlassSurface className="card p-5">
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Alpha</p>
            <p className={clsx(
              'text-2xl font-bold font-mono',
              trackRecord.alpha >= 0 ? 'text-green-400' : 'text-red-400',
            )}>
              {trackRecord.alpha >= 0 ? '+' : ''}{trackRecord.alpha.toFixed(2)}x
            </p>
          </GlassSurface>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          className="bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
        >
          <option value="ALL">All Triggers</option>
          {uniqueTriggers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          className="bg-white/[0.06] border border-[var(--glass-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-apple-blue focus:outline-none"
        >
          <option value="ALL">All Verdicts</option>
          <option value="WIN">Win</option>
          <option value="LOSS">Loss</option>
          <option value="INCONCLUSIVE">Inconclusive</option>
        </select>
      </div>

      {/* Table */}
      {filteredTrades.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-[var(--foreground-secondary)] text-sm">
            No closed hypotheses yet. The track record builds as campaigns close.
          </p>
        </div>
      ) : (
        <GlassSurface className="card overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Trigger</th>
                  <th className="px-4 py-3 font-medium text-center">Awareness</th>
                  <th className="px-4 py-3 font-medium text-right">Exp ROAS</th>
                  <th className="px-4 py-3 font-medium text-right">Act ROAS</th>
                  <th className="px-4 py-3 font-medium text-right">Delta</th>
                  <th className="px-4 py-3 font-medium text-center">Verdict</th>
                  <th className="px-4 py-3 font-medium">Lesson</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-[var(--foreground)]">{t.title}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300">
                        {t.trigger}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-[var(--foreground)]">{t.awarenessLevel}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--foreground)]">{t.expectedROAS.toFixed(2)}x</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                      {t.actualROAS != null ? `${t.actualROAS.toFixed(2)}x` : '--'}
                    </td>
                    <td className={clsx(
                      'px-4 py-3 text-right font-mono text-xs',
                      t.delta != null && t.delta > 0 ? 'text-green-400' : t.delta != null && t.delta < 0 ? 'text-red-400' : 'text-[var(--foreground-secondary)]',
                    )}>
                      {t.delta != null ? `${t.delta > 0 ? '+' : ''}${t.delta.toFixed(2)}x` : '--'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${VERDICT_STYLES[t.verdict] ?? VERDICT_STYLES.INCONCLUSIVE}`}>
                        {t.verdict}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--foreground-secondary)] max-w-[200px]">
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

          {/* Footer: running win rate */}
          <div className="px-4 py-3 border-t border-[var(--glass-border)] flex items-center justify-between">
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
