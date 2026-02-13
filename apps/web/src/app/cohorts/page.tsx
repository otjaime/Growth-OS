'use client';

import { useState, useEffect } from 'react';
import { formatPercent, formatCurrency, formatNumber, formatMultiplier } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api';

interface ProjectedValue {
  value: number;
  projected: boolean;
}

interface CohortProjection {
  cohortMonth: string;
  cohortSize: number;
  ageDays: number;
  retention: {
    d7: ProjectedValue;
    d30: ProjectedValue;
    d60: ProjectedValue;
    d90: ProjectedValue;
  };
  ltv: {
    ltv30: ProjectedValue;
    ltv90: ProjectedValue;
    ltv180: ProjectedValue;
  };
  avgCac: number;
  paybackDays: number | null;
}

interface ProjectionData {
  projections: CohortProjection[];
  decayRatios: {
    d30toD7: number;
    d60toD30: number;
    d90toD60: number;
    matureCohortCount: number;
  };
}

function ProjectedCell({ value, projected, formatter }: { value: number; projected: boolean; formatter: (v: number) => string }) {
  if (value === 0 && projected) return <span className="text-slate-600">--</span>;
  return (
    <span className={projected ? 'text-blue-400/60 italic' : ''}>
      {formatter(value)}
      {projected && <span className="text-[10px] ml-0.5">*</span>}
    </span>
  );
}

export default function CohortsPage() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/metrics/cohort-projections`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: ProjectionData | null) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  if (!data || data.projections.length === 0) {
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

  const cohorts = data.projections;

  // Prepare chart data — show both actual and projected retention
  const retentionChartData = [...cohorts].reverse().map((c) => ({
    cohort: c.cohortMonth,
    D7: c.retention.d7.value * 100,
    D30: c.retention.d30.value * 100 || undefined,
    D60: c.retention.d60.value * 100 || undefined,
    D90: c.retention.d90.value * 100 || undefined,
  }));

  const ltvChartData = [...cohorts].reverse().map((c) => ({
    cohort: c.cohortMonth,
    LTV30: c.ltv.ltv30.value || undefined,
    LTV90: c.ltv.ltv90.value || undefined,
    LTV180: c.ltv.ltv180.value || undefined,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cohorts & Retention</h1>
        {data.decayRatios.matureCohortCount > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            * Projected values based on decay curves from {data.decayRatios.matureCohortCount} mature cohort{data.decayRatios.matureCohortCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

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
              const cac = c.avgCac;
              const ltv180 = c.ltv.ltv180.value;
              const ratio = cac > 0 ? ltv180 / cac : 0;
              const ratioProjected = c.ltv.ltv180.projected;
              return (
                <tr key={c.cohortMonth} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="px-3 py-2 font-medium text-white">{c.cohortMonth}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(c.cohortSize)}</td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d7.value} projected={c.retention.d7.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d30.value} projected={c.retention.d30.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d60.value} projected={c.retention.d60.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.retention.d90.value} projected={c.retention.d90.projected} formatter={formatPercent} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv30.value} projected={c.ltv.ltv30.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv90.value} projected={c.ltv.ltv90.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ProjectedCell value={c.ltv.ltv180.value} projected={c.ltv.ltv180.projected} formatter={formatCurrency} />
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(cac)}</td>
                  <td className="px-3 py-2 text-right">{c.paybackDays ? `${c.paybackDays}d` : '--'}</td>
                  <td className={`px-3 py-2 text-right font-medium ${cac > 0 && ratio >= 3 ? 'text-green-400' : cac > 0 && ratio >= 2 ? 'text-yellow-400' : 'text-red-400'} ${ratioProjected ? 'opacity-60 italic' : ''}`}>
                    {cac > 0 ? (
                      <>
                        {formatMultiplier(ratio)}
                        {ratioProjected && <span className="text-[10px] ml-0.5">*</span>}
                      </>
                    ) : '--'}
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
