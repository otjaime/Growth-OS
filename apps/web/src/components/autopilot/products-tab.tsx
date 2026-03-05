'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, Sparkles, ShoppingBag, BarChart3, Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '@/lib/api';
import type { ProductPerformanceRow, ProactiveRecommendation, ProactiveAdJob } from './types';
import { ProactiveJobCard } from './proactive-job-card';
import { ReflectiveCard } from '@/components/ui/reflective-card';

// ── Helpers ──────────────────────────────────────────────────

function fmt$(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

type SortKey = 'grossProfit' | 'revenue' | 'units' | 'adFitness';

function scoreColor(score: number | null): string {
  if (score == null) return 'text-[var(--foreground-secondary)]';
  if (score >= 80) return 'text-apple-green';
  if (score >= 60) return 'text-apple-blue';
  if (score >= 40) return 'text-apple-yellow';
  return 'text-apple-red';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-glass-hover';
  if (score >= 80) return 'bg-[var(--tint-green)]';
  if (score >= 60) return 'bg-[var(--tint-blue)]';
  if (score >= 40) return 'bg-[var(--tint-yellow)]';
  return 'bg-[var(--tint-red)]';
}

function fitnessBar(score: number): JSX.Element {
  const width = Math.min(100, Math.max(0, score));
  const color = score >= 80 ? 'bg-apple-green' : score >= 60 ? 'bg-apple-blue' : score >= 40 ? 'bg-apple-yellow' : 'bg-apple-red';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-glass-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${width}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${scoreColor(score)}`}>{score.toFixed(0)}</span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export function ProductsTab(): JSX.Element {
  const [products, setProducts] = useState<ProductPerformanceRow[]>([]);
  const [opportunities, setOpportunities] = useState<ProactiveRecommendation[]>([]);
  const [jobs, setJobs] = useState<ProactiveAdJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('grossProfit');
  const [sortAsc, setSortAsc] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const [prodRes, opRes, jobRes] = await Promise.all([
        apiFetch(`/api/metrics/products?limit=50&sortBy=${sortBy}`),
        apiFetch('/api/autopilot/product-opportunities'),
        apiFetch('/api/autopilot/proactive/jobs'),
      ]);

      if (prodRes.ok) {
        const data = await prodRes.json();
        setProducts(data.products ?? []);
      }
      if (opRes.ok) {
        const data = await opRes.json();
        setOpportunities(data.recommendations ?? []);
      }
      if (jobRes.ok) {
        const data = await jobRes.json();
        setJobs(data.jobs ?? []);
      }
    } catch (err) {
      console.error('[Products] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [sortBy]);

  useEffect(() => {
    setLoading(true);
    fetchProducts();
  }, [fetchProducts]);

  // ── Sort logic ────────────────────────────────────────────
  const sortedProducts = useMemo(() => {
    const sorted = [...products].sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'grossProfit': va = a.grossProfit30d; vb = b.grossProfit30d; break;
        case 'revenue': va = a.revenue30d; vb = b.revenue30d; break;
        case 'units': va = a.unitsSold30d; vb = b.unitsSold30d; break;
        case 'adFitness': va = a.adFitnessScore ?? 0; vb = b.adFitnessScore ?? 0; break;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return sorted;
  }, [products, sortBy, sortAsc]);

  // ── Summary stats ─────────────────────────────────────────
  const summary = useMemo(() => {
    const total = products.length;
    const eligible = products.filter((p) => (p.adFitnessScore ?? 0) >= 60).length;
    const totalRevenue = products.reduce((s, p) => s + p.revenue30d, 0);
    const totalProfit = products.reduce((s, p) => s + p.grossProfit30d, 0);
    return { total, eligible, totalRevenue, totalProfit };
  }, [products]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }): JSX.Element => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--foreground-secondary)]" />
        <span className="ml-2 text-sm text-[var(--foreground-secondary)]">Loading product intelligence...</span>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card px-6 py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--tint-purple)] flex items-center justify-center mx-auto mb-3">
          <Package className="h-6 w-6 text-apple-purple" />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)]">No product data yet</p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-1">
          Run a sync to analyze your product catalog and identify ad-ready products.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ReflectiveCard className="card p-4" intensity="subtle">
          <div className="flex items-center gap-2 mb-1.5">
            <ShoppingBag className="h-3.5 w-3.5 text-apple-blue" />
            <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Products</p>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">{summary.total}</p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">tracked (30d)</p>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4" intensity="subtle">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-apple-green" />
            <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Ad-Ready</p>
          </div>
          <p className="text-2xl font-bold text-apple-green">{summary.eligible}</p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">score 60+</p>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4" intensity="subtle">
          <div className="flex items-center gap-2 mb-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-apple-purple" />
            <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Revenue</p>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">{fmt$(summary.totalRevenue)}</p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">last 30 days</p>
        </ReflectiveCard>

        <ReflectiveCard className="card p-4" intensity="subtle">
          <div className="flex items-center gap-2 mb-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-apple-orange" />
            <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Gross Profit</p>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">{fmt$(summary.totalProfit)}</p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">est. margin</p>
        </ReflectiveCard>
      </div>

      {/* ── Opportunities Banner ───────────────────────────────── */}
      {opportunities.length > 0 && (
        <div className="rounded-xl border border-apple-green/30 bg-[var(--tint-green)] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-apple-green" />
            <h3 className="text-sm font-semibold text-apple-green">
              {opportunities.length} product{opportunities.length > 1 ? 's' : ''} ready for ads
            </h3>
          </div>
          <p className="text-xs text-[var(--foreground-secondary)] mb-3">
            These products have strong sales metrics and are not currently being advertised.
          </p>
          <div className="space-y-2">
            {opportunities.map((op) => (
              <div
                key={op.productTitle}
                className="flex items-center justify-between bg-glass-active rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${scoreBg(op.adFitnessScore)} flex items-center justify-center`}>
                    <span className={`text-xs font-bold ${scoreColor(op.adFitnessScore)}`}>
                      {op.adFitnessScore.toFixed(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--foreground)]">{op.productTitle}</p>
                    <p className="text-caption text-[var(--foreground-secondary)]">{op.reason}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-[var(--foreground)]">{fmt$(op.metrics.grossProfit30d)}</p>
                  <p className="text-caption text-[var(--foreground-secondary)]">gross profit</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Proactive Jobs ──────────────────────────────── */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Active Ad Jobs</h3>
          <AnimatePresence>
            {jobs.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ProactiveJobCard job={job} onRefresh={fetchProducts} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Product Performance Table ─────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">
                  Product
                </th>
                <th className="text-left px-3 py-3 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">
                  Type
                </th>
                <th className="text-right px-3 py-3">
                  <button onClick={() => handleSort('units')} className="flex items-center gap-1 ml-auto text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                    Units <SortIcon col="units" />
                  </button>
                </th>
                <th className="text-right px-3 py-3">
                  <button onClick={() => handleSort('revenue')} className="flex items-center gap-1 ml-auto text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                    Revenue <SortIcon col="revenue" />
                  </button>
                </th>
                <th className="text-right px-3 py-3 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">
                  Margin
                </th>
                <th className="text-right px-3 py-3">
                  <button onClick={() => handleSort('grossProfit')} className="flex items-center gap-1 ml-auto text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                    Profit <SortIcon col="grossProfit" />
                  </button>
                </th>
                <th className="text-right px-3 py-3 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">
                  Repeat %
                </th>
                <th className="px-3 py-3">
                  <button onClick={() => handleSort('adFitness')} className="flex items-center gap-1 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                    Ad Score <SortIcon col="adFitness" />
                  </button>
                </th>
                <th className="px-3 py-3 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium text-center">
                  Assets
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p, i) => (
                <motion.tr
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-[var(--border)]/50 hover:bg-glass-hover transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.productTitle}
                          className="w-8 h-8 rounded-lg object-cover bg-glass-muted"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-glass-muted flex items-center justify-center">
                          <Package className="h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
                        </div>
                      )}
                      <span className="font-medium text-[var(--foreground)] truncate max-w-[180px]">{p.productTitle}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-md bg-glass-muted text-caption text-[var(--foreground-secondary)] capitalize">
                      {p.productType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--foreground)]">
                    {fmtNum(p.unitsSold30d)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--foreground)]">
                    {fmt$(p.revenue30d)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--foreground-secondary)]">
                    {fmtPct(p.estimatedMargin)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--foreground)]">
                    {fmt$(p.grossProfit30d)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--foreground-secondary)]">
                    {fmtPct(p.repeatBuyerPct)}
                  </td>
                  <td className="px-3 py-3">
                    {p.adFitnessScore != null ? fitnessBar(p.adFitnessScore) : (
                      <span className="text-[var(--foreground-secondary)]">--</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {p.imageUrl && <ImageIcon className="h-3 w-3 text-apple-green" />}
                      {p.description && <span className="text-caption text-apple-green" title="Has description">Aa</span>}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
