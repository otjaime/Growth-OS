'use client';

import { useState, useEffect } from 'react';
import { Activity, DollarSign, ArrowUpDown, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ImpactData {
  actionsTaken7d: number;
  actionsTaken30d: number;
  budgetSaved7d: number;
  budgetReallocated7d: number;
  autoVsManual: { auto: number; manual: number };
}

function formatCurrencyCompact(num: number): string {
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function SkeletonCard(): JSX.Element {
  return (
    <div className="card p-4">
      <div className="space-y-3">
        <div className="h-4 w-24 skeleton-shimmer" />
        <div className="h-6 w-16 skeleton-shimmer" />
        <div className="h-3 w-20 skeleton-shimmer" />
      </div>
    </div>
  );
}

export function ImpactSummary(): JSX.Element {
  const [data, setData] = useState<ImpactData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/autopilot/impact')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ImpactData | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        // silently fail — impact summary is non-critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data || data.actionsTaken30d === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-[var(--foreground-secondary)]">No impact data yet</p>
      </div>
    );
  }

  const cards = [
    {
      label: 'Actions Taken',
      value: String(data.actionsTaken7d),
      subtitle: `${data.actionsTaken30d} in last 30d`,
      icon: Activity,
      colorClass: 'text-apple-blue',
      tint: 'var(--tint-blue)',
    },
    {
      label: 'Budget Saved',
      value: formatCurrencyCompact(data.budgetSaved7d),
      subtitle: 'Last 7 days',
      icon: DollarSign,
      colorClass: 'text-apple-green',
      tint: 'var(--tint-green)',
    },
    {
      label: 'Budget Reallocated',
      value: formatCurrencyCompact(data.budgetReallocated7d),
      subtitle: 'Last 7 days',
      icon: ArrowUpDown,
      colorClass: 'text-apple-purple',
      tint: 'var(--tint-purple)',
    },
    {
      label: 'Auto vs Manual',
      value: `${data.autoVsManual.auto} auto / ${data.autoVsManual.manual} manual`,
      subtitle: 'Action breakdown',
      icon: Users,
      colorClass: 'text-apple-orange',
      tint: 'var(--tint-orange)',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: card.tint }}
              >
                <Icon className={`h-4 w-4 ${card.colorClass}`} />
              </div>
              <p className="text-xs font-medium text-[var(--foreground-secondary)]">{card.label}</p>
            </div>
            <p className="text-lg font-bold text-[var(--foreground)]">{card.value}</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{card.subtitle}</p>
          </div>
        );
      })}
    </div>
  );
}
