'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatPercent, formatDays, formatMultiplier } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  const [data, setData] = useState<UnitEconData | null>(null);
  const [cohort, setCohort] = useState<CohortSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/metrics/unit-economics?days=30`).then((r) => r.json()),
      fetch(`${API}/api/metrics/cohort-snapshot`).then((r) => r.json()),
    ])
      .then(([unitData, cohortData]) => {
        setData(unitData as UnitEconData);
        setCohort(cohortData as CohortSnapshot);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  const b = data.breakdown;
  const waterfall = [
    { name: 'Revenue Net', value: b.revenueNet, color: '#3b82f6' },
    { name: 'COGS', value: -b.cogs, color: '#ef4444' },
    { name: 'Shipping', value: -b.shipping, color: '#f97316' },
    { name: 'Ops Cost', value: -b.opsCost, color: '#f59e0b' },
    { name: 'CM', value: b.contributionMargin, color: '#22c55e' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Unit Economics & Payback</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">AOV</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(b.avgOrderValue)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Contribution Margin</p>
          <p className="text-2xl font-bold text-white mt-1">{formatPercent(b.cmPercent)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Blended CAC</p>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(b.blendedCac)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 uppercase">Total Orders</p>
          <p className="text-2xl font-bold text-white mt-1">{b.orderCount.toLocaleString()}</p>
        </div>
      </div>

      {/* Margin Decomposition */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Contribution Margin Decomposition</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfall} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
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
        <h2 className="text-lg font-semibold text-white mb-4">Cost Breakdown (Last 30 Days)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-4 py-2 text-left text-xs text-slate-400">Line Item</th>
              <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
              <th className="px-4 py-2 text-right text-xs text-slate-400">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800"><td className="px-4 py-2 text-white">Revenue (Net)</td><td className="px-4 py-2 text-right">{formatCurrency(b.revenueNet)}</td><td className="px-4 py-2 text-right">100%</td></tr>
            <tr className="border-b border-slate-800"><td className="px-4 py-2 text-slate-300">− COGS</td><td className="px-4 py-2 text-right text-red-400">({formatCurrency(b.cogs)})</td><td className="px-4 py-2 text-right">{formatPercent(b.cogsPercent)}</td></tr>
            <tr className="border-b border-slate-800"><td className="px-4 py-2 text-slate-300">− Shipping</td><td className="px-4 py-2 text-right text-red-400">({formatCurrency(b.shipping)})</td><td className="px-4 py-2 text-right">{formatPercent(b.shippingPercent)}</td></tr>
            <tr className="border-b border-slate-800"><td className="px-4 py-2 text-slate-300">− Ops Cost</td><td className="px-4 py-2 text-right text-red-400">({formatCurrency(b.opsCost)})</td><td className="px-4 py-2 text-right">{formatPercent(b.opsPercent)}</td></tr>
            <tr className="border-b border-slate-700 bg-slate-800/50"><td className="px-4 py-2 font-semibold text-green-400">= Contribution Margin</td><td className="px-4 py-2 text-right font-semibold text-green-400">{formatCurrency(b.contributionMargin)}</td><td className="px-4 py-2 text-right font-semibold text-green-400">{formatPercent(b.cmPercent)}</td></tr>
            <tr className="border-b border-slate-800"><td className="px-4 py-2 text-slate-300">− Marketing Spend</td><td className="px-4 py-2 text-right text-yellow-400">({formatCurrency(b.marketingSpend)})</td><td className="px-4 py-2 text-right">{b.revenueNet > 0 ? formatPercent(b.marketingSpend / b.revenueNet) : '—'}</td></tr>
          </tbody>
        </table>
      </div>

      {/* CAC vs LTV Section */}
      {cohort?.latest && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">CAC vs LTV</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-xs text-slate-400 uppercase">LTV:CAC Ratio</p>
              <p className={`text-2xl font-bold mt-1 ${cohort.latest.ltvCacRatio >= 3 ? 'text-green-400' : cohort.latest.ltvCacRatio >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                {formatMultiplier(cohort.latest.ltvCacRatio)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {cohort.latest.ltvCacRatio >= 3 ? 'Healthy' : cohort.latest.ltvCacRatio >= 2 ? 'Monitor' : 'Critical'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 uppercase">Payback Period</p>
              <p className="text-2xl font-bold text-white mt-1">{formatDays(cohort.latest.paybackDays)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {cohort.latest.paybackDays !== null && cohort.latest.paybackDays <= 90 ? 'Within target' : 'Above 90d target'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 uppercase">LTV (180-day)</p>
              <p className="text-2xl font-bold text-white mt-1">{formatCurrency(cohort.latest.ltv180)}</p>
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'CAC', value: cohort.latest.avgCac, color: '#ef4444' },
                  { name: 'LTV (180d)', value: cohort.latest.ltv180, color: '#22c55e' },
                ]}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} tickFormatter={(v: number) => `$${v}`} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={80} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  <Cell fill="#ef4444" />
                  <Cell fill="#22c55e" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
