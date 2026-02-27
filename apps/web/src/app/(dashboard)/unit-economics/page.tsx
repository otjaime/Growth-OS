'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatPercent, formatDays, formatMultiplier } from '@/lib/format';
import { DateRangePicker } from '@/components/date-range-picker';
import { MiniSparkline } from '@/components/sparkline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';
import { GlassSurface } from '@/components/ui/glass-surface';

interface SegmentStats {
  orderCount: number;
  revenueNet: number;
  aov: number;
  cm: number;
  cmPercent: number;
  cac?: number;
}

interface ChannelUnitEcon {
  channel: string;
  spend: number;
  revenueNet: number;
  cogs: number;
  cm: number;
  cmPercent: number;
  cac: number | null;
  roas: number | null;
  orderCount: number;
}

interface Trends {
  weeks: string[];
  cmPercent: number[];
  cac: number[];
  aov: number[];
}

interface UnitEconData {
  breakdown: {
    revenueNet: number;
    cogs: number;
    cogsPercent: number;
    shipping: number;
    shippingPercent: number;
    opsCost: number;
    opsPercent: number;
    discounts: number;
    refunds: number;
    contributionMargin: number;
    cmPercent: number;
    marketingSpend: number;
    blendedCac: number;
    orderCount: number;
    avgOrderValue: number;
  };
  paymentBreakdown?: PaymentMethod[];
  customerSegments?: {
    new: SegmentStats;
    returning: SegmentStats;
  };
  channelUnitEconomics?: ChannelUnitEcon[];
  trends?: Trends;
}

interface PaymentMethod {
  method: string;
  count: number;
  revenue: number;
  share: number;
  successRate: number;
}

interface CohortSnapshot {
  latest: {
    avgCac: number;
    ltv90: number;
    ltv180: number;
    paybackDays: number | null;
    ltvCacRatio: number;
  } | null;
}

interface MarginSegment {
  segment: string;
  count: number;
  totalRevenue: number;
  avgCmPercent: number;
}

type SortKey = 'channel' | 'spend' | 'revenueNet' | 'cm' | 'cmPercent' | 'cac' | 'roas' | 'orderCount';

function guardrailColor(value: number, green: number, yellow: number, invert = false): string {
  if (invert) {
    if (value <= green) return 'text-apple-green';
    if (value <= yellow) return 'text-apple-yellow';
    return 'text-apple-red';
  }
  if (value >= green) return 'text-apple-green';
  if (value >= yellow) return 'text-apple-yellow';
  return 'text-apple-red';
}

function guardrailBg(value: number, green: number, yellow: number, invert = false): string {
  if (invert) {
    if (value <= green) return 'bg-apple-green/20';
    if (value <= yellow) return 'bg-apple-yellow/20';
    return 'bg-apple-red/20';
  }
  if (value >= green) return 'bg-apple-green/20';
  if (value >= yellow) return 'bg-apple-yellow/20';
  return 'bg-apple-red/20';
}

function guardrailLabel(value: number, green: number, yellow: number, invert = false): string {
  if (invert) {
    if (value <= green) return 'Healthy';
    if (value <= yellow) return 'Monitor';
    return 'Critical';
  }
  if (value >= green) return 'Healthy';
  if (value >= yellow) return 'Monitor';
  return 'Critical';
}

