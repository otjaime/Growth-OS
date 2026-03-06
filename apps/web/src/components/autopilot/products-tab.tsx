'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown,
  Loader2, Sparkles, ShoppingBag, BarChart3, Image as ImageIcon,
  Search, Filter, X, Zap,
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

type SortKey = 'grossProfit' | 'revenue' | 'units' | 'adFitness' | 'tier' | 'trend';

// ── Tier display config ──────────────────────────────────────

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  hero: { bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', label: 'Hero' },
  growth: { bg: 'bg-[var(--tint-green)]', text: 'text-apple-green', label: 'Growth' },
  niche: { bg: 'bg-[var(--tint-purple)]', text: 'text-apple-purple', label: 'Niche' },
  'long-tail': { bg: 'bg-glass-hover', text: 'text-[var(--foreground-secondary)]', label: 'Long-tail' },
};

const TIER_RANK: Record<string, number> = {
  hero: 4,
  growth: 3,
  niche: 2,
  'long-tail': 1,
};

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

// ── Fitness breakdown (5.3) ──────────────────────────────────

interface FitnessBreakdown {
  margin: number;
  velocity: number;
  profit: number;
  repeat: number;
  readiness: number;
}

function computeBreakdown(p: ProductPerformanceRow): FitnessBreakdown {
  const margin = p.estimatedMargin <= 0.25 ? 0 : Math.min(20, ((p.estimatedMargin - 0.25) / 0.30) * 20);
  const velocity = Math.min(20, (p.avgDailyUnits / 1) * 20);
  const profit = Math.min(30, (p.grossProfit30d / 1000) * 30);
  const repeat = Math.min(15, (p.repeatBuyerPct / 0.10) * 15);
  const readiness = (p.imageUrl ? 5 : 0) + (p.description ? 5 : 0) + (p.avgPrice > 0 ? 5 : 0);
  return { margin, velocity, profit, repeat, readiness };
}

function breakdownColor(value: number, max: number): string {
  return value < max * 0.5 ? 'text-apple-red' : 'text-apple-green';
}

function FitnessTooltip({ product }: { product: ProductPerformanceRow }): JSX.Element {
  const b = computeBreakdown(product);
  const rows: readonly { label: string; value: number; max: number }[] = [
    { label: 'Margin', value: b.margin, max: 20 },
    { label: 'Velocity', value: b.velocity, max: 20 },
    { label: 'Profit', value: b.profit, max: 30 },
    { label: 'Repeat', value: b.repeat, max: 15 },
    { label: 'Readiness', value: b.readiness, max: 15 },
  ];
  return (
    <div className="absolute -top-2 right-0 -translate-y-full z-50 bg-[var(--glass-bg-elevated)] backdrop-blur-xl border border-[var(--glass-border)] rounded-lg shadow-glass-elevated p-2.5 min-w-[140px] pointer-events-none">
      <p className="text-caption font-semibold text-[var(--foreground)] mb-1.5">Score Breakdown</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 text-caption leading-relaxed">
          <span className="text-[var(--foreground-secondary)]">{r.label}:</span>
          <span className={`font-semibold tabular-nums ${breakdownColor(r.value, r.max)}`}>
            {r.value.toFixed(0)}/{r.max}
          </span>
        </div>
      ))}
    </div>
  );
}

