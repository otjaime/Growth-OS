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

const FUNNEL_STEPS = [
  { key: 'sessions', label: 'Sessions', color: '#0a84ff' },
  { key: 'pdpViews', label: 'Product Views', color: '#6366f1' },
  { key: 'addToCart', label: 'Add to Cart', color: '#bf5af2' },
  { key: 'checkouts', label: 'Checkouts', color: '#bf5af2' },
  { key: 'purchases', label: 'Purchases', color: '#30d158' },
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apple-blue" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Conversion Funnel</h1>
        <div className="card border-apple-red/50 flex items-center justify-center h-64">
          <p className="text-apple-red">Failed to load funnel data. Check that your API is running.</p>
        </div>
      </div>
    );
  }

  const hasTraffic = data.traffic !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Conversion Funnel</h1>
        <DateRangePicker onChange={setDays} defaultDays={days} />
      </div>

      {hasTraffic ? (
        <TrafficFunnel traffic={data.traffic!} orders={data.orders} />
      ) : (
        <NoTrafficFunnel orders={data.orders} />
      )}
    </div>
  );
}

// ── Full funnel when GA4 data is available ─────────────────
function TrafficFunnel({ traffic, orders }: { traffic: TrafficData; orders: OrderData }) {
  const maxVal = traffic.sessions || 1;

  // Find the bottleneck: step with the largest drop-off percentage
  const dropoffs = FUNNEL_STEPS.slice(1).map((step, i) => {
    const prevStep = FUNNEL_STEPS[i]!;
    const prevVal = traffic[prevStep.key as keyof typeof traffic] as number;
    const curVal = traffic[step.key as keyof typeof traffic] as number;
    const dropoffPct = prevVal > 0 ? ((prevVal - curVal) / prevVal) * 100 : 0;
    return { index: i + 1, dropoffPct };
  });
  const bottleneckIdx = dropoffs.reduce((max, d) => d.dropoffPct > max.dropoffPct ? d : max, dropoffs[0]!).index;

  return (
    <>
      {/* Overall CVR + Order stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Overall Conversion Rate</p>
          <p className="text-2xl font-bold text-apple-green">{formatPercent(traffic.cvr.overall)}</p>
          <p className="text-[10px] text-[var(--foreground-secondary)]/70 mt-1">
            {formatNumber(traffic.sessions)} visits → {formatNumber(traffic.purchases)} purchases
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Orders</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatNumber(orders.totalOrders)}</p>
          <p className="text-[10px] text-[var(--foreground-secondary)]/70 mt-1">
            {formatNumber(orders.newCustomerOrders)} new / {formatNumber(orders.returningOrders)} returning
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">AOV</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(orders.aov)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Revenue</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(orders.revenueNet)}</p>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="card space-y-1">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6">Funnel Steps</h2>
        {FUNNEL_STEPS.map((step, i) => {
          const value = traffic[step.key as keyof typeof traffic] as number;
          const pct = (value / maxVal) * 100;
          const prevKey = i > 0 ? FUNNEL_STEPS[i - 1]!.key : null;
          const prevVal = prevKey ? traffic[prevKey as keyof typeof traffic] as number : 0;
          const dropoff = i > 0 ? prevVal - value : 0;
          const dropoffPct = i > 0 && prevVal > 0 ? (dropoff / prevVal) * 100 : 0;

          return (
            <div key={step.key}>
              {i > 0 && (
                <div className="flex items-center gap-3 py-2 pl-14">
                  <div className={`text-xs ${i === bottleneckIdx ? 'text-apple-red font-semibold' : 'text-[var(--foreground-secondary)]/70'}`}>
                    ↓ {formatNumber(dropoff)} lost ({dropoffPct.toFixed(1)}% drop-off)
                    {i === bottleneckIdx && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--tint-red)] text-apple-red border border-apple-red/30">
                        BOTTLENECK
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="w-10 text-center text-sm text-[var(--foreground-secondary)]">{i + 1}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--foreground)]">{step.label}</span>
                    <span className="text-sm font-bold text-[var(--foreground)]">{formatNumber(value)}</span>
                  </div>
                  <div className="w-full bg-white/[0.06] rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: step.color,
                      }}
                    >
                      {pct > 15 && (
                        <span className="text-xs text-[var(--foreground)] font-medium pl-3">
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

      {/* Step-by-step CVRs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(traffic.cvr).map(([key, val]) => (
          <div key={key} className="card text-center">
            <p className="text-xs text-[var(--foreground-secondary)] mb-1">{CVR_LABELS[key] ?? key}</p>
            <p className={`text-xl font-bold ${key === 'overall' ? 'text-apple-green' : 'text-[var(--foreground)]'}`}>
              {formatPercent(val)}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Shopify-only view when no GA4 data ─────────────────────
function NoTrafficFunnel({ orders }: { orders: OrderData }) {
  return (
    <>
      {/* Order summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatNumber(orders.totalOrders)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">AOV</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(orders.aov)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">New Customer Rate</p>
          <p className="text-2xl font-bold text-apple-green">{formatPercent(orders.newCustomerRate)}</p>
          <p className="text-[10px] text-[var(--foreground-secondary)]/70 mt-1">
            {formatNumber(orders.newCustomerOrders)} new / {formatNumber(orders.returningOrders)} returning
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-[var(--foreground-secondary)] mb-1">Net Revenue</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{formatCurrency(orders.revenueNet)}</p>
        </div>
      </div>

      {/* Connect GA4 prompt */}
      <div className="card border-apple-blue/30">
        <div className="flex items-start gap-4">
          <div className="text-3xl">📊</div>
          <div>
            <h3 className="text-[var(--foreground)] font-semibold mb-1">Connect GA4 for full funnel visibility</h3>
            <p className="text-sm text-[var(--foreground-secondary)] mb-3">
              The conversion funnel (Sessions → Product Views → Add to Cart → Checkout → Purchase)
              requires Google Analytics 4 data. Connect your GA4 property in{' '}
              <a href="/connections" className="text-apple-blue hover:text-apple-blue underline">Connections</a>{' '}
              to see the full funnel with drop-off rates at each step.
            </p>
            <p className="text-sm text-[var(--foreground-secondary)]">
              Below is your order data from Shopify for the selected period.
            </p>
          </div>
        </div>
      </div>

      {/* Simple order breakdown */}
      <div className="card">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Order Breakdown</h2>
        <div className="space-y-3">
          {[
            { label: 'New Customers', value: orders.newCustomerOrders, color: '#30d158' },
            { label: 'Returning Customers', value: orders.returningOrders, color: '#6366f1' },
          ].map((row) => {
            const pct = orders.totalOrders > 0 ? (row.value / orders.totalOrders) * 100 : 0;
            return (
              <div key={row.label} className="flex items-center gap-4">
                <div className="w-44 flex-shrink-0">
                  <span className="text-sm text-[var(--foreground)]">{row.label}</span>
                </div>
                <div className="flex-1">
                  <div className="w-full bg-white/[0.06] rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: row.color }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-bold text-[var(--foreground)]">{formatNumber(row.value)}</span>
                  <span className="text-xs text-[var(--foreground-secondary)]/70 ml-1">({pct.toFixed(0)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
