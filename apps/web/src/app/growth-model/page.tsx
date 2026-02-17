'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/export';

interface GrowthModelInput {
  monthlyBudget: number;
  targetCac: number;
  expectedCvr: number;
  avgOrderValue: number;
  cogsPercent: number;
  returnRate: number;
  avgOrdersPerCustomer: number;
  horizonMonths: number;
}

interface MonthlyProjection {
  month: number;
  spend: number;
  newCustomers: number;
  returningCustomers: number;
  orders: number;
  revenue: number;
  cogs: number;
  contributionMargin: number;
  cumulativeRevenue: number;
  cumulativeSpend: number;
  cumulativeProfit: number;
  roas: number;
}

interface GrowthModelOutput {
  projectedRevenue: number;
  projectedOrders: number;
  projectedCustomers: number;
  projectedRoas: number;
  projectedMer: number;
  projectedLtv: number;
  projectedContributionMargin: number;
  breakEvenMonth: number | null;
  monthlyBreakdown: MonthlyProjection[];
}

interface SavedScenario {
  id: string;
  name: string;
  description?: string | null;
  isBaseline: boolean;
  monthlyBudget: number;
  targetCac: number;
  expectedCvr: number;
  avgOrderValue: number;
  cogsPercent: number;
  returnRate: number;
  avgOrdersPerCustomer: number;
  horizonMonths: number;
  projectedRevenue: number;
  projectedOrders: number;
  projectedCustomers: number;
  projectedRoas: number;
  projectedMer: number;
  projectedLtv: number;
  projectedContributionMargin: number;
  breakEvenMonth: number | null;
  updatedAt: string;
}

const DEFAULT_INPUT: GrowthModelInput = {
  monthlyBudget: 25000,
  targetCac: 50,
  expectedCvr: 0.025,
  avgOrderValue: 85,
  cogsPercent: 0.45,
  returnRate: 0.20,
  avgOrdersPerCustomer: 1.3,
  horizonMonths: 6,
};

const HORIZON_OPTIONS = [3, 6, 9, 12];

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-[var(--foreground-secondary)]">{label}</label>
        <span className="text-sm font-medium text-[var(--foreground)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white/[0.06] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}

