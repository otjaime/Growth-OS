'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle, Plus } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { GlassSurface } from '@/components/ui/glass-surface';

interface Hypothesis {
  id: string;
  title: string;
  status: string;
  trigger: string;
  conviction: number;
  expectedROAS: number | null;
  actualROAS: number | null;
  delta: number | null;
  createdAt: string;
  stopLoss: boolean;
}

interface StopLossEvent {
  id: string;
  hypothesisTitle: string;
  triggeredAt: string;
  reason: string;
}

interface ClientDetail {
  id: string;
  name: string;
  vertical: string;
  currentROAS: number | null;
  winRate: number | null;
  totalSpend: number;
  monthlyAum: number;
  hypotheses: Hypothesis[];
  stopLossEvents: StopLossEvent[];
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-400',
  APPROVED: 'bg-blue-500/20 text-blue-400',
  LIVE: 'bg-amber-500/20 text-amber-400',
  WINNER: 'bg-green-500/20 text-green-400',
  LOSER: 'bg-red-500/20 text-red-400',
  INCONCLUSIVE: 'bg-gray-500/20 text-gray-400',
};

const STATUS_ORDER: Record<string, number> = {
  LIVE: 0,
  APPROVED: 1,
  DRAFT: 2,
  WINNER: 3,
  LOSER: 4,
  INCONCLUSIVE: 5,
};

function ConvictionDots({ level }: { level: number }) {
  return (
    <span className="font-mono text-xs tracking-wider">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < level ? 'text-amber-400' : 'text-[var(--foreground-secondary)]/30'}>
          {'\u25CF'}
        </span>
      ))}
    </span>
  );
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/api/clients/${clientId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) { setError(true); setLoading(false); return; }
        setClient(data);
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

  if (error || !client) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Client</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load client data.</p>
        </div>
      </div>
    );
  }

  const sortedHypotheses = [...client.hypotheses].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const lastStopLoss = client.stopLossEvents.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/clients" className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors">
            &larr; All Clients
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{client.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clients/${clientId}/tradebook`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] transition-all ease-spring"
          >
            Trade Book
          </Link>
          <Link
            href={`/clients/${clientId}/track-record`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06] transition-all ease-spring"
          >
            Track Record
          </Link>
          <Link
            href={`/hypotheses/new?clientId=${clientId}`}
            className="flex items-center gap-2 bg-apple-blue hover:bg-apple-blue/90 text-[var(--foreground)] text-sm font-medium px-4 py-2 rounded-lg transition-all ease-spring"
          >
            <Plus className="h-4 w-4" />
            New Hypothesis
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassSurface className="card p-5">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Current ROAS</p>
          <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
            {client.currentROAS != null ? `${client.currentROAS.toFixed(2)}x` : '--'}
          </p>
        </GlassSurface>
        <GlassSurface className="card p-5">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Win Rate</p>
          <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
            {client.winRate != null ? `${(client.winRate * 100).toFixed(0)}%` : '--'}
          </p>
        </GlassSurface>
        <GlassSurface className="card p-5">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Total Spend</p>
          <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
            {formatCurrency(client.totalSpend)}
          </p>
        </GlassSurface>
        <GlassSurface className="card p-5">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Monthly AUM</p>
          <p className="text-2xl font-bold font-mono text-[var(--foreground)]">
            {formatCurrency(client.monthlyAum)}
          </p>
        </GlassSurface>
      </div>

      {/* Hypothesis Pipeline */}
      <GlassSurface className="card overflow-hidden !p-0">
        <div className="px-5 py-4 border-b border-[var(--glass-border)]">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Hypothesis Pipeline</h2>
        </div>
        {sortedHypotheses.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[var(--foreground-secondary)] text-sm">No hypotheses yet.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Trigger</th>
                <th className="px-5 py-3 font-medium text-center">Conviction</th>
                <th className="px-5 py-3 font-medium text-right">Exp ROAS</th>
                <th className="px-5 py-3 font-medium text-right">Act ROAS</th>
                <th className="px-5 py-3 font-medium text-right">Delta</th>
              </tr>
            </thead>
            <tbody>
              {sortedHypotheses.map((h) => (
                <tr key={h.id} className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[h.status] ?? STATUS_STYLES.DRAFT}`}>
                      {h.status}
                    </span>
                    {h.stopLoss && <span className="ml-1" title="Stop-loss triggered">{'\u26A0\uFE0F'}</span>}
                  </td>
                  <td className="px-5 py-3 text-sm text-[var(--foreground)]">{h.title}</td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300">
                      {h.trigger}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <ConvictionDots level={h.conviction} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                    {h.expectedROAS != null ? `${h.expectedROAS.toFixed(2)}x` : '--'}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                    {h.actualROAS != null ? `${h.actualROAS.toFixed(2)}x` : '--'}
                  </td>
                  <td className={clsx(
                    'px-5 py-3 text-right font-mono text-xs',
                    h.delta != null && h.delta > 0 ? 'text-green-400' : h.delta != null && h.delta < 0 ? 'text-red-400' : 'text-[var(--foreground-secondary)]',
                  )}>
                    {h.delta != null ? `${h.delta > 0 ? '+' : ''}${h.delta.toFixed(2)}x` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassSurface>

      {/* Stop-Loss Events */}
      {lastStopLoss.length > 0 && (
        <GlassSurface className="card p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Recent Stop-Loss Events
          </h2>
          <div className="space-y-3">
            {lastStopLoss.map((sl) => (
              <div key={sl.id} className="flex items-start justify-between text-xs border-b border-[var(--glass-border)]/30 pb-2 last:border-0">
                <div>
                  <p className="text-[var(--foreground)] font-medium">{sl.hypothesisTitle}</p>
                  <p className="text-[var(--foreground-secondary)]">{sl.reason}</p>
                </div>
                <span className="text-[var(--foreground-secondary)] whitespace-nowrap ml-4">
                  {new Date(sl.triggeredAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </GlassSurface>
      )}
    </div>
  );
}
