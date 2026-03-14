'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, TrendingUp, Target, BarChart3, Shield } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { GlassSurface } from '@/components/ui/glass-surface';

interface ClientTrackRecord {
  clientName: string;
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
  totalSpend: number;
  totalRevenue: number;
  sampleDisclaimer: string | null;
}

export default function ClientTrackRecordPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [record, setRecord] = useState<ClientTrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/api/clients/${clientId}/track-record`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) { setError(true); setLoading(false); return; }
        setRecord(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-apple-blue" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Track Record</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load track record.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href={`/clients/${clientId}`} className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
          &larr; {record.clientName}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{record.clientName} — Track Record</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassSurface className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-3.5 w-3.5 text-apple-blue" />
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Win Rate</p>
          </div>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {(record.winRate * 100).toFixed(0)}%
          </p>
          <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
            {record.wins}W / {record.losses}L / {record.inconclusive}I
          </p>
        </GlassSurface>

        <GlassSurface className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-400" />
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Expected Value</p>
          </div>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {record.expectedValue >= 0 ? '+' : ''}{record.expectedValue.toFixed(2)}x
          </p>
        </GlassSurface>

        <GlassSurface className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Sharpe Equiv.</p>
          </div>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {record.sharpeEquivalent != null ? record.sharpeEquivalent.toFixed(2) : '--'}
          </p>
        </GlassSurface>

        <GlassSurface className="card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-3.5 w-3.5 text-purple-400" />
            <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider">Alpha</p>
          </div>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {record.alpha != null ? `${record.alpha >= 0 ? '+' : ''}${record.alpha.toFixed(2)}x` : '--'}
          </p>
          <p className="text-[10px] text-[var(--foreground-secondary)] mt-1">
            vs {record.industryBenchmarkROAS}x benchmark
          </p>
        </GlassSurface>
      </div>

      {record.sampleDisclaimer && (
        <p className="text-[10px] text-amber-400/60 italic">{record.sampleDisclaimer}</p>
      )}

      {/* Win/Loss Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Performance Breakdown</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground-secondary)]">Avg Winner ROAS</span>
              <span className="font-mono text-green-400">{record.avgWinnerROAS.toFixed(2)}x</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground-secondary)]">Avg Loser ROAS</span>
              <span className="font-mono text-red-400">{record.avgLoserROAS.toFixed(2)}x</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground-secondary)]">Total Spend</span>
              <span className="font-mono text-[var(--foreground)]">{formatCurrency(record.totalSpend)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground-secondary)]">Total Revenue</span>
              <span className="font-mono text-[var(--foreground)]">{formatCurrency(record.totalRevenue)}</span>
            </div>
          </div>
        </GlassSurface>

        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Win Rate Visual</h2>
          <div className="flex items-center gap-1 h-6 rounded-lg overflow-hidden">
            {record.wins > 0 && (
              <div
                className="h-full bg-green-500/60 flex items-center justify-center"
                style={{ width: `${(record.wins / record.totalHypotheses) * 100}%` }}
              >
                <span className="text-[10px] font-mono text-white">{record.wins}W</span>
              </div>
            )}
            {record.losses > 0 && (
              <div
                className="h-full bg-red-500/60 flex items-center justify-center"
                style={{ width: `${(record.losses / record.totalHypotheses) * 100}%` }}
              >
                <span className="text-[10px] font-mono text-white">{record.losses}L</span>
              </div>
            )}
            {record.inconclusive > 0 && (
              <div
                className="h-full bg-gray-500/60 flex items-center justify-center"
                style={{ width: `${(record.inconclusive / record.totalHypotheses) * 100}%` }}
              >
                <span className="text-[10px] font-mono text-white">{record.inconclusive}I</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--foreground-secondary)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/60" /> Winners</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/60" /> Losers</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-500/60" /> Inconclusive</span>
          </div>
        </GlassSurface>
      </div>
    </div>
  );
}