function formatChannelLabel(slug: string): string {
  const labels: Record<string, string> = {
    meta: 'Meta Ads', google: 'Google Ads', tiktok: 'TikTok Ads',
    email: 'Email', organic: 'Organic', affiliate: 'Affiliate',
    direct: 'Direct', unknown: 'Unknown',
  };
  return labels[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function UnitEconomicsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UnitEconData | null>(null);
  const [cohort, setCohort] = useState<CohortSnapshot | null>(null);
  const [marginSegments, setMarginSegments] = useState<MarginSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [channelSort, setChannelSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'revenueNet', asc: false });

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiFetch(`/api/metrics/unit-economics?days=${days}`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/cohort-snapshot`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/segments`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([unitData, cohortData, segData]) => {
        if (!unitData) { setError(true); setLoading(false); return; }
        setData(unitData as UnitEconData);
        setCohort(cohortData as CohortSnapshot);
        setMarginSegments((segData as { marginSegments?: MarginSegment[] } | null)?.marginSegments ?? []);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [days]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Unit Economics & Payback</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load unit economics data. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  const b = data.breakdown;
  const trends = data.trends;
  const waterfall = [
    { name: 'Revenue Net', value: b.revenueNet, color: '#0a84ff' },
    { name: 'COGS', value: -b.cogs, color: '#ff453a' },
    { name: 'Shipping', value: -b.shipping, color: '#ff9f0a' },
    { name: 'Ops Cost', value: -b.opsCost, color: '#ff9f0a' },
    { name: 'CM', value: b.contributionMargin, color: '#30d158' },
  ];

  const refundRate = b.revenueNet > 0 ? b.refunds / b.revenueNet : 0;

  // Sort channel data
  const sortedChannels = [...(data.channelUnitEconomics ?? [])].sort((a, b) => {
    const av = a[channelSort.key] ?? 0;
    const bv = b[channelSort.key] ?? 0;
    if (typeof av === 'string' && typeof bv === 'string') return channelSort.asc ? av.localeCompare(bv) : bv.localeCompare(av);
    return channelSort.asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    setChannelSort((prev) => ({ key, asc: prev.key === key ? !prev.asc : false }));
  }

  function sortIndicator(key: SortKey) {
    if (channelSort.key !== key) return '';
    return channelSort.asc ? ' \u2191' : ' \u2193';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Unit Economics & Payback</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* KPI Row with Sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">AOV</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(b.avgOrderValue)}</p>
            {trends && trends.aov.length > 1 && <MiniSparkline data={trends.aov} color="#0a84ff" />}
          </div>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Contribution Margin</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatPercent(b.cmPercent)}</p>
            {trends && trends.cmPercent.length > 1 && <MiniSparkline data={trends.cmPercent.map((v) => v * 100)} color="#30d158" />}
          </div>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Blended CAC</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(b.blendedCac)}</p>
            {trends && trends.cac.length > 1 && <MiniSparkline data={trends.cac} color="#ff9f0a" />}
          </div>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Total Orders</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{b.orderCount.toLocaleString()}</p>
        </div>
      </div>

      {/* Guardrails */}
      <GlassSurface className="card" intensity="subtle">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Guardrails</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`rounded-lg p-3 ${guardrailBg(b.cmPercent, 0.20, 0.15)}`}>
            <p className="text-xs text-[var(--foreground-secondary)] uppercase">CM%</p>
            <p className={`text-xl font-bold mt-1 ${guardrailColor(b.cmPercent, 0.20, 0.15)}`}>{formatPercent(b.cmPercent)}</p>
            <p className={`text-xs mt-1 ${guardrailColor(b.cmPercent, 0.20, 0.15)}`}>{guardrailLabel(b.cmPercent, 0.20, 0.15)}</p>
          </div>
          <div className={`rounded-lg p-3 ${guardrailBg(refundRate, 0.05, 0.08, true)}`}>
            <p className="text-xs text-[var(--foreground-secondary)] uppercase">Refund Rate</p>
            <p className={`text-xl font-bold mt-1 ${guardrailColor(refundRate, 0.05, 0.08, true)}`}>{formatPercent(refundRate)}</p>
            <p className={`text-xs mt-1 ${guardrailColor(refundRate, 0.05, 0.08, true)}`}>{guardrailLabel(refundRate, 0.05, 0.08, true)}</p>
          </div>
          <div className={`rounded-lg p-3 ${guardrailBg(b.blendedCac, 60, 80, true)}`}>
            <p className="text-xs text-[var(--foreground-secondary)] uppercase">CAC</p>
            <p className={`text-xl font-bold mt-1 ${guardrailColor(b.blendedCac, 60, 80, true)}`}>{formatCurrency(b.blendedCac)}</p>
            <p className={`text-xs mt-1 ${guardrailColor(b.blendedCac, 60, 80, true)}`}>{guardrailLabel(b.blendedCac, 60, 80, true)}</p>
          </div>
          <div className={`rounded-lg p-3 ${cohort?.latest?.paybackDays != null ? guardrailBg(cohort.latest.paybackDays, 180, 270, true) : 'bg-white/[0.04]'}`}>
            <p className="text-xs text-[var(--foreground-secondary)] uppercase">Payback</p>
            <p className={`text-xl font-bold mt-1 ${cohort?.latest?.paybackDays != null ? guardrailColor(cohort.latest.paybackDays, 180, 270, true) : 'text-[var(--foreground-secondary)]'}`}>
              {formatDays(cohort?.latest?.paybackDays ?? null)}
            </p>
            <p className={`text-xs mt-1 ${cohort?.latest?.paybackDays != null ? guardrailColor(cohort.latest.paybackDays, 180, 270, true) : 'text-[var(--foreground-secondary)]'}`}>
              {cohort?.latest?.paybackDays != null ? guardrailLabel(cohort.latest.paybackDays, 180, 270, true) : 'No data'}
            </p>
          </div>
        </div>
      </GlassSurface>

      {/* New vs Returning Customers */}
      {data.customerSegments && (
        <GlassSurface className="card" intensity="subtle">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">New vs Returning Customers</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    {
                      metric: 'Orders',
                      New: data.customerSegments.new.orderCount,
                      Returning: data.customerSegments.returning.orderCount,
                    },
                    {
                      metric: 'Revenue',
                      New: data.customerSegments.new.revenueNet,
                      Returning: data.customerSegments.returning.revenueNet,
                    },
                    {
                      metric: 'CM',
                      New: data.customerSegments.new.cm,
                      Returning: data.customerSegments.returning.cm,
                    },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="metric" stroke="rgba(255,255,255,0.35)" fontSize={11} />
                  <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(30,30,36,0.85)',
                      backdropFilter: 'blur(20px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f5f5f7',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
                    }}
                    formatter={(v: number) => v >= 100 ? formatCurrency(v) : v.toLocaleString()}
                  />
                  <Bar dataKey="New" fill="#0a84ff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Returning" fill="#30d158" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 bg-[#0a84ff]/10 border border-[#0a84ff]/20">
                <p className="text-xs text-apple-blue font-medium uppercase mb-2">New Customers</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Orders</span><span className="text-[var(--foreground)]">{data.customerSegments.new.orderCount.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Revenue</span><span className="text-[var(--foreground)]">{formatCurrency(data.customerSegments.new.revenueNet)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">AOV</span><span className="text-[var(--foreground)]">{formatCurrency(data.customerSegments.new.aov)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">CM%</span><span className="text-[var(--foreground)]">{formatPercent(data.customerSegments.new.cmPercent)}</span></div>
                  {data.customerSegments.new.cac != null && (
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">CAC</span><span className="text-[var(--foreground)]">{formatCurrency(data.customerSegments.new.cac)}</span></div>
                  )}
                </div>
              </div>
              <div className="rounded-lg p-3 bg-[#30d158]/10 border border-[#30d158]/20">
                <p className="text-xs text-apple-green font-medium uppercase mb-2">Returning Customers</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Orders</span><span className="text-[var(--foreground)]">{data.customerSegments.returning.orderCount.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Revenue</span><span className="text-[var(--foreground)]">{formatCurrency(data.customerSegments.returning.revenueNet)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">AOV</span><span className="text-[var(--foreground)]">{formatCurrency(data.customerSegments.returning.aov)}</span></div>
                  <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">CM%</span><span className="text-[var(--foreground)]">{formatPercent(data.customerSegments.returning.cmPercent)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </GlassSurface>
      )}

      {/* Margin Segments */}
      {marginSegments.length > 0 && (
        <GlassSurface className="card" intensity="subtle">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Margin Segments</h2>
          <p className="text-xs text-[var(--foreground-secondary)] mb-4">Customers split by contribution margin percentage (above/below median CM%).</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {marginSegments.map((ms) => {
              const isHigh = ms.segment === 'High Margin';
              return (
                <div
                  key={ms.segment}
                  className={`rounded-lg p-4 border ${isHigh ? 'bg-apple-green/10 border-apple-green/20' : 'bg-apple-yellow/10 border-apple-yellow/20'}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-3 h-3 rounded-full ${isHigh ? 'bg-apple-green' : 'bg-apple-yellow'}`} />
                    <span className={`text-sm font-semibold ${isHigh ? 'text-apple-green' : 'text-apple-yellow'}`}>{ms.segment}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] text-[var(--foreground-secondary)] uppercase">Customers</div>
                      <div className="text-lg font-bold text-[var(--foreground)] mt-0.5">{ms.count.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--foreground-secondary)] uppercase">Revenue</div>
                      <div className="text-lg font-bold text-[var(--foreground)] mt-0.5">{formatCurrency(ms.totalRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--foreground-secondary)] uppercase">Avg CM%</div>
                      <div className={`text-lg font-bold mt-0.5 ${ms.avgCmPercent >= 20 ? 'text-apple-green' : ms.avgCmPercent >= 15 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                        {ms.avgCmPercent.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassSurface>
      )}

      {/* Channel Unit Economics */}
      {sortedChannels.length > 0 && (
        <GlassSurface className="card" intensity="subtle">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Channel Unit Economics</h2>
            <button
              onClick={() => exportToCSV(
                sortedChannels.map((ch) => ({
                  channel: formatChannelLabel(ch.channel),
                  spend: ch.spend,
                  revenue: ch.revenueNet,
                  cogs: ch.cogs,
                  cm: ch.cm,
                  cmPercent: ch.cmPercent,
                  cac: ch.cac,
                  roas: ch.roas,
                  orders: ch.orderCount,
                })),
                `channel-unit-economics-${days}d`,
                [
                  { key: 'channel', label: 'Channel' },
                  { key: 'spend', label: 'Spend', format: (v) => `$${Number(v).toFixed(2)}` },
                  { key: 'revenue', label: 'Revenue', format: (v) => `$${Number(v).toFixed(2)}` },
                  { key: 'cogs', label: 'COGS', format: (v) => `$${Number(v).toFixed(2)}` },
                  { key: 'cm', label: 'CM', format: (v) => `$${Number(v).toFixed(2)}` },
                  { key: 'cmPercent', label: 'CM%', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
                  { key: 'cac', label: 'CAC', format: (v) => v != null ? `$${Number(v).toFixed(2)}` : 'N/A' },
                  { key: 'roas', label: 'ROAS', format: (v) => v != null ? `${Number(v).toFixed(2)}x` : 'N/A' },
                  { key: 'orders', label: 'Orders' },
                ],
              )}
              className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] px-2 py-1 border border-[var(--glass-border)] rounded hover:border-[var(--glass-border-hover)] transition-all ease-spring"
            >
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('channel')}>Channel{sortIndicator('channel')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('spend')}>Spend{sortIndicator('spend')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('revenueNet')}>Revenue{sortIndicator('revenueNet')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('cm')}>CM{sortIndicator('cm')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('cmPercent')}>CM%{sortIndicator('cmPercent')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('cac')}>CAC{sortIndicator('cac')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('roas')}>ROAS{sortIndicator('roas')}</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] cursor-pointer hover:text-[var(--foreground)]" onClick={() => toggleSort('orderCount')}>Orders{sortIndicator('orderCount')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedChannels.map((ch) => (
                  <tr key={ch.channel} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-[var(--foreground)] font-medium">{formatChannelLabel(ch.channel)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(ch.spend)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(ch.revenueNet)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(ch.cm)}</td>
                    <td className={`px-3 py-2 text-right ${ch.cmPercent >= 0.20 ? 'text-apple-green' : ch.cmPercent >= 0.15 ? 'text-apple-yellow' : 'text-apple-red'}`}>{formatPercent(ch.cmPercent)}</td>
                    <td className="px-3 py-2 text-right">{ch.cac != null ? formatCurrency(ch.cac) : '\u2014'}</td>
                    <td className={`px-3 py-2 text-right ${ch.roas != null && ch.roas >= 3 ? 'text-apple-green' : ch.roas != null && ch.roas >= 2 ? 'text-apple-yellow' : ''}`}>{ch.roas != null ? `${ch.roas.toFixed(2)}x` : '\u2014'}</td>
                    <td className="px-3 py-2 text-right">{ch.orderCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassSurface>
      )}

      {/* Margin Decomposition */}
      <GlassSurface className="card" intensity="subtle">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Contribution Margin Decomposition</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={11} width={100} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30,30,36,0.85)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  color: '#f5f5f7',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
                }}
                formatter={(v: number) => formatCurrency(Math.abs(v))}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {waterfall.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassSurface>

      {/* Cost Breakdown Table */}
      <GlassSurface className="card" intensity="subtle">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Cost Breakdown (Last {days} Days)</h2>
          <button
            onClick={() => exportToCSV(
              [
                { item: 'Revenue (Net)', amount: b.revenueNet, pctOfRevenue: 1 },
                { item: 'COGS', amount: b.cogs, pctOfRevenue: b.cogsPercent },
                { item: 'Shipping', amount: b.shipping, pctOfRevenue: b.shippingPercent },
                { item: 'Ops Cost', amount: b.opsCost, pctOfRevenue: b.opsPercent },
                { item: 'Contribution Margin', amount: b.contributionMargin, pctOfRevenue: b.cmPercent },
                { item: 'Marketing Spend', amount: b.marketingSpend, pctOfRevenue: b.revenueNet > 0 ? b.marketingSpend / b.revenueNet : 0 },
              ],
              `unit-economics-${days}d`,
              [
                { key: 'item', label: 'Line Item' },
                { key: 'amount', label: 'Amount', format: (v) => `$${Number(v).toFixed(2)}` },
                { key: 'pctOfRevenue', label: '% of Revenue', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
              ],
            )}
            className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] px-2 py-1 border border-[var(--glass-border)] rounded hover:border-[var(--glass-border-hover)] transition-all ease-spring"
          >
            Export CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="px-4 py-2 text-left text-xs text-[var(--foreground-secondary)]">Line Item</th>
              <th className="px-4 py-2 text-right text-xs text-[var(--foreground-secondary)]">Amount</th>
              <th className="px-4 py-2 text-right text-xs text-[var(--foreground-secondary)]">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]">Revenue (Net)</td><td className="px-4 py-2 text-right">{formatCurrency(b.revenueNet)}</td><td className="px-4 py-2 text-right">100%</td></tr>
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]/80">− COGS</td><td className="px-4 py-2 text-right text-apple-red">({formatCurrency(b.cogs)})</td><td className="px-4 py-2 text-right">{formatPercent(b.cogsPercent)}</td></tr>
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]/80">− Shipping</td><td className="px-4 py-2 text-right text-apple-red">({formatCurrency(b.shipping)})</td><td className="px-4 py-2 text-right">{formatPercent(b.shippingPercent)}</td></tr>
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]/80">− Ops Cost</td><td className="px-4 py-2 text-right text-apple-red">({formatCurrency(b.opsCost)})</td><td className="px-4 py-2 text-right">{formatPercent(b.opsPercent)}</td></tr>
            <tr className="border-b border-[var(--glass-border)] bg-white/[0.04]"><td className="px-4 py-2 font-semibold text-apple-green">= Contribution Margin</td><td className="px-4 py-2 text-right font-semibold text-apple-green">{formatCurrency(b.contributionMargin)}</td><td className="px-4 py-2 text-right font-semibold text-apple-green">{formatPercent(b.cmPercent)}</td></tr>
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]/80">− Marketing Spend</td><td className="px-4 py-2 text-right text-apple-yellow">({formatCurrency(b.marketingSpend)})</td><td className="px-4 py-2 text-right">{b.revenueNet > 0 ? formatPercent(b.marketingSpend / b.revenueNet) : '\u2014'}</td></tr>
          </tbody>
        </table>
      </GlassSurface>

      {/* CAC vs LTV Section */}
      <GlassSurface className="card" intensity="subtle">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">CAC vs LTV</h2>
        {cohort?.latest ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-xs text-[var(--foreground-secondary)] uppercase">LTV:CAC Ratio</p>
                <p className={`text-2xl font-bold mt-1 ${cohort.latest.ltvCacRatio >= 3 ? 'text-apple-green' : cohort.latest.ltvCacRatio >= 2 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                  {formatMultiplier(cohort.latest.ltvCacRatio)}
                </p>
                <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">
                  {cohort.latest.ltvCacRatio >= 3 ? 'Healthy' : cohort.latest.ltvCacRatio >= 2 ? 'Monitor' : 'Critical'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-[var(--foreground-secondary)] uppercase">Payback Period</p>
                <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatDays(cohort.latest.paybackDays)}</p>
                <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">
                  {cohort.latest.paybackDays !== null && cohort.latest.paybackDays <= 90 ? 'Within target' : cohort.latest.paybackDays !== null ? 'Above 90d target' : ''}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-[var(--foreground-secondary)] uppercase">LTV (180-day)</p>
                <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(cohort.latest.ltv180)}</p>
              </div>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'CAC', value: cohort.latest.avgCac, color: '#ff453a' },
                    { name: 'LTV (180d)', value: cohort.latest.ltv180, color: '#30d158' },
                  ]}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => `$${v}`} />
                  <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(30,30,36,0.85)',
                      backdropFilter: 'blur(20px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f5f5f7',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
                    }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    <Cell fill="#ff453a" />
                    <Cell fill="#30d158" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase">Blended CAC</p>
              <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(b.blendedCac)}</p>
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">Current period</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--foreground-secondary)] uppercase">LTV:CAC Ratio</p>
              <p className="text-2xl font-bold text-[var(--foreground-secondary)]/70 mt-1">--</p>
              <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">Awaiting cohort maturation</p>
            </div>
          </div>
        )}
      </GlassSurface>

      {/* Payment Method Breakdown */}
      {data.paymentBreakdown && data.paymentBreakdown.length > 0 && (
        <GlassSurface className="card" intensity="subtle">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Payment Methods</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.paymentBreakdown.map((p) => ({
                      name: formatMethodLabel(p.method),
                      value: p.count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data.paymentBreakdown.map((_, i) => (
                      <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(30,30,36,0.85)',
                      backdropFilter: 'blur(20px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      color: '#f5f5f7',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
                    }}
                    formatter={(value: number) => [value.toLocaleString(), 'Orders']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)]">Method</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Orders</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Share</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Revenue</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {data.paymentBreakdown.map((p, i) => (
                    <tr key={p.method} className="border-b border-white/[0.04]">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} />
                          <span className="text-[var(--foreground)]">{formatMethodLabel(p.method)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{p.count.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{formatPercent(p.share)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(p.revenue)}</td>
                      <td className={`px-3 py-2 text-right ${p.successRate >= 0.95 ? 'text-apple-green' : p.successRate >= 0.90 ? 'text-apple-yellow' : 'text-apple-red'}`}>
                        {formatPercent(p.successRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </GlassSurface>
      )}
    </div>
  );
}

const PAYMENT_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#98989f'];

function formatMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    card_visa: 'Visa',
    card_mastercard: 'Mastercard',
    card_amex: 'Amex',
    apple_pay: 'Apple Pay',
    google_pay: 'Google Pay',
    unknown: 'Other',
  };
  return labels[method] ?? method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