function fitnessBar(score: number, product: ProductPerformanceRow): JSX.Element {
  const width = Math.min(100, Math.max(0, score));
  const color = score >= 80 ? 'bg-apple-green' : score >= 60 ? 'bg-apple-blue' : score >= 40 ? 'bg-apple-yellow' : 'bg-apple-red';
  return (
    <div className="relative group">
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-1.5 rounded-full bg-glass-muted overflow-hidden">
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${width}%` }} />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${scoreColor(score)}`}>{score.toFixed(0)}</span>
      </div>
      <div className="hidden group-hover:block">
        <FitnessTooltip product={product} />
      </div>
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

  // ── Filter state (5.4) ─────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [onlyAdReady, setOnlyAdReady] = useState(false);

  // ── Opportunity generate loading (5.6) ─────────────────────
  const [generatingOp, setGeneratingOp] = useState<string | null>(null);

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

  // ── Unique product types for dropdown ──────────────────────
  const productTypes = useMemo(() => {
    const types = new Set(products.map((p) => p.productType).filter(Boolean));
    return Array.from(types).sort();
  }, [products]);

  const hasActiveFilters = searchTerm !== '' || typeFilter !== '' || onlyAdReady;

  function clearFilters(): void {
    setSearchTerm('');
    setTypeFilter('');
    setOnlyAdReady(false);
  }

  // ── Sort + filter logic ─────────────────────────────────────
  const sortedProducts = useMemo(() => {
    let filtered = [...products];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p) => p.productTitle.toLowerCase().includes(term));
    }

    // Apply type filter
    if (typeFilter) {
      filtered = filtered.filter((p) => p.productType === typeFilter);
    }

    // Apply ad-ready filter
    if (onlyAdReady) {
      filtered = filtered.filter((p) => (p.adFitnessScore ?? 0) >= 60);
    }

    // Sort
    filtered.sort((a, b) => {
      let va: number, vb: number;
      switch (sortBy) {
        case 'grossProfit': va = a.grossProfit30d; vb = b.grossProfit30d; break;
        case 'revenue': va = a.revenue30d; vb = b.revenue30d; break;
        case 'units': va = a.unitsSold30d; vb = b.unitsSold30d; break;
        case 'adFitness': va = a.adFitnessScore ?? 0; vb = b.adFitnessScore ?? 0; break;
        case 'tier': va = TIER_RANK[a.productTier ?? ''] ?? 0; vb = TIER_RANK[b.productTier ?? ''] ?? 0; break;
        case 'trend': va = a.revenueTrend ?? 0; vb = b.revenueTrend ?? 0; break;
      }
      return sortAsc ? va - vb : vb - va;
    });

    return filtered;
  }, [products, sortBy, sortAsc, searchTerm, typeFilter, onlyAdReady]);

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

  // ── Generate Ad from opportunity (5.6) ─────────────────────
  async function handleGenerateFromOpportunity(op: ProactiveRecommendation): Promise<void> {
    setGeneratingOp(op.productTitle);
    try {
      const res = await apiFetch('/api/autopilot/proactive/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await fetchProducts();
      }
    } catch (err) {
      console.error('[Products] Generate ad failed:', err);
    } finally {
      setGeneratingOp(null);
    }
  }

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

      {/* ── Filter Bar (5.4) ─────────────────────────────────────── */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-[var(--glass-bg-thin)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-apple-blue/50 transition-all"
            />
          </div>

          {/* Type dropdown */}
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground-secondary)] pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="pl-8 pr-6 py-2 text-xs bg-[var(--glass-bg-thin)] border border-[var(--border)] rounded-lg text-[var(--foreground)] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-apple-blue/50 transition-all"
            >
              <option value="">All types</option>
              {productTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Ad-Ready toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAdReady}
              onChange={(e) => setOnlyAdReady(e.target.checked)}
              className="rounded border-[var(--border)] text-apple-blue focus:ring-apple-blue/50"
            />
            <span className="text-[var(--foreground-secondary)] whitespace-nowrap">Only Ad-Ready (60+)</span>
          </label>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-apple-blue hover:text-apple-blue/80 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>

        {/* Filter counter */}
        <p className="text-caption text-[var(--foreground-secondary)] mt-2">
          Showing {sortedProducts.length} of {products.length} products
        </p>
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
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[var(--foreground)]">{fmt$(op.metrics.grossProfit30d)}</p>
                    <p className="text-caption text-[var(--foreground-secondary)]">gross profit</p>
                  </div>
                  {/* Generate Ad button (5.6) */}
                  <button
                    onClick={() => void handleGenerateFromOpportunity(op)}
                    disabled={generatingOp != null}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-apple-blue hover:bg-apple-blue/80 disabled:opacity-50 rounded-lg transition-all ease-spring shrink-0"
                  >
                    {generatingOp === op.productTitle ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    Generate Ad
                  </button>
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
        {/* Empty filter state */}
        {sortedProducts.length === 0 && hasActiveFilters && (
          <div className="px-6 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-glass-muted flex items-center justify-center mx-auto mb-2">
              <Search className="h-4 w-4 text-[var(--foreground-secondary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--foreground)]">No products match your filters</p>
            <button
              onClick={clearFilters}
              className="text-xs text-apple-blue hover:text-apple-blue/80 mt-1 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {sortedProducts.length > 0 && (
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
                  <th className="px-3 py-3">
                    <button onClick={() => handleSort('tier')} className="flex items-center gap-1 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                      Tier <SortIcon col="tier" />
                    </button>
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
                  <th className="text-right px-3 py-3">
                    <button onClick={() => handleSort('trend')} className="flex items-center gap-1 ml-auto text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium hover:text-[var(--foreground)] transition-colors">
                      Trend <SortIcon col="trend" />
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
                    <td className="px-3 py-3">
                      {p.productTier ? (() => {
                        const style = TIER_STYLES[p.productTier] ?? TIER_STYLES['long-tail'];
                        return (
                          <span className={`inline-block px-2 py-0.5 rounded-md text-caption font-semibold ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        );
                      })() : (
                        <span className="text-[var(--foreground-secondary)] text-caption">--</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--foreground)]">
                      {fmtNum(p.unitsSold30d)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--foreground)]">
                      {fmt$(p.revenue30d)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">
                      {p.revenueTrend != null ? (
                        <span className={`flex items-center gap-0.5 justify-end font-medium ${p.revenueTrend >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                          {p.revenueTrend >= 0 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {Math.abs(p.revenueTrend * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[var(--foreground-secondary)]">--</span>
                      )}
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
                      {p.adFitnessScore != null ? fitnessBar(p.adFitnessScore, p) : (
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
        )}
      </div>
    </div>
  );
}
