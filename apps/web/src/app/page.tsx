'use client';

import { useState, useEffect } from 'react';
import { KpiCard } from '@/components/kpi-card';
import { DateRangePicker } from '@/components/date-range-picker';
import { RevenueChart } from '@/components/revenue-chart';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface KpiValue {
  value: number;
  change: number;
}

interface SummaryData {
  period: { start: string; end: string; days: number };
  kpis: {
    revenueGross: KpiValue;
    revenueNet: KpiValue;
    orders: KpiValue;
    aov: KpiValue;
    contributionMargin: KpiValue;
    cmPct: KpiValue;
    blendedCac: KpiValue;
    mer: KpiValue;
    newCustomers: KpiValue;
    sessions: KpiValue;
    spend: KpiValue;
  };
}

interface TimeseriesData {
  dailyRevenue: Array<{ date: string; revenue: number; orders: number; new_customers: number }>;
  dailySpend: Array<{ date: string; spend: number }>;
  dailyTraffic: Array<{ date: string; sessions: number }>;
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`${API}/api/metrics/summary?days=${days}`).then((r) => r.json()),
      fetch(`${API}/api/metrics/timeseries?days=${days}`).then((r) => r.json()),
    ])
      .then(([summaryData, tsData]) => {
        setSummary(summaryData as SummaryData);
        setTimeseries(tsData as TimeseriesData);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-red-500/50">
        <p className="text-red-400">Failed to load dashboard data. Is the API running?</p>
        <p className="text-xs text-slate-500 mt-2">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const k = summary.kpis;
  const revenueSparkData = timeseries?.dailyRevenue.map((d) => d.revenue) ?? [];
  const orderSparkData = timeseries?.dailyRevenue.map((d) => d.orders) ?? [];
  const spendSparkData = timeseries?.dailySpend.map((d) => d.spend) ?? [];
  const sessionSparkData = timeseries?.dailyTraffic.map((d) => d.sessions) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Executive Summary</h1>
          <p className="text-sm text-slate-400 mt-1">
            {summary.period.start} — {summary.period.end}
          </p>
        </div>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Revenue (Gross)" value={k.revenueGross.value} change={k.revenueGross.change} sparkData={revenueSparkData} />
        <KpiCard title="Orders" value={k.orders.value} change={k.orders.change} format="number" sparkData={orderSparkData} />
        <KpiCard title="AOV" value={k.aov.value} change={k.aov.change} />
        <KpiCard title="New Customers" value={k.newCustomers.value} change={k.newCustomers.change} format="number" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Ad Spend" value={k.spend.value} change={k.spend.change} invertColor sparkData={spendSparkData} />
        <KpiCard title="Blended CAC" value={k.blendedCac.value} change={k.blendedCac.change} invertColor />
        <KpiCard title="MER" value={k.mer.value} change={k.mer.change} format="multiplier" />
        <KpiCard title="CM%" value={k.cmPct.value} change={k.cmPct.change} format="percent" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard title="Revenue (Net)" value={k.revenueNet.value} change={k.revenueNet.change} />
        <KpiCard title="Sessions" value={k.sessions.value} change={k.sessions.change} format="number" sparkData={sessionSparkData} />
      </div>

      {/* Revenue Chart */}
      {timeseries && (
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Revenue & Spend Trend</h2>
          <RevenueChart
            revenueData={timeseries.dailyRevenue}
            spendData={timeseries.dailySpend}
          />
        </div>
      )}
    </div>
  );
}
