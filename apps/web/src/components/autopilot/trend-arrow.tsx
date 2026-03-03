'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface TrendArrowProps {
  /** Fractional change, e.g. 0.15 = +15% */
  change: number | null;
  /** When true, a decrease is good (e.g., CPC, frequency) */
  invert?: boolean;
  size?: 'sm' | 'md';
}

export function TrendArrow({ change, invert = false, size = 'sm' }: TrendArrowProps) {
  if (change === null || change === undefined || Math.abs(change) < 0.005) return null;

  const isUp = change > 0;
  const isGood = invert ? !isUp : isUp;
  const color = isGood ? 'text-apple-green' : 'text-apple-red';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = size === 'sm' ? 'text-caption' : 'text-xs';
  const Icon = isUp ? TrendingUp : TrendingDown;
  const pct = `${isUp ? '+' : ''}${(change * 100).toFixed(0)}%`;

  return (
    <span className={`inline-flex items-center gap-0.5 ${color} ${textSize} font-medium`}>
      <Icon className={iconSize} />
      {pct}
    </span>
  );
}
