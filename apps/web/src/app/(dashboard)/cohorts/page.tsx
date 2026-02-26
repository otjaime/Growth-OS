'use client';

import { useState, useEffect } from 'react';
import { formatPercent, formatCurrency, formatNumber, formatMultiplier } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
  PieChart, Pie,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';
import { GlassSurface } from '@/components/ui/glass-surface';

interface ProjectedValue {
  value: number;
  projected: boolean;
}

interface CohortProjection {
  cohortMonth: string;
  cohortSize: number;
  ageDays: number;
  retention: {
    d7: ProjectedValue;
    d30: ProjectedValue;
    d60: ProjectedValue;
    d90: ProjectedValue;
  };
  ltv: {
    ltv30: ProjectedValue;
    ltv90: ProjectedValue;
    ltv180: ProjectedValue;
  };
  avgCac: number;
  paybackDays: number | null;
}

interface ProjectionData {
  projections: CohortProjection[];
  decayRatios: {
    d30toD7: number;
    d60toD30: number;
    d90toD60: number;
    matureCohortCount: number;
  };
}

interface SegmentData {
  segment: string;
  count: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgOrdersPerCustomer: number;
}

interface CustomerTypeEntry {
  count: number;
  totalRevenue: number;
  avgAov: number;
  percentOfRevenue: number;
}

interface MarginSegment {
  segment: string;
  count: number;
  totalRevenue: number;
  avgCmPercent: number;
}

interface SegmentsResponse {
  segments: SegmentData[];
  customerType?: {
    new: CustomerTypeEntry;
    returning: CustomerTypeEntry;
  };
  marginSegments?: MarginSegment[];
}

const SEGMENT_COLORS: Record<string, string> = {
  Champions: '#30d158',
  Loyal: '#0a84ff',
  Potential: '#bf5af2',
  'At Risk': '#ff9f0a',
  Dormant: '#98989f',
  Lost: '#ff453a',
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(30,30,36,0.85)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#f5f5f7',
  boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
};

function ProjectedCell({ value, projected, formatter }: { value: number; projected: boolean; formatter: (v: number) => string }) {
  if (value === 0 && projected) return <span className="text-[var(--foreground-secondary)]/50">--</span>;
  return (
    <span className={projected ? 'text-apple-blue/60 italic' : ''}>
      {formatter(value)}
      {projected && <span className="text-[10px] ml-0.5">*</span>}
    </span>
  );
}

