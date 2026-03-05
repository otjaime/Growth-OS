'use client';

import { TrendingUp, TrendingDown, Trophy, XCircle, FlaskConical } from 'lucide-react';

interface VariantPerformanceProps {
  variant: {
    status: string;
    spend: number | null;
    impressions: number | null;
    clicks: number | null;
    conversions: number | null;
    revenue: number | null;
  };
  original: {
    spend7d: number;
    roas7d: number | null;
    ctr7d: number | null;
    conversions7d: number;
  };
}

function formatCurrency(v: number): string {
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  switch (status) {
    case 'WINNER':
      return (
        <span className="flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-bold uppercase">
          <Trophy className="h-3 w-3" />
          Winner
        </span>
      );
    case 'LOSER':
      return (
        <span className="flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-red)] text-apple-red font-bold uppercase">
          <XCircle className="h-3 w-3" />
          Underperformer
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-blue)] text-apple-blue font-bold uppercase">
          <FlaskConical className="h-3 w-3" />
          Testing
        </span>
      );
  }
}

function MetricRow({ label, original, variant, format, higherIsBetter = true }: {
  label: string;
  original: number | null;
  variant: number | null;
  format: (v: number) => string;
  higherIsBetter?: boolean;
}): JSX.Element {
  const origVal = original ?? 0;
  const varVal = variant ?? 0;
  const delta = origVal > 0 ? ((varVal - origVal) / origVal) * 100 : null;
  const isPositive = delta !== null && ((higherIsBetter && delta > 0) || (!higherIsBetter && delta < 0));

  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-separator last:border-b-0">
      <p className="text-xs text-[var(--foreground-secondary)]">{label}</p>
      <p className="text-xs font-medium text-[var(--foreground)] text-center">
        {original !== null ? format(original) : '\u2014'}
      </p>
      <div className="flex items-center justify-end gap-1.5">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          {variant !== null ? format(variant) : '\u2014'}
        </p>
        {delta !== null && (
          <span className={`flex items-center gap-0.5 text-caption font-medium ${isPositive ? 'text-apple-green' : 'text-apple-red'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function VariantPerformance({ variant, original }: VariantPerformanceProps): JSX.Element | null {
  // Only show for published/winner/loser variants with some spend
  if (!variant.spend && variant.status === 'PUBLISHED') return null;
  if (!['PUBLISHED', 'WINNER', 'LOSER'].includes(variant.status)) return null;

  const variantSpend = variant.spend ? Number(variant.spend) : 0;
  const variantRevenue = variant.revenue ? Number(variant.revenue) : 0;
  const variantRoas = variantSpend > 0 ? variantRevenue / variantSpend : null;
  const variantClicks = variant.clicks ?? 0;
  const variantImpressions = variant.impressions ?? 0;
  const variantCtr = variantImpressions > 0 ? variantClicks / variantImpressions : null;
  const variantConversions = variant.conversions ?? 0;

  return (
    <div className="glass-thin rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase font-semibold text-[var(--foreground-secondary)]">Performance Comparison</p>
        <StatusBadge status={variant.status} />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2 pb-1">
        <p className="text-caption text-[var(--foreground-secondary)]/60 uppercase font-medium">Metric</p>
        <p className="text-caption text-[var(--foreground-secondary)]/60 uppercase font-medium text-center">Original</p>
        <p className="text-caption text-[var(--foreground-secondary)]/60 uppercase font-medium text-right">Variant</p>
      </div>

      <MetricRow
        label="ROAS"
        original={original.roas7d}
        variant={variantRoas}
        format={(v) => `${v.toFixed(2)}x`}
      />
      <MetricRow
        label="CTR"
        original={original.ctr7d}
        variant={variantCtr}
        format={formatPct}
      />
      <MetricRow
        label="Spend"
        original={original.spend7d}
        variant={variantSpend}
        format={formatCurrency}
        higherIsBetter={false}
      />
      <MetricRow
        label="Conversions"
        original={original.conversions7d}
        variant={variantConversions}
        format={(v) => v.toFixed(0)}
      />
    </div>
  );
}
