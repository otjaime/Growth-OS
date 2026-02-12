'use client';

import { useState, useEffect } from 'react';
import { formatPercent, formatCurrency, formatNumber, formatMultiplier } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface CohortData {
  cohortMonth: string;
  cohortSize: number;
  d7Retention: number;
  d30Retention: number;
  d60Retention: number;
  d90Retention: number;
  ltv30: number;
  ltv90: number;
  ltv180: number;
  paybackDays: number | null;
  avgCac: number;
}

// Calculate how many days since the end of a cohort month
function cohortAgeDays(cohortMonth: string): number {
  const [y, m] = cohortMonth.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y!, m!, 1)); // first day of NEXT month
  return Math.floor((Date.now() - monthEnd.getTime()) / (1000 * 60 * 60 * 24));
}

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<CohortData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/metrics/cohorts`)
      .then((r) => r.ok ? r.json() : { cohorts: [] })
      .then((data: { cohorts: CohortData[] }) => {
        setCohorts(data.cohorts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  if (cohorts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Cohorts & Retention</h1>
        <div className="card flex flex-col items-center justify-center h-64 text-slate-400">
          <p className="text-lg font-medium">No cohort data yet</p>
          <p className="text-sm mt-2">Cohorts will appear after your first data sync completes.</p>
        </div>
      </div>
    );
  }

  // Prepare chart data — only include retention values for mature cohorts
  const retentionChartData = cohorts.map((c) => {
    const age = cohortAgeDays(c.cohortMonth);
    return {
      cohort: c.cohortMonth,
      D7: age >= 7 ? Number(c.d7Retention) * 100 : undefined,
      D30: age >= 30 ? Number(c.d30Retention) * 100 : undefined,
      D60: age >= 60 ? Number(c.d60Retention) * 100 : undefined,
      D90: age >= 90 ? Number(c.d90Retention) * 100 : undefined,
    };
  }).reverse();

  const ltvChartData = cohorts.map((c) => {
    const age = cohortAgeDays(c.cohortMonth);
    return {
      cohort: c.cohortMonth,
      LTV30: age >= 30 ? Number(c.ltv30) : undefined,
      LTV90: age >= 90 ? Number(c.ltv90) : undefined,
      LTV180: age >= 180 ? Number(c.ltv180) : undefined,
    };
  }).reverse();

  // Format retention cell: show "—" for immature windows
  const retCell = (value: number, minAgeDays: number, age: number) =>
    age >= minAgeDays ? formatPercent(Number(value)) : '—';

  // Format LTV cell: show "—" for immature windows
  const ltvCell = (value: number, minAgeDays: number, age: number) =>
    age >= minAgeDays ? formatCurrency(Number(value)) : '—';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Cohorts & Retention</h1>

      {/* Retention Curves */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Retention Curves by Cohort</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={retentionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="cohort" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
              <Legend />
              <Line type="monotone" dataKey="D7" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D30" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D60" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="D90" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* LTV Curves */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">LTV by Cohort</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ltvChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="cohort" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' }} />
              <Legend />
              <Line type="monotone" dataKey="LTV30" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="LTV90" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="LTV180" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cohort Table */}
      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-white mb-4">Cohort Detail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-3 py-2 text-left text-xs text-slate-400 uppercase">Cohort</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Size</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">D7</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">D30</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">D60</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">D90</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">LTV 30</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">LTV 90</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">LTV 180</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">CAC</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">Payback</th>
              <th className="px-3 py-2 text-right text-xs text-slate-400 uppercase">LTV:CAC</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => {
              const age = cohortAgeDays(c.cohortMonth);
              const cac = Number(c.avgCac);
              const ltv180 = Number(c.ltv180);
              const ratio = cac > 0 ? ltv180 / cac : 0;
              return (
                <tr key={c.cohortMonth} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="px-3 py-2 font-medium text-white">{c.cohortMonth}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(c.cohortSize)}</td>
                  <td className="px-3 py-2 text-right">{retCell(c.d7Retention, 7, age)}</td>
                  <td className="px-3 py-2 text-right">{retCell(c.d30Retention, 30, age)}</td>
                  <td className="px-3 py-2 text-right">{retCell(c.d60Retention, 60, age)}</td>
                  <td className="px-3 py-2 text-right">{retCell(c.d90Retention, 90, age)}</td>
                  <td className="px-3 py-2 text-right">{ltvCell(c.ltv30, 30, age)}</td>
                  <td className="px-3 py-2 text-right">{ltvCell(c.ltv90, 90, age)}</td>
                  <td className="px-3 py-2 text-right">{ltvCell(c.ltv180, 180, age)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(cac)}</td>
                  <td className="px-3 py-2 text-right">{c.paybackDays ? `${c.paybackDays}d` : '—'}</td>
                  <td className={`px-3 py-2 text-right font-medium ${cac > 0 && ratio >= 3 ? 'text-green-400' : cac > 0 && ratio >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {cac > 0 && age >= 180 ? formatMultiplier(ratio) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
