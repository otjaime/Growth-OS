'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatMultiplier } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
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

  const load = () => {
    setLoading(true);
    setError(false);
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
  };

  useEffect(() => { load(); }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Track Record" breadcrumb={{ label: 'Back to Client', href: `/clients/${clientId}` }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton />
        </div>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="space-y-6">
        <PageHeader title="Track Record" breadcrumb={{ label: 'Back to Client', href: `/clients/${clientId}` }} />
        <ErrorState message="Failed to load track record." onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${record.clientName} — Track Record`}
        icon={Trophy}
        breadcrumb={{ label: record.clientName, href: `/clients/${clientId}` }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Win Rate"
          value={record.winRate}
          format="percent"
          subtitle={`${record.wins}W / ${record.losses}L / ${record.inconclusive}I`}
        />
        <KpiCard
          title="Expected Value"
          value={record.expectedValue}
          format="multiplier"
        />
        <KpiCard
          title="Sharpe Equiv."
          value={record.sharpeEquivalent ?? 0}
          format="multiplier"
          subtitle="Risk-adjusted return"
        />
        <KpiCard
          title="Alpha"
          value={record.alpha ?? 0}
          format="multiplier"
          subtitle={`vs ${record.industryBenchmarkROAS}x benchmark`}
        />
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
              <span className="font-mono text-green-400">{formatMultiplier(record.avgWinnerROAS)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--foreground-secondary)]">Avg Loser ROAS</span>
              <span className="font-mono text-red-400">{formatMultiplier(record.avgLoserROAS)}</span>
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
