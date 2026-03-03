'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, DollarSign, Loader2, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { PortfolioOptimization } from './types';
import { GlassSurface } from '@/components/ui/glass-surface';
import { ReflectiveCard } from '@/components/ui/reflective-card';

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function ChangeBadge({ changePct }: { changePct: number }) {
  if (Math.abs(changePct) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-caption px-1.5 py-0.5 rounded-full bg-glass-hover text-[var(--foreground-secondary)] font-medium">
        <Minus className="h-3 w-3" />
        Hold
      </span>
    );
  }
  if (changePct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-caption px-1.5 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-medium">
        <TrendingUp className="h-3 w-3" />
        +{changePct.toFixed(0)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-caption px-1.5 py-0.5 rounded-full bg-[var(--tint-red)] text-apple-red font-medium">
      <TrendingDown className="h-3 w-3" />
      {changePct.toFixed(0)}%
    </span>
  );
}

export function BudgetView() {
  const [data, setData] = useState<PortfolioOptimization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/autopilot/budget-optimization')
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((json: PortfolioOptimization) => {
        setData(json);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="h-3 w-24 skeleton-shimmer" />
              <div className="h-7 w-20 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-16">
        <DollarSign className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Budget Optimization Unavailable</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">{error}</p>
      </div>
    );
  }

  if (!data || data.allocations.length === 0) {
    return (
      <div className="card text-center py-16">
        <DollarSign className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">No Allocations</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">Sync Meta Ads data to generate budget optimization recommendations.</p>
      </div>
    );
  }

  const budgetDelta = data.totalSuggestedDailyBudget - data.totalCurrentDailyBudget;
  const budgetDeltaPct = data.totalCurrentDailyBudget > 0
    ? ((budgetDelta / data.totalCurrentDailyBudget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReflectiveCard className="card p-4">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1">Current Daily Budget</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {formatCurrency(data.totalCurrentDailyBudget)}
          </p>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1">Suggested Daily Budget</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {formatCurrency(data.totalSuggestedDailyBudget)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {budgetDelta >= 0 ? (
              <TrendingUp className="h-3 w-3 text-apple-green" />
            ) : (
              <TrendingDown className="h-3 w-3 text-apple-red" />
            )}
            <span className={`text-xs font-medium ${budgetDelta >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
              {budgetDelta >= 0 ? '+' : ''}{formatCurrency(budgetDelta)} ({budgetDeltaPct >= 0 ? '+' : ''}{budgetDeltaPct.toFixed(1)}%)
            </span>
          </div>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1">Current Return</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {data.currentBlendedRoas != null ? `${data.currentBlendedRoas.toFixed(2)}x` : '--'}
          </p>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium mb-1">Projected Return</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {data.projectedBlendedRoas != null ? `${data.projectedBlendedRoas.toFixed(2)}x` : '--'}
          </p>
          {data.currentBlendedRoas != null && data.projectedBlendedRoas != null && (
            <div className="flex items-center gap-1 mt-1">
              {data.projectedBlendedRoas >= data.currentBlendedRoas ? (
                <TrendingUp className="h-3 w-3 text-apple-green" />
              ) : (
                <TrendingDown className="h-3 w-3 text-apple-red" />
              )}
              <span className={`text-xs font-medium ${
                data.projectedBlendedRoas >= data.currentBlendedRoas ? 'text-apple-green' : 'text-apple-red'
              }`}>
                {data.projectedBlendedRoas >= data.currentBlendedRoas ? '+' : ''}
                {(data.projectedBlendedRoas - data.currentBlendedRoas).toFixed(2)}x
              </span>
            </div>
          )}
        </ReflectiveCard>
      </div>

      {/* Summary text */}
      {data.summary && (
        <div className="px-4 py-3 rounded-lg bg-[var(--tint-blue)] border border-apple-blue/20">
          <p className="text-xs text-apple-blue leading-relaxed">{data.summary}</p>
        </div>
      )}

      {/* Allocations Table */}
      <GlassSurface className="card overflow-hidden" intensity="subtle">
        <div className="px-4 py-3 border-b border-[var(--glass-border)]">
          <p className="text-xs text-[var(--foreground-secondary)]">
            {data.allocations.length} ad set{data.allocations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Ad Set</th>
                <th className="text-right text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Current</th>
                <th className="text-center text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3 w-8" />
                <th className="text-right text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Suggested</th>
                <th className="text-center text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Change</th>
                <th className="text-left text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.allocations.map((alloc) => (
                <tr
                  key={alloc.adSetId}
                  className="table-separator last:bg-none hover:bg-glass-muted transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate max-w-[200px]">
                      {alloc.adSetName}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm text-[var(--foreground)]">
                      ${Number(alloc.currentDailyBudget).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--foreground-secondary)]/40 mx-auto" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      ${Number(alloc.suggestedDailyBudget).toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ChangeBadge changePct={alloc.changePct} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-[var(--foreground-secondary)] truncate max-w-[250px]">
                      {alloc.reason}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassSurface>
    </div>
  );
}
