'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/format';
import { GlassSurface } from '@/components/ui/glass-surface';

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

const VERTICAL_COLORS: Record<string, string> = {
  fashion: 'bg-pink-500/20 text-pink-400',
  beauty: 'bg-purple-500/20 text-purple-400',
  health: 'bg-emerald-500/20 text-emerald-400',
  food: 'bg-amber-500/20 text-amber-400',
  home: 'bg-blue-500/20 text-blue-400',
  tech: 'bg-cyan-500/20 text-cyan-400',
  fitness: 'bg-orange-500/20 text-orange-400',
  pets: 'bg-lime-500/20 text-lime-400',
  supplements: 'bg-teal-500/20 text-teal-400',
};

function getVerticalColor(vertical: string): string {
  return VERTICAL_COLORS[vertical.toLowerCase()] ?? 'bg-slate-500/20 text-slate-400';
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [aum, setAum] = useState<AumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Client Portfolio</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load clients. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-apple-blue" />
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Client Portfolio</h1>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassSurface className="card p-6">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">AUM</p>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {aum ? formatCurrency(aum.totalAum) : '--'}
          </p>
        </GlassSurface>
        <GlassSurface className="card p-6">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Active Accounts</p>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {aum ? formatNumber(aum.activeAccounts) : '--'}
          </p>
        </GlassSurface>
        <GlassSurface className="card p-6">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wider mb-1">Active Hypotheses</p>
          <p className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {aum ? formatNumber(aum.activeHypotheses) : '--'}
          </p>
        </GlassSurface>
      </div>

      {/* Client Grid */}
      {clients.length === 0 ? (
        <div className="card text-center py-16">
          <Briefcase className="h-12 w-12 text-[var(--foreground-secondary)]/50 mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)] text-lg">No clients yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <GlassSurface className="card p-5 hover:bg-white/[0.04] transition-all ease-spring cursor-pointer">
                {/* Name + Vertical */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{client.name}</h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getVerticalColor(client.vertical)}`}>
                    {client.vertical}
                  </span>
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
                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    {client.activeHypotheses.live > 0 && (
                      <span className="text-amber-400">{client.activeHypotheses.live} live</span>
                    )}
                    {client.activeHypotheses.approved > 0 && (
                      <span className="text-blue-400">{client.activeHypotheses.approved} approved</span>
                    )}
                    {client.activeHypotheses.draft > 0 && (
                      <span className="text-gray-400">{client.activeHypotheses.draft} draft</span>
                    )}
                    {client.activeHypotheses.live === 0 && client.activeHypotheses.approved === 0 && client.activeHypotheses.draft === 0 && (
                      <span className="text-[var(--foreground-secondary)]">none</span>
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
