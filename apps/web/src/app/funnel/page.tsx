'use client';

import { useState, useEffect } from 'react';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatNumber, formatPercent } from '@/lib/format';
import { apiFetch } from '@/lib/api';

interface FunnelData {
  funnel: {
    sessions: number;
    pdpViews: number;
    addToCart: number;
    checkouts: number;
    purchases: number;
  };
  cvr: {
    sessionToPdp: number;
    pdpToAtc: number;
    atcToCheckout: number;
    checkoutToPurchase: number;
    overall: number;
  };
}

const STEPS = [
  { key: 'sessions', label: 'Sessions', color: '#3b82f6', icon: '👁' },
  { key: 'pdpViews', label: 'PDP Views', color: '#6366f1', icon: '📄' },
  { key: 'addToCart', label: 'Add to Cart', color: '#8b5cf6', icon: '🛒' },
  { key: 'checkouts', label: 'Checkouts', color: '#a855f7', icon: '💳' },
  { key: 'purchases', label: 'Purchases', color: '#22c55e', icon: '✅' },
] as const;

const CVR_LABELS: Record<string, string> = {
  sessionToPdp: 'Session → PDP',
  pdpToAtc: 'PDP → ATC',
  atcToCheckout: 'ATC → Checkout',
  checkoutToPurchase: 'Checkout → Purchase',
  overall: 'Overall CVR',
};

export default function FunnelPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    apiFetch(`/api/metrics/funnel?days=${days}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: FunnelData | null) => {
        if (!d) { setError(true); setLoading(false); return; }
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Conversion Funnel</h1>
        <div className="card border-red-500/50 flex items-center justify-center h-64">
          <p className="text-red-400">Failed to load funnel data. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  const maxVal = data.funnel.sessions || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Conversion Funnel</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {/* Overall CVR Banner */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Overall Conversion Rate</p>
          <p className="text-3xl font-bold text-white mt-1">
            {formatPercent(data.cvr.overall)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {formatNumber(data.funnel.sessions)} sessions → {formatNumber(data.funnel.purchases)} purchases
          </p>
        </div>
        <div className="text-6xl opacity-30">🎯</div>
      </div>

      {/* Funnel Visualization */}
      <div className="card space-y-1">
        <h2 className="text-lg font-semibold text-white mb-6">Funnel Steps</h2>
        {STEPS.map((step, i) => {
          const value = data.funnel[step.key];
          const pct = (value / maxVal) * 100;
          const dropoff = i > 0
            ? data.funnel[STEPS[i - 1]!.key] - value
            : 0;
          const dropoffPct = i > 0 && data.funnel[STEPS[i - 1]!.key] > 0
            ? (dropoff / data.funnel[STEPS[i - 1]!.key]) * 100
            : 0;

          return (
            <div key={step.key}>
              {/* Drop-off indicator between steps */}
              {i > 0 && (
                <div className="flex items-center gap-3 py-2 pl-14">
                  <div className="text-xs text-slate-500">
                    ↓ {formatNumber(dropoff)} lost ({dropoffPct.toFixed(1)}% drop-off)
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-10 text-center text-xl">{step.icon}</div>

                {/* Bar + Labels */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-200">{step.label}</span>
                    <span className="text-sm font-bold text-white">{formatNumber(value)}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: step.color,
                      }}
                    >
                      {pct > 15 && (
                        <span className="text-xs text-white font-medium pl-3">
                          {pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step-by-Step Conversion Rates */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(data.cvr).map(([key, val]) => (
          <div key={key} className="card text-center">
            <p className="text-xs text-slate-400 mb-1">{CVR_LABELS[key] ?? key}</p>
            <p className={`text-xl font-bold ${key === 'overall' ? 'text-green-400' : 'text-white'}`}>
              {formatPercent(val)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