export default function CohortsPage() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [segments, setSegments] = useState<SegmentData[]>([]);
  const [customerType, setCustomerType] = useState<{ new: CustomerTypeEntry; returning: CustomerTypeEntry } | null>(null);
  const [marginSegments, setMarginSegments] = useState<MarginSegment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/metrics/cohort-projections`)
        .then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/segments`)
        .then((r) => r.ok ? r.json() : null),
    ]).then(([projData, segData]: [ProjectionData | null, SegmentsResponse | null]) => {
      setData(projData);
      setSegments(segData?.segments ?? []);
      setCustomerType(segData?.customerType ?? null);
      setMarginSegments(segData?.marginSegments ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  if (!data || data.projections.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Cohorts & Retention</h1>
        <div className="card flex flex-col items-center justify-center h-64 text-[var(--foreground-secondary)]">
          <p className="text-lg font-medium">No cohort data yet</p>
          <p className="text-sm mt-2">Cohorts will appear after your first data sync completes.</p>
        </div>
      </div>
    );
  }

  const cohorts = data.projections;

  // Prepare chart data — show both actual and projected retention
  const retentionChartData = [...cohorts].reverse().map((c) => ({
    cohort: c.cohortMonth,
    D7: c.retention.d7.value * 100,
    D30: c.retention.d30.value * 100 || undefined,
    D60: c.retention.d60.value * 100 || undefined,
    D90: c.retention.d90.value * 100 || undefined,
  }));

  const ltvChartData = [...cohorts].reverse().map((c) => ({
    cohort: c.cohortMonth,
    LTV30: c.ltv.ltv30.value || undefined,
    LTV90: c.ltv.ltv90.value || undefined,
    LTV180: c.ltv.ltv180.value || undefined,
  }));

  // Donut chart data for new vs returning
  const donutData = customerType ? [
    { name: 'New', value: customerType.new.count, fill: '#0a84ff' },
    { name: 'Returning', value: customerType.returning.count, fill: '#30d158' },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Cohorts & Retention</h1>
        {data.decayRatios.matureCohortCount > 0 && (
          <p className="text-xs text-[var(--foreground-secondary)]/70 mt-1">
            * Projected values based on decay curves from {data.decayRatios.matureCohortCount} mature cohort{data.decayRatios.matureCohortCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* New vs Returning Customers */}
      {customerType && (customerType.new.count > 0 || customerType.returning.count > 0) && (
        <>
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">New vs Returning Customers</h2>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Breakdown by customer purchase history. New = first order only, Returning = 2+ orders.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Donut chart */}
            <div className="card">
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Customer Split</h3>
              <div className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      nameKey="name"
                      stroke="none"
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string) => [formatNumber(value), name]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue split + metrics */}
            <div className="card">
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Revenue Split</h3>
              {/* Revenue split bar */}
              <div className="mb-4">
                <div className="flex h-6 rounded-lg overflow-hidden">
                  <div
                    className="bg-[#0a84ff] transition-all"
                    style={{ width: `${customerType.new.percentOfRevenue}%` }}
                  />
                  <div
                    className="bg-[#30d158] transition-all"
                    style={{ width: `${customerType.returning.percentOfRevenue}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-[var(--foreground-secondary)]">
                  <span className="text-apple-blue">New: {customerType.new.percentOfRevenue}%</span>
                  <span className="text-apple-green">Returning: {customerType.returning.percentOfRevenue}%</span>
                </div>
              </div>

              {/* Metrics comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg p-3 bg-[#0a84ff]/10 border border-[#0a84ff]/20">
                  <p className="text-xs text-apple-blue font-medium uppercase mb-2">New</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Customers</span><span className="text-[var(--foreground)]">{formatNumber(customerType.new.count)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Revenue</span><span className="text-[var(--foreground)]">{formatCurrency(customerType.new.totalRevenue)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">AOV</span><span className="text-[var(--foreground)]">{formatCurrency(customerType.new.avgAov)}</span></div>
                  </div>
                </div>
                <div className="rounded-lg p-3 bg-[#30d158]/10 border border-[#30d158]/20">
                  <p className="text-xs text-apple-green font-medium uppercase mb-2">Returning</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Customers</span><span className="text-[var(--foreground)]">{formatNumber(customerType.returning.count)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">Revenue</span><span className="text-[var(--foreground)]">{formatCurrency(customerType.returning.totalRevenue)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--foreground-secondary)]">AOV</span><span className="text-[var(--foreground)]">{formatCurrency(customerType.returning.avgAov)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Margin Segments */}
      {marginSegments.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">Margin Segments</h2>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              Customers split by contribution margin percentage (above/below median CM%).
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {marginSegments.map((ms) => {
              const isHigh = ms.segment === 'High Margin';
              return (
                <div
                  key={ms.segment}
                  className={`card border ${isHigh ? 'border-apple-green/20' : 'border-apple-yellow/20'}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-3 h-3 rounded-full ${isHigh ? 'bg-apple-green' : 'bg-apple-yellow'}`} />
                    <h3 className={`text-sm font-semibold ${isHigh ? 'text-apple-green' : 'text-apple-yellow'}`}>
                      {ms.segment}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] text-[var(--foreground-secondary)] uppercase">Customers</div>
                      <div className="text-lg font-bold text-[var(--foreground)] mt-0.5">{formatNumber(ms.count)}</div>
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
          {/* Insight callout */}
          {marginSegments.length === 2 && (() => {
            const high = marginSegments.find((m) => m.segment === 'High Margin');
            const low = marginSegments.find((m) => m.segment === 'Low Margin');
            if (!high || !low) return null;
            const totalRev = high.totalRevenue + low.totalRevenue;
            const highPct = totalRev > 0 ? Math.round((high.totalRevenue / totalRev) * 100) : 0;
            return (
              <div className="card bg-[var(--tint-purple)] border border-apple-purple/20">
                <p className="text-sm text-[var(--foreground)]">
                  <strong className="text-apple-purple">Insight:</strong> High-margin customers represent{' '}
                  <strong>{highPct}%</strong> of revenue with an average CM% of{' '}
                  <strong>{high.avgCmPercent.toFixed(1)}%</strong> vs{' '}
                  <strong>{low.avgCmPercent.toFixed(1)}%</strong> for low-margin.
                  {high.avgCmPercent - low.avgCmPercent > 10 && (
                    <> The {(high.avgCmPercent - low.avgCmPercent).toFixed(0)}pp spread suggests opportunity to shift acquisition toward higher-margin segments.</>
                  )}
                </p>
              </div>
            );
          })()}
        </>
      )}

      {/* Retention Curves */}
      <GlassSurface className="card" intensity="subtle">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Retention Curves by Cohort</h2>
        <p className="text-xs text-[var(--foreground-secondary)] mb-4">
          Each line represents a monthly cohort of first-time customers. The Y-axis shows what percentage made a repeat purchase within D7, D30, D60, or D90. Higher and flatter curves indicate stronger retention.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={retentionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="cohort" stroke="rgba(255,255,255,0.35)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Line type="monotone" dataKey="D7" stroke="#30d158" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D30" stroke="#0a84ff" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D60" stroke="#ff9f0a" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D90" stroke="#ff453a" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassSurface>

      {/* LTV Curves */}
      <GlassSurface className="card" intensity="subtle">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">LTV by Cohort</h2>
        <p className="text-xs text-[var(--foreground-secondary)] mb-4">
          Shows the cumulative revenue per customer at 30, 90, and 180 days after acquisition. Rising curves across cohorts mean newer customers are spending more over time. Compare against CAC to assess profitability.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ltvChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="cohort" stroke="rgba(255,255,255,0.35)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Line type="monotone" dataKey="LTV30" stroke="#0a84ff" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="LTV90" stroke="#30d158" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="LTV180" stroke="#ff9f0a" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassSurface>

      {/* Cohort Table */}
      <GlassSurface className="card overflow-x-auto" intensity="subtle">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Cohort Detail</h2>
          <button
            onClick={() => exportToCSV(
              cohorts.map((c) => ({
                cohortMonth: c.cohortMonth,
                cohortSize: c.cohortSize,
                d7: c.retention.d7.value,
                d30: c.retention.d30.value,
                d60: c.retention.d60.value,
                d90: c.retention.d90.value,
                ltv30: c.ltv.ltv30.value,
                ltv90: c.ltv.ltv90.value,
                ltv180: c.ltv.ltv180.value,
                avgCac: c.avgCac,
                paybackDays: c.paybackDays,
              })),
              'cohorts',
              [
                { key: 'cohortMonth', label: 'Cohort' },
                { key: 'cohortSize', label: 'Size' },
                { key: 'd7', label: 'D7 Retention', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
                { key: 'd30', label: 'D30 Retention', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
                { key: 'd60', label: 'D60 Retention', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
                { key: 'd90', label: 'D90 Retention', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
                { key: 'ltv30', label: 'LTV 30' },
                { key: 'ltv90', label: 'LTV 90' },
                { key: 'ltv180', label: 'LTV 180' },
                { key: 'avgCac', label: 'CAC' },
                { key: 'paybackDays', label: 'Payback Days' },
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
              <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)] uppercase">Cohort</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Size</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">D7</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">D30</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">D60</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">D90</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">LTV 30</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">LTV 90</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">LTV 180</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">CAC</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Payback</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">LTV:CAC</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => {
              const cac = c.avgCac;
              const ltv180 = c.ltv.ltv180.value;
              const ratio = cac > 0 ? ltv180 / cac : 0;
              const ratioProjected = c.ltv.ltv180.projected;
              return (
                <tr key={c.cohortMonth} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                  <td className="px-3 py-2 font-medium text-[var(--foreground)]">{c.cohortMonth}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(c.cohortSize)}</td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d7.value} projected={c.retention.d7.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d30.value} projected={c.retention.d30.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d60.value} projected={c.retention.d60.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d90.value} projected={c.retention.d90.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv30.value} projected={c.ltv.ltv30.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv90.value} projected={c.ltv.ltv90.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv180.value} projected={c.ltv.ltv180.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(cac)}</td>
                  <td className="px-3 py-2 text-right">{c.paybackDays ? `${c.paybackDays}d` : '--'}</td>
                  <td className={`px-3 py-2 text-right font-medium ${cac > 0 && ratio >= 3 ? 'text-apple-green' : cac > 0 && ratio >= 2 ? 'text-apple-yellow' : 'text-apple-red'} ${ratioProjected ? 'opacity-60 italic' : ''}`}>
                    {cac > 0 ? (
                      <>
                        {formatMultiplier(ratio)}
                        {ratioProjected && <span className="text-[10px] ml-0.5">*</span>}
                      </>
                    ) : '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassSurface>

      {/* Customer Segments (RFM) */}
      {segments.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-bold text-[var(--foreground)]">Customer Segments</h2>
            <p className="text-xs text-[var(--foreground-secondary)] mt-1">
              RFM segmentation based on Recency, Frequency, and Monetary value. Each customer is scored 1-5 on each dimension and classified into a segment.
            </p>
          </div>

          <GlassSurface className="card" intensity="subtle">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Segment Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segments} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.35)" fontSize={11} />
                  <YAxis type="category" dataKey="segment" stroke="rgba(255,255,255,0.35)" fontSize={12} width={80} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number) => [formatNumber(value), 'Customers']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {segments.map((s) => (
                      <Cell key={s.segment} fill={SEGMENT_COLORS[s.segment] ?? '#98989f'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassSurface>

          <GlassSurface className="card overflow-x-auto" intensity="subtle">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Segment Detail</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)]">
                  <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)] uppercase">Segment</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Customers</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Revenue</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Avg Orders</th>
                  <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Avg Order Value</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((s) => (
                  <tr key={s.segment} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[s.segment] ?? '#98989f' }} />
                        <span className="font-medium text-[var(--foreground)]">{s.segment}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(s.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(s.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right">{s.avgOrdersPerCustomer.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(s.avgOrderValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassSurface>
        </>
      )}
    </div>
  );
}
