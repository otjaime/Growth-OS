'use client';

import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatCurrency, formatPercent, formatNumber, changeColor, formatPercentChange } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const CHANNEL_COLORS: Record<string, string> = {
  meta: '#3b82f6',
  google: '#22c55e',
  email: '#f59e0b',
  organic: '#8b5cf6',
  direct: '#64748b',
  other: '#94a3b8',
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

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/metrics/channels?days=${days}`)
      .then((r) => r.json())
      .then((data: { channels: ChannelData[] }) => {
        setChannels(data.channels);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  const sorted = [...channels].sort((a, b) => {
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
      className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  );

  // Totals
  const totals = {
    spend: channels.reduce((s, c) => s + c.spend, 0),
    revenue: channels.reduce((s, c) => s + c.revenue, 0),
    orders: channels.reduce((s, c) => s + c.orders, 0),
    contributionMargin: channels.reduce((s, c) => s + c.contributionMargin, 0),
    channelProfit: channels.reduce((s, c) => s + c.channelProfit, 0),
  };

  // Pie chart data
  const pieData = channels
    .filter((c) => c.revenue > 0)
    .map((c) => ({
      name: c.name,
      value: c.revenue,
      color: CHANNEL_COLORS[c.slug] ?? CHANNEL_COLORS['other'],
    }));

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Channel Performance</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* Revenue Mix Donut */}
      {pieData.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Revenue Mix</h2>
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
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {pieData.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>{entry.name}</span>
                  <span className="text-slate-500">{formatCurrency(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
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
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Rev Δ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ch) => (
              <tr key={ch.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                <td className="px-4 py-3 font-medium text-white">{ch.name}</td>
                <td className="px-4 py-3">{formatCurrency(ch.spend)}</td>
                <td className="px-4 py-3">{formatCurrency(ch.revenue)}</td>
                <td className="px-4 py-3">{formatNumber(ch.orders)}</td>
                <td className="px-4 py-3">{ch.cac > 0 ? formatCurrency(ch.cac) : '—'}</td>
                <td className="px-4 py-3">{ch.roas > 0 ? `${ch.roas.toFixed(2)}x` : '—'}</td>
                <td className="px-4 py-3">{formatPercent(ch.cmPct)}</td>
                <td className={`px-4 py-3 font-medium ${ch.channelProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {ch.channelProfit >= 0 ? '+' : ''}{formatCurrency(ch.channelProfit)}
                </td>
                <td className="px-4 py-3">{formatPercent(ch.channelShare)}</td>
                <td className="px-4 py-3">{formatNumber(ch.newCustomers)}</td>
                <td className={`px-4 py-3 ${changeColor(ch.revenueChange)}`}>
                  {formatPercentChange(ch.revenueChange)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600 text-white font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{formatCurrency(totals.spend)}</td>
              <td className="px-4 py-3">{formatCurrency(totals.revenue)}</td>
              <td className="px-4 py-3">{formatNumber(totals.orders)}</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
              <td className={`px-4 py-3 ${totals.channelProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totals.channelProfit >= 0 ? '+' : ''}{formatCurrency(totals.channelProfit)}
              </td>
              <td className="px-4 py-3">100.0%</td>
              <td className="px-4 py-3">—</td>
              <td className="px-4 py-3">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
