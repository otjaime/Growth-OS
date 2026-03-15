'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { KpiCard } from '@/components/kpi-card';
import { KpiCardSkeleton, TableSkeleton } from '@/components/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useClient } from '@/contexts/client';

interface Client {
  id: string;
  name: string;
  vertical: string;
  monthlySpend: number;
  targetROAS: number | null;
  currentROAS: number | null;
  winRate: number | null;
  totalHypotheses: number;
  activeHypotheses: { live: number; approved: number; draft: number };
}

interface AumData {
  totalAum: number;
  activeAccounts: number;
  activeHypotheses: number;
}

const VERTICAL_VARIANT: Record<string, 'pink' | 'purple' | 'green' | 'amber' | 'blue' | 'cyan' | 'orange' | 'lime' | 'teal' | 'slate'> = {
  fashion: 'pink',
  beauty: 'purple',
  health: 'green',
  food: 'amber',
  home: 'blue',
  tech: 'cyan',
  fitness: 'orange',
  pets: 'lime',
  supplements: 'teal',
};

export default function ClientsPage() {
  const { setSelectedClientId } = useClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [aum, setAum] = useState<AumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiFetch('/api/portfolio/aum').then((r) => r.ok ? r.json() : null),
      apiFetch('/api/clients').then((r) => r.ok ? r.json() : null),
    ])
      .then(([aumData, clientsData]) => {
        if (aumData) setAum(aumData);
        if (clientsData) setClients(clientsData.clients ?? clientsData);
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
        <PageHeader title="Client Portfolio" icon={Briefcase} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
        <TableSkeleton rows={4} cols={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client Portfolio" icon={Briefcase} />
        <ErrorState message="Failed to load clients. Check that your API is running." onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Client Portfolio" icon={Briefcase} />

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="AUM" value={aum?.totalAum ?? 0} format="currency" />
        <KpiCard title="Active Accounts" value={aum?.activeAccounts ?? 0} format="number" />
        <KpiCard title="Active Hypotheses" value={aum?.activeHypotheses ?? 0} format="number" />
      </div>

      {/* Client Grid */}
      {clients.length === 0 ? (
        <EmptyState icon={Briefcase} title="No clients yet." description="Add your first client to start building hypotheses." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`} onClick={() => setSelectedClientId(client.id)}>
              <GlassSurface className="card p-5 hover:bg-white/[0.04] transition-all ease-spring cursor-pointer">
                {/* Name + Vertical */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{client.name}</h3>
                  <Badge variant={VERTICAL_VARIANT[client.vertical.toLowerCase()] ?? 'slate'}>
                    {client.vertical}
                  </Badge>
                </div>

                {/* ROAS */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[var(--foreground-secondary)]">ROAS</span>
                  <span className="text-xs font-mono text-[var(--foreground)]">
                    {client.currentROAS != null ? `${client.currentROAS.toFixed(1)}x` : '--'}
                    {client.targetROAS != null && (
                      <span className="text-[var(--foreground-secondary)]"> / {client.targetROAS.toFixed(1)}x target</span>
                    )}
                  </span>
                </div>

                {/* Win Rate */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[var(--foreground-secondary)]">Win Rate</span>
                  <span className="text-xs font-mono text-[var(--foreground)]">
                    {client.totalHypotheses >= 5 && client.winRate != null
                      ? `${(client.winRate * 100).toFixed(0)}%`
                      : '\u2014'}
                  </span>
                </div>

                {/* Active Hypotheses */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[var(--foreground-secondary)]">Active</span>
                  <div className="flex items-center gap-2">
                    {client.activeHypotheses.live > 0 && (
                      <Badge variant="amber">{client.activeHypotheses.live} live</Badge>
                    )}
                    {client.activeHypotheses.approved > 0 && (
                      <Badge variant="blue">{client.activeHypotheses.approved} approved</Badge>
                    )}
                    {client.activeHypotheses.draft > 0 && (
                      <Badge variant="gray">{client.activeHypotheses.draft} draft</Badge>
                    )}
                    {client.activeHypotheses.live === 0 && client.activeHypotheses.approved === 0 && client.activeHypotheses.draft === 0 && (
                      <span className="text-[10px] text-[var(--foreground-secondary)]">none</span>
                    )}
                  </div>
                </div>

                {/* Monthly Spend */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--foreground-secondary)]">Monthly Spend</span>
                  <span className="text-xs font-mono text-[var(--foreground)]">
                    {formatCurrency(client.monthlySpend)}
                  </span>
                </div>
              </GlassSurface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
