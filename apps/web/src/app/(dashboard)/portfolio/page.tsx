'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Loader2, TrendingUp, Target, BarChart3, Shield } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
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

  useEffect(() => {
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
  }, []);

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
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Track Record</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load portfolio data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-apple-blue" />
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Track Record</h1>
      </div>

      {/* Top-Level Stats */}
      {track && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <GlassSurface className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-3.5 w-3.5 text-apple-blue" />
                <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Win Rate</p>
              </div>
              <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
                {(track.winRate * 100).toFixed(0)}%
              </p>
              <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
                {track.wins}W / {track.losses}L / {track.inconclusive}I of {track.totalHypotheses} total
              </p>
            </GlassSurface>

            <GlassSurface className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Expected Value</p>
              </div>
              <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
                {track.expectedValue >= 0 ? '+' : ''}{track.expectedValue.toFixed(2)}x
              </p>
              <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
                Avg ROAS per hypothesis
              </p>
            </GlassSurface>

            <GlassSurface className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Sharpe Equiv.</p>
              </div>
              <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
                {track.sharpeEquivalent != null ? track.sharpeEquivalent.toFixed(2) : '--'}
              </p>
              <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
                Risk-adjusted return
              </p>
            </GlassSurface>

            <GlassSurface className="card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-3.5 w-3.5 text-purple-400" />
                <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Alpha</p>
              </div>
              <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
                {track.alpha != null ? `${track.alpha >= 0 ? '+' : ''}${track.alpha.toFixed(2)}x` : '--'}
              </p>
              <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
                vs {track.industryBenchmarkROAS}x benchmark
              </p>
            </GlassSurface>
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
                      {s.avgROAS != null ? `${s.avgROAS.toFixed(2)}x` : '--'}
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-mono text-[var(--foreground-secondary)]">
                      n={s.sampleSize}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        s.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                        s.confidence === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {s.confidence}
                      </span>
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
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        t.verdict === 'WINNER' ? 'bg-green-500/20 text-green-400' :
                        t.verdict === 'LOSER' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {t.verdict}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--foreground)]">{t.title}</td>
                    <td className="px-5 py-3 text-xs text-[var(--foreground-secondary)]">{t.clientName}</td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300">
                        {t.trigger}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-xs font-mono text-[var(--foreground)]">
                      {t.actualROAS != null ? `${t.actualROAS.toFixed(2)}x` : '--'}
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
        <div className="card text-center py-16">
          <BookOpen className="h-12 w-12 text-[var(--foreground-secondary)]/50 mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)] text-lg">No track record yet.</p>
          <p className="text-sm text-[var(--foreground-secondary)]/50 mt-1">Close your first hypothesis to see results here.</p>
        </div>
      )}
    </div>
  );
}