export default function GrowthModelPage() {
  const [input, setInput] = useState<GrowthModelInput>(DEFAULT_INPUT);
  const [output, setOutput] = useState<GrowthModelOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareOutput, setCompareOutput] = useState<GrowthModelOutput | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced compute
  const compute = useCallback((params: GrowthModelInput) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      apiFetch('/api/growth-model/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((d: GrowthModelOutput | null) => {
          if (d) setOutput(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 300);
  }, []);

  // Initial compute + load scenarios
  useEffect(() => {
    compute(input);
    loadScenarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateInput = (key: keyof GrowthModelInput, value: number) => {
    const next = { ...input, [key]: value };
    setInput(next);
    compute(next);
  };

  const loadScenarios = () => {
    apiFetch('/api/growth-model/scenarios')
      .then((r) => r.ok ? r.json() : { scenarios: [] })
      .then((d: { scenarios: SavedScenario[] }) => setScenarios(d.scenarios ?? []))
      .catch(() => {});
  };

  const loadBaseline = () => {
    apiFetch('/api/growth-model/baseline')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { baseline: GrowthModelInput } | null) => {
        if (d?.baseline) {
          setInput(d.baseline);
          compute(d.baseline);
        }
      })
      .catch(() => {});
  };

  const saveScenario = () => {
    if (!saveName.trim()) return;
    setSaving(true);
    apiFetch('/api/growth-model/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveName.trim(), ...input }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then(() => {
        setSaveName('');
        setSaving(false);
        loadScenarios();
      })
      .catch(() => setSaving(false));
  };

  const deleteScenario = (id: string) => {
    apiFetch(`/api/growth-model/scenarios/${id}`, { method: 'DELETE' })
      .then(() => {
        loadScenarios();
        if (compareId === id) {
          setCompareId(null);
          setCompareOutput(null);
        }
      })
      .catch(() => {});
  };

  const loadScenarioInputs = (s: SavedScenario) => {
    const next: GrowthModelInput = {
      monthlyBudget: s.monthlyBudget,
      targetCac: s.targetCac,
      expectedCvr: s.expectedCvr,
      avgOrderValue: s.avgOrderValue,
      cogsPercent: s.cogsPercent,
      returnRate: s.returnRate,
      avgOrdersPerCustomer: s.avgOrdersPerCustomer,
      horizonMonths: s.horizonMonths,
    };
    setInput(next);
    compute(next);
  };

  // Compare scenario
  useEffect(() => {
    if (!compareId) { setCompareOutput(null); return; }
    apiFetch(`/api/growth-model/scenarios/${compareId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: (SavedScenario & { monthlyBreakdown: MonthlyProjection[] }) | null) => {
        if (d) {
          setCompareOutput({
            projectedRevenue: d.projectedRevenue,
            projectedOrders: d.projectedOrders,
            projectedCustomers: d.projectedCustomers,
            projectedRoas: d.projectedRoas,
            projectedMer: d.projectedMer,
            projectedLtv: d.projectedLtv,
            projectedContributionMargin: d.projectedContributionMargin,
            breakEvenMonth: d.breakEvenMonth,
            monthlyBreakdown: d.monthlyBreakdown,
          });
        }
      })
      .catch(() => {});
  }, [compareId]);

  const chartData = output?.monthlyBreakdown.map((m) => ({
    name: `M${m.month}`,
    Revenue: m.revenue,
    Spend: m.spend,
    'Cumulative Profit': m.cumulativeProfit,
    ...(compareOutput?.monthlyBreakdown[m.month - 1] ? {
      'Compare Revenue': compareOutput.monthlyBreakdown[m.month - 1]!.revenue,
      'Compare Profit': compareOutput.monthlyBreakdown[m.month - 1]!.cumulativeProfit,
    } : {}),
  })) ?? [];

  const breakEvenColor = (month: number | null) => {
    if (month === null) return 'text-apple-red';
    if (month <= 3) return 'text-apple-green';
    if (month <= 6) return 'text-apple-yellow';
    return 'text-apple-red';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Growth Model</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBaseline}
            className="px-3 py-1.5 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)] rounded-lg transition-all ease-spring"
          >
            Load Baseline
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel — Input Sliders */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider">Assumptions</h2>

          <SliderInput
            label="Monthly Budget"
            value={input.monthlyBudget}
            min={1000}
            max={200000}
            step={1000}
            format={(v) => formatCurrency(v)}
            onChange={(v) => updateInput('monthlyBudget', v)}
          />

          <SliderInput
            label="Target CAC"
            value={input.targetCac}
            min={5}
            max={200}
            step={1}
            format={(v) => `$${v}`}
            onChange={(v) => updateInput('targetCac', v)}
          />

          <SliderInput
            label="Expected CVR"
            value={input.expectedCvr}
            min={0.005}
            max={0.10}
            step={0.001}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => updateInput('expectedCvr', v)}
          />

          <SliderInput
            label="AOV"
            value={input.avgOrderValue}
            min={10}
            max={500}
            step={5}
            format={(v) => `$${v}`}
            onChange={(v) => updateInput('avgOrderValue', v)}
          />

          <SliderInput
            label="COGS %"
            value={input.cogsPercent}
            min={0.10}
            max={0.80}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => updateInput('cogsPercent', v)}
          />

          <SliderInput
            label="Repeat Rate"
            value={input.returnRate}
            min={0}
            max={0.60}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => updateInput('returnRate', v)}
          />

          <SliderInput
            label="Avg Orders/Customer"
            value={input.avgOrdersPerCustomer}
            min={1.0}
            max={5.0}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => updateInput('avgOrdersPerCustomer', v)}
          />

          <div className="space-y-1">
            <label className="text-xs text-[var(--foreground-secondary)]">Horizon</label>
            <div className="flex gap-2">
              {HORIZON_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => updateInput('horizonMonths', h)}
                  className={`px-3 py-1 text-xs rounded-lg transition-all ease-spring ${
                    input.horizonMonths === h
                      ? 'bg-apple-blue text-[var(--foreground)]'
                      : 'bg-white/[0.06] text-[var(--foreground)]/80 hover:bg-white/[0.08]'
                  }`}
                >
                  {h}mo
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="pt-2 border-t border-[var(--glass-border)] space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Scenario name..."
                className="flex-1 px-3 py-1.5 text-sm bg-white/[0.06] border border-[var(--glass-border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)]/50 focus:outline-none focus:border-apple-blue"
              />
              <button
                onClick={saveScenario}
                disabled={saving || !saveName.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-apple-blue hover:bg-apple-blue/90 disabled:bg-white/[0.06] disabled:text-[var(--foreground-secondary)]/70 text-[var(--foreground)] rounded-lg transition-all ease-spring"
              >
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Projections */}
        <div className="lg:col-span-2 space-y-4">
          {/* KPI Cards */}
          {output && (
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">Projected Revenue</p>
                <p className="text-lg font-bold text-[var(--foreground)] mt-1">{formatCurrency(output.projectedRevenue)}</p>
              </div>
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">ROAS</p>
                <p className="text-lg font-bold text-[var(--foreground)] mt-1">{output.projectedRoas.toFixed(2)}x</p>
              </div>
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">CAC</p>
                <p className="text-lg font-bold text-[var(--foreground)] mt-1">${input.targetCac}</p>
              </div>
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">CM</p>
                <p className="text-lg font-bold text-[var(--foreground)] mt-1">{formatCurrency(output.projectedContributionMargin)}</p>
              </div>
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">Break-Even</p>
                <p className={`text-lg font-bold mt-1 ${breakEvenColor(output.breakEvenMonth)}`}>
                  {output.breakEvenMonth ? `Month ${output.breakEvenMonth}` : 'Never'}
                </p>
              </div>
              <div className="card text-center">
                <p className="text-[10px] text-[var(--foreground-secondary)] uppercase">LTV</p>
                <p className="text-lg font-bold text-[var(--foreground)] mt-1">{formatCurrency(output.projectedLtv)}</p>
              </div>
            </div>
          )}

          {/* Chart */}
          {output && chartData.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">Monthly Projections</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" fontSize={11} />
                    <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
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
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="Revenue" fill="#0a84ff" fillOpacity={0.15} stroke="#0a84ff" strokeWidth={2} />
                    <Area type="monotone" dataKey="Spend" fill="#ff453a" fillOpacity={0.1} stroke="#ff453a" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="Cumulative Profit" stroke="#30d158" strokeWidth={2} dot={false} />
                    {compareOutput && (
                      <>
                        <Line type="monotone" dataKey="Compare Revenue" stroke="#bf5af2" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="Compare Profit" stroke="#bf5af2" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                      </>
                    )}
                    {output.breakEvenMonth && (
                      <ReferenceLine x={`M${output.breakEvenMonth}`} stroke="#30d158" strokeDasharray="3 3" label={{ value: 'Break-even', position: 'top', fill: '#30d158', fontSize: 10 }} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Monthly Table */}
          {output && output.monthlyBreakdown.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider">Monthly Breakdown</h2>
                <button
                  onClick={() => exportToCSV(
                    output.monthlyBreakdown.map((m) => ({
                      month: m.month,
                      spend: m.spend,
                      newCustomers: m.newCustomers,
                      returningCustomers: m.returningCustomers,
                      orders: m.orders,
                      revenue: m.revenue,
                      cogs: m.cogs,
                      contributionMargin: m.contributionMargin,
                      roas: m.roas,
                      cumulativeProfit: m.cumulativeProfit,
                    })),
                    'growth-model-projections',
                    [
                      { key: 'month', label: 'Month' },
                      { key: 'spend', label: 'Spend' },
                      { key: 'newCustomers', label: 'New Customers' },
                      { key: 'returningCustomers', label: 'Returning' },
                      { key: 'orders', label: 'Orders' },
                      { key: 'revenue', label: 'Revenue' },
                      { key: 'cogs', label: 'COGS' },
                      { key: 'contributionMargin', label: 'CM' },
                      { key: 'roas', label: 'ROAS', format: (v) => `${Number(v).toFixed(2)}x` },
                      { key: 'cumulativeProfit', label: 'Cumulative Profit' },
                    ],
                  )}
                  className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] px-2 py-1 border border-[var(--glass-border)] rounded hover:border-[var(--glass-border-hover)] transition-all ease-spring"
                >
                  Export CSV
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)]">
                    <th className="px-3 py-2 text-left text-xs text-[var(--foreground-secondary)]">Month</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">New</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Return</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Orders</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Revenue</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">COGS</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">CM</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">ROAS</th>
                    <th className="px-3 py-2 text-right text-xs text-[var(--foreground-secondary)]">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {output.monthlyBreakdown.map((m) => (
                    <tr key={m.month} className="border-b border-white/[0.04] hover:bg-white/[0.04]">
                      <td className="px-3 py-2 font-medium text-[var(--foreground)]">M{m.month}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(m.newCustomers)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(m.returningCustomers)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(m.orders)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(m.revenue)}</td>
                      <td className="px-3 py-2 text-right text-apple-red">{formatCurrency(m.cogs)}</td>
                      <td className={`px-3 py-2 text-right ${m.contributionMargin >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                        {formatCurrency(m.contributionMargin)}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--foreground)]">
                        {m.roas.toFixed(2)}x
                      </td>
                      <td className={`px-3 py-2 text-right font-medium ${m.cumulativeProfit >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                        {formatCurrency(m.cumulativeProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Saved Scenarios */}
      {scenarios.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider mb-3">Saved Scenarios</h2>
          <p className="text-xs text-[var(--foreground-secondary)]/70 mb-3">Click a scenario to load its inputs. Select "Compare" to overlay it on the chart.</p>
          <div className="space-y-2">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-white/[0.04] rounded-lg border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] transition-all ease-spring"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{s.name}</span>
                    {s.isBaseline && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--tint-blue)] text-apple-blue border border-apple-blue/30">
                        BASELINE
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-[var(--foreground-secondary)]/70">
                    <span>Rev: {formatCurrency(s.projectedRevenue)}</span>
                    <span>ROAS: {s.projectedRoas.toFixed(2)}x</span>
                    <span>Break-even: {s.breakEvenMonth ? `M${s.breakEvenMonth}` : 'Never'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => loadScenarioInputs(s)}
                    className="px-2 py-1 text-xs bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)]/80 rounded transition-all ease-spring"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => setCompareId(compareId === s.id ? null : s.id)}
                    className={`px-2 py-1 text-xs rounded transition-all ease-spring ${
                      compareId === s.id
                        ? 'bg-apple-purple text-[var(--foreground)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.08] text-[var(--foreground)]/80'
                    }`}
                  >
                    Compare
                  </button>
                  <button
                    onClick={() => deleteScenario(s.id)}
                    className="px-2 py-1 text-xs bg-white/[0.06] hover:bg-apple-red/90/80 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] rounded transition-all ease-spring"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
