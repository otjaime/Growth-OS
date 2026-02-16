'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { KpiCard } from '@/components/kpi-card';
import { DateRangePicker } from '@/components/date-range-picker';
import { RevenueChart } from '@/components/revenue-chart';
import { ForecastChart } from '@/components/forecast-chart';
import { KpiCardSkeleton, ChartSkeleton, TableSkeleton } from '@/components/skeleton';
import { AcronymTip } from '@/components/tooltip';
import { formatCurrency, formatPercent, formatNumber, formatDays, formatMultiplier } from '@/lib/format';
import { apiFetch } from '@/lib/api';

interface KpiValue {
  value: number;
  change?: number;
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
    grossMarginPct: KpiValue;
    ltvCacRatio: KpiValue;
    paybackDays: { value: number | null };
    retentionD30: KpiValue;
    ltv90: KpiValue;
  };
}

interface TimeseriesData {
  dailyRevenue: Array<{ date: string; revenue: number; orders: number; new_customers: number }>;
  dailySpend: Array<{ date: string; spend: number }>;
  dailyTraffic: Array<{ date: string; sessions: number }>;
  dailyMargin: Array<{ date: string; cm: number; revenue_net: number }>;
}

interface CohortSnapshot {
  latest: {
    cohortMonth: string;
    cohortSize: number;
    d30Retention: number;
    ltv90: number;
    ltv180: number;
    avgCac: number;
    paybackDays: number | null;
    ltvCacRatio: number;
  } | null;
  recentCohorts: Array<{ cohortMonth: string; d30Retention: number; ltv90: number; cohortSize: number }>;
}

interface ChannelRow {
  id: string;
  name: string;
  slug: string;
  spend: number;
  revenue: number;
  orders: number;
  contributionMargin: number;
  cmPct: number;
  channelProfit: number;
  channelShare: number;
}

interface ChannelsData {
  channels: ChannelRow[];
}

