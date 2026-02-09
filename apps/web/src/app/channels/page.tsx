'use client';

import { useState, useEffect } from 'react';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatCurrency, formatPercent, formatNumber, changeColor, formatPercentChange } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Channel Performance</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

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
              <SortHeader label="MER" field="mer" />
              <SortHeader label="CM%" field="cmPct" />
              <SortHeader label="New" field="newCustomers" />
              <SortHeader label="Returning" field="returningCustomers" />
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
                <td className="px-4 py-3">{ch.mer > 0 ? `${ch.mer.toFixed(2)}x` : '—'}</td>
                <td className="px-4 py-3">{formatPercent(ch.cmPct)}</td>
                <td className="px-4 py-3">{formatNumber(ch.newCustomers)}</td>
                <td className="px-4 py-3">{formatNumber(ch.returningCustomers)}</td>
                <td className={`px-4 py-3 ${changeColor(ch.revenueChange)}`}>
                  {formatPercentChange(ch.revenueChange)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
