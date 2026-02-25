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
      <span className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-[var(--foreground)] mt-1">{value}</span>
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" /></div>;
  }

  if (!data || (data.campaigns.length === 0 && data.flows.sends === 0)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Email Performance</h1>
        <div className="card flex flex-col items-center justify-center h-64 text-[var(--foreground-secondary)]">
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
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Email Performance</h1>

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
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Campaign Performance</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={10} angle={-15} textAnchor="end" height={60} />
                <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} />
                <Tooltip contentStyle={{
                  backgroundColor: 'rgba(30,30,36,0.85)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  color: '#f5f5f7',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
                }} />
                <Legend />
                <Bar dataKey="Sends" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Opens" fill="#0a84ff" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Clicks" fill="#30d158" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Campaign Detail Table */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Campaign Detail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)] uppercase">Campaign</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Sends</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Open Rate</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Click Rate</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Conv Rate</th>
              <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)] uppercase">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.campaignId} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                <td className="px-3 py-2 font-medium text-[var(--foreground)] max-w-[200px] truncate">{c.campaignName}</td>
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
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Automated Flows</h2>
          <p className="text-xs text-[var(--foreground-secondary)] mb-4">
            Aggregate performance of automated email flows (Welcome Series, Abandoned Cart, Post-Purchase, etc.)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <span className="text-xs text-[var(--foreground-secondary)]">Sends</span>
              <p className="text-lg font-bold text-[var(--foreground)]">{formatNumber(flows.sends)}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--foreground-secondary)]">Opens</span>
              <p className="text-lg font-bold text-[var(--foreground)]">{formatNumber(flows.opens)}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--foreground-secondary)]">Clicks</span>
              <p className="text-lg font-bold text-[var(--foreground)]">{formatNumber(flows.clicks)}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--foreground-secondary)]">Conversions</span>
              <p className="text-lg font-bold text-[var(--foreground)]">{formatNumber(flows.conversions)}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--foreground-secondary)]">Revenue</span>
              <p className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(flows.revenue)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