interface ForecastResponse {
  metric: string;
  horizon: number;
  parameters: { alpha: number; beta: number; mse: number };
  historical: Array<{ date: string; value: number }>;
  forecast: Array<{
    date: string;
    value: number;
    lower80: number;
    upper80: number;
    lower95: number;
    upper95: number;
  }> | null;
  error?: string;
}

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesData | null>(null);
  const [cohortSnap, setCohortSnap] = useState<CohortSnapshot | null>(null);
  const [channels, setChannels] = useState<ChannelsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastResponse | null>(null);
  const [forecastMetric, setForecastMetric] = useState<'revenue' | 'orders' | 'spend'>('revenue');
  const [forecastHorizon, setForecastHorizon] = useState(30);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch(`/api/metrics/summary?days=${days}`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/timeseries?days=${days}`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/cohort-snapshot`).then((r) => r.ok ? r.json() : null),
      apiFetch(`/api/metrics/channels?days=${days}`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([summaryData, tsData, cohortData, channelsData]) => {
        if (summaryData?.kpis) setSummary(summaryData as SummaryData);
        if (tsData?.dailyRevenue) setTimeseries(tsData as TimeseriesData);
        if (cohortData) setCohortSnap(cohortData as CohortSnapshot);
        if (channelsData?.channels) setChannels(channelsData as ChannelsData);
        if (!summaryData?.kpis) setError('API returned no data');
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [days]);

  // Fetch forecast independently (always uses 180 days, not tied to dashboard period)
  useEffect(() => {
    setForecastLoading(true);
    apiFetch(`/api/metrics/forecast?metric=${forecastMetric}&horizon=${forecastHorizon}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setForecastData(data as ForecastResponse | null);
        setForecastLoading(false);
      })
      .catch(() => setForecastLoading(false));
  }, [forecastMetric, forecastHorizon]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="animate-pulse rounded bg-slate-700/50 h-8 w-56" />
          <div className="animate-pulse rounded bg-slate-700/50 h-9 w-36" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <KpiCardSkeleton key={i} />)}
        </div>
        <ChartSkeleton />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => <KpiCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={4} cols={5} />
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
  const spendSparkData = timeseries?.dailySpend.map((d) => d.spend) ?? [];
  const cohort = cohortSnap?.latest;

  // LTV:CAC color coding
  const ltvCacValue = cohort?.ltvCacRatio ?? k.ltvCacRatio.value;
  const ltvCacColor = ltvCacValue >= 3 ? 'text-green-400' : ltvCacValue >= 2 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-8">
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

      {/* SECTION 1: Revenue & Profitability */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Revenue & Profitability</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Revenue (Gross)" value={k.revenueGross.value} change={k.revenueGross.change} sparkData={revenueSparkData} />
          <KpiCard title="Orders" value={k.orders.value} change={k.orders.change} format="number" />
          <KpiCard title="Gross Margin" value={k.grossMarginPct.value} format="percent" />
          <KpiCard title={<AcronymTip term="CM%" />} value={k.cmPct.value} change={k.cmPct.change} format="percent" benchmark="20–35%" />
        </div>
      </section>

      {/* SECTION 2: Revenue & Margin Trend */}
      {timeseries && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Revenue & Margin Trend</h2>
          <div className="card">
            <RevenueChart
              revenueData={timeseries.dailyRevenue}
              spendData={timeseries.dailySpend}
              marginData={timeseries.dailyMargin}
            />
          </div>
        </section>
      )}

      {/* SECTION 2.5: Revenue Forecast */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            {forecastMetric === 'revenue' ? 'Revenue' : forecastMetric === 'orders' ? 'Orders' : 'Spend'} Forecast ({forecastHorizon}-day)
          </h2>
          <div className="flex gap-3">
            <div className="flex gap-1">
              {([7, 14, 30, 60, 90] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setForecastHorizon(h)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    forecastHorizon === h
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {h}d
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['revenue', 'orders', 'spend'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setForecastMetric(m)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    forecastMetric === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {m === 'revenue' ? 'Revenue' : m === 'orders' ? 'Orders' : 'Spend'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {forecastData?.forecast && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card flex flex-col gap-2">
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                Projected {forecastMetric === 'revenue' ? 'Revenue' : forecastMetric === 'orders' ? 'Orders' : 'Spend'} ({forecastHorizon}d)
              </p>
              <p className="text-2xl font-bold text-white">
                {forecastMetric === 'orders'
                  ? formatNumber(Math.round(forecastData.forecast.reduce((s, f) => s + f.value, 0)))
                  : formatCurrency(forecastData.forecast.reduce((s, f) => s + f.value, 0))}
              </p>
              <p className="text-xs text-slate-500">
                80% range:{' '}
                {forecastMetric === 'orders'
                  ? formatNumber(Math.round(forecastData.forecast.reduce((s, f) => s + f.lower80, 0)))
                  : formatCurrency(forecastData.forecast.reduce((s, f) => s + f.lower80, 0))}
                {' – '}
                {forecastMetric === 'orders'
                  ? formatNumber(Math.round(forecastData.forecast.reduce((s, f) => s + f.upper80, 0)))
                  : formatCurrency(forecastData.forecast.reduce((s, f) => s + f.upper80, 0))}
              </p>
            </div>
            {forecastData.parameters && (
              <div className="card flex flex-col gap-2">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Forecast Model</p>
                <p className="text-sm text-slate-300">
                  Holt-Winters double exponential smoothing
                </p>
                <p className="text-xs text-slate-500">
                  Level sensitivity {forecastData.parameters.alpha} · Trend sensitivity {forecastData.parameters.beta}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="card">
          {forecastLoading ? (
            <div className="flex items-center justify-center h-80">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : forecastData?.historical ? (
            <ForecastChart
              historical={forecastData.historical}
              forecast={forecastData.forecast}
              metric={forecastMetric}
            />
          ) : (
            <div className="flex items-center justify-center h-80 text-slate-500">
              No forecast data available
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: Customer Economics */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Customer Economics</h2>
          <p className="text-xs text-slate-500 mt-0.5">LTV, LTV:CAC, and Payback are based on the most recent mature cohort</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title={<><AcronymTip term="CAC" /> (Blended)</>} value={k.blendedCac.value} change={k.blendedCac.change} invertColor benchmark="$80–$150" />
          <div className="card flex flex-col gap-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide"><AcronymTip term="LTV" /> (90-day)</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(k.ltv90.value)}</p>
            <p className="text-xs text-slate-500">Latest mature cohort</p>
          </div>
          <div className="card flex flex-col gap-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide"><AcronymTip term="LTV" />:<AcronymTip term="CAC" /> Ratio</p>
            <p className={`text-2xl font-bold ${ltvCacColor}`}>{formatMultiplier(ltvCacValue)}</p>
            <p className="text-xs text-slate-500">
              {ltvCacValue >= 3 ? 'Healthy' : ltvCacValue >= 2 ? 'Monitor' : 'Critical'}
            </p>
          </div>
          <div className="card flex flex-col gap-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Payback Period</p>
            <p className="text-2xl font-bold text-white">{formatDays(k.paybackDays.value)}</p>
            <p className="text-xs text-slate-500">
              {k.paybackDays.value !== null && k.paybackDays.value <= 90 ? 'Within target' : k.paybackDays.value !== null ? 'Above 90d target' : ''}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: Retention & Acquisition */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Retention & Acquisition</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card flex flex-col gap-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide"><AcronymTip term="D30" /> Retention</p>
            <p className="text-2xl font-bold text-white">{formatPercent(k.retentionD30.value)}</p>
            <p className="text-xs text-slate-500">Most recent mature cohort</p>
          </div>
          <KpiCard title="New Customers" value={k.newCustomers.value} change={k.newCustomers.change} format="number" />
          <KpiCard title={<AcronymTip term="MER" />} value={k.mer.value} change={k.mer.change} format="multiplier" benchmark="3–5x" />
        </div>
      </section>

      {/* SECTION 5: Channel Overview */}
      {channels && channels.channels.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Channel Overview</h2>
            <Link href="/channels" className="text-xs text-blue-400 hover:text-blue-300">
              View all channels &rarr;
            </Link>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium text-right">Spend</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                  <th className="pb-2 font-medium text-right">CM</th>
                  <th className="pb-2 font-medium text-right">Profit</th>
                  <th className="pb-2 font-medium text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {channels.channels.slice(0, 5).map((ch) => (
                  <tr key={ch.id} className="border-b border-slate-800 text-slate-300">
                    <td className="py-2 font-medium text-white">{ch.name}</td>
                    <td className="py-2 text-right">{formatCurrency(ch.spend)}</td>
                    <td className="py-2 text-right">{formatCurrency(ch.revenue)}</td>
                    <td className="py-2 text-right">{formatPercent(ch.cmPct)}</td>
                    <td className={`py-2 text-right font-medium ${ch.channelProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {ch.channelProfit >= 0 ? '+' : ''}{formatCurrency(ch.channelProfit)}
                    </td>
                    <td className="py-2 text-right">{formatPercent(ch.channelShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
