'use client';

import type { ReactNode } from 'react';
import { formatCurrency, formatPercent, formatNumber, formatPercentChange, changeColor } from '@/lib/format';
import { MiniSparkline } from './sparkline';

interface KpiCardProps {
  title: ReactNode;
  value: number;
  change?: number;
  format?: 'currency' | 'percent' | 'number' | 'multiplier';
  invertColor?: boolean;
  sparkData?: number[];
  benchmark?: string;
}

export function KpiCard({ title, value, change, format = 'currency', invertColor = false, sparkData, benchmark }: KpiCardProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = (() => {
    switch (format) {
      case 'currency': return formatCurrency(safeValue);
      case 'percent': return formatPercent(safeValue);
      case 'number': return formatNumber(safeValue);
      case 'multiplier': return safeValue === 0 ? '--' : `${safeValue.toFixed(1)}x`;
    }
  })();

  return (
    <div className="card flex flex-col gap-2">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{title}</p>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-bold text-white">{formatted}</p>
        {sparkData && sparkData.length > 0 && (
          <MiniSparkline data={sparkData} color={(change ?? 0) >= 0 ? '#22c55e' : '#ef4444'} />
        )}
      </div>
      <p className={`text-sm font-medium ${changeColor(change ?? 0, invertColor)}`}>
        {change !== undefined ? `${formatPercentChange(change)} vs prior period` : '\u00A0'}
      </p>
      {benchmark && (
        <p className="text-[10px] text-slate-600">DTC benchmark: {benchmark}</p>
      )}
    </div>
  );
}
