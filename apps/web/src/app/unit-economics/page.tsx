'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatPercent, formatDays, formatMultiplier } from '@/lib/format';
import { DateRangePicker } from '@/components/date-range-picker';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';

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

export default function UnitEconomicsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UnitEconData | null>(null);
  const [cohort, setCohort] = useState<CohortSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      apiFetch(`/api/metrics/unit-economics?days=${days}`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/cohort-snapshot`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([unitData, cohortData]) => {
        if (!unitData) { setError(true); setLoading(false); return; }
        setData(unitData as UnitEconData);
        setCohort(cohortData as CohortSnapshot);
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
  const waterfall = [
    { name: 'Revenue Net', value: b.revenueNet, color: '#0a84ff' },
    { name: 'COGS', value: -b.cogs, color: '#ff453a' },
    { name: 'Shipping', value: -b.shipping, color: '#ff9f0a' },
    { name: 'Ops Cost', value: -b.opsCost, color: '#ff9f0a' },
    { name: 'CM', value: b.contributionMargin, color: '#30d158' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Unit Economics & Payback</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">AOV</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(b.avgOrderValue)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Contribution Margin</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatPercent(b.cmPercent)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Blended CAC</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{formatCurrency(b.blendedCac)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] uppercase">Total Orders</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1">{b.orderCount.toLocaleString()}</p>
        </div>
      </div>

      {/* Margin Decomposition */}
      <div className="card">
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
      </div>

      {/* Cost Breakdown Table */}
      <div className="card">
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
            <tr className="border-b border-white/[0.04]"><td className="px-4 py-2 text-[var(--foreground)]/80">− Marketing Spend</td><td className="px-4 py-2 text-right text-apple-yellow">({formatCurrency(b.marketingSpend)})</td><td className="px-4 py-2 text-right">{b.revenueNet > 0 ? formatPercent(b.marketingSpend / b.revenueNet) : '—'}</td></tr>
          </tbody>
        </table>
      </div>

      {/* CAC vs LTV Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">CAC vs LTV</h2>
        {cohort?.latest ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
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
      </div>

      {/* Payment Method Breakdown */}
      {data.paymentBreakdown && data.paymentBreakdown.length > 0 && (
        <div className="card">
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
        </div>
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
