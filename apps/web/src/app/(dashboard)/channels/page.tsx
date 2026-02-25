'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatCurrency, formatPercent, formatNumber, changeColor, formatPercentChange } from '@/lib/format';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';
import { useFilters } from '@/contexts/filters';

const CHANNEL_COLORS: Record<string, string> = {
  meta: '#0a84ff',
  google: '#30d158',
  tiktok: '#64d2ff',
  email: '#ff9f0a',
  organic: '#bf5af2',
  affiliate: '#ff375f',
  direct: '#98989f',
  other: '#98989f',
};

interface ChannelData {
  id: string;
  name: string;
  slug: string;
  spend: number;
  revenue: number;
  orders: number;
  newCustomers: number;
  returningCustomers: number;
  cac: number;
  roas: number;
  mer: number;
  contributionMargin: number;
  cmPct: number;
  impressions: number;
  clicks: number;
  revenueChange: number;
  spendChange: number;
  channelProfit: number;
  channelShare: number;
}

export default function ChannelsPage() {
  const [days, setDays] = useState(7);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof ChannelData>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { channelFilter } = useFilters();

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/metrics/channels?days=${days}`)
      .then((r) => r.ok ? r.json() : { channels: [] })
      .then((data: { channels?: ChannelData[] }) => {
        setChannels(data.channels ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  const filtered = channelFilter
    ? channels.filter((c) => c.slug === channelFilter)
    : channels;

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key: keyof ChannelData) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, field }: { label: string; field: keyof ChannelData }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-secondary)] uppercase tracking-wider cursor-pointer hover:text-[var(--foreground)] select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );

  // Totals
  const totals = {
    spend: filtered.reduce((s, c) => s + c.spend, 0),
    revenue: filtered.reduce((s, c) => s + c.revenue, 0),
    orders: filtered.reduce((s, c) => s + c.orders, 0),
    contributionMargin: filtered.reduce((s, c) => s + c.contributionMargin, 0),
    channelProfit: filtered.reduce((s, c) => s + c.channelProfit, 0),
    newCustomers: filtered.reduce((s, c) => s + c.newCustomers, 0),
    returningCustomers: filtered.reduce((s, c) => s + c.returningCustomers, 0),
  };

  // Pie chart data
  const pieData = filtered
    .filter((c) => c.revenue > 0)
    .map((c) => ({
      name: c.name,
      value: c.revenue,
      color: CHANNEL_COLORS[c.slug] ?? CHANNEL_COLORS['other'],
    }));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Channel Performance</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* Revenue Mix Donut */}
      {pieData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">Revenue Mix</h2>
          <div className="h-48 flex items-center">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
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
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {pieData.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-[var(--foreground)]/80">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>{entry.name}</span>
                  <span className="text-[var(--foreground-secondary)]/70">{formatCurrency(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider">Channel Breakdown</h2>
          <button
            onClick={() => exportToCSV(channels, `channels-${days}d`, [
              { key: 'name', label: 'Channel' },
              { key: 'spend', label: 'Spend' },
              { key: 'revenue', label: 'Revenue' },
              { key: 'orders', label: 'Orders' },
              { key: 'cac', label: 'CAC' },
              { key: 'roas', label: 'ROAS' },
              { key: 'cmPct', label: 'CM%', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
              { key: 'newCustomers', label: 'New Customers' },
              { key: 'returningCustomers', label: 'Returning' },
            ])}
            className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] px-2 py-1 border border-[var(--glass-border)] rounded hover:border-[var(--glass-border-hover)] transition-all ease-spring"
          >
            Export CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <SortHeader label="Channel" field="name" />
              <SortHeader label="Spend" field="spend" />
              <SortHeader label="Revenue" field="revenue" />
              <SortHeader label="Orders" field="orders" />
              <SortHeader label="CAC" field="cac" />
              <SortHeader label="ROAS" field="roas" />
              <SortHeader label="CM%" field="cmPct" />
              <SortHeader label="Ch. Profit" field="channelProfit" />
              <SortHeader label="Share" field="channelShare" />
              <SortHeader label="New" field="newCustomers" />
              <SortHeader label="Existing" field="returningCustomers" />
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--foreground-secondary)]">Rev Δ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ch) => (
              <tr key={ch.id} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                <td className="px-4 py-3 font-medium text-[var(--foreground)]">{ch.name}</td>
                <td className="px-4 py-3">{formatCurrency(ch.spend)}</td>
                <td className="px-4 py-3">{formatCurrency(ch.revenue)}</td>
                <td className="px-4 py-3">{formatNumber(ch.orders)}</td>
                <td className="px-4 py-3">{ch.cac > 0 ? formatCurrency(ch.cac) : '—'}</td>
                <td className="px-4 py-3">{ch.roas > 0 ? `${ch.roas.toFixed(2)}x` : '—'}</td>
                <td className="px-4 py-3">{formatPercent(ch.cmPct)}</td>
                <td className={`px-4 py-3 font-medium ${ch.channelProfit >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                  {ch.channelProfit >= 0 ? '+' : ''}{formatCurrency(ch.channelProfit)}
                </td>
                <td className="px-4 py-3">{formatPercent(ch.channelShare)}</td>
                <td className="px-4 py-3">{formatNumber(ch.newCustomers)}</td>
                <td className="px-4 py-3">{formatNumber(ch.returningCustomers)}</td>
                <td className={`px-4 py-3 ${changeColor(ch.revenueChange)}`}>
                  {formatPercentChange(ch.revenueChange)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--glass-border)] text-[var(--foreground)] font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{formatCurrency(totals.spend)}</td>
              <td className="px-4 py-3">{formatCurrency(totals.revenue)}</td>
              <td className="px-4 py-3">{formatNumber(totals.orders)}</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
              <td className={`px-4 py-3 ${totals.channelProfit >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                {totals.channelProfit >= 0 ? '+' : ''}{formatCurrency(totals.channelProfit)}
              </td>
              <td className="px-4 py-3">100.0%</td>
              <td className="px-4 py-3">{formatNumber(totals.newCustomers)}</td>
              <td className="px-4 py-3">{formatNumber(totals.returningCustomers)}</td>
              <td className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
