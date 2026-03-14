'use client';

import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatMultiplier } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton, TableSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge, getStatusVariant } from '@/components/ui/badge';
import { GlassSurface } from '@/components/ui/glass-surface';

interface TrackRecord {
  totalHypotheses: number;
  wins: number;
  losses: number;
  inconclusive: number;
  winRate: number;
  expectedValue: number;
  sharpeEquivalent: number | null;
  alpha: number | null;
  industryBenchmarkROAS: number;
  avgWinnerROAS: number;
  avgLoserROAS: number;
  sampleDisclaimer: string | null;
}

interface TriggerScore {
  id: string;
  trigger: string;
  vertical: string;
  awarenessLevel: number;
  sampleSize: number;
  winRate: number;
  avgROAS: number | null;
  confidence: string;
}

interface TradeBookEntry {
  id: string;
  title: string;
  clientName: string;
  trigger: string;
  verdict: string;
  actualROAS: number | null;
  expectedROAS: number | null;
  delta: number | null;
  lesson: string | null;
  closedAt: string;
}

export default function PortfolioPage() {
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [scores, setScores] = useState<TriggerScore[]>([]);
  const [trades, setTrades] = useState<TradeBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiFetch('/api/portfolio/track-record').then((r) => r.ok ? r.json() : null),
      apiFetch('/api/portfolio/trigger-scores').then((r) => r.ok ? r.json() : null),
      apiFetch('/api/portfolio/tradebook?limit=20').then((r) => r.ok ? r.json() : null),
    ])
      .then(([trackData, scoresData, tradesData]) => {
        if (trackData) setTrack(trackData);
        if (scoresData) setScores(scoresData.scores ?? scoresData);
        if (tradesData) setTrades(tradesData.trades ?? tradesData);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Track Record" icon={Trophy} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton />
        </div>
        <TableSkeleton rows={6} cols={7} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Track Record" icon={Trophy} />
        <ErrorState message="Failed to load portfolio data." onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Track Record" icon={Trophy} />

      {/* Top-Level Stats */}
      {track && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Win Rate"
              value={track.winRate}
              format="percent"
              subtitle={`${track.wins}W / ${track.losses}L / ${track.inconclusive}I of ${track.totalHypotheses} total`}
            />
            <KpiCard
              title="Expected Value"
              value={track.expectedValue}
              format="multiplier"
              subtitle="Avg ROAS per hypothesis"
            />
            <KpiCard
              title="Sharpe Equiv."
              value={track.sharpeEquivalent ?? 0}
              format="multiplier"
              subtitle="Risk-adjusted return"
            />
            <KpiCard
              title="Alpha"
              value={track.alpha ?? 0}
              format="multiplier"
              subtitle={`vs ${track.industryBenchmarkROAS}x benchmark`}
            />
          </div>

          {track.sampleDisclaimer && (
            <p className="text-[10px] text-amber-400/60 italic">{track.sampleDisclaimer}</p>
          )}
        </>
      )}

      {/* Trigger Score Matrix */}
      {scores.length > 0 && (
        <GlassSurface className="card overflow-hidden !p-0">
          <div className="px-5 py-4 border-b border-[var(--glass-border)]">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Trigger Score Matrix</h2>
            <p className="text-[10px] text-[var(--foreground-secondary)] mt-0.5">
              Empirical win rates by trigger × vertical × awareness
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                  <th className="px-5 py-3 font-medium">Trigger</th>
                  <th className="px-5 py-3 font-medium">Vertical</th>
                  <th className="px-5 py-3 font-medium text-center">Awareness</th>
                  <th className="px-5 py-3 font-medium text-right">Win Rate</th>
                  <th className="px-5 py-3 font-medium text-right">Avg ROAS</th>
                  <th className="px-5 py-3 font-medium text-right">Sample</th>
                  <th className="px-5 py-3 font-medium text-center">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-sm text-[var(--foreground)]">{s.trigger}</td>
                    <td className="px-5 py-3 text-xs text-[var(--foreground-secondary)]">{s.vertical}</td>
                    <td className="px-5 py-3 text-center text-xs font-mono text-[var(--foreground)]">{s.awarenessLevel}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-mono font-semibold ${
                        s.winRate >= 0.6 ? 'text-green-400' : s.winRate >= 0.4 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {(s.winRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-mono text-[var(--foreground)]">
                      {s.avgROAS != null ? formatMultiplier(s.avgROAS) : '--'}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-mono text-[var(--foreground-secondary)]">
                      n={s.sampleSize}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={getStatusVariant(s.confidence)}>{s.confidence}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassSurface>
      )}

      {/* Recent Trades */}
      {trades.length > 0 && (
        <GlassSurface className="card overflow-hidden !p-0">
          <div className="px-5 py-4 border-b border-[var(--glass-border)]">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Recent Trades</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                  <th className="px-5 py-3 font-medium">Verdict</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Trigger</th>
                  <th className="px-5 py-3 font-medium text-right">ROAS</th>
                  <th className="px-5 py-3 font-medium text-right">Delta</th>
                  <th className="px-5 py-3 font-medium text-right">Closed</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <Badge variant={getStatusVariant(t.verdict)}>{t.verdict}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--foreground)]">{t.title}</td>
                    <td className="px-5 py-3 text-xs text-[var(--foreground-secondary)]">{t.clientName}</td>
                    <td className="px-5 py-3">
                      <Badge variant="slate">{t.trigger}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-mono text-[var(--foreground)]">
                      {t.actualROAS != null ? formatMultiplier(t.actualROAS) : '--'}
                    </td>
                    <td className={`px-5 py-3 text-right text-xs font-mono ${
                      t.delta != null && t.delta > 0 ? 'text-green-400' : t.delta != null && t.delta < 0 ? 'text-red-400' : 'text-[var(--foreground-secondary)]'
                    }`}>
                      {t.delta != null ? `${t.delta > 0 ? '+' : ''}${t.delta.toFixed(2)}x` : '--'}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-[var(--foreground-secondary)]">
                      {new Date(t.closedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassSurface>
      )}

      {/* Empty State */}
      {!track && trades.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="No track record yet."
          description="Close your first hypothesis to see results here."
        />
      )}
    </div>
  );
}
