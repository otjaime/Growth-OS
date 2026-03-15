'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { FlaskConical, Plus, Filter as FilterIcon } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import { formatMultiplier } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton, TableSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge, getStatusVariant } from '@/components/ui/badge';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ConvictionDots } from '@/components/ui/conviction-dots';

/* ── Types ────────────────────────────────────────── */

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
  launchedAt: string | null;
  closedAt: string | null;
  stopLoss: boolean;
}

interface ClientWithHypotheses {
  id: string;
  name: string;
  hypotheses: Hypothesis[];
}

type StatusFilter = 'ALL' | 'DRAFT' | 'APPROVED' | 'LIVE' | 'PAUSED' | 'CLOSED';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'LIVE', label: 'Live' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CLOSED', label: 'Closed' },
];

const STATUS_ORDER: Record<string, number> = {
  LIVE: 0, PAUSED_BY_SYSTEM: 1, PAUSED_BY_USER: 1, APPROVED: 2, DRAFT: 3, WINNER: 4, LOSER: 5, INCONCLUSIVE: 6,
};

const PAUSED_STATUSES = new Set(['PAUSED_BY_SYSTEM', 'PAUSED_BY_USER']);
const CLOSED_STATUSES = new Set(['WINNER', 'LOSER', 'INCONCLUSIVE']);

/* ── Page ─────────────────────────────────────────── */

