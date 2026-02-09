'use client';

import { formatCurrency, formatPercent, formatNumber, formatPercentChange, changeColor } from '@/lib/format';
import { MiniSparkline } from './sparkline';

interface KpiCardProps {
  title: string;
  value: number;
  change: number;
  format?: 'currency' | 'percent' | 'number' | 'multiplier';
  invertColor?: boolean;
  sparkData?: number[];
}

export function KpiCard({ title, value, change, format = 'currency', invertColor = false, sparkData }: KpiCardProps) {
  const formatted = (() => {
    switch (format) {
      case 'currency': return formatCurrency(value);
      case 'percent': return formatPercent(value);
      case 'number': return formatNumber(value);
      case 'multiplier': return `${value.toFixed(2)}x`;
    }
  })();

  return (
    <div className="card flex flex-col gap-2">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-white">{formatted}</p>
        {sparkData && sparkData.length > 0 && (
          <MiniSparkline data={sparkData} color={change >= 0 ? '#22c55e' : '#ef4444'} />
        )}
      </div>
      <p className={`text-sm font-medium ${changeColor(change, invertColor)}`}>
        {formatPercentChange(change)} vs prior period
      </p>
    </div>
  );
}
