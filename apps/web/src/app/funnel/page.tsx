'use client';

import { useState, useEffect } from 'react';
import { DateRangePicker } from '@/components/date-range-picker';
import { formatNumber, formatPercent, formatCurrency } from '@/lib/format';
import { apiFetch } from '@/lib/api';

interface OrderData {
  totalOrders: number;
  newCustomerOrders: number;
  returningOrders: number;
  revenueGross: number;
  discounts: number;
  refunds: number;
  revenueNet: number;
  cogs: number;
  shippingCost: number;
  contributionMargin: number;
  aov: number;
  newCustomerRate: number;
}

interface TrafficData {
  sessions: number;
  pdpViews: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  cvr: {
    sessionToPdp: number;
    pdpToAtc: number;
    atcToCheckout: number;
    checkoutToPurchase: number;
    overall: number;
  };
}

interface FunnelData {
  orders: OrderData;
  traffic: TrafficData | null;
}

type FunnelView = 'orders' | 'traffic';

const REVENUE_STEPS = [
  { key: 'revenueGross', label: 'Gross Revenue', color: '#3b82f6' },
  { key: 'discounts', label: 'Discounts', color: '#f59e0b', subtract: true },
  { key: 'refunds', label: 'Refunds', color: '#ef4444', subtract: true },
  { key: 'revenueNet', label: 'Net Revenue', color: '#6366f1' },
  { key: 'cogs', label: 'COGS', color: '#f59e0b', subtract: true },
  { key: 'shippingCost', label: 'Shipping', color: '#f97316', subtract: true },
  { key: 'contributionMargin', label: 'Contribution Margin', color: '#22c55e' },
] as const;

const TRAFFIC_STEPS = [
  { key: 'sessions', label: 'Sessions', color: '#3b82f6' },
  { key: 'pdpViews', label: 'PDP Views', color: '#6366f1' },
  { key: 'addToCart', label: 'Add to Cart', color: '#8b5cf6' },
  { key: 'checkouts', label: 'Checkouts', color: '#a855f7' },
  { key: 'purchases', label: 'Purchases', color: '#22c55e' },
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
  const [view, setView] = useState<FunnelView>('orders');

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Conversion Funnel</h1>
        <div className="flex items-center gap-3">
          {/* View toggle — only show if GA4 data exists */}
          {data.traffic && (
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setView('orders')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'orders'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Revenue
              </button>
              <button
                onClick={() => setView('traffic')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === 'traffic'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Web Funnel (GA4)
              </button>
            </div>
          )}
          <DateRangePicker onChange={setDays} defaultDays={days} />
        </div>
      </div>

      {view === 'orders' ? (
        <OrdersFunnel orders={data.orders} />
      ) : data.traffic ? (
        <TrafficFunnel traffic={data.traffic} />
      ) : null}
    </div>
  );
}

// ── Orders / Revenue Waterfall ─────────────────────────────
function OrdersFunnel({ orders }: { orders: OrderData }) {
  const maxVal = orders.revenueGross || 1;

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-white">{formatNumber(orders.totalOrders)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">AOV</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(orders.aov)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">New Customer Rate</p>
          <p className="text-2xl font-bold text-green-400">{formatPercent(orders.newCustomerRate)}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {formatNumber(orders.newCustomerOrders)} new / {formatNumber(orders.returningOrders)} returning
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-400 mb-1">Contribution Margin</p>
          <p className="text-2xl font-bold text-green-400">
            {formatCurrency(orders.contributionMargin)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {orders.revenueNet > 0 ? formatPercent(orders.contributionMargin / orders.revenueNet) : '0%'} of net revenue
          </p>
        </div>
      </div>

      {/* Revenue waterfall */}
      <div className="card space-y-1">
        <h2 className="text-lg font-semibold text-white mb-6">Revenue Waterfall</h2>
        {REVENUE_STEPS.map((step, i) => {
          const value = orders[step.key as keyof OrderData] as number;
          const pct = (value / maxVal) * 100;

          return (
            <div key={step.key}>
              {/* Drop-off indicator for subtracted items */}
              {'subtract' in step && step.subtract && value > 0 && (
                <div className="flex items-center gap-3 py-1.5 pl-4">
                  <div className="text-xs text-slate-500">
                    - {formatCurrency(value)} ({(value / maxVal * 100).toFixed(1)}% of gross)
                  </div>
                </div>
              )}

              {!('subtract' in step && step.subtract) && (
                <div className="flex items-center gap-4 py-1">
                  <div className="w-40 flex-shrink-0">
                    <span className="text-sm font-medium text-slate-200">{step.label}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
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
                              {formatCurrency(value)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-24 text-right">
                    <span className="text-sm font-bold text-white">{formatCurrency(value)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── GA4 Web Traffic Funnel ─────────────────────────────────
function TrafficFunnel({ traffic }: { traffic: TrafficData }) {
  const maxVal = traffic.sessions || 1;

  return (
    <>
      {/* Overall CVR Banner */}
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Overall Conversion Rate</p>
          <p className="text-3xl font-bold text-white mt-1">
            {formatPercent(traffic.cvr.overall)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {formatNumber(traffic.sessions)} sessions → {formatNumber(traffic.purchases)} purchases
          </p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="card space-y-1">
        <h2 className="text-lg font-semibold text-white mb-6">Web Funnel Steps</h2>
        {TRAFFIC_STEPS.map((step, i) => {
          const value = traffic[step.key as keyof typeof traffic] as number;
          const pct = (value / maxVal) * 100;
          const prevKey = i > 0 ? TRAFFIC_STEPS[i - 1]!.key : null;
          const prevVal = prevKey ? traffic[prevKey as keyof typeof traffic] as number : 0;
          const dropoff = i > 0 ? prevVal - value : 0;
          const dropoffPct = i > 0 && prevVal > 0 ? (dropoff / prevVal) * 100 : 0;

          return (
            <div key={step.key}>
              {i > 0 && (
                <div className="flex items-center gap-3 py-2 pl-14">
                  <div className="text-xs text-slate-500">
                    ↓ {formatNumber(dropoff)} lost ({dropoffPct.toFixed(1)}% drop-off)
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="w-10 text-center text-sm text-slate-400">{i + 1}</div>
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

      {/* Step-by-Step CVRs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(traffic.cvr).map(([key, val]) => (
          <div key={key} className="card text-center">
            <p className="text-xs text-slate-400 mb-1">{CVR_LABELS[key] ?? key}</p>
            <p className={`text-xl font-bold ${key === 'overall' ? 'text-green-400' : 'text-white'}`}>
              {formatPercent(val)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