export default function HypothesesPage() {
  const [clients, setClients] = useState<ClientWithHypotheses[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const load = () => {
    setLoading(true);
    setError(false);

    apiFetch('/api/clients')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!data) {
          setError(true);
          setLoading(false);
          return;
        }
        const clientList = data.clients ?? data;

        // Fetch hypotheses for each client in parallel
        const results: ClientWithHypotheses[] = await Promise.all(
          clientList.map(async (c: { id: string; name: string }) => {
            try {
              const res = await apiFetch(`/api/clients/${c.id}/hypotheses`);
              if (res.ok) {
                const hData = await res.json();
                return { id: c.id, name: c.name, hypotheses: hData.hypotheses ?? [] };
              }
            } catch {
              /* skip client on error */
            }
            return { id: c.id, name: c.name, hypotheses: [] };
          }),
        );

        setClients(results);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  // Flatten all hypotheses with client info
  const allHypotheses = useMemo(() => {
    const flat: (Hypothesis & { clientId: string; clientName: string })[] = [];
    for (const c of clients) {
      for (const h of c.hypotheses) {
        flat.push({ ...h, clientId: c.id, clientName: c.name });
      }
    }
    return flat;
  }, [clients]);

  // Filter
  const filtered = useMemo(() => {
    let list = allHypotheses;
    if (statusFilter === 'PAUSED') {
      list = list.filter((h) => PAUSED_STATUSES.has(h.status));
    } else if (statusFilter === 'CLOSED') {
      list = list.filter((h) => CLOSED_STATUSES.has(h.status));
    } else if (statusFilter !== 'ALL') {
      list = list.filter((h) => h.status === statusFilter);
    }
    return list.sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 99;
      const sb = STATUS_ORDER[b.status] ?? 99;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [allHypotheses, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = allHypotheses.length;
    const live = allHypotheses.filter((h) => h.status === 'LIVE').length;
    const wins = allHypotheses.filter((h) => h.status === 'WINNER').length;
    const closed = allHypotheses.filter((h) => CLOSED_STATUSES.has(h.status)).length;
    const winRate = closed > 0 ? wins / closed : 0;
    const avgConviction = total > 0
      ? allHypotheses.reduce((s, h) => s + h.conviction, 0) / total
      : 0;
    return { total, live, winRate, avgConviction };
  }, [allHypotheses]);

  /* ── Loading ────────────────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hypotheses" icon={FlaskConical} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
        <TableSkeleton />
      </div>
    );
  }

  /* ── Error ──────────────────────────────────────── */

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hypotheses" icon={FlaskConical} />
        <ErrorState message="Failed to load hypotheses." onRetry={load} />
      </div>
    );
  }

  /* ── Empty ──────────────────────────────────────── */

  if (allHypotheses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Hypotheses"
          icon={FlaskConical}
          actions={
            <Link
              href="/hypotheses/new"
              className="flex items-center gap-2 bg-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/80 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
            >
              <Plus className="h-4 w-4" />
              New Hypothesis
            </Link>
          }
        />
        <EmptyState
          icon={FlaskConical}
          title="No hypotheses yet"
          description="Create your first hypothesis to start testing marketing strategies."
          action={{ label: 'New Hypothesis', href: '/hypotheses/new' }}
        />
      </div>
    );
  }

  /* ── Main Render ────────────────────────────────── */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hypotheses"
        icon={FlaskConical}
        actions={
          <Link
            href="/hypotheses/new"
            className="flex items-center gap-2 bg-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/80 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
          >
            <Plus className="h-4 w-4" />
            New Hypothesis
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Hypotheses" value={stats.total} format="number" />
        <KpiCard title="Live Now" value={stats.live} format="number" />
        <KpiCard title="Win Rate" value={stats.winRate} format="percent" />
        <KpiCard title="Avg Conviction" value={stats.avgConviction / 5} format="percent" />
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <FilterIcon className="h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={clsx(
              'text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ease-spring',
              statusFilter === f.value
                ? 'border-[var(--apple-blue)] bg-[var(--apple-blue)]/10 text-[var(--apple-blue)]'
                : 'border-[var(--glass-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.06]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <GlassSurface className="card overflow-hidden !p-0">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-xs text-[var(--foreground-secondary)] uppercase">
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Trigger</th>
              <th className="px-5 py-3 font-medium text-center">Conviction</th>
              <th className="px-5 py-3 font-medium text-right">Exp ROAS</th>
              <th className="px-5 py-3 font-medium text-right">Act ROAS</th>
              <th className="px-5 py-3 font-medium text-right">Delta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr
                key={h.id}
                className="border-b border-[var(--glass-border)]/50 hover:bg-white/[0.02] transition-colors"
              >
                <td className="px-5 py-3">
                  <Badge variant={getStatusVariant(h.status)}>
                    {h.status.replace(/_/g, ' ')}
                  </Badge>
                  {h.stopLoss && (
                    <span className="ml-1" title="Stop-loss triggered">
                      {'\u26A0\uFE0F'}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm">
                  <Link
                    href={`/hypotheses/${h.id}?clientId=${h.clientId}`}
                    className="text-[var(--foreground)] hover:text-[var(--apple-blue)] transition-colors"
                  >
                    {h.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-xs text-[var(--foreground-secondary)]">
                  <Link
                    href={`/clients/${h.clientId}`}
                    className="hover:text-[var(--foreground)] transition-colors"
                  >
                    {h.clientName}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <Badge variant="slate">{h.trigger}</Badge>
                </td>
                <td className="px-5 py-3 text-center">
                  <ConvictionDots level={h.conviction} />
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                  {h.expectedROAS != null ? formatMultiplier(h.expectedROAS) : '--'}
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-[var(--foreground)]">
                  {h.actualROAS != null ? formatMultiplier(h.actualROAS) : '--'}
                </td>
                <td
                  className={clsx(
                    'px-5 py-3 text-right font-mono text-xs',
                    h.delta != null && h.delta > 0
                      ? 'text-green-400'
                      : h.delta != null && h.delta < 0
                        ? 'text-red-400'
                        : 'text-[var(--foreground-secondary)]',
                  )}
                >
                  {h.delta != null
                    ? `${h.delta > 0 ? '+' : ''}${h.delta.toFixed(2)}x`
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--foreground-secondary)]">
              No hypotheses match this filter.
            </p>
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
