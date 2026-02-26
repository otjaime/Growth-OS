'use client';

import type { ReactNode } from 'react';
import { formatCurrency, formatPercent, formatNumber, formatPercentChange, changeColor, formatMultiplier } from '@/lib/format';
import { MiniSparkline } from './sparkline';
import { SpotlightCard } from './ui/spotlight-card';
import { CountUp } from './ui/count-up';

interface KpiCardProps {
  title: ReactNode;
  value: number;
  change?: number;
  format?: 'currency' | 'percent' | 'number' | 'multiplier';
  invertColor?: boolean;
  sparkData?: number[];
  benchmark?: string;
}

const FORMAT_FNS: Record<string, (v: number) => string> = {
  currency: formatCurrency,
  percent: formatPercent,
  number: formatNumber,
  multiplier: formatMultiplier,
};

export function KpiCard({ title, value, change, format = 'currency', invertColor = false, sparkData, benchmark }: KpiCardProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatFn = FORMAT_FNS[format];

  return (
    <SpotlightCard className="card glass-interactive flex flex-col gap-2">
      <p className="text-xs text-[var(--foreground-secondary)] uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between">
        <CountUp
          value={safeValue}
          format={formatFn}
          className="text-2xl font-bold text-[var(--foreground)]"
        />
        {sparkData && sparkData.length > 0 && (
          <MiniSparkline data={sparkData} color={(change ?? 0) >= 0 ? '#30d158' : '#ff453a'} />
        )}
      </div>
      <p className={`text-sm font-medium ${changeColor(change ?? 0, invertColor)}`}>
        {change !== undefined ? `${formatPercentChange(change)} vs prior period` : '\u00A0'}
      </p>
      {benchmark && (
        <p className="text-[10px] text-[var(--foreground-secondary)]/50">DTC benchmark: {benchmark}</p>
      )}
    </SpotlightCard>
  );
}
