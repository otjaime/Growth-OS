'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api';

interface EmailCampaign {
  campaignId: string;
  campaignName: string;
  sends: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscribes: number;
  conversions: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

interface EmailData {
  campaigns: EmailCampaign[];
  flows: {
    sends: number;
    opens: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
  summary: {
    totalSends: number;
    avgOpenRate: number;
    avgClickRate: number;
    totalEmailRevenue: number;
    unsubscribeRate: number;
  };
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col">
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-white mt-1">{value}</span>
    </div>
  );
}

export default function EmailPage() {
  const [data, setData] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/metrics/email?days=30`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: EmailData | null) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  if (!data || (data.campaigns.length === 0 && data.flows.sends === 0)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Email Performance</h1>
        <div className="card flex flex-col items-center justify-center h-64 text-slate-400">
          <p className="text-lg font-medium">No email data yet</p>
          <p className="text-sm mt-2">Connect Klaviyo or run the demo pipeline to see email metrics.</p>
        </div>
      </div>
    );
  }

  const { summary, campaigns, flows } = data;

  // Chart data: top campaigns by revenue
  const chartData = campaigns.slice(0, 10).map((c) => ({
    name: c.campaignName.length > 20 ? c.campaignName.substring(0, 18) + '...' : c.campaignName,
    Sends: c.sends,
    Opens: c.opens,
    Clicks: c.clicks,
    Revenue: c.revenue,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Email Performance</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total Sends" value={formatNumber(summary.totalSends)} />
        <KpiCard label="Open Rate" value={formatPercent(summary.avgOpenRate)} />
        <KpiCard label="Click Rate" value={formatPercent(summary.avgClickRate)} />
        <KpiCard label="Email Revenue" value={formatCurrency(summary.totalEmailRevenue)} />
        <KpiCard label="Unsub Rate" value={formatPercent(summary.unsubscribeRate)} />
      </div>

      {/* Campaign Performance Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Campaign Performance</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
                <Legend />
                <Bar dataKey="Sends" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Opens" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Clicks" fill="#22c55e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Campaign Detail Table */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-white mb-4">Campaign Detail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-3 py-2 text-left text-xs text-slate-400 uppercase">Campaign</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Sends</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Open Rate</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Click Rate</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Conv Rate</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaignId} className="border-b border-slate-800 hover:bg-slate-800/50">
                <td className="px-3 py-2 font-medium text-white max-w-[200px] truncate">{c.campaignName}</td>
                <td className="px-3 py-2 text-right">{formatNumber(c.sends)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(c.openRate)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(c.clickRate)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(c.conversionRate)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Flow Summary */}
      {flows.sends > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Automated Flows</h2>
          <p className="text-xs text-slate-400 mb-4">
            Aggregate performance of automated email flows (Welcome Series, Abandoned Cart, Post-Purchase, etc.)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <span className="text-xs text-slate-400">Sends</span>
              <p className="text-lg font-bold text-white">{formatNumber(flows.sends)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Opens</span>
              <p className="text-lg font-bold text-white">{formatNumber(flows.opens)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Clicks</span>
              <p className="text-lg font-bold text-white">{formatNumber(flows.clicks)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Conversions</span>
              <p className="text-lg font-bold text-white">{formatNumber(flows.conversions)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-400">Revenue</span>
              <p className="text-lg font-bold text-white">{formatCurrency(flows.revenue)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
